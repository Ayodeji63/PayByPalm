\set ON_ERROR_STOP on
\timing off

-- =====================================================================
-- PayByPalm schema invariant tests
-- =====================================================================

-- --- fixtures --------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@test', '{"full_name":"Ada Ade","phone":"08010001234"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@test', '{"full_name":"Bola Bello","phone":"08020005678"}');

-- Guarded so the suite runs against either a bare schema or a seeded one.
-- Exactly one float account, one merchant, and one terminal must exist
-- afterwards either way — several assertions below depend on that.
insert into public.accounts (kind)
select 'float' where not exists (select 1 from public.accounts where kind = 'float');

with ma as (
  insert into public.accounts (kind)
  select 'merchant' where not exists (select 1 from public.merchants)
  returning id
)
insert into public.merchants (name, account_id) select 'Test Merchant', id from ma;

insert into public.terminals (merchant_id, label, api_key_hash)
select id, 'Test Terminal', 'test-key-hash' from public.merchants
where not exists (select 1 from public.terminals);

\echo '--- T1: handle_new_user created profile + wallet + generated last4'
do $$
begin
  assert (select count(*) from public.profiles) = 2, 'expected 2 profiles';
  assert (select count(*) from public.accounts where kind='user') = 2, 'expected 2 wallets';
  assert (select phone_last4 from public.profiles where id='11111111-1111-1111-1111-111111111111') = '1234',
    'phone_last4 not generated correctly';
end $$;

\echo '--- T2: signup without metadata is rejected'
do $$
begin
  begin
    insert into auth.users (email, raw_user_meta_data) values ('c@test', '{"full_name":"No Phone"}');
    raise exception 'TEST FAILED: profile created without phone';
  exception when invalid_parameter_value then null;
  end;
end $$;

\echo '--- T3: post_topup writes a balanced pair; balance derives to 20,000 NGN'
do $$
declare v_bal bigint; v_txn uuid;
begin
  select id into v_txn from public.post_topup('11111111-1111-1111-1111-111111111111', 2000000, 'Seed');
  select balance_minor into v_bal from public.account_balances
    where account_id = (select id from public.accounts where user_id='11111111-1111-1111-1111-111111111111');
  assert v_bal = 2000000, format('expected 2000000 kobo, got %s', v_bal);
  assert (select count(*) from public.ledger_entries where transaction_id=v_txn) = 2, 'expected 2 entries';
  -- float goes negative: correct double-entry for money issued into the loop
  assert (select balance_minor from public.account_balances
          where account_id=(select id from public.accounts where kind='float')) = -2000000,
    'float account should carry the offsetting debit';
end $$;

\echo '--- T4: happy-path payment settles as a balanced pair'
do $$
declare v_txn uuid; v_bal bigint; v_mbal bigint;
begin
  insert into public.transactions (terminal_id, merchant_id, amount_minor, status, matched_user_id, match_score, match_mode, authenticated_at)
  select t.id, t.merchant_id, 125000, 'authenticated', '11111111-1111-1111-1111-111111111111', 92, 'search', now()
  from public.terminals t limit 1
  returning id into v_txn;

  perform public.post_transaction(v_txn);

  assert (select status from public.transactions where id=v_txn) = 'settled', 'txn not settled';
  select balance_minor into v_bal from public.account_balances
    where account_id=(select id from public.accounts where user_id='11111111-1111-1111-1111-111111111111');
  assert v_bal = 1875000, format('payer balance wrong: %s', v_bal);
  select balance_minor into v_mbal from public.account_balances
    where account_id=(select account_id from public.merchants limit 1);
  assert v_mbal = 125000, format('merchant balance wrong: %s', v_mbal);
end $$;

\echo '--- T5: replaying confirm on a settled txn raises PB002, charges nothing'
do $$
declare v_txn uuid; v_before bigint; v_after bigint;
begin
  select id into v_txn from public.transactions where status='settled' and merchant_id is not null limit 1;
  select balance_minor into v_before from public.account_balances
    where account_id=(select id from public.accounts where user_id='11111111-1111-1111-1111-111111111111');
  begin
    perform public.post_transaction(v_txn);
    raise exception 'TEST FAILED: replay was allowed';
  exception when sqlstate 'PB002' then null;
  end;
  select balance_minor into v_after from public.account_balances
    where account_id=(select id from public.accounts where user_id='11111111-1111-1111-1111-111111111111');
  assert v_before = v_after, 'replay changed the balance';
end $$;

\echo '--- T6: overdraw raises PB003 and writes no entries'
do $$
declare v_txn uuid; v_count_before int; v_count_after int;
begin
  select count(*) into v_count_before from public.ledger_entries;
  insert into public.transactions (terminal_id, merchant_id, amount_minor, status, matched_user_id, authenticated_at)
  select t.id, t.merchant_id, 999999999, 'authenticated', '11111111-1111-1111-1111-111111111111', now()
  from public.terminals t limit 1 returning id into v_txn;

  begin
    perform public.post_transaction(v_txn);
    raise exception 'TEST FAILED: overdraw was allowed';
  exception when sqlstate 'PB003' then null;
  end;

  select count(*) into v_count_after from public.ledger_entries;
  assert v_count_before = v_count_after, 'overdraw wrote ledger entries';
end $$;

\echo '--- T7: a user with no funds cannot pay (PB003 at zero balance)'
do $$
declare v_txn uuid;
begin
  insert into public.transactions (terminal_id, merchant_id, amount_minor, status, matched_user_id, authenticated_at)
  select t.id, t.merchant_id, 100, 'authenticated', '22222222-2222-2222-2222-222222222222', now()
  from public.terminals t limit 1 returning id into v_txn;
  begin
    perform public.post_transaction(v_txn);
    raise exception 'TEST FAILED: zero-balance user paid';
  exception when sqlstate 'PB003' then null;
  end;
end $$;

\echo '--- T8: unbalanced ledger write is rejected by the deferred trigger'
do $$
declare v_txn uuid; v_before int; v_after int;
begin
  select count(*) into v_before from public.ledger_entries;
  begin
    insert into public.transactions (amount_minor, status, matched_user_id)
    values (500, 'settled', '11111111-1111-1111-1111-111111111111') returning id into v_txn;

    -- a lone debit with no matching credit
    insert into public.ledger_entries (transaction_id, account_id, direction, amount_minor)
    values (v_txn, (select id from public.accounts where kind='float'), 'debit', 500);

    -- The trigger is DEFERRABLE INITIALLY DEFERRED, so it would normally fire at
    -- COMMIT — too late to catch here. Forcing it immediate makes the same check
    -- run now, inside this subtransaction, where it is catchable.
    execute 'set constraints all immediate';

    raise exception 'TEST FAILED: unbalanced transaction was allowed';
  exception when check_violation then null;
  end;
  select count(*) into v_after from public.ledger_entries;
  assert v_before = v_after, 'unbalanced entry survived the rollback';
end $$;

\echo '--- T9: only one float account may exist'
do $$
begin
  begin
    insert into public.accounts (kind) values ('float');
    raise exception 'TEST FAILED: second float account allowed';
  exception when unique_violation then null;
  end;
end $$;

\echo '--- T10: accounts_owner_matches_kind rejects a user account with no owner'
do $$
begin
  begin
    insert into public.accounts (kind) values ('user');
    raise exception 'TEST FAILED: ownerless user account allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.accounts (kind, user_id) values ('float', '11111111-1111-1111-1111-111111111111');
    raise exception 'TEST FAILED: owned float account allowed';
  exception when check_violation then null;
  end;
end $$;

\echo '--- T11: enrolment is one-time; revoke then re-enrol works'
do $$
begin
  insert into public.palm_bindings (user_id, tencent_palm_id)
  values ('11111111-1111-1111-1111-111111111111', 'palm-1');

  -- second ACTIVE binding must fail
  begin
    insert into public.palm_bindings (user_id, tencent_palm_id)
    values ('11111111-1111-1111-1111-111111111111', 'palm-2');
    raise exception 'TEST FAILED: two active bindings allowed';
  exception when unique_violation then null;
  end;

  -- soft revoke, then re-enrol: this is what a plain unique(user_id) would break
  update public.palm_bindings set revoked_at = now()
   where user_id='11111111-1111-1111-1111-111111111111' and revoked_at is null;

  insert into public.palm_bindings (user_id, tencent_palm_id)
  values ('11111111-1111-1111-1111-111111111111', 'palm-2');

  assert (select count(*) from public.palm_bindings
          where user_id='11111111-1111-1111-1111-111111111111') = 2, 'revoked history not retained';
  assert (select count(*) from public.palm_bindings
          where user_id='11111111-1111-1111-1111-111111111111' and revoked_at is null) = 1,
    'expected exactly one active binding';
end $$;

\echo '--- T12: RLS — a user reads only their own rows'
-- Plain SET, not SET LOCAL: psql runs each statement in its own implicit
-- transaction, so SET LOCAL would be discarded before the next statement runs.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  assert (select count(*) from public.profiles) = 1, 'profiles leaked across users';
  assert (select count(*) from public.accounts) = 1, 'accounts leaked across users';
  assert (select count(*) from public.transactions
          where matched_user_id='22222222-2222-2222-2222-222222222222') = 0, 'transactions leaked';
  assert (select count(*) from public.terminals) = 0, 'terminals readable by a client';
  assert (select count(*) from public.palm_audit) = 0, 'palm_audit readable by a client';
  assert (select count(*) from public.enrol_sessions) = 0, 'enrol_sessions readable by a client';
  assert (select count(*) from public.merchants) = 0, 'merchants readable by a client';
end $$;

\echo '--- T13: account_balances view does not leak other accounts'
do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.account_balances;
  assert v_rows = 1, format('view exposed %s accounts to one user (security_invoker not applied?)', v_rows);
end $$;

\echo '--- T14: a client cannot write, and cannot mint money'
do $$
begin
  begin
    insert into public.ledger_entries (transaction_id, account_id, direction, amount_minor)
    values (gen_random_uuid(), gen_random_uuid(), 'credit', 100000);
    raise exception 'TEST FAILED: client inserted a ledger entry';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;

  begin
    perform public.post_topup('11111111-1111-1111-1111-111111111111', 100000000, 'free money');
    raise exception 'TEST FAILED: client called post_topup';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo ''
\echo '=== ALL SCHEMA TESTS PASSED ==='
