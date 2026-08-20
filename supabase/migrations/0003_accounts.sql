-- 0003_accounts.sql
-- PayByPalm — ledger accounts, merchants, terminals, and new-user provisioning.
--
-- MONEY RULE, enforced everywhere in this schema:
--   All amounts are bigint MINOR units (kobo). Never float, never numeric.
--   No table in this schema has a `balance` column. Balance is derived by summing
--   ledger_entries — see the account_balances view in 0005_ledger.sql.

create table public.accounts (
  id         uuid primary key default gen_random_uuid(),

  -- Nullable: merchant and float accounts have no owning user.
  user_id    uuid references public.profiles (id) on delete cascade,

  kind       text not null check (kind in ('user', 'merchant', 'float')),
  currency   text not null default 'NGN',
  created_at timestamptz not null default now(),

  -- Keeps `kind` and `user_id` from disagreeing: a user wallet must have an owner,
  -- and a merchant or float account must not.
  constraint accounts_owner_matches_kind check (
    (kind = 'user' and user_id is not null)
    or (kind in ('merchant', 'float') and user_id is null)
  )
);

-- Exactly one wallet per user.
create unique index accounts_one_wallet_per_user
  on public.accounts (user_id)
  where kind = 'user';

-- Exactly one float account for the whole system. Every indexed row has the same
-- value for `kind` ('float', per the predicate), so a unique index over that column
-- permits precisely one such row. The float account is the counterparty for every
-- top-up; a second one would silently split the system's funding source in two.
create unique index accounts_single_float
  on public.accounts (kind)
  where kind = 'float';

create table public.merchants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  account_id uuid not null unique references public.accounts (id),
  created_at timestamptz not null default now()
);

create table public.terminals (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  label        text not null,

  -- SHA-256 of the terminal's API key, never the key itself. A dump of this table
  -- must not yield a working credential.
  api_key_hash text not null unique,

  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

comment on column public.terminals.api_key_hash is
  'SHA-256 of the X-Terminal-Key value. The plaintext key exists only on the device.';


-- ---------------------------------------------------------------------------
-- New-user provisioning
-- ---------------------------------------------------------------------------
-- Fires on auth.users insert and creates the profile plus its wallet account in
-- the same transaction, so a signed-up user can never exist without somewhere to
-- hold money.
--
-- SECURITY DEFINER because the trigger runs in the context of the Supabase auth
-- schema owner; search_path is pinned to defeat search-path hijacking.
--
-- The PIN is deliberately NOT handled here. Hashing a secret is the backend's job
-- (bcrypt, in POST /auth/signup); a SQL trigger has no safe way to do it.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_phone     text;
begin
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  v_phone     := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');

  -- Fail loudly rather than creating a half-formed profile. The backend must send
  -- full_name and phone as auth metadata at signup.
  if v_full_name is null or v_phone is null then
    raise exception
      'signup requires full_name and phone in raw_user_meta_data (got full_name=%, phone=%)',
      coalesce(v_full_name, '<null>'), coalesce(v_phone, '<null>')
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.profiles (id, full_name, phone)
  values (new.id, v_full_name, v_phone);

  insert into public.accounts (user_id, kind)
  values (new.id, 'user');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
