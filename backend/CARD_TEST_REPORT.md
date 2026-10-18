# Card sandbox testing — 18 October 2026 (Africa/Lagos)

## Completed

- Payment mode explicitly set to test locally and in the deployment template.
  Startup and provider client reject keys that do not match that mode. A test
  secret cannot enable live mode, and a live secret is rejected in test mode.
- Supplied test credential accepted by Paystack on a read-only API request.
  No credentials are included in this report. Shared test secrets need rotation.
- Backend: 163 automated tests passed across 12 files, including payment binding,
  declines, authentication-in-progress, refund failure/needs-attention, refund
  mismatch, ambiguous network outcomes, replay, ownership and webhook signatures.
- Wallet: 23 security regression tests passed.
- Backend typecheck and build passed; wallet production build passed.
- Isolated Postgres: all migrations through 0017 and schema, RLS, ledger integrity,
  concurrency, idempotency, abuse protection, identity and card-link tests passed.
  No hosted database reset or schema change was performed by this runner.
- Chromium fixture integration: consent, hosted-checkout navigation, verified
  card metadata, pending-to-processed refunds, pause/resume/remove, replay,
  missing configuration and load-failure recovery passed on mobile/desktop.
- Signup/PIN flow and PWA installability/private-cache/offline checks passed.
- Browser-bundle credential scan and git whitespace check passed.

## Actual hosted sandbox run

The user applied migration 0017 and supplied a successful hosted preflight.
Dedicated confirmed sandbox accounts were created in the test database; these
tests did not exercise signup email delivery. An isolated local API and wallet
used test keys and mock biometrics, without changing the user's running servers.

- User completed real hosted Paystack test checkout using the official reusable
  Visa fixture ending 4081, expiry 12/2030.
- Reference: `pbp_card_ab88d548b20c43f48d554dfb41a5cd6d`.
- Backend verification returned HTTP 200, status verified, and a saved default
  reusable card containing masked issuer/brand/last4/expiry fields only.
- Verified amount: 5000 kobo (NGN 50); provider domain: test.
- Backend requested the verification refund. App refund status was pending;
  Paystack transaction verification reported reversal-pending. This is not
  evidence of a completed refund.
- A second account's same-request and concurrent initialization calls reused
  one hosted checkout. Its sixth request returned 429 with Retry-After.
- Cross-account callback verification and card removal returned 404. Direct
  authenticated Supabase reads of encrypted card credentials were denied (42501).
- Pause, resume and default actions persisted on the actual saved test card.
  Callback replay kept one card; Paystack's refund-list API confirmed exactly one
  refund, still pending. The card remains available in the dedicated test account.
- Actual unfinished-checkout verification exposed a lifecycle bug: Paystack's
  abandoned status had been treated as failed, releasing the open-attempt guard.
  Fixed it to preserve pending/reusable checkout; regression test passes. See
  https://paystack.com/docs/payments/verify-payments/ for provider status meanings.
- After that correction, all 163 backend tests and typecheck passed again;
  backend build also passed.
- User completed the declined-card fixture in hosted checkout. Provider API
  confirmed failed in test mode for reference
  `pbp_card_9a339230af2d422385972cf8d5e07103`. Backend verification returned
  failed, refund not_requested, null card ID, and zero cards for that account.

## Remaining hosted acceptance cases

PIN/OTP and bank-auth simulator screens, insufficient-funds cards,
missing reusable authorization, failed/needs-attention refund fixtures, and
public Paystack test-webhook delivery remain unverified against the provider.
These behaviors have automated fixture coverage; that is not a substitute for
running the hosted matrix in CARD_TESTING.md. Automated checkout navigation was
blocked by Cloudflare, so the user completed the success case in a normal browser.

Retain sandbox records for review. The second checkout was declined and saved
no card. Refund completion must be checked separately; pending must not be presented
as processed. Do not switch to live payment mode based only on this success case.

No live key, personal card, or real-money transaction was used. No change to live
payment mode is authorized by these results. Real issuer posting and bank-statement
refund timing cannot be established with test payments.

## Direct-card payment implementation follow-up

Added migration 0018 and a separate direct-card payment rail after the card-link
success/decline tests above. The prior hosted card-linking results do not cover
this new rail. It charges the reusable default card after a fresh full-accept
palm match and explicit terminal confirmation. It does not read/debit/credit the
internal wallet ledger, accept a terminal PIN, or expose a bank balance.

Hosted migration 0018 and a real Paystack test-mode terminal token charge remain
pending. See DIRECT_CARD_PAYMENTS.md for enablement and recovery requirements.

Local follow-up verification: 187 backend tests and 24 wallet security tests
passed; backend typecheck/build and wallet production build passed. Chromium
fixture checks passed for card management, refunds and the updated balance
message at mobile and desktop sizes. SQL checks include direct-card claim and
cancellation races, no ledger writes and freshness after waiting for a card lock.
No hosted token charge was initiated during this implementation follow-up.
