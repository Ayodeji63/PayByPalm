-- Stable sale references prevent duplicate creation after response loss.
alter table public.transactions add column sale_id uuid;
create unique index transactions_terminal_sale_unique
  on public.transactions (terminal_id, sale_id) where sale_id is not null;

create function public.create_terminal_transaction(
  p_terminal_id uuid, p_sale_id uuid, p_amount bigint, p_description text default null
) returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare v_txn public.transactions; v_merchant uuid;
begin
  if p_sale_id is null or p_amount is null or p_amount <= 0 or p_amount > 100000000 then
    raise exception 'invalid sale details' using errcode = 'invalid_parameter_value';
  end if;
  select merchant_id into v_merchant from public.terminals where id = p_terminal_id;
  if not found then raise exception 'terminal not found' using errcode = 'PB001'; end if;
  insert into public.transactions (terminal_id, merchant_id, sale_id, amount_minor, description)
  values (p_terminal_id, v_merchant, p_sale_id, p_amount, p_description)
  on conflict (terminal_id, sale_id) where sale_id is not null do nothing;
  select * into v_txn from public.transactions
    where terminal_id = p_terminal_id and sale_id = p_sale_id;
  if v_txn.amount_minor <> p_amount or v_txn.description is distinct from p_description then
    raise exception 'sale reference reused with different details' using errcode = 'PB007';
  end if;
  return v_txn;
end;
$$;
revoke execute on function public.create_terminal_transaction(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.create_terminal_transaction(uuid, uuid, bigint, text) to service_role;

-- Enforce immutable financial details and final states even for service-role writes.
create function public.guard_payment_transition() returns trigger
language plpgsql set search_path = public
as $$
begin
  if row(new.amount_minor, new.terminal_id, new.merchant_id, new.sale_id)
     is distinct from row(old.amount_minor, old.terminal_id, old.merchant_id, old.sale_id) then
    raise exception 'payment details are immutable' using errcode = 'PB002';
  end if;
  if old.status <> 'pending' and
     row(new.matched_user_id, new.match_score, new.match_mode, new.authenticated_at)
     is distinct from row(old.matched_user_id, old.match_score, old.match_mode, old.authenticated_at) then
    raise exception 'payer authorization is immutable' using errcode = 'PB002';
  end if;
  if new.status <> old.status and not (
    (old.status = 'pending' and new.status in ('authenticated', 'failed', 'cancelled')) or
    (old.status = 'authenticated' and new.status in ('settled', 'failed', 'cancelled'))
  ) then
    raise exception 'invalid payment transition' using errcode = 'PB002';
  end if;
  if old.status = 'pending' and new.status = 'authenticated' then
    if new.matched_user_id is null or new.match_score is null or new.match_score < 0 or new.match_score > 100
       or new.match_mode is null then
      raise exception 'missing payer authorization' using errcode = 'PB005';
    end if;
    new.authenticated_at := clock_timestamp();
  end if;
  if old.status in ('settled', 'failed', 'cancelled') and
     row(new.settled_at, new.failure_reason) is distinct from row(old.settled_at, old.failure_reason) then
    raise exception 'final payment outcome is immutable' using errcode = 'PB002';
  end if;
  return new;
end;
$$;
create trigger payment_transition_guard before update on public.transactions
for each row execute function public.guard_payment_transition();
revoke execute on function public.guard_payment_transition() from public, anon, authenticated;

-- Replace the old overload so every call enforces expiry under the account lock.
drop function public.post_transaction(uuid);
create or replace function public.post_transaction(txn_id uuid, p_auth_validity_seconds integer default 60)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn           public.transactions;
  v_payer_account uuid;
  v_payee_account uuid;
  v_balance       bigint;
begin
  -- Row lock first. Two terminals double-tapping Confirm on the same transaction
  -- serialise here; the loser then fails the status check below rather than
  -- posting a second pair of entries.
  select * into v_txn
  from public.transactions
  where id = txn_id
  for update;

  if not found then
    raise exception 'transaction % not found', txn_id using errcode = 'PB001';
  end if;

  -- The status gate is what makes this function idempotent-safe: a replay finds
  -- 'settled', not 'authenticated', and is rejected instead of charging twice.
  if v_txn.status = 'settled' then return v_txn; end if;
  if v_txn.status <> 'authenticated' then
    raise exception 'transaction % has status %, expected authenticated', txn_id, v_txn.status
      using errcode = 'PB002';
  end if;

  if v_txn.matched_user_id is null then
    raise exception 'transaction % has no matched user', txn_id using errcode = 'PB005';
  end if;

  select id into v_payer_account
  from public.accounts
  where user_id = v_txn.matched_user_id and kind = 'user';

  if v_payer_account is null then
    raise exception 'no wallet account for user %', v_txn.matched_user_id using errcode = 'PB004';
  end if;

  select m.account_id into v_payee_account
  from public.merchants m
  where m.id = v_txn.merchant_id;

  if v_payee_account is null then
    raise exception 'no merchant account for merchant %', v_txn.merchant_id using errcode = 'PB004';
  end if;

  -- Lock the payer's account row so two concurrent payments by the same user
  -- cannot both read a sufficient balance and both succeed. The lock is on
  -- `accounts`, not `ledger_entries`, because the rows we need to exclude do not
  -- exist yet — there is nothing in the ledger to lock against.
  perform 1 from public.accounts where id = v_payer_account for update;

  -- Use wall-clock time after both locks, not the transaction-start clock.
  if p_auth_validity_seconds is null or p_auth_validity_seconds < 1 or p_auth_validity_seconds > 60
     or v_txn.authenticated_at is null
     or v_txn.authenticated_at > clock_timestamp()
     or v_txn.authenticated_at < clock_timestamp() - make_interval(secs => p_auth_validity_seconds) then
    raise exception 'palm authorization expired' using errcode = 'PB006';
  end if;

  v_balance := public.balance_of(v_payer_account);

  if v_balance < v_txn.amount_minor then
    raise exception
      'insufficient funds: balance %, required %', v_balance, v_txn.amount_minor
      using errcode = 'PB003';
  end if;

  -- The balanced pair. Equal amounts, opposite directions, one transaction.
  insert into public.ledger_entries (transaction_id, account_id, direction, amount_minor)
  values (txn_id, v_payer_account, 'debit',  v_txn.amount_minor),
         (txn_id, v_payee_account, 'credit', v_txn.amount_minor);

  update public.transactions
     set status = 'settled',
         settled_at = now()
   where id = txn_id
  returning * into v_txn;

  return v_txn;
end;
$$;

comment on function public.post_transaction(uuid, integer) is
  'Settles an authenticated payment as a balanced debit/credit pair. Raises PB003 rather than overdrawing.';


revoke execute on function public.post_transaction(uuid, integer) from public, anon, authenticated;
grant execute on function public.post_transaction(uuid, integer) to service_role;

notify pgrst, 'reload schema';
