# Payment providers: Flutterwave v3 and Paystack

For real payments and automatic merchant bank setup, follow [the live rollout guide](FLUTTERWAVE_LIVE.md).

PayByPalm supports a selected provider for new card links and terminal payments.
`PAYMENT_PROVIDER=paystack` is the backward-compatible default. There is no automatic
fallback: a sale can acquire only one durable charge claim, with one provider,
environment, card, amount and reference. Provider selection never changes CCNet,
palm enrollments, accounts or previous payments.

## Deploy the upgrade

1. Back up Supabase and preserve the existing `CARD_TOKEN_ENCRYPTION_KEY`. Never
   replace that encryption key during a provider switch.
2. Apply [`0031_payment_providers.sql`](../supabase/migrations/0031_payment_providers.sql)
   once in the Supabase SQL editor, after migrations through 0030. Existing rows
   are backfilled as Paystack; no cards or payment history are deleted. This
   migration is transactional, but is not intended to be run twice.
3. Deploy the updated backend, wallet and admin app. The Pi serves the deployed
   wallet terminal; refresh its kiosk after the wallet deployment. No Pi GPIO,
   audio, Docker, SQLite or ngrok changes are needed for this payment integration.
4. Keep `PAYMENT_PROVIDER=paystack` initially. The existing `PAYSTACK_MODE` and
   `PAYSTACK_SECRET_KEY` configuration continues to work. Verify normal account,
   card and terminal access before switching.

## Configure Flutterwave on Render

Add these to the **backend's** environment, never to Vercel `VITE_*` variables or
the Pi. Use actual credentials from the same Flutterwave business account:

```dotenv
PAYMENT_PROVIDER=flutterwave
PAYMENT_MODE=test
FLUTTERWAVE_TEST_SECRET_KEY=<your Flutterwave v3 test secret>
FLUTTERWAVE_WEBHOOK_HASH=<a random private value of at least 32 characters>
FLUTTERWAVE_NOAUTH_APPROVED=false
```

Generate the webhook hash with `openssl rand -hex 32`. Configure the exact same
hash in Flutterwave's webhook settings. Use this URL:

```text
https://<your-backend-host>/webhooks/flutterwave
```

This v3 webhook checks `verif-hash`; it is a notification to recheck the payment,
not proof of payment. Server-to-server transaction verification decides outcomes.
Neither a redirect query parameter nor a signed webhook can settle a sale.

Keep the existing encryption key and Paystack credentials on Render so unresolved
Paystack payments and refunds can still reconcile. To retain both environments,
use `PAYSTACK_TEST_SECRET_KEY` / `PAYSTACK_LIVE_SECRET_KEY` and
`FLUTTERWAVE_TEST_SECRET_KEY` / `FLUTTERWAVE_LIVE_SECRET_KEY`. The single-key
`FLUTTERWAVE_SECRET_KEY` alias is also supported, only in its matching mode.
`PAYMENT_MODE` takes precedence over legacy `PAYSTACK_MODE`. A retained legacy
Paystack secret must still match `PAYSTACK_MODE`; using the explicit per-mode
variables avoids ambiguity when switching modes.

Redeploy the backend after editing the environment. `/payment-settings` exposes
only `paymentProvider` and `paymentMode`; the wallet and admin follow that selection.
No frontend payment secret or Flutterwave public key is needed for hosted checkout.

## Card linking and one-tap checkout

- In Flutterwave's Business preferences, turn **Disable preferred payment methods**
  off so the API's `payment_options: card` setting takes effect. Confirm the hosted
  checkout presents card payment in test mode.
- Existing Paystack tokens cannot be sent to Flutterwave. Each customer must link
  their card again under Flutterwave. Their account and enrolled palm stay intact.
- Flutterwave linking uses its hosted **card-only** checkout and a **₦100**
  verification payment. Paystack retains its **₦50** flow. The wallet states the
  selected provider and amount before consent. Amounts are stored as integer kobo;
  the Flutterwave adapter converts them to decimal naira at the boundary.
- After GET verification confirms the reference, original customer, amount,
  currency and metadata, the backend saves only encrypted reusable credentials
  plus masked card details, and requests the full verification-payment refund.
  Unsupported cards are refunded too; they cannot be used for checkout.
- Flutterwave card tokens are email-bound and expire. PayByPalm uses the original
  verified token email, stores the one-year credential expiry, and refuses new
  charges with expired credentials. Re-link the card when required.
- **Before terminal payments:** Flutterwave must approve your business for
  tokenized charges without OTP/3DS (`NOAUTH`). Only after that approval, set
  `FLUTTERWAVE_NOAUTH_APPROVED=true` on Render and redeploy. The flag does not
  grant Flutterwave approval. The integration does not bypass issuer challenges.
  A pending or redirected provider response never produces a successful receipt.
- The terminal keeps its existing scan → review → **Pay** → verified receipt flow.
  A payment is initiated only by the customer's Pay tap. There are no automatic
  retries of charge POSTs and no automatic switch to another provider.

## Merchant settlement setup

With migration 0032 and the updated Admin, Flutterwave bank verification and
subaccount creation are available directly in **Bank payouts**. Configure the same
Flutterwave business’s live secret on the Admin server, verify the bank account
name, confirm the commission, and create the receiving subaccount. See the
[live guide](FLUTTERWAVE_LIVE.md). Paystack’s setup remains available when selected.

The following dashboard-code import describes compatibility with the first
Flutterwave release; automated creation replaces that manual setup for new merchants.

