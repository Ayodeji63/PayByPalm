-- Shared API budgets. Keys are SHA-256 hashes, not raw IPs, phones, or tokens.
create table public.api_budgets (
  key text primary key check (length(key) = 64),
  hits integer not null,
  expires_at timestamptz not null
);
create index api_budgets_expiry on public.api_budgets(expires_at);
alter table public.api_budgets enable row level security;
revoke all on public.api_budgets from public, anon, authenticated;
grant select, insert, update, delete on public.api_budgets to service_role;

create function public.consume_api_budget(p_key text, p_limit integer, p_window_seconds integer)
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

-- Leases enforce stream caps across API workers and expire after worker crashes.
create table public.api_stream_leases (
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.terminals(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null
);
create index api_stream_leases_terminal on public.api_stream_leases(terminal_id, expires_at);
alter table public.api_stream_leases enable row level security;
revoke all on public.api_stream_leases from public, anon, authenticated;
grant select, insert, update, delete on public.api_stream_leases to service_role;

create function public.acquire_api_stream(p_terminal_id uuid, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('api-stream:' || p_terminal_id::text, 0));
  delete from public.api_stream_leases where terminal_id = p_terminal_id and expires_at <= clock_timestamp();
  if (select count(*) from public.api_stream_leases where terminal_id = p_terminal_id) >= 2
     or exists (select 1 from public.api_stream_leases where terminal_id = p_terminal_id and session_id = p_session_id) then
    return null;
  end if;
  insert into public.api_stream_leases(terminal_id, session_id, expires_at)
  values (p_terminal_id, p_session_id, clock_timestamp() + interval '120 seconds') returning id into v_id;
  return v_id;
end;
$$;
create function public.release_api_stream(p_id uuid)
returns void language sql security definer set search_path = public
as $$ delete from public.api_stream_leases where id = p_id; $$;
revoke execute on function public.acquire_api_stream(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.release_api_stream(uuid) from public, anon, authenticated;
grant execute on function public.acquire_api_stream(uuid, uuid) to service_role;
grant execute on function public.release_api_stream(uuid) to service_role;
notify pgrst, 'reload schema';
