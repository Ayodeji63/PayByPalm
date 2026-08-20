-- 0002_profiles.sql
-- PayByPalm — user profiles.
--
-- `profiles` is the application-side mirror of `auth.users`. Supabase owns
-- authentication (email/password, JWT issuance); we own everything else.
--
-- The row is created automatically by handle_new_user() — see 0003_accounts.sql,
-- which is where that trigger lives because it must also insert the user's
-- wallet account, and `accounts` does not exist until that migration.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null,

  -- Phone is the identity anchor. The terminal narrows a 1:N palm search down to
  -- near-1:1 by binning on the last four digits, so this must be unique and stable.
  phone         text not null unique,

  -- GENERATED, not maintained by application code. A plain column would eventually
  -- drift out of sync with `phone` after a number change and silently break the
  -- candidate lookup at the terminal. Postgres recomputes this on every write.
  phone_last4   text generated always as (right(phone, 4)) stored,

  -- bcrypt hash of the 4-digit wallet PIN, used for step-up auth when a palm match
  -- lands in the mid-confidence band. Nullable: set by the backend just after signup,
  -- because a Postgres trigger has no business hashing secrets.
  pin_hash      text,

  -- Denormalised convenience flag mirroring "has an active row in palm_bindings".
  -- palm_bindings remains the source of truth; this exists so the wallet app and the
  -- enrolment guard can answer "already enrolled?" without a join on every request.
  palm_enrolled boolean not null default false,

  created_at    timestamptz not null default now()
);

comment on column public.profiles.phone_last4 is
  'Generated from phone. Terminal payment bin — converts 1:N palm search into near-1:1 compare.';
comment on column public.profiles.palm_enrolled is
  'Mirror of "has an active palm_bindings row". palm_bindings is the source of truth.';
