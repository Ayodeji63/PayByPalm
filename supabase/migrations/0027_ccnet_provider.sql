-- Provider-specific bindings, retry-safe CCNet enrollment and exact-binding charges.
-- No images or CCNet credentials are stored in PostgreSQL.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
alter table public.palm_bindings
 add column provider text not null default 'tencent' check(provider in ('tencent','ccnet','mock')),
 add column provider_subject_id text,
 add column palm_side text check(palm_side in ('left','right')),
 add column templates_deleted_at timestamptz;
update public.palm_bindings set provider_subject_id=tencent_palm_id;
alter table public.palm_bindings alter column tencent_palm_id drop not null;
alter table public.palm_bindings add constraint ccnet_binding_reference check
 (provider<>'ccnet' or (provider_subject_id is not null and palm_side is not null));
drop index public.palm_bindings_one_active;
create unique index palm_bindings_one_active on public.palm_bindings(user_id,provider) where revoked_at is null;
create unique index palm_binding_subject on public.palm_bindings(provider,provider_subject_id,palm_side) where provider='ccnet';
alter table public.enrol_sessions
 add column provider text not null default 'tencent' check(provider in ('tencent','ccnet','mock')),
 add column capture_fingerprint text check(capture_fingerprint ~ '^[a-f0-9]{64}$'),
 add column palm_side text check(palm_side in ('left','right')),
 add column registration_owner uuid,
 add column registration_until timestamptz,
 add column templates_deleted_at timestamptz;
alter table public.palm_audit
 add column provider text not null default 'tencent',
 add column provider_request_id text,
 add column timings jsonb;
update public.palm_audit set provider_request_id=tencent_request_id;
alter table public.transactions
 add column palm_provider text check(palm_provider in ('tencent','ccnet','mock')),
 add column palm_binding_id uuid references public.palm_bindings(id);
-- Historical authentications cannot authorize a fresh CCNet checkout.
update public.transactions set palm_provider='tencent' where authenticated_at is not null;

create function public.guard_palm_binding() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.user_id,new.provider,new.provider_subject_id,new.palm_side,new.tencent_palm_id) is distinct from
    row(old.user_id,old.provider,old.provider_subject_id,old.palm_side,old.tencent_palm_id)
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
  raise exception 'palm binding identity is immutable' using errcode='PC002';
 end if;
 return new;
end $$;
create trigger palm_binding_identity before update on public.palm_bindings for each row execute function public.guard_palm_binding();

-- Serialize attempts by account and session. Uncertain upstream calls retain their
-- fingerprint; retrying can replace only the same session's isolated subject.
create function public.reserve_ccnet_enrolment(p_session uuid,p_terminal uuid,p_user uuid,p_fingerprint text,p_side text,p_owner uuid)
returns text language plpgsql security definer set search_path='' as $$
declare s public.enrol_sessions;
begin
 perform 1 from public.profiles where id=p_user for update;
 if not found then raise exception 'account missing' using errcode='PC002'; end if;
 select * into s from public.enrol_sessions where id=p_session for update;
 if not found or s.provider<>'ccnet' or s.terminal_id<>p_terminal or s.user_id is distinct from p_user then
  raise exception 'enrollment ownership changed' using errcode='PC002'; end if;
 if s.capture_fingerprint is not null and (s.capture_fingerprint<>p_fingerprint or s.palm_side<>p_side) then
  raise exception 'retry requires original captures' using errcode='PC003'; end if;
 if s.status='completed' then return 'completed'; end if;
 if s.status<>'claimed' or s.expires_at<=clock_timestamp() or p_fingerprint is null or p_side is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_side not in ('left','right') or p_owner is null then
  raise exception 'enrollment expired or invalid' using errcode='PC002'; end if;
 if exists(select 1 from public.palm_bindings where user_id=p_user and provider='ccnet' and revoked_at is null) then
  raise exception 'already enrolled' using errcode='PC002'; end if;
 if exists(select 1 from public.enrol_sessions where user_id=p_user and provider='ccnet' and registration_until>clock_timestamp()) then
  raise exception 'registration in progress' using errcode='PC004'; end if;
 update public.enrol_sessions set capture_fingerprint=p_fingerprint,palm_side=p_side,
  registration_owner=p_owner,registration_until=clock_timestamp()+interval '70 seconds' where id=p_session;
 return 'reserved';
