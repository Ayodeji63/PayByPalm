-- 0007_functions.sql
-- PayByPalm — the only two functions permitted to move money.
--
-- Both write a balanced debit/credit pair inside a single transaction. Neither can
-- be replaced by ad-hoc inserts from application code without tripping the
-- balanced-transaction trigger in 0005_ledger.sql.
--
-- ERROR CODES — custom SQLSTATEs in the 'PB' class, surfaced verbatim by PostgREST
-- as error.code so the backend can map them to HTTP statuses without string
-- matching on messages:
--   PB001  transaction not found
--   PB002  transaction in the wrong status for this operation
--   PB003  insufficient funds
--   PB004  a required account is missing
--   PB005  transaction has no matched user

-- ---------------------------------------------------------------------------
-- balance_of — single definition of "what is this account worth"
-- ---------------------------------------------------------------------------
-- The account_balances view is the read path for clients; this is the same
-- arithmetic for use inside functions, where a single-account lookup beats
-- scanning a grouped view.

create or replace function public.balance_of(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           sum(case when direction = 'credit' then amount_minor else -amount_minor end),
           0
         )::bigint
  from public.ledger_entries
  where account_id = p_account_id;
$$;


-- ---------------------------------------------------------------------------
-- post_transaction — settle an authenticated terminal payment
-- ---------------------------------------------------------------------------
-- Called by POST /transactions/:id/confirm, and only after the user has explicitly
-- tapped Confirm on the terminal. No other path debits a wallet.

create or replace function public.post_transaction(txn_id uuid)
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

comment on function public.post_transaction(uuid) is
  'Settles an authenticated payment as a balanced debit/credit pair. Raises PB003 rather than overdrawing.';


-- ---------------------------------------------------------------------------
-- post_topup — credit a wallet from the system float account
-- ---------------------------------------------------------------------------
-- HACKATHON SCOPE. This simulates funds arriving from outside the closed loop.
-- In production this is the seam where a real Wema funding rail plugs in: an
-- inbound NIP/virtual-account webhook would verify the credit and call this same
-- function, so the ledger shape does not change.
--
-- The float account is deliberately allowed to go negative — it is the source of
-- funds for the closed loop, and its debit balance is the correct double-entry
-- representation of "money issued into the system".

create or replace function public.post_topup(
  p_user_id     uuid,
  p_amount      bigint,
  p_description text default 'Wallet top-up'
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn           public.transactions;
  v_float_account uuid;
  v_user_account  uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'top-up amount must be positive, got %', p_amount
      using errcode = 'invalid_parameter_value';
  end if;

  select id into v_float_account from public.accounts where kind = 'float';
  if v_float_account is null then
    raise exception 'no float account exists — run the seed' using errcode = 'PB004';
  end if;

  select id into v_user_account
  from public.accounts
  where user_id = p_user_id and kind = 'user';

  if v_user_account is null then
    raise exception 'no wallet account for user %', p_user_id using errcode = 'PB004';
  end if;

  insert into public.transactions (amount_minor, description, status, matched_user_id, settled_at)
  values (p_amount, p_description, 'settled', p_user_id, now())
  returning * into v_txn;

  insert into public.ledger_entries (transaction_id, account_id, direction, amount_minor)
  values (v_txn.id, v_float_account, 'debit',  p_amount),
         (v_txn.id, v_user_account,  'credit', p_amount);

  return v_txn;
end;
$$;

comment on function public.post_topup(uuid, bigint, text) is
  'Credits a wallet from the float account. Hackathon stand-in for a real funding rail; same ledger shape.';
