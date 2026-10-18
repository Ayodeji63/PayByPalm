# Palm-authorized direct card payments

The terminal identifies a customer with a strong palm match, displays the amount
and masked default card, and charges that card after explicit confirmation.
There is no internal balance check, internal ledger debit, automatic card
fallback, or terminal PIN/OTP prompt. Marginal palm scores require another scan.
A bank can still decline or require issuer authentication; that never counts as
a successful payment. Initial card linking may require bank authentication.

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

In test mode an unset subaccount collects simulated payments into the configured
Paystack test business. That does not establish a merchant payout rail.
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
Hosted direct-card acceptance remains pending migration 0018 and a full test
terminal sale. Use only Paystack test fixtures until it passes.

Provider reference: https://paystack.com/docs/payments/recurring-charges/
