# Card linking — sandbox test plan

Use Paystack's test environment and official test cards only. No personal card is
needed. A valid Paystack **test secret** (`sk_test_…`) is still required for hosted
checkout; fixture tests can run without any Paystack account. Never paste keys
into chat, browser code or a test report. Regenerate any shared test secret.

## 1. Configure and check the test environment

Backend `.env`:

```dotenv
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=YOUR_PAYSTACK_TEST_SECRET
# Preserve the CARD_TOKEN_ENCRYPTION_KEY already generated for this environment.
WALLET_BASE_URL=http://localhost:5173
```

Obtain the test secret from Paystack Dashboard → Settings → API Keys & Webhooks,
with the dashboard displaying Test Mode. This hosted-checkout integration does
not require a public key in the wallet. The backend rejects keys that do not
match PAYSTACK_MODE. Test mode is the default even with NODE_ENV=production;
NODE_ENV controls the application runtime, not whether a charge is real.
Switching the Paystack Dashboard view alone does not change the key in the app.
Use a separate Supabase project for eventual live users and balances.

Apply `supabase/migrations/0017_verified_cards.sql` to your **test project**:

1. Supabase Dashboard → select the project → SQL Editor → New query.
2. Open the migration in your local editor, copy the whole file into SQL Editor.
3. Click Run; success normally reports "Success. No rows returned."
4. If an error occurs, preserve the exact error. Do not delete existing tables,
   reset the project, or repeatedly execute fragments to bypass it.

Then run from the repository root:

```bash
pnpm --dir backend cards:test:preflight
```

This checks test mode, encryption configuration, table permissions, absence of
live card attempts, the verification-lock RPC, and a read-only Paystack request.
It does not initialize payment, link a card, or create a refund. A blocked result
means hosted checkout has not yet passed. Fix each blocker before continuing.

Start/restart the backend and wallet in separate terminals:

```bash
cd /home/dell/PayByPalm/backend
pnpm dev
```

```bash
cd /home/dell/PayByPalm/wallet
pnpm dev
```

For webhook tests, configure Paystack's **test-mode** webhook URL to
`https://YOUR-TEST-API-HOST/webhooks/paystack`. Localhost cannot receive Paystack
webhooks directly; use a public HTTPS test backend/tunnel. Keep WALLET_BASE_URL
and CORS origins matched to the wallet URL. Do not expose secrets through URLs.
For local return-only checks, the authenticated callback/status flow can be tested
before the public webhook is available; that does not prove webhook delivery.

Direct palm-to-card payments additionally require migration
`supabase/migrations/0018_card_payments.sql`. The preflight now checks both card
linking and direct-payment storage/RPCs. Follow
[DIRECT_CARD_PAYMENTS.md](DIRECT_CARD_PAYMENTS.md) for terminal acceptance testing.
Internal wallet funding and ledger debit are retired.

## 2. Official test cards

Use a future expiry such as **12/30**. The fields below are public Paystack test
fixtures, not personal card details. Enter them only in Paystack's test checkout.

| Case | Test card number | CVV | Extra authentication |
| --- | --- | --- | --- |
| Reusable success | `4084084084084081` | `408` | None |
| Bank-auth simulation, reusable | `5192602720584796` | `123` | Complete the bank simulator |
| PIN + OTP success | `5060666666666666666` | `123` | PIN `1234`; OTP `123456` |
| Declined | `4084080000005408` | `001` | — |
| Token not generated | `507850785078507853` | `082` | PIN `0000` |
| Refund fails | `4084080000671803` | `180` | — |
| Refund needs attention | `4084080000671902` | `190` | — |
| Insufficient funds API error | `4084080000670037` | `787` | — |

Source: https://paystack.com/docs/payments/test-payments/
Test mode behavior: https://support.paystack.com/en/articles/2129922

## 3. Hosted checkout acceptance matrix

