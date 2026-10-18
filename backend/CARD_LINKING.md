# Verified card linking

The restored Cards page uses Paystack-hosted checkout. The backend initializes a
fixed NGN 5,000-kobo (₦50) transaction, verifies it, saves a reusable authorization
and requests a full refund. No PAN, CVV, secret key or reusable authorization is
accepted from the wallet or returned to it. Provider authorization details and
original email are encrypted together with AES-256-GCM, bound to the user's ID.
Only masked issuer, brand, last four digits and actual expiry reach the browser.

For sandbox credentials, official test cards and acceptance cases, see [CARD_TESTING.md](CARD_TESTING.md).

## Required deployment setup

1. Apply pending database migrations in order, including
   `supabase/migrations/0017_verified_cards.sql`, using Supabase SQL Editor or
   `supabase db push`. The migration creates two tables, enables RLS and restricts
   tables/functions to the backend service role. It preserves existing users and
   wallet balances. Local code does not automatically apply hosted migrations.
2. In **backend/.env** locally and your backend host's secret settings in production,
   set `PAYSTACK_SECRET_KEY` from Paystack Dashboard → Settings → API Keys & Webhooks.
   Keep `PAYSTACK_MODE=test` with a test secret during testing. Live operation
   requires explicitly setting `PAYSTACK_MODE=live` and a matching live secret. A browser
   public key is insufficient. Never put the secret in `VITE_` variables or chat.
3. Generate `CARD_TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32` and store it
   in those same backend secret settings. Keep a secure copy; do not regenerate
   it on restart. Rotating it requires decrypting/re-encrypting existing tokens and
   migrating their signature hashes. Losing it requires users to relink cards.
4. Set `WALLET_BASE_URL` to the wallet origin. Callback is `/cards` on that origin.
   Set Paystack's webhook URL (for the matching test/live environment) to
   `https://YOUR-API-HOST/webhooks/paystack`. Localhost needs a public HTTPS tunnel
   for webhooks; the authenticated return/status flow still works locally.
5. Deploy the backend and wallet together. Keep refund funds available in Paystack
   and confirm your Paystack account supports reusable cards and refunds. Test a
   complete checkout/verify/refund sequence with Paystack test cards before live use.
   This implementation's automated tests mock Paystack and do not exercise your
   merchant account or create charges. No live provider transaction was initiated.

Neither key is required to boot the rest of the wallet. Without them the card
page shows that payment setup is incomplete; it never requests a verification
charge. A configured Paystack key without its encryption key fails startup.
Payment mode defaults to test and rejects a mismatched key, independently of NODE_ENV.
A production-built staging server can use test mode. Do not mix live and test payments in a DB.

## Lifecycle and recovery

- Authenticated `GET /cards`: masked active cards and recent linking/refund status.
- `POST /cards/link`: `{requestId: UUID, consent: true}`. All pricing, reference,
  email, metadata, channels and callback URL are server controlled. Unique request
  and per-user open-checkout constraints prevent duplicate initialization. A
  repeated request reuses its existing checkout. Definitive failed payments allow
  a new request; unfinished checkout can be resumed from the Link button.
- `POST /cards/link/verify`: `{reference}`. Requires ownership before provider
  access. Server checks success, reference, NGN amount, mode, email and stored
  purpose/user/request metadata. It saves only supported, reusable, unexpired
  authorizations. Verified payments for unsupported cards are refunded too.
- `POST /cards/:id`: `{action: 'pause'|'resume'|'default'|'remove'}`. Every mutation
  checks ownership. Database locks serialize defaults/removal and verification.
  Removed cards have their encrypted credential cleared. Replaying an old callback
  cannot restore a removed card. Fingerprints are reserved to one account.
- Webhooks verify HMAC-SHA512 over original bytes using constant-time comparison,
  persist a wakeup and acknowledge. They do not trust event card fields. A worker
  runs every 30 seconds and on boot, using database leases across API replicas.
  It verifies outstanding payments and reconciles refunds using Paystack's API.
- A refund POST is recorded as `submitting` before the network request. On timeout
  or restart, only refund GET queries run for that transaction; the POST is never
  blindly retried. Missing/ambiguous, failed or needs-attention refunds show a
  support status rather than claiming money was returned. Pending/processing is
  distinct from processed. Bank posting may take longer than provider processing.
- For `manual_review`, locate the exact reference in Paystack Dashboard and inspect
  its existing refunds. If none exists, issue **one full ₦50 refund** there. Do not
  create a second refund for a pending one. Then select Check status in the wallet
  or run `npx tsx scripts/reconcile-card-links.ts` from backend. If Paystack reports
  failure/needs-attention, resolve it through Paystack; retain the original refund
  ID. Never reset `refund_status` to `not_requested` to retry an uncertain POST.
- On a host that sleeps, arrange an external scheduler to run that reconciliation
  script against the same secrets/database. Otherwise durable records resume when
  the API next wakes; checking status in the app also runs reconciliation.

Card linking does not credit an internal wallet or expose a bank balance.
Palm terminal payments now charge the saved default card directly after a strong
palm match and explicit confirmation. Apply migration 0018 and follow
[DIRECT_CARD_PAYMENTS.md](DIRECT_CARD_PAYMENTS.md) before testing that flow.
Pausing or removing a card prevents new charges; an already initiated charge
must still be reconciled using its original reference.
