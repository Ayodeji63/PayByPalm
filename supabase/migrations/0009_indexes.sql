-- 0009_indexes.sql
-- PayByPalm — indexes for the hot paths.
--
-- Uniqueness-enforcing indexes live with their tables (0003, 0004); these are
-- purely for lookup performance.

-- The terminal payment bin. Every /authenticate call in the production path runs
-- this lookup before any biometric work happens, so it must not be a seq scan.
create index if not exists profiles_phone_last4_idx
  on public.profiles (phone_last4)
  where palm_enrolled;

-- Wallet transaction history, newest first — matches the ORDER BY of GET /transactions.
create index if not exists transactions_user_created_idx
  on public.transactions (matched_user_id, created_at desc);

-- Balance derivation sums by account; history detail fetches by transaction.
create index if not exists ledger_entries_account_idx
  on public.ledger_entries (account_id);

create index if not exists ledger_entries_transaction_idx
  on public.ledger_entries (transaction_id);

-- Session polling and the expiry sweep both filter on this pair.
create index if not exists enrol_sessions_status_expiry_idx
  on public.enrol_sessions (status, expires_at);

comment on index public.profiles_phone_last4_idx is
  'Partial on palm_enrolled — an un-enrolled user can never be a payment candidate, so they do not belong in the index.';
