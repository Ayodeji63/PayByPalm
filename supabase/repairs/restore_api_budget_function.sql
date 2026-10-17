-- Restore the signup/API request-budget dependency, whether its table is missing
-- or only its RPC is missing. Existing budget rows are retained.
-- Run the ENTIRE file in the SQL Editor for the backend SUPABASE_URL project.
-- Does not replace migrations 0010-0013 or reconcile CLI migration history.
begin;
create table if not exists public.api_budgets (
  key text primary key check (length(key) = 64),
  hits integer not null,
  expires_at timestamptz not null
);
create index if not exists api_budgets_expiry on public.api_budgets(expires_at);
alter table public.api_budgets enable row level security;
revoke all on public.api_budgets from public, anon, authenticated;
grant select, insert, update, delete on public.api_budgets to service_role;

create or replace function public.consume_api_budget(p_key text, p_limit integer, p_window_seconds integer)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_now timestamptz := clock_timestamp(); v_row public.api_budgets;
begin
  if p_key is null or length(p_key) <> 64 or p_limit is null or p_limit < 1 or p_limit > 10000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid budget' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.api_budgets where key in (
    select key from public.api_budgets where expires_at < v_now - interval '1 day'
      and key <> p_key order by expires_at limit 100
  );
  insert into public.api_budgets(key, hits, expires_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    hits = case when api_budgets.expires_at <= v_now then 1 else least(api_budgets.hits, p_limit) + 1 end,
    expires_at = case when api_budgets.expires_at <= v_now
      then v_now + make_interval(secs => p_window_seconds) else api_budgets.expires_at end
  returning * into v_row;
  if v_row.hits > p_limit then
    return greatest(1, ceil(extract(epoch from v_row.expires_at - v_now))::integer);
  end if;
  return 0;
end;
$$;
revoke execute on function public.consume_api_budget(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_budget(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
commit;
