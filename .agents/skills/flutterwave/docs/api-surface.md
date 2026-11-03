# Flutterwave API Surface Notes

This document summarizes integration standards, base URLs, authentication mechanisms, and architecture patterns to keep Flutterwave skills accurate and aligned with current official documentation.

## Base URLs & Environments

Flutterwave operates across stable production (v3) and the next-generation Public Beta (v4):

### v3 API (Production Stable)
- **Base URL:** `https://api.flutterwave.com/v3`
- **Dashboard:** https://dashboard.flutterwave.com
- **Sandbox Test Keys:** Initiated via test keys in your Flutterwave dashboard (`FLWPUBK_TEST-...`, `FLWSECK_TEST-...`, `FLWENCKEY_TEST-...`).
- **Official Docs:** https://developer.flutterwave.com/docs
- **API Reference:** https://developer.flutterwave.com/reference
- **AI Agent Index:** https://developer.flutterwave.com/llms.txt
- **Markdown Docs Convention:** Append `.md` to any doc URL (e.g., `https://developer.flutterwave.com/docs/getting-started.md`) for AI ingestion.

### v4 API (Next-Gen Public Beta)
- **IDP Token Base URL (OAuth 2.0 OpenID Connect):**
  `https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token`
- **Sandbox API Base URL:** `https://developersandbox-api.flutterwave.com`
- **Production API Base URL:** `https://f4bexperience.flutterwave.com/`
- **v4 Documentation & LLM Index:** https://developer.flutterwave.com/v4.0.0/llms.txt

---

## Authentication Models

### 1. v3 Authentication (Static Secret Key)
v3 endpoints authenticate requests using HTTP Bearer authorization:
```http
Authorization: Bearer FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx-X
Content-Type: application/json
```
For card direct charges in v3, payload encryption utilizes Triple-DES (`3DES-24`) with an encryption key obtained from your dashboard or derived from your secret key.

### 2. v4 Authentication (OAuth 2.0 Client Credentials)
v4 uses OpenID Connect / OAuth 2.0:
1. Make a `POST` request to `https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token`
2. Header: `Content-Type: application/x-www-form-urlencoded`
3. Body:
   ```text
   grant_type=client_credentials&client_id={{CLIENT_ID}}&client_secret={{CLIENT_SECRET}}
   ```
4. Receive JSON response containing `access_token` and `expires_in`.
5. Pass `Authorization: Bearer {{access_token}}` on subsequent v4 requests.
6. Cache the access token in memory until expiration to prevent unnecessary token calls.

### 3. v4 Required Headers
Every v4 API request requires tracking and tracing headers:
- `Authorization: Bearer {{ACCESS_TOKEN}}`
- `Content-Type: application/json`
- `X-Trace-Id`: Unique string (12 to 255 characters) for distributed tracing and request observability.
- `X-Idempotency-Key` *(optional/recommended for mutations)*: Unique string (12 to 255 characters) to guarantee idempotency on retries.

---

## Webhook Verification Architecture

Flutterwave verifies incoming webhook notifications via a **secret hash** configured directly on your Flutterwave Dashboard:

1. **Dashboard Configuration:**
   - Navigate to **Settings > Webhooks** in the Flutterwave Dashboard.
   - Enter your unique secret hash (e.g. `FLW_WEBHOOK_HASH`).
2. **Incoming Request Header (`verif-hash`):**
   - Flutterwave includes the secret hash in the incoming request header: `verif-hash`.
   - The merchant server compares the incoming `verif-hash` with the environment variable `process.env.FLW_WEBHOOK_HASH`.
   - Always use constant-time string comparison (`crypto.timingSafeEqual`) to avoid timing attacks.
3. **Response SLA & Lifecycle:**
   - Return an HTTP `200 OK` status immediately within 60 seconds.
   - Flutterwave treats HTTP status codes other than 200, or redirects, as delivery failures and schedules retries.
   - Run asynchronous processing (DB updates, email, provisioning) in the background after returning HTTP 200.
