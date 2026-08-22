-- 0004_palm.sql
-- PayByPalm — palm bindings and the biometric audit trail.

-- ---------------------------------------------------------------------------
-- palm_bindings
-- ---------------------------------------------------------------------------
-- Links a user to the palm template Tencent holds for them. We store only the
-- opaque Tencent palm id — never an image, never a biometric template. Tencent is
-- a pure matching oracle: it knows a UserId (our profiles.id) and nothing else.
--
-- Revocation is SOFT. A revoked binding keeps its row so the audit trail stays
-- intact; re-enrolment inserts a NEW row rather than mutating the old one.

create table public.palm_bindings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tencent_palm_id text not null,
  enrolled_at     timestamptz not null default now(),
  revoked_at      timestamptz
);

-- One ACTIVE binding per user — enrolment is one-time.
--
-- This is a PARTIAL unique index, not a plain `unique (user_id)`. A plain unique
-- constraint would make revoke-then-re-enrol impossible: the revoked row would
-- still occupy the user's only slot and the second insert would fail. Scoping
-- uniqueness to `revoked_at is null` enforces the real rule (at most one live
-- binding) while permitting an unlimited revoked history.
create unique index palm_bindings_one_active
  on public.palm_bindings (user_id)
  where revoked_at is null;

create index palm_bindings_user_idx on public.palm_bindings (user_id);

comment on index public.palm_bindings_one_active is
  'At most one live binding per user. Partial (not plain) unique so soft revoke can be followed by re-enrolment.';


-- ---------------------------------------------------------------------------
-- palm_audit
-- ---------------------------------------------------------------------------
-- One row for EVERY provider call — success and failure alike. This is the
-- dispute trail: it is what lets us answer "why was this person charged?" months
-- later. Written by the auditing decorator that wraps the palm provider, so no
-- call site can forget it.
--
-- Contains no image data and no biometric template, only the outcome.

create table public.palm_audit (
  id                 uuid primary key default gen_random_uuid(),

  -- Which provider operation ran: 'register' | 'compare' | 'search' | 'delete'.
  endpoint           text not null,

  -- Tencent's requestId, echoed back for support escalation. Null for the mock
  -- provider and for calls that failed before a response was received.
  tencent_request_id text,

  -- Intentionally NOT a foreign key. Audit rows must outlive the user they
  -- describe; a cascade delete here would erase the evidence along with the
  -- account. For 'search' this is the user the provider returned, if any.
  user_id            uuid,

  score              int,

  -- The provider's own verdict, recorded alongside our score so our thresholds
  -- can be calibrated against it rather than guessed at.
  is_match           boolean,

  latency_ms         int,

  -- Non-zero Tencent `code`, or null on success.
  error_code         int,

  created_at         timestamptz not null default now()
);

create index palm_audit_created_idx on public.palm_audit (created_at desc);
create index palm_audit_user_idx on public.palm_audit (user_id, created_at desc);

comment on table public.palm_audit is
  'Every palm provider call, success or failure. Dispute trail. Never contains images.';
comment on column public.palm_audit.user_id is
  'Deliberately not a FK — audit rows must survive deletion of the user they describe.';
