-- Run in an isolated database after applying the repair twice.
begin;
set local role service_role;
do $$
declare v_key text := repeat('e', 64); v_result integer;
begin
  v_result := public.consume_api_budget(v_key, 1, 60);
  if v_result <> 0 then raise exception 'first budget request must pass'; end if;
  v_result := public.consume_api_budget(v_key, 1, 60);
  if v_result < 1 or v_result > 60 then raise exception 'second request must be limited'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.consume_api_budget(text,integer,integer)', 'execute') or
     has_function_privilege('authenticated', 'public.consume_api_budget(text,integer,integer)', 'execute') then
    raise exception 'client must not consume service budgets directly';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.api_budgets'::regclass) then
    raise exception 'budget table needs RLS';
  end if;
end $$;
rollback;
