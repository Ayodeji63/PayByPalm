-- Short-lived H5 capture grants and durable, cross-instance replay protection.
-- No images, SDK tokens or biometric templates are stored in these tables.
begin;

create table if not exists public.palm_capture_sessions (
  id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.terminals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('payment', 'enrol')),
  scope_id uuid not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists palm_capture_scope_idx on public.palm_capture_sessions (terminal_id, scope_id);

create table if not exists public.palm_used_captures (
  capture_hash text primary key check (capture_hash ~ '^[a-f0-9]{64}$'),
  consumed_at timestamptz not null default clock_timestamp()
);

alter table public.palm_capture_sessions enable row level security;
alter table public.palm_used_captures enable row level security;
revoke all on public.palm_capture_sessions, public.palm_used_captures from public, anon, authenticated;
grant select, insert, update, delete on public.palm_capture_sessions, public.palm_used_captures to service_role;

create or replace function public.consume_palm_capture(
  p_capture uuid, p_terminal uuid, p_scope uuid, p_purpose text,
  p_token_hash text, p_capture_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  update public.palm_capture_sessions
     set consumed_at = clock_timestamp()
   where id = p_capture and terminal_id = p_terminal and scope_id = p_scope
     and purpose = p_purpose and token_hash = p_token_hash
     and consumed_at is null and expires_at > clock_timestamp()
  returning user_id into v_user;
  if v_user is null then
    raise exception using errcode = 'PC001', message = 'Palm capture expired, used or belongs to another operation';
  end if;
  -- A duplicate raises 23505 and rolls back the grant update as well.
  insert into public.palm_used_captures (capture_hash) values (p_capture_hash);
  return v_user;
end;
$$;
revoke all on function public.consume_palm_capture(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_palm_capture(uuid, uuid, uuid, text, text, text) to service_role;

create or replace function public.complete_h5_palm_enrolment(
  p_session uuid, p_terminal uuid, p_user uuid, p_palm_id text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.enrol_sessions;
begin
  select * into v_session from public.enrol_sessions where id = p_session for update;
  if not found or v_session.terminal_id <> p_terminal or v_session.user_id is distinct from p_user
    or v_session.status <> 'claimed' or v_session.expires_at <= clock_timestamp() then
    raise exception using errcode = 'PC002', message = 'Enrolment session is no longer claimable';
  end if;
  if p_palm_id is null or length(p_palm_id) = 0 or length(p_palm_id) > 512 then
    raise exception using errcode = 'PC002', message = 'Invalid palm identifier';
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if not found or exists (select 1 from public.palm_bindings where user_id = p_user and revoked_at is null) then
    raise exception using errcode = 'PC002', message = 'Account is missing or already enrolled';
  end if;
  insert into public.palm_bindings(user_id, tencent_palm_id) values(p_user, p_palm_id);
  update public.profiles set palm_enrolled = true where id = p_user;
  update public.enrol_sessions set status = 'completed' where id = p_session;
end;
$$;
revoke all on function public.complete_h5_palm_enrolment(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.complete_h5_palm_enrolment(uuid, uuid, uuid, text) to service_role;
commit;
