-- 0008_rls.sql
-- PayByPalm — row-level security.
--
-- MODEL
--   The backend holds the service role key, which carries BYPASSRLS. Every write
--   in this system goes through it. The service role key must never reach a
--   browser, a phone, or the Pi.
--
--   The anon/authenticated keys are shipped to clients, so everything reachable
--   with them is treated as public. Clients get SELECT on their own rows and
--   nothing else — no INSERT, UPDATE, or DELETE policy exists anywhere in this
--   file. A client cannot write to this database at all.
--
--   Tables with RLS enabled and zero policies are fully closed to anon and
--   authenticated. That is deliberate for the operational tables at the bottom,
--   not an oversight.

alter table public.profiles       enable row level security;
alter table public.accounts       enable row level security;
alter table public.merchants      enable row level security;
alter table public.terminals      enable row level security;
alter table public.palm_bindings  enable row level security;
alter table public.palm_audit     enable row level security;
alter table public.transactions   enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.enrol_sessions enable row level security;


-- ---------------------------------------------------------------------------
-- Reader policies — a user sees their own data, and only their own
-- ---------------------------------------------------------------------------

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy palm_bindings_select_own on public.palm_bindings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A user sees the payments they were matched to. Terminal-side detail (which
-- device, which merchant) is joined in by the backend, not read directly.
create policy transactions_select_own on public.transactions
  for select to authenticated
  using (matched_user_id = (select auth.uid()));

-- Entries on accounts the user owns. This policy is also what makes an optional
-- Supabase realtime subscription on the ledger safe to expose to the wallet app.
create policy ledger_entries_select_own on public.ledger_entries
  for select to authenticated
  using (
    account_id in (
      select id from public.accounts where user_id = (select auth.uid())
    )
  );

-- Note on `(select auth.uid())`: wrapping the call in a scalar subquery lets the
-- planner evaluate it once per query instead of once per row, which matters on
-- the ledger table as history grows.


-- ---------------------------------------------------------------------------
-- Closed tables — RLS on, no policies, backend-only
-- ---------------------------------------------------------------------------
--   merchants, terminals   — terminals holds API key hashes and device inventory.
--   enrol_sessions         — a readable session table would let an attacker watch
--                            for pending sessions and race the legitimate phone.
--   palm_audit             — biometric outcome history for every user.
--
-- No policy is created for these on purpose. Anon and authenticated get nothing.


-- ---------------------------------------------------------------------------
-- Views and functions
-- ---------------------------------------------------------------------------

-- account_balances is declared security_invoker (0005), so it inherits the RLS
-- above and a user sees only their own account's balance through it.
grant select on public.account_balances to authenticated;

-- The money-moving functions are SECURITY DEFINER, which means they run with the
-- owner's privileges and ignore RLS entirely. Postgres grants EXECUTE on new
-- functions to PUBLIC by default — leaving that in place would let any client
-- with the anon key call post_topup() and mint themselves an unlimited balance.
-- Revoke first, then grant narrowly.
revoke execute on function public.post_transaction(uuid)              from public, anon, authenticated;
revoke execute on function public.post_topup(uuid, bigint, text)      from public, anon, authenticated;
revoke execute on function public.balance_of(uuid)                    from public, anon, authenticated;
revoke execute on function public.handle_new_user()                   from public, anon, authenticated;

grant execute on function public.post_transaction(uuid)         to service_role;
grant execute on function public.post_topup(uuid, bigint, text) to service_role;
grant execute on function public.balance_of(uuid)               to service_role;


-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Publishing ledger_entries lets the wallet app subscribe and reflect a terminal
-- payment on the phone within a second. The RLS policy above still applies to the
-- subscription, so a user only receives their own entries.
--
-- Polling remains the primary mechanism in the wallet app; this is an enhancement
-- layered behind it, never the sole path. Guarded because the publication does not
-- exist on a bare Postgres.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.ledger_entries;
    exception
      when duplicate_object then null;  -- already published, fine
    end;
  end if;
end;
$$;
