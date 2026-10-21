-- Auth cutover: run only with the matching backend, wallet, admin and merchant release.
-- Preserves UUIDs, bcrypt hashes, profiles, cards, palms, history and access grants.
-- Legacy Supabase sessions and old confirmation/reset links require signing in again.
-- Transactional and rerunnable. No application data or legacy Auth rows are deleted.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtextextended('paybypalm-auth-cutover',0));
lock table auth.users in share row exclusive mode;
create schema if not exists pbp_auth;
revoke all on schema pbp_auth from public,anon,authenticated,service_role;
set local search_path=pbp_auth,pg_catalog;
create table if not exists pbp_auth.cutover (id integer primary key check(id=1), applied_at timestamptz not null default now());
create table if not exists "user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "phone" text not null, "disabled" boolean not null);

create table if not exists "session" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" uuid not null references "user" ("id") on delete cascade);

create table if not exists "account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table if not exists "verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create index if not exists "session_userId_idx" on "session" ("userId");

create index if not exists "account_userId_idx" on "account" ("userId");

create index if not exists "verification_identifier_idx" on "verification" ("identifier");
create unique index if not exists account_one_credential on pbp_auth.account("providerId","accountId");
create unique index if not exists user_email_canonical on pbp_auth."user"(lower(email));
-- A second application preserves all newer password/email changes.
insert into pbp_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt",phone,disabled)
select u.id,coalesce(nullif(trim(p.full_name),''),'PayByPalm user'),
 coalesce(nullif(lower(trim(u.email)),''),'legacy-'||u.id::text||'@disabled.paybypalm.invalid'),
 u.email_confirmed_at is not null and u.deleted_at is null,
 u.created_at,coalesce(u.updated_at,u.created_at),coalesce(p.phone,''),
 u.deleted_at is not null or coalesce(u.banned_until>now(),false) or nullif(trim(u.email),'') is null
 or lower(u.email) like '%@phone.paybypalm.local'
from auth.users u left join public.profiles p on p.id=u.id
on conflict(id) do nothing;
insert into pbp_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt")
select gen_random_uuid(),u.id::text,'credential',u.id,u.encrypted_password,u.created_at,coalesce(u.updated_at,u.created_at)
from auth.users u where u.encrypted_password ~ '^\$2[aby]\$'
on conflict("providerId","accountId") do nothing;

-- Retarget only application FKs; Supabase's internal auth tables remain archived.
do $$ declare c record; definition text; begin
 for c in select conrelid::regclass as tbl,conname,pg_get_constraintdef(oid) as def
  from pg_constraint where contype='f' and confrelid='auth.users'::regclass
  and connamespace='public'::regnamespace
 loop
  definition:=replace(c.def,'REFERENCES auth.users(', 'REFERENCES pbp_auth."user"(');
  if definition=c.def then raise exception 'Unexpected legacy Auth FK format'; end if;
  execute format('alter table %s drop constraint %I',c.tbl,c.conname);
  execute format('alter table %s add constraint %I %s',c.tbl,c.conname,definition);
 end loop;
end $$;

create or replace function pbp_auth.provision_user() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare canonical text;
begin
 canonical:=public.canonical_sms_phone(new.phone);
 if canonical is null or length(trim(new.name)) not between 2 and 120 then
  raise exception 'A name and valid Nigerian profile phone are required' using errcode='22023';
 end if;
 insert into public.profiles(id,full_name,phone) values(new.id,trim(new.name),canonical);
 insert into public.accounts(user_id,kind) values(new.id,'user');
 return new;
