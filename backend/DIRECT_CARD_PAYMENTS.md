# Palm-authorized direct card payments

The terminal identifies a customer with a strong palm match, displays the amount
and masked default card, and charges that card after explicit confirmation.
There is no internal balance check, internal ledger debit, automatic card
fallback, or terminal PIN/OTP prompt. Marginal palm scores require another scan.
A bank can still decline or require issuer authentication; that never counts as
a successful payment. Initial card linking may require bank authentication.

## Comparing enrolled palms

The 1:1 candidate sweep treats Tencent's `2080017` / `1001025` as a definitive
exclusion for that candidate's missing hand direction, then checks the remaining
active bindings. The provider audit retains the original error and request ID.
This never counts as a positive match: exactly one explicit match is still
required. Missing users, application/configuration errors, image quality or
liveness failures, transport failures and ambiguous matches block authorization.

## Enable in the test environment

1. Apply `supabase/migrations/0018_card_payments.sql` in Supabase SQL Editor after
   migration 0017. Keep existing data and schema; no reset is needed. The updated
   migration is transactional and safe to rerun after an interrupted attempt.
   Missing legacy debit/top-up functions are skipped; any existing overloads lose
   application execute privileges.
2. Keep `PAYSTACK_MODE=test` and the existing test secret/encryption key.
3. Run `pnpm cards:test:preflight` from `backend`, then restart API and wallet.
4. Link a reusable test card, choose it as default, and enrol a palm. At a
   provisioned test terminal create a sale, scan, and confirm the displayed card
   charge. PIN/OTP is not part of terminal payment confirmation.
5. Verify Paystack's test transaction and the local transaction both succeed;
   `ledger_entries` must remain unchanged. Repeat confirmation of the same sale:
   there must be one `card_payment_attempts` row and one Paystack reference.

This migration has not been applied to the hosted database by the coding agent.
No real card or live key is needed for these checks. Prior successful hosted
card-linking tests do not establish that direct terminal token charges work.

## Financial state and recovery

`begin_card_payment` locks the terminal's transaction, rechecks palm freshness
and accept threshold, and locks the user's card selection against pause/remove/
default changes. The card must be the exact default shown after authentication,
active, unexpired, owned by the payer, and verified in the configured payment
mode. A single durable claim moves the sale to processing before any HTTP POST.

Only the winning request can POST `transaction/charge_authorization`. Later
requests and the worker only GET verification of the original reference. The
original token email is used even if the account email changes. Success is bound
to reference, amount, currency, mode, customer, card fingerprint, payment metadata
and configured merchant subaccount. Success marks the sale settled without
writing any wallet ledger entry. No platform-to-merchant wallet credit occurs.

A lost response, process crash or provider authentication requirement leaves the
sale processing until its actual result is known. Do not start another sale to
retry it. The terminal keeps its original sale/reference across reloads. A
processing sale cannot be cancelled. Verified failures are final and permit a
new sale; uncertain results are never treated as a failure or approval.

The reconciliation worker starts with the API and polls every 30 seconds. Signed
`charge.success` webhooks wake the durable attempt, then the worker independently
verifies Paystack. Configure the public test URL `/webhooks/paystack` before
claiming public webhook delivery has passed. Neither webhook bodies nor the
initial charge response directly settle a sale.

A crash between recording the claim and sending HTTP is intentionally not
retried automatically: it is indistinguishable from a lost accepted request.
Support must check the original reference with Paystack and its dashboard before
resolving such a sale. The current implementation provides no operator override
or automatic resend. Do not manually label an uncertain charge failed to unblock
another charge. Encrypted authorization snapshots are cleared on final outcomes.

## Balance display and historical data

Paystack's saved-card integration does not supply the cardholder's bank balance.
`GET /me` returns `balanceMinor: null`, `cardBalanceAvailable: false` and
`paymentSource: "linked_card"`. The wallet explains that available funds must be
checked in the bank app. Never substitute Paystack's merchant balance, an old
ledger balance, a fabricated zero, or spending history for a card balance.

The old ledger is retained as historical data. `/topup` is retired (410), and the
application role loses execute access to `post_topup` and `post_transaction`.
Account-security PIN management remains separate from terminal payments.

## Merchant settlement and live rollout

The original Pi camera flow (`TENCENT_CAPTURE_MODE=legacy`) supports the operator's
controlled live tests. It has no account allowlist or additional pilot amount cap.
Normal validation, strong/unique palm matching, ownership, freshness, card-mode,
settlement and idempotency checks still apply. Local hand guidance is not validated
biometric liveness. `TENCENT_H5_IMAGE_ONLY_APPROVED` applies only to the separate,
optional H5 implementation; it is not required for the original camera.

Deploy the updated backend and wallet together. In Render, save these together:

```dotenv
PAYSTACK_MODE=live
PAYSTACK_SECRET_KEY=YOUR_PRIVATE_LIVE_SECRET
TENCENT_CAPTURE_MODE=legacy
# Preserve the existing CARD_TOKEN_ENCRYPTION_KEY for the existing database.
```

The Render Blueprint leaves payment mode and secrets in dashboard configuration
so syncing it does not reset the chosen mode to test. Configuration still rejects
a mismatched test/live key. No live key is committed or sent to the Pi/frontend.
Set the live Paystack webhook to the API's `/webhooks/paystack` URL. Configure the
merchant's `paystack_subaccount`, link a real card through live hosted checkout,
then select it as default before trying a fresh terminal sale. Check that the
displayed amount/card are correct, confirm once, and verify the same reference
in Paystack Live Mode. Reconcile uncertain outcomes on that reference.

