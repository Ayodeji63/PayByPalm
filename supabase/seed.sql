-- seed.sql
-- PayByPalm — infrastructure rows. Safe to re-run; every insert is guarded.
--
-- This file seeds only the rows that need no Supabase Auth user:
--   * the single system float account
--   * one merchant, "Yaba Tech Cafeteria", and its ledger account
-- Device credentials are provisioned separately; none are seeded.
--
-- The five test users need rows in auth.users, which SQL alone cannot create
-- properly (Supabase hashes passwords and issues identities through its Admin
-- API). They are seeded by `backend/scripts/seed.ts` — see supabase/README.md.

-- ---------------------------------------------------------------------------
-- 1. The system float account
-- ---------------------------------------------------------------------------
-- Counterparty for every top-up. Carries a growing debit balance, which is the
-- correct double-entry representation of money issued into the closed loop.
-- The partial unique index in 0003 permits only one of these to exist.

insert into public.accounts (kind)
select 'float'
where not exists (select 1 from public.accounts where kind = 'float');


-- ---------------------------------------------------------------------------
-- 2. Merchant + its ledger account
-- ---------------------------------------------------------------------------

with new_account as (
  insert into public.accounts (kind)
  select 'merchant'
  where not exists (select 1 from public.merchants where name = 'Yaba Tech Cafeteria')
  returning id
)
insert into public.merchants (name, account_id)
select 'Yaba Tech Cafeteria', id from new_account;


-- ---------------------------------------------------------------------------
-- 3. Terminal credentials are provisioned separately per device.
-- Never seed a reusable public development credential.

-- ---------------------------------------------------------------------------
-- Confirmation
-- ---------------------------------------------------------------------------

do $$
declare
  v_float int; v_merchants int; v_terminals int;
begin
  select count(*) into v_float     from public.accounts where kind = 'float';
  select count(*) into v_merchants from public.merchants;
  select count(*) into v_terminals from public.terminals;
  raise notice 'seed complete: % float account, % merchant(s), % terminal(s)',
    v_float, v_merchants, v_terminals;
  raise notice 'next: run the user seed -> cd backend && pnpm seed';
end $$;