end $$;
drop trigger if exists provision_identity on pbp_auth."user";
create trigger provision_identity after insert on pbp_auth."user" for each row execute function pbp_auth.provision_user();
revoke all on function pbp_auth.provision_user() from public,anon,authenticated,service_role;
-- Prevent legacy signup from creating users outside the new identity system.
create or replace function pbp_auth.reject_legacy_signup() returns trigger language plpgsql as $$
begin raise exception 'Use PayByPalm authentication' using errcode='28000'; end $$;
revoke all on function pbp_auth.reject_legacy_signup() from public,anon,authenticated,service_role;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_confirmed_phone_changed on auth.users;
drop trigger if exists paybypalm_legacy_signup_disabled on auth.users;
create trigger paybypalm_legacy_signup_disabled before insert on auth.users for each row execute function pbp_auth.reject_legacy_signup();
-- Public data is served by the backend with owner/role checks, never old JWTs.
revoke all on all tables in schema public from public,anon,authenticated;
revoke all on all tables in schema pbp_auth from public,anon,authenticated,service_role;
-- Better Auth sessions replace these cookies; preserve their rows for audit.
update public.admin_sessions set revoked_at=coalesce(revoked_at,now()) where revoked_at is null and not exists(select 1 from pbp_auth.cutover);
update public.merchant_sessions set revoked_at=coalesce(revoked_at,now()) where revoked_at is null and not exists(select 1 from pbp_auth.cutover);
set local search_path=public,pg_catalog;
create or replace function public.admin_grant_merchant_access(p_actor uuid,p_merchant uuid,p_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid; m public.merchant_memberships;
begin
 if p_actor is null or p_merchant is null or p_email is null or length(trim(p_email)) not between 3 and 254 then raise exception 'invalid access grant' using errcode='MA400'; end if;
 perform 1 from pbp_auth."user" where id=p_actor and "emailVerified" and not disabled;
 if not found then raise exception 'invalid actor' using errcode='MA400'; end if;
 perform 1 from public.merchants where id=p_merchant;
 if not found then raise exception 'merchant missing' using errcode='MA404'; end if;
 select id into u from pbp_auth."user" where lower(email)=lower(trim(p_email)) and "emailVerified" and not disabled;
 if u is null then raise exception 'verified account required' using errcode='MA405'; end if;
 perform pg_advisory_xact_lock(hashtextextended('merchant-access:'||p_merchant::text||':'||u::text,0));
 select * into m from public.merchant_memberships where merchant_id=p_merchant and user_id=u for update;
 if found and m.revoked_at is null then return jsonb_build_object('id',m.id,'user_id',u,'email',lower(trim(p_email)),'created_at',m.created_at,'updated_at',m.updated_at); end if;
 insert into public.merchant_memberships(merchant_id,user_id,granted_by) values(p_merchant,u,p_actor)
 on conflict(merchant_id,user_id) do update set revoked_at=null,granted_by=p_actor,updated_at=clock_timestamp() returning * into m;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label) values(p_actor,'merchant.access_granted',m.id,p_merchant,'Merchant portal access granted');
 return jsonb_build_object('id',m.id,'user_id',u,'email',lower(trim(p_email)),'created_at',m.created_at,'updated_at',m.updated_at);
end $$;
create or replace function public.admin_list_merchant_access(p_merchant uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'email',u.email,'created_at',m.created_at,'updated_at',m.updated_at) order by m.created_at),'[]'::jsonb)
 from public.merchant_memberships m join pbp_auth."user" u on u.id=m.user_id where m.merchant_id=p_merchant and m.revoked_at is null;
$$;
create or replace function public.admin_revoke_merchant_access(p_actor uuid,p_merchant uuid,p_user uuid,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchant_memberships;
begin
 if p_actor is null or p_merchant is null or p_user is null or p_expected is null then raise exception 'invalid access revocation' using errcode='MA400'; end if;
 perform 1 from pbp_auth."user" where id=p_actor and "emailVerified" and not disabled;
 if not found then raise exception 'invalid actor' using errcode='MA400'; end if;
 perform pg_advisory_xact_lock(hashtextextended('merchant-access:'||p_merchant::text||':'||p_user::text,0));
 select * into m from public.merchant_memberships where merchant_id=p_merchant and user_id=p_user for update;
 if not found then raise exception 'access missing' using errcode='MA404'; end if;
 if m.revoked_at is not null then return; end if;
 if m.updated_at<>p_expected then raise exception 'access changed' using errcode='MA409'; end if;
 update public.merchant_memberships set revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=m.id;
 insert into public.admin_audit(actor_id,action,entity_id,merchant_id,label) values(p_actor,'merchant.access_revoked',m.id,p_merchant,'Merchant portal access revoked');
end $$;


-- Service-only identity lookup for administrator setup tooling; no password exposure.
create or replace function public.lookup_verified_identity(p_email text default null,p_id uuid default null)
returns table(id uuid,email text) language sql security definer set search_path=pg_catalog as $$
 select u.id,u.email from pbp_auth."user" u where u."emailVerified" and not u.disabled
 and ((p_email is not null and lower(u.email)=lower(trim(p_email))) or (p_id is not null and u.id=p_id));
$$;
revoke all on function public.lookup_verified_identity(text,uuid) from public,anon,authenticated;
grant execute on function public.lookup_verified_identity(text,uuid) to service_role;
comment on schema pbp_auth is 'PayByPalm Better Auth identities; private, not a PostgREST exposed schema';
insert into pbp_auth.cutover(id) values(1) on conflict do nothing;
notify pgrst,'reload schema';
commit;