For a live readiness review, after configuring a separate live process privately:

```bash
pnpm cards:live:preflight --user-id USER_UUID --merchant-id MERCHANT_UUID
```

This command never enables live mode, changes database state, or initializes a
checkout, charge or refund. It checks local palm-binding state, the default card's
verified **live** origin, credential decryption, merchant subaccount lookup using
a Paystack GET, and outstanding sandbox charges. It refuses a test-mode process
before making any requests. Credentials, email, card tokens and bank account
details are not printed. A passing result is not evidence of webhook delivery,
biometric liveness, a real charge, refund processing or bank settlement.

Before an actual live test, the operator must have Paystack Live Mode activated,
configure the live secret and its live webhook in the backend environment, and
link a real card through live hosted checkout to obtain a new reusable
authorization. Existing sandbox cards/history are not converted into live records.
Keep the existing card encryption key for an existing database. Use the original
authorization email when charging. Check the exact reference in Paystack Live
Mode, independently of the app's transaction history. The card-linking ₦50
verification payment and its refund are separate from a terminal purchase.

Sources: [Paystack activation](https://support.paystack.com/en/articles/2125506),
[test/live separation](https://support.paystack.com/en/articles/2129922),
[reusable authorizations](https://paystack.com/docs/payments/recurring-charges/).

With migration 0022, test mode collects simulated payments into the configured
Paystack test business and retains the merchant’s live subaccount without sending it. That does not establish a merchant payout rail.
For live mode every merchant must have its correct Paystack split subaccount
configured in `merchants.paystack_subaccount` (`ACCT_...`), using the same Paystack
business as the live secret. The server refuses a live charge without it. The
subaccount is snapshotted before charging and verified against the provider.
Configure and test settlement destinations and fees before enabling live keys.
The application's settled status means Paystack verified collection; it does not
assert that bank settlement or merchant payout has completed.

## Validation

Automated service tests cover binding, mode mismatch, replay, timeout recovery,
provider declines, issuer authentication, secret handling and receipt gating.
Isolated Postgres tests cover no ledger mutations, authorization/ownership,
card selection, concurrent charge claims, cancellation races, final outcomes and
browser access restrictions. Run `bash supabase/tests/run.sh` from the root.
Automated tests use fixtures and do not certify live collection, refunds or bank
settlement. Run the read-only live preflight and verify actual provider outcomes
for the selected merchant after applying migration 0022.

Provider reference: https://paystack.com/docs/payments/recurring-charges/

## One switch for the wallet, admin and backend

Apply `supabase/migrations/0022_payment_modes.sql` once, then deploy the backend
and wallet changes together. Existing users, palms and financial records are retained.
Verified legacy cards are classified using their verified checkout origin;
ambiguous or unverified cards remain unclassified and must be relinked.

There is **no frontend payment-mode environment variable** and no Paystack key
belongs in the wallet Vercel project, the wallet bundle or the Pi. `/me`, `/cards` and `/transactions` report
the backend's `paymentMode`. Card screens refresh on focus and every 30 seconds;
the dashboard also refreshes cards when `/me` observes a changed mode. Checkout
checks mode again before opening, and the server rejects stale-mode consent.

For each future switch, finish/reconcile pending payments and verification refunds
in the current environment first. Save both Render environment values together,
then redeploy the backend:

| Environment | `PAYSTACK_MODE` | `PAYSTACK_SECRET_KEY` |
| --- | --- | --- |
| Sandbox | `test` | Your private `sk_test_…` key |
| Real money | `live` | Your private `sk_live_…` key |

For the separate admin server, configure these once in its Vercel project:
`PAYMENT_API_BASE_URL=https://paybypalm-backend.onrender.com`,
`PAYSTACK_TEST_SECRET_KEY` and `PAYSTACK_LIVE_SECRET_KEY` (the same business's
private keys). Deploy the updated backend and admin once. The admin reads
`/payment-settings` on the main backend and chooses its matching server key
without another admin deployment. It ignores any old admin `PAYSTACK_MODE`.
Bank payouts refresh on focus, every 30 seconds while visible and before creation;
a mode switch clears previous bank confirmation. If the backend cannot confirm
its mode, payout operations wait instead of guessing. See `admin/README.md`.

Preserve `CARD_TOKEN_ENCRYPTION_KEY`. The wallet follows the running backend;
no wallet rebuild or Pi configuration change is needed for future mode switches.
Test/live credentials, defaults, pending checkouts and transaction history are
separate. Switching back restores the corresponding cards and history. A test
card is never upgraded to live: link a real card in live mode and configure the
merchant's live `ACCT_…` settlement code. Never leave a completed test checkout
waiting for verification when retiring its test-key process. A late old-mode
callback is retained for reconciliation under its original mode, not processed
with the other environment's key.

Run `python3 supabase/tests/payment_modes_migration_test.py` for disposable
PostgreSQL backfill/isolation tests. `wallet/tests/cards-browser.mjs` uses fixture
APIs to exercise test→live→test without rebuilding and rejects a switch between
pre-check and checkout POST; it performs no real payment.
