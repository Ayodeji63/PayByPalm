-- 0006_enrol.sql
-- PayByPalm — one-time enrolment handshake sessions.
--
-- The flow this table coordinates:
--   1. Terminal creates a session and renders its id as a QR code.   -> 'pending'
--   2. Phone scans the QR and claims the session with its user JWT.  -> 'claimed'
--   3. Terminal captures the palm and registers it with the provider.-> 'completed'
--
-- Short-lived by design (90s). A stale QR left on a terminal screen must not still
-- be claimable by a passer-by.

create table public.enrol_sessions (
  id          uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.terminals (id) on delete cascade,

  -- Null until the phone claims the session. This is the only moment a user
  -- identity enters the flow, and it arrives authenticated from the phone —
  -- the terminal never asserts who the user is.
  user_id     uuid references public.profiles (id) on delete set null,

  status      text not null default 'pending'
              check (status in ('pending', 'claimed', 'captured', 'completed', 'expired')),

  -- Set to now() + 90s at creation. Enforced in application code so an expiring
  -- session yields a friendly terminal message rather than a constraint error.
  expires_at  timestamptz not null,

  created_at  timestamptz not null default now()
);

comment on table public.enrol_sessions is
  'Short-lived QR handshake between a terminal and a phone. 90s TTL. Single use.';