Use dedicated confirmed test users A and B with wallet PINs. This tests card
linking, not the signup email deliverability or real bank posting. Record each
provider reference; do not record session tokens or authorization codes.

| Test | Steps | Required result |
| --- | --- | --- |
| Consent and charge disclosure | Open Cards before checking consent. | Test banner visible; checkout button disabled until consent; ₦50 disclosed. |
| Successful reusable card | Pay with reusable success card. | Server verifies it; actual issuer/last4/expiry shown; no fabricated bank balance. |
| Refund lifecycle | Check status after successful verification. | Only Paystack-confirmed processed status says processed; pending is shown honestly. |
| PIN + OTP | Use the PIN + OTP fixture in hosted checkout. | No linked card before authentication completes; then verified result. |
| Decline | Use declined card. Return/check status. | No card added, no refund for an unsuccessful charge; a fresh request is possible. |
| Missing authorization | Use token-not-generated card. | No usable card saved; any verified successful ₦50 payment is queued for refund. |
| Refund failure | Use failed-refund fixture. | Failed/manual-attention state; never a false successful refund. |
| Refund attention | Use needs-attention fixture. | Support/review state with the original reference; no blind second refund POST. |
| Close/reopen checkout | Start checkout, close it without paying, then Link again. | Reuse the outstanding checkout; no second verification payment. |
| Lost return | Complete checkout, close the tab before callback. | Signed webhook/worker discovers payment and refund; reopening Cards shows the result. |
| Callback replay | Reload the same return URL/check status repeatedly. | One card and at most one automatic refund POST per successful payment. |
| Same-card replay | Relink same reusable card as user A. | No duplicate active card row; each separately authorized verification payment has its own refund record. |
| Cross-user isolation | Sign in as B and submit A's reference/card ID. | 404; B cannot view, change, pause or remove A's card. |
| Card control | Pause, resume, set default, remove. Reload. | Changes persist on the server; removal clears credential; old callbacks cannot restore it. |
| Multi-device | Sign in as A in another browser. | Same server-saved cards; localStorage editing cannot create a verified card. |
| Provider outage | Block provider in an isolated fixture test. | Error/pending/review; no unverified card or invented success. |
| Lost refund response | Simulate timeout after refund acceptance in fixtures. | Reconciliation uses GET; no duplicate POST. |
| API tampering | Fixture tests for amount/currency/email/mode/reference/metadata changes. | Verification rejected; no card accepted. |
| Signature tampering | Replay valid and modified signed fixture payloads. | Modified/missing signatures rejected; valid replay cannot duplicate fulfillment. |

The per-user initialization limit is five requests/hour. Spread hosted scenarios
across dedicated test users or sessions; prefer automated fixtures for repeated
fault/race scenarios. Do not disable the shared abuse protection for testing.

## 4. Automated checks

From the repository root:

```bash
pnpm --dir backend test
pnpm --dir backend typecheck
pnpm --dir backend build
pnpm --dir wallet test:security
pnpm --dir wallet build
pnpm --dir wallet guard:secrets
bash supabase/tests/run.sh
```

The DB runner uses throwaway Docker Postgres, not the hosted database. Browser
checks `wallet/tests/cards-browser.mjs` and `wallet/tests/pwa-browser.mjs` use a
production preview plus Playwright and fixture API routes. They cover real UI
behavior without contacting Paystack or charging a card. Their success does not
substitute for hosted test checkout with your merchant account and test webhook.

## 5. Evidence and completion

Keep a sanitized report with date, test case, pass/fail, provider reference and
refund status. Mark unexecuted cases pending. Never label an unexecuted hosted
scenario as passed based on a mocked result. No live mode change is authorized
by this test plan. Complete these sandbox checks before considering live use.
Real issuer posting, bank statement refunds and real-card authorization behavior
cannot be established by simulated payments. Terminal card auto-debits are not
part of this linking flow; terminal settlement still uses the wallet ledger.
