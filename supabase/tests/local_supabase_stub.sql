-- Local-only stub of the parts of Supabase our migrations depend on.
-- Not shipped; exists so the migrations can be validated on a bare Postgres.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema if not exists auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase reads the JWT claim; locally we fake it with a session GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Mirror Supabase's default grants on the public schema.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

create publication supabase_realtime;
