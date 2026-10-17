\set ON_ERROR_STOP on
begin;
do $$
declare budget_key text := repeat('a', 64); terminal uuid; first_lease uuid; second_lease uuid;
begin
  assert public.consume_api_budget(budget_key, 2, 60) = 0;
  assert public.consume_api_budget(budget_key, 2, 60) = 0;
  assert public.consume_api_budget(budget_key, 2, 60) > 0, 'budget allowed an excess request';
  update public.api_budgets set expires_at = clock_timestamp() - interval '1 second' where api_budgets.key = budget_key;
  assert public.consume_api_budget(budget_key, 2, 60) = 0, 'expired budget did not reset';
  assert not has_function_privilege('authenticated', 'public.consume_api_budget(text,integer,integer)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.acquire_api_stream(uuid,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.release_api_stream(uuid)', 'EXECUTE');

  select id into terminal from public.terminals limit 1;
  first_lease := public.acquire_api_stream(terminal, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  assert first_lease is not null;
  assert public.acquire_api_stream(terminal, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa') is null, 'duplicate stream allowed';
  second_lease := public.acquire_api_stream(terminal, gen_random_uuid());
  assert second_lease is not null;
  assert public.acquire_api_stream(terminal, gen_random_uuid()) is null, 'terminal stream cap exceeded';
  perform public.release_api_stream(first_lease);
  assert public.acquire_api_stream(terminal, gen_random_uuid()) is not null, 'release did not free capacity';
  update public.api_stream_leases set expires_at = clock_timestamp() - interval '1 second' where terminal_id = terminal;
  assert public.acquire_api_stream(terminal, gen_random_uuid()) is not null, 'crashed-worker lease did not expire';
end $$;
rollback;
\echo 'API ABUSE TESTS PASSED'
