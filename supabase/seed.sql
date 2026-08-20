-- seed.sql
-- PayByPalm — infrastructure rows. Safe to re-run; every insert is guarded.
--
-- This file seeds only the rows that need no Supabase Auth user:
--   * the single system float account
--   * one merchant, "Yaba Tech Cafeteria", and its ledger account
--   * one terminal for that merchant
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
-- 3. Terminal
-- ---------------------------------------------------------------------------
-- DEV KEY — replace before anything resembling production.
--
--   plaintext : pbp_dev_terminal_key_001
--   sha256    : 4093fc76e48a3db5c7db148e448d692bb996cf965c04a6729f9f992aeb3e836b
--
-- Send the plaintext as the X-Terminal-Key header. Only the hash is stored, so a
-- dump of this table yields no working credential.
--
-- The hash is written literally rather than computed with pgcrypto's digest():
-- Supabase installs pgcrypto into the `extensions` schema, so an unqualified
-- digest() call resolves on a bare Postgres but fails on a real Supabase project.

insert into public.terminals (merchant_id, label, api_key_hash)
select m.id,
       'Counter 1',
       '4093fc76e48a3db5c7db148e448d692bb996cf965c04a6729f9f992aeb3e836b'
from public.merchants m
where m.name = 'Yaba Tech Cafeteria'
  and not exists (
    select 1 from public.terminals t
    where t.merchant_id = m.id and t.label = 'Counter 1'
  );


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
