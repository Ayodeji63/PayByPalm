-- 0005_ledger.sql
-- PayByPalm — transactions, double-entry ledger, and derived balances.
--
-- THE LEDGER RULE: money only ever moves as a balanced pair of entries. There is
-- no balance column anywhere in this database. A balance is a question you ask the
-- ledger, not a number you store and hope stays right.

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),

  -- Null for top-ups, which originate in the wallet app rather than at a terminal.
  terminal_id     uuid references public.terminals (id),
  merchant_id     uuid references public.merchants (id),

  amount_minor    bigint not null check (amount_minor > 0),
  description     text,

  status          text not null default 'pending'
                  check (status in ('pending', 'authenticated', 'settled', 'failed', 'cancelled')),

  -- Set by the palm match at /authenticate. Null while pending.
  matched_user_id uuid references public.profiles (id),

  -- Our score for the winning match, retained for dispute review and for
  -- calibrating the accept/step-up thresholds against real-world data.
  match_score     int,

  -- 'compare' = last4-binned near-1:1 (production path).
  -- 'search'  = pure 1:N palm, nothing typed (demo path).
  match_mode      text check (match_mode in ('compare', 'search')),

  failure_reason  text,

  created_at      timestamptz not null default now(),

  -- Distinct from created_at, which is stamped at 'pending'. The 60-second
  -- stale-auth window at /confirm is measured from THIS clock: a palm match that
  -- has been sitting around must not still be spendable.
  authenticated_at timestamptz,

  settled_at      timestamptz,

  -- Raised from the wallet app's transaction detail screen.
  disputed_at     timestamptz,
  dispute_reason  text
);

comment on column public.transactions.authenticated_at is
  'When the palm match succeeded. The stale-auth window at /confirm is measured from here, not created_at.';


create table public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  account_id     uuid not null references public.accounts (id),
  direction      text not null check (direction in ('debit', 'credit')),
  amount_minor   bigint not null check (amount_minor > 0),
  created_at     timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- account_balances — the ONLY way a balance is ever read
-- ---------------------------------------------------------------------------
-- LEFT JOIN so an account with no entries yet reports 0 rather than vanishing
-- from the result set.
--
-- security_invoker = true (Postgres 15+) makes the view run with the CALLING
-- user's permissions. Without it a view executes as its owner, which would let any
-- authenticated client read every account's balance straight through the RLS
-- policies on the underlying tables. This one setting is what keeps the view from
-- becoming a hole in the row-level security defined in 0008_rls.sql.

create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  coalesce(
    sum(case when e.direction = 'credit' then e.amount_minor else -e.amount_minor end),
    0
  )::bigint as balance_minor
from public.accounts a
left join public.ledger_entries e on e.account_id = a.id
group by a.id;

comment on view public.account_balances is
  'Derived balances. No balance is stored anywhere; this view is the single read path.';


-- ---------------------------------------------------------------------------
-- Balanced-transaction invariant
-- ---------------------------------------------------------------------------
-- post_transaction() and post_topup() write balanced pairs by construction. This
-- trigger is the backstop for any future code path that does not: it makes an
-- unbalanced transaction impossible to commit, rather than merely unlikely.
--
-- DEFERRABLE INITIALLY DEFERRED is essential — it runs at COMMIT, not per
-- statement. A non-deferred check would fire after the first INSERT of a pair,
-- see debits ≠ credits, and reject every legitimate write.

create or replace function public.assert_transaction_balanced()
returns trigger
language plpgsql
as $$
declare
  v_txn uuid;
  v_net bigint;
begin
  -- NEW is unassigned in a DELETE trigger, so branch rather than coalesce.
  if tg_op = 'DELETE' then
    v_txn := old.transaction_id;
  else
    v_txn := new.transaction_id;
  end if;

  select coalesce(
           sum(case when direction = 'debit' then amount_minor else -amount_minor end),
           0
         )
    into v_net
  from public.ledger_entries
  where transaction_id = v_txn;

  if v_net <> 0 then
    raise exception
      'unbalanced ledger transaction %: debits minus credits = % (must be 0)', v_txn, v_net
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger trg_ledger_balanced
  after insert or update or delete on public.ledger_entries
  deferrable initially deferred
  for each row
  execute function public.assert_transaction_balanced();
