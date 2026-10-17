# P2 payment remediation

## Implemented

- Production startup rejects the mock biometric provider. Production sandbox
  top-ups are rejected by the route and service; the demo seed CLI is also blocked.
- Authentication transitions require one successfully updated pending row.
  Insufficient-funds updates cannot overwrite other outcomes, and a missing PIN
  rejects step-up before changing the transaction to authenticated.
- Confirmation rejects scores rejected by the current policy. Expired matches
  do not update a payment to failed outside the settlement transaction.
- Migration 0011 makes financial details and completed outcomes immutable,
  derives authorization time from the database clock, and checks expiry after
  acquiring both settlement locks.
- Each initiation requires a UUID saleId, unique per terminal. Reusing the same
  saleId and details returns the original transaction; conflicting details fail.
- Repeated confirmation returns the settled receipt without another debit.
  Receipts omit customer balances and do not depend on a subsequent balance read.
- The terminal persists unresolved sales in its tab's sessionStorage. Unknown
  outcomes block fresh sales until checked. Lost responses are retried using
  the original sale/transaction IDs. Do not clear browser storage to bypass recovery.
- Wallet balances come from /me. Sample histories and fabricated balance defaults
  are removed. Transfers, card linking/charging, and simulated merchant reporting
  are unavailable until backed by verified server implementations.

## Required before deployment

1. Back up the database and apply supabase/migrations/0011_payment_integrity.sql
   in staging, then production. Apply the pending P1 migration 0010 as well.
   Refresh the Supabase Data API schema cache after changing RPC signatures.
2. Deploy the backend and terminal client together. Existing clients that omit
   saleId will be rejected. The old post_transaction(uuid) overload is replaced
   with post_transaction(uuid, integer), whose expiry argument defaults to 60.
   Pause sales and resolve existing in-flight transactions during rollout.
3. Use separate databases for sandbox and production. Before merchants accept
   payments, reconcile existing balances: old demo credits remain in the ledger.
   This migration does not erase or guess how to reverse historical financial
   records. Block live acceptance until synthetic balances are removed through
   an approved reconciliation process or a clean production database is provisioned.
4. Keep PALM_PROVIDER=tencent with a valid provider credential in production.
   AUTH_VALIDITY_SECONDS must be between 1 and 60. Verify real provider matching,
   liveness, and replay resistance using the actual hardware before live use.
5. Transfers and card charges must stay unavailable until server-side provider
   verification, ownership checks, unique provider references, reconciled refunds,
   and authoritative receipts exist. No new funding rail was implemented here.
6. The terminal recovery record survives reloads in the same tab. Closing the
   browser session, clearing its storage, or replacing the device can lose that
   local recovery context. Reconcile outstanding server transactions before
   starting sales on a replacement session; never assume a missing receipt means
   the customer was not charged.

No production settings, balances, migrations, or provider transactions were changed.

## Verification

- backend: npm test; npm run typecheck; npm run build
- wallet: npm run test:security; npm run build; npm run guard:secrets
- database: ./supabase/tests/run.sh (Docker and Python 3, isolated Postgres 17)

Database tests cover stable/concurrent sale creation, repeated settlement without
extra entries, immutable settled states, stale authorization, concurrent wallet
spending, and expiry after waiting for a payer-account lock. Client regression tests
cover lost initiation/settlement responses and fail-closed recovery of corrupt state.