For Flutterwave, create and verify the merchant's NGN split-payment subaccount in
**the same Flutterwave account and mode** used by the backend. Confirm its bank
recipient and fee configuration in Flutterwave. In PayByPalm Admin, edit the
merchant, open **Bank payouts**, and save its `RS_...` subaccount code. Test and live
codes are separate. Saving is an audited administrator action with stale-edit
protection; saving a code does not claim Flutterwave verified its bank details.
A Flutterwave secret is required on the admin server for automatic creation. The
legacy manual-code import remains available only without an automated setup in progress.

Live terminal checkout requires a saved settlement subaccount for that merchant.
The adapter includes it in the tokenized charge request. GET verification binds
the server-generated settlement metadata; because the v3 verification contract
does not provide a canonical split result here, confirm actual split routing in
Flutterwave's test reports before live use. PayByPalm's merchant payment history
continues to work; Flutterwave settlement reports are viewed in its dashboard for
this release. Paystack's existing automated bank/subaccount setup and settlement
reports remain available when Paystack is selected.

## API changes

Existing routes are retained. Customer routes require the normal authenticated
user session; no card credential is returned to the browser.

| Route | Behavior |
| --- | --- |
| `GET /payment-settings` | Public, uncached `{ paymentProvider, paymentMode }`; no secrets |
| `GET /cards` | Active-provider/mode cards and attempts; adds `provider`, provider-specific `amountMinor`; each attempt also has `provider` and `amountMinor` |
| `POST /cards/link` | `{ requestId: UUID, consent: true, paymentMode: "test" or "live", paymentProvider: "paystack" or "flutterwave" }`; returns an allowlisted `checkoutUrl` and durable `reference` |
| `POST /cards/link/verify` | `{ reference }`; verifies an owned attempt using its original provider, including after a switch |
| `POST /cards/:id` | `{ action: "default", "pause", "resume" or "remove", paymentMode, paymentProvider }`; owner and active selection checked |
| `POST /webhooks/flutterwave` | Provider callback using the configured v3 `verif-hash`; only queues authoritative GET verification |
| Admin `GET /api/payouts/banks` | Lists banks for the backend-selected provider and mode; private server credentials |
| Admin `POST /api/payouts/verify` | `{ merchantId, bankCode, accountNumber }`; returns masked account details and an opaque provider/admin/merchant/mode-bound verification token |
| Admin `POST /api/merchants/:id/payout` | `{ verificationToken, percentageCharge, expected }`; claims once, creates the selected provider’s receiving subaccount, and verifies it by GET |
| Admin `POST /api/merchants/:id/payout/check` | `{}`; checks the original request with GET only and never creates a replacement |
| Admin `POST /api/merchants/:id/payout/flutterwave` | Admin session and same-origin write; `{ mode, code: "RS_...", expected: merchant.updated_at }`; audited optimistic update |

Wallet returns accept Flutterwave's `tx_ref` alongside existing Paystack
`reference`/`trxref` parameters. The backend never trusts callback status or
transaction IDs. Omitted `paymentProvider` is accepted as legacy Paystack consent
only; a stale provider or mode is rejected with HTTP 409 and requires fresh consent.

## Recovery and refunds

Each attempt retains its original provider and test/live mode. Reconciliation
uses that provider's credentials even after a switch. Keep old credentials until
all in-flight charges and verification refunds reach a reviewed final state.
The API runs recovery on startup and every 30 seconds; `pnpm cards:reconcile` in
`backend/` runs it once without initiating new card charges.

A lost charge response is checked by the original reference using GET; it is never
reposted automatically. A lost refund POST is searched by its original transaction
ID or checked by saved refund ID, then marked for manual review if unconfirmed.
Never start a replacement refund to resolve uncertainty without checking upstream.
Flutterwave refund `completed` means initiated, not received. Only its documented
terminal refund statuses are shown as processed; bank posting may take longer.

## Switch back to Paystack

Set `PAYMENT_PROVIDER=paystack` and the intended `PAYMENT_MODE=test|live`, retain
that mode's Paystack key, and redeploy the backend. Customers' existing Paystack
cards and provider-specific default selection become available again. The existing
live merchant `ACCT_...` configuration remains intact. Do not delete Flutterwave
keys or records while reconciliation still needs them. Old authentication from
another provider cannot authorize a new charge; the customer scans again.

## Verification before live activation

The existing `cards:test:preflight` and `cards:live:preflight` commands remain
Paystack-specific; they do not validate Flutterwave readiness.

Automated tests use mocked HTTP and disposable PostgreSQL only. Run:

```sh
cd backend
pnpm test
pnpm build
cd ../admin
pnpm test
pnpm build
cd ../wallet
pnpm build
cd ..
python3 supabase/tests/payment_providers_test.py
```

In Flutterwave **test mode**, exercise hosted linking, return to Cards without
losing the session, token capture, refund tracking, successful and declined
terminal charges, a double Pay tap, a disconnected response, and recovery after a
provider switch. Confirm the exact merchant split and webhook deliveries in the
provider dashboard. Then configure `FLUTTERWAVE_LIVE_SECRET_KEY`, live subaccounts,
`PAYMENT_MODE=live`, and the NOAUTH approval flag. Live payment validation is a
separate customer-authorized step; automated tests never charge live cards.

Provider references: [Standard checkout](https://developer.flutterwave.com/docs/flutterwave-standard-1),
[tokenization and NOAUTH](https://developer.flutterwave.com/docs/tokenization),
[tokenized charges](https://developer.flutterwave.com/reference/charge-with-token-1),
[refund status meanings and minimum](https://developer.flutterwave.com/docs/refunds),
[v3 webhooks](https://developer.flutterwave.com/docs/webhooks).
