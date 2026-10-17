-- DESTRUCTIVE: use only when ALL users and app records in this project are test data.
-- Deletes Auth users, wallets, ledger history, palm binding/audit history,
-- enrolment sessions, merchant/terminal records and abuse budgets.
-- Keeps schema, functions, RLS policies, migrations, Auth settings and API keys.
-- Does NOT delete external Tencent palm templates or Supabase platform logs.
-- Stop backend/kiosks first. Export any data you want to keep before running.
-- Run in Supabase SQL Editor only after verifying the target project.
-- Afterwards run supabase/seed.sql to restore the float account and merchant;
-- provision a new terminal credential separately. Do not run the test-user seed.

begin;
set local lock_timeout = '5s';
-- Prevent signup from creating a new user in the middle of this reset.
lock table auth.users in access exclusive mode;

do $$
declare v_tables text;
begin
  -- Include only known application tables which exist in this installation.
  -- RESTRICT deliberately aborts on an unexpected external table dependency.
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into v_tables
    from pg_tables
    where schemaname = 'public' and tablename = any(array[
      'ledger_entries', 'transactions', 'enrol_sessions', 'api_stream_leases',
      'palm_bindings', 'palm_audit', 'terminals', 'merchants', 'accounts',
      'profiles', 'api_budgets'
    ]);
  if v_tables is not null then
    execute 'truncate table ' || v_tables || ' restart identity restrict';
  end if;
end $$;

-- Auth-owned foreign keys remove identities and sessions. Do not truncate/drop
-- the managed Auth schema or modify its migrations, configuration or roles.
delete from auth.users;
commit;