4. **Mandatory Server Re-verification:**
   - Never credit accounts based solely on webhook payloads.
   - Always re-query the transaction by calling `GET /transactions/{id}/verify` (v3) or `GET /charges/{id}` (v4) to independently confirm amount, currency, status (`successful`), and `tx_ref`.

---

## Verified Resource Families

### v3 Core Operations
- **Hosted Checkout / Payments:** `POST /payments` -> returns hosted payment `link`.
- **Card Direct Charges:** `POST /charges?type=card` (encrypted payload) + `POST /validate-charge`.
- **Alternative Collection Rails:**
  - Bank Transfer: `POST /charges?type=bank_transfer`
  - Mobile Money: `POST /charges?type=mpesa`, `mobile_money_ghana`, `mobile_money_rwanda`, `mobile_money_uganda`, `mobile_money_franco`
  - USSD: `POST /charges?type=ussd`
- **Transactions & Verification:**
  - `GET /transactions/:id/verify`
  - `GET /transactions/verify_by_reference?tx_ref=...`
  - `GET /transactions`
- **Refunds:** `POST /transactions/:id/refund`
- **Payouts / Transfers:**
  - `POST /transfers`
  - `GET /transfers/:id`
  - `POST /transfers/:id/retries`
  - `POST /bulk-transfers`
- **Recipients & Beneficiaries:** `POST /beneficiaries`, `GET /beneficiaries`, `DELETE /beneficiaries/:id`
- **Split Payments & Subaccounts:** `POST /subaccounts`, `GET /subaccounts/:id`
- **Tokenized Recurring Charges:** `POST /tokenized-charges`
- **Subscriptions & Payment Plans:** `POST /payment-plans`, `GET /payment-plans`
- **Virtual Accounts:** `POST /virtual-account-numbers`, `POST /bulk-virtual-account-numbers`
- **Virtual Cards:** `POST /virtual-cards`, `GET /virtual-cards/:id`
- **Bill Payments:** `POST /bills`, `GET /bill-categories`
- **Identity & KYC Resolution:** `POST /accounts/resolve`, `POST /bvn/match`
- **Disputes & Settlements:** `GET /chargebacks`, `PUT /chargebacks/:id`, `GET /settlements`

### v4 Resource-Oriented Surface
- **Customers:** `/customers` (list, create, retrieve, update, search)
- **Charges:** `/charges` (list, create, retrieve, update, retry)
- **Payment Methods:** `/payment-methods` (list, create, retrieve)
- **Mobile Networks:** `/mobile-networks` (retrieve supported operators)
- **Banks & Branches:** `/banks`, `/banks/{id}/branches`, `/accounts/lookup`
- **Wallets & Balances:** `/wallets` (balances, statements, account lookup)
- **Transfers & Payouts:** `/transfers` (instant, deferred, scheduled)
- **Transfer Senders & Recipients:** `/transfer-senders`, `/transfer-recipients`
- **Transfer Rates & FX:** `/transfer-rates`
- **Settlement & Reporting:** `/settlement`
- **Chargebacks & Disputes:** `/chargebacks`
- **Refunds:** `/refunds`
- **Orders & Checkouts:** `/orders`
- **Virtual Accounts:** `/virtual-accounts` (static and dynamic account allocation)
- **Stablecoins & Cross-Border Corridors:** Real-time liquidity settlement rails

---

## Agent Guidance & Rules of Engagement

1. **Version Isolation:** Do not mix v3 request schemas (e.g. `tx_ref`, `customer.email` embedded directly) with v4 schemas (`payment_instruction`, `customer_id`, `payment_method_id`).
2. **Always Require tx_ref:** Include a deterministic, collision-resistant `tx_ref` or `reference` (UUID or domain order ID) for every payment or payout.
3. **Always Verify Server-Side:** Enforce double-check on verification endpoints before granting entitlements or goods.
4. **Resilient Webhook Parsing:** Implement HMAC/hash guards using `verif-hash` header comparison and deduplicate incoming events with idempotent processing locks.