end $$;
create function public.complete_ccnet_enrolment(p_session uuid,p_terminal uuid,p_user uuid,p_fingerprint text,p_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.enrol_sessions;
begin
 perform 1 from public.profiles where id=p_user for update;
 select * into s from public.enrol_sessions where id=p_session for update;
 if not found or s.provider<>'ccnet' or s.user_id is distinct from p_user or s.terminal_id<>p_terminal or s.capture_fingerprint is distinct from p_fingerprint then
  raise exception 'enrollment changed' using errcode='PC002'; end if;
 if s.status='completed' then return; end if;
 if s.status<>'claimed' or s.expires_at<=clock_timestamp() or s.registration_owner is distinct from p_owner or s.registration_until<=clock_timestamp() then
  raise exception 'registration lease expired' using errcode='PC002'; end if;
 insert into public.palm_bindings(user_id,provider,provider_subject_id,palm_side) values(p_user,'ccnet',p_session::text,s.palm_side);
 update public.profiles set palm_enrolled=true where id=p_user;
 update public.enrol_sessions set status='completed',registration_until=null,registration_owner=null where id=p_session;
end $$;
-- Revoke locally BEFORE upstream cleanup. This immediately blocks matching and
-- new charge claims, even when the PC is offline. Retain rows for cleanup retries.
create function public.revoke_ccnet_palms(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_user for update;
 update public.palm_bindings set revoked_at=clock_timestamp() where user_id=p_user and provider='ccnet' and revoked_at is null;
 update public.enrol_sessions set status='expired'
  where user_id=p_user and provider='ccnet' and status in ('claimed','captured');
 update public.profiles set palm_enrolled=exists(select 1 from public.palm_bindings where user_id=p_user and revoked_at is null) where id=p_user;
end $$;

-- Keep every existing transition check; add exact, active binding authorization.
-- Trigger functions cannot be called directly; install an additional guard.
create function public.guard_ccnet_authorization() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status<>'pending' and row(new.palm_provider,new.palm_binding_id) is distinct from row(old.palm_provider,old.palm_binding_id) then
  raise exception 'palm authorization is immutable' using errcode='PB002'; end if;
 if old.status='pending' and new.status='authenticated' and new.palm_provider='ccnet' then
  perform 1 from public.profiles where id=new.matched_user_id for share;
  perform 1 from public.palm_bindings where id=new.palm_binding_id and user_id=new.matched_user_id and provider='ccnet' and revoked_at is null for share;
  if not found or new.match_score<85 then raise exception 'active CCNet binding required' using errcode='PB005'; end if;
 end if;
 return new;
end $$;
create trigger ccnet_authorization_guard before update on public.transactions for each row execute function public.guard_ccnet_authorization();

-- Retain the full card validity/idempotency/expiry implementation behind a
-- restricted wrapper. Existing attempts continue through reconciliation.
alter function public.begin_card_payment(uuid,uuid,text,integer,integer) rename to begin_card_payment_previous;
revoke all on function public.begin_card_payment_previous(uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;
create function public.begin_card_payment(p_transaction uuid,p_terminal uuid,p_domain text,p_validity integer,p_accept_score integer)
returns setof public.card_payment_attempts language plpgsql security definer set search_path='' as $$
declare t public.transactions;
begin
 select * into t from public.transactions where id=p_transaction and terminal_id=p_terminal for update;
 if not found then raise exception 'payment not found' using errcode='PB001'; end if;
 if exists(select 1 from public.card_payment_attempts where transaction_id=t.id) then return; end if;
 if t.palm_provider is distinct from 'ccnet' or t.match_score is null or t.match_score<85 then
  raise exception 'fresh CCNet authentication required' using errcode='PB005'; end if;
 perform 1 from public.profiles where id=t.matched_user_id for share;
 perform 1 from public.palm_bindings where id=t.palm_binding_id and user_id=t.matched_user_id and provider='ccnet' and revoked_at is null for share;
 if not found then raise exception 'palm binding revoked or replaced' using errcode='PB005'; end if;
 return query select * from public.begin_card_payment_previous(p_transaction,p_terminal,p_domain,p_validity,greatest(p_accept_score,85));
end $$;
revoke all on function public.reserve_ccnet_enrolment(uuid,uuid,uuid,text,text,uuid), public.complete_ccnet_enrolment(uuid,uuid,uuid,text,uuid),public.revoke_ccnet_palms(uuid),public.begin_card_payment(uuid,uuid,text,integer,integer), public.guard_ccnet_authorization(),public.guard_palm_binding() from public,anon,authenticated;
grant execute on function public.reserve_ccnet_enrolment(uuid,uuid,uuid,text,text,uuid), public.complete_ccnet_enrolment(uuid,uuid,uuid,text,uuid),public.revoke_ccnet_palms(uuid),public.begin_card_payment(uuid,uuid,text,integer,integer) to service_role;
notify pgrst,'reload schema';
commit;
