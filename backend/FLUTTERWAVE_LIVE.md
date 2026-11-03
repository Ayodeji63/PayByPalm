# Enable real Flutterwave payments and merchant bank settlements

This is the live deployment path for PayByPalm. It uses real cards and merchants'
real Nigerian bank accounts. Paystack code, cards and history remain available for
switching back. No Flutterwave keys are currently configured in this local checkout;
set the private deployment variables below to activate it.

## 1. Apply the database migrations

In the existing Supabase project, apply the migrations you have not applied yet,
in order. Back up the database first; keep the existing card encryption key.

1. [`0031_payment_providers.sql`](../supabase/migrations/0031_payment_providers.sql)
2. [`0032_flutterwave_merchant_settlements.sql`](../supabase/migrations/0032_flutterwave_merchant_settlements.sql)

These migrations preserve accounts, enrolled palms, linked Paystack cards and
payment history. Migration 0032 adds private, audited Flutterwave setup records,
serializes creation attempts, and prevents two merchants sharing the same receiving
subaccount. Each file is applied once. If 0031 was already applied, start with 0032.
Do not rerun historical migrations or delete existing data.

## 2. Set the payment backend's Render environment

```dotenv
PAYMENT_PROVIDER=flutterwave
PAYMENT_MODE=live
FLUTTERWAVE_LIVE_SECRET_KEY=<your actual Flutterwave v3 live secret>
FLUTTERWAVE_WEBHOOK_HASH=<a random private value of at least 32 characters>
FLUTTERWAVE_NOAUTH_APPROVED=true
```

Set `FLUTTERWAVE_NOAUTH_APPROVED=true` only for the account Flutterwave has approved
for saved-card charges without OTP/3DS. This setting records that approval; it does
not enable the capability upstream. If approval is not yet available, keep it
false: card linking can work, but terminal payment authorization stays disabled.

Preserve `CARD_TOKEN_ENCRYPTION_KEY`, existing Paystack credentials, Supabase,
Better Auth, CCNet and other environment values. `PAYMENT_MODE=live` overrides the
legacy `PAYSTACK_MODE` fallback. Retained Paystack keys remain available only for
their own environment and for reconciliation; no automatic fallback is performed.

Use the live secret from the same Flutterwave business that will own the merchant
subaccounts. Never put secret keys in a `VITE_*` variable, wallet configuration,
terminal URL, repository or chat. Redeploy the backend after setting these values.

## 3. Configure webhooks

Generate a private hash with `openssl rand -hex 32`; set the exact same value as
`FLUTTERWAVE_WEBHOOK_HASH` on Render and the secret hash in Flutterwave's **V3**
webhook settings. Set the webhook URL to:

```text
https://paybypalm-backend.onrender.com/webhooks/flutterwave
```

Use your backend's actual HTTPS origin if it differs. Enable transaction/refund
notifications. In Flutterwave Business preferences, turn **Disable preferred
payment methods** off so `payment_options: card` applies to card linking.

Webhooks wake reconciliation. The backend verifies the original transaction using
authenticated GET before recording payment success; callback status is not proof.

## 4. Configure and deploy Admin and Wallet

On the **Admin Vercel project's server environment**, add:

```dotenv
FLUTTERWAVE_LIVE_SECRET_KEY=<the live secret from the same Flutterwave business>
```

Keep `PAYMENT_API_BASE_URL` pointed at the Render backend and retain Admin's other
private variables. Deploy the updated Admin and Wallet. Refresh the Pi kiosk to
load the updated wallet terminal. No Pi wiring or CCNet Docker/SQLite changes are
needed for the payment provider.

Visit `<backend>/payment-settings`. It must return:

```json
{"paymentMode":"live","paymentProvider":"flutterwave"}
```

Admin's Bank payouts must display **Live mode**. It follows the backend selection;
there is no separate Admin mode switch. Missing live credentials disable bank
verification and creation rather than falling back to a test key.

## 5. Create each merchant's receiving subaccount

1. In Admin, create or open the merchant. Save its business details, including a
   valid contact phone number. Flutterwave requires this for subaccount creation.
2. Open **Bank payouts** and confirm the provider is Flutterwave and mode is live.
3. Select the merchant's actual Nigerian bank and enter its 10-digit account number.
4. Click **Verify bank account**. Check that the returned account name belongs to
   the merchant. Verification returns the bank account name, not KYC approval.
5. Review **PayByPalm share (%)**. It defaults to **0%**: the merchant receives the
   payment less applicable Flutterwave processing fees, with no PayByPalm commission.
   An explicitly confirmed nonzero percentage is sent as the platform commission.
6. Confirm the named receiving account and commission, then click **Confirm and
   create payout account**. This action creates a real Flutterwave collection
   subaccount. It does not charge a customer or initiate a bank transfer.
7. Admin saves the returned `RS_...` recipient after fetching and checking its
   canonical details. The terminal payment adapter includes that merchant's saved
   recipient on subsequent card charges.

A collection subaccount links the merchant's existing bank account to split
payments. Flutterwave settles the allocated funds to that bank account according
to the account's settlement cycle. Creating the recipient is not proof that a bank
settlement has completed. View actual settlement status and any account activation
requirements in Flutterwave. [Flutterwave split-payment documentation](https://developer.flutterwave.com/docs/split-payments).

## 6. Handle interrupted setup safely

If creation times out or returns an uncertain result, Admin shows **Check status**.
Use that action: it fetches the original numeric ID or finds the request's opaque
metadata marker, then checks the original account. It never resends the creation
POST. Multiple tabs or repeated confirmation cannot acquire another creation claim
for the same merchant and environment.

If the original account cannot be confirmed, review it in Flutterwave. Do not create
a replacement account to resolve uncertainty. Existing codes imported using the
previous release continue to work; the compatibility import endpoint cannot replace
an in-progress or completed automated setup. Changing a configured receiving bank
is a separate reviewed operation, not a repeat of the creation form.

## 7. Link customers' cards and use the terminal

Existing customers retain their accounts and enrolled palms. They must link their
cards under Flutterwave because Paystack authorizations cannot be used with it.
The wallet shows a **real ₦100 verification payment** and requests a full refund
after successful verification. Choose an active Flutterwave card as default.

Checkout stays: amount → palm scan → review payer/card → **Pay** → verified receipt.
The receipt confirms the customer payment, while merchant bank settlement happens
separately. No live card charges or real subaccounts were created by automated
validation of this implementation; those actions happen when you operate the live
app with its configured credentials.

For API details and switching back, see [PAYMENT_PROVIDERS.md](PAYMENT_PROVIDERS.md).
