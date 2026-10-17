\set ON_ERROR_STOP on

-- Uses fixtures created by schema_test.sql, in a transaction rolled back below.
begin;
do $$
declare
  terminal uuid; sale uuid := gen_random_uuid();
  a public.transactions; b public.transactions; expired uuid;
  count_before bigint;
begin
  select id into terminal from public.terminals limit 1;
  a := public.create_terminal_transaction(terminal, sale, 100, 'Lunch');
  b := public.create_terminal_transaction(terminal, sale, 100, 'Lunch');
  assert a.id = b.id, 'sale replay created another payment';
  begin
    perform public.create_terminal_transaction(terminal, sale, 200, 'Lunch');
    raise exception 'TEST FAILED: sale reference reused for different amount';
  exception when sqlstate 'PB007' then null;
  end;

  update public.transactions set status = 'authenticated',
    matched_user_id = '11111111-1111-1111-1111-111111111111',
    match_score = 92, match_mode = 'search', authenticated_at = '2099-01-01'
    where id = a.id returning * into a;
  assert a.authenticated_at <= clock_timestamp(), 'application clock controlled authorization time';
  b := public.post_transaction(a.id);
  assert b.status = 'settled', 'payment failed to settle';
  assert (public.post_transaction(a.id)).id = a.id, 'settlement replay changed identity';
  assert (select count(*) from public.ledger_entries where transaction_id = a.id) = 2,
    'settlement replay duplicated entries';

  begin
    update public.transactions set status = 'failed' where id = a.id;
    raise exception 'TEST FAILED: settled payment became failed';
  exception when sqlstate 'PB002' then null;
  end;
  begin
    update public.transactions set matched_user_id = '22222222-2222-2222-2222-222222222222' where id = a.id;
    raise exception 'TEST FAILED: settled payer was changed';
  exception when sqlstate 'PB002' then null;
  end;
  begin
    update public.transactions set amount_minor = 200 where id = a.id;
    raise exception 'TEST FAILED: payment amount was changed';
  exception when sqlstate 'PB002' then null;
  end;

  insert into public.transactions (terminal_id, merchant_id, amount_minor, status,
    matched_user_id, match_score, match_mode, authenticated_at)
  select t.id, t.merchant_id, 100, 'authenticated',
    '11111111-1111-1111-1111-111111111111', 92, 'search', clock_timestamp() - interval '2 minutes'
  from public.terminals t limit 1 returning id into expired;
  select count(*) into count_before from public.ledger_entries;
  begin
    perform public.post_transaction(expired);
    raise exception 'TEST FAILED: stale payment settled';
  exception when sqlstate 'PB006' then null;
  end;
  assert (select count(*) from public.ledger_entries) = count_before, 'stale payment wrote entries';
  assert not has_function_privilege('authenticated', 'public.post_transaction(uuid,integer)', 'EXECUTE'),
    'new settlement RPC exposed to users';
  assert not has_function_privilege('anon', 'public.create_terminal_transaction(uuid,uuid,bigint,text)', 'EXECUTE'),
    'sale creation RPC exposed to anonymous clients';
end $$;
rollback;
\echo 'PAYMENT INTEGRITY TESTS PASSED'
