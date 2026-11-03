# Skill Map & Architecture Guide

This map organizes the 23 production skills by domain, providing quick access to primary v3 endpoints, v4 Next-Gen equivalents, and target use cases.

---

## 1. Core Integration Foundation

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave`** | Universal multi-endpoint router | Full v4 Next-Gen suite with OAuth 2.0 | Complete all-in-one skill covering all payment operations & versions |
| **`flutterwave-setup`** | Base URL config & Bearer secret | OAuth 2.0 OpenID Connect (`/token`), `X-Trace-Id` | Client bootstrapping, token caching, error handling |
| **`flutterwave-webhooks`** | POST listener with `verif-hash` header | POST listener with `verif-hash` + `/charges/{id}` re-query | Event processing, signature guards, idempotent handlers |
| **`flutterwave-testing`** | Sandbox keys (`FLWSECK_TEST-...`), test cards | Developer Sandbox (`developersandbox-api.flutterwave.com`) | Test vectors, 3DS PIN/OTP simulation, sandbox verification |

---

## 2. Collections & Inflow Rails

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-standard-checkout`** | `POST /payments` | `POST /charges` (intent flow) | Hosted checkout redirect, multi-rail modal, return URLs |
| **`flutterwave-card-payments`** | `POST /charges?type=card` + `3DES` encryption | `POST /charges` with `payment_method_id` | Direct card billing, OTP/PIN validation, 3D Secure |
| **`flutterwave-bank-transfers`** | `POST /charges?type=bank_transfer` | `POST /virtual-accounts` | Direct bank transfers, Nigerian NIP collections, dynamic accounts |
| **`flutterwave-mobile-money`** | `POST /charges?type=mpesa\|mobile_money_ghana` | `POST /charges` with mobile network payload | M-Pesa STK push, MTN MoMo, Telecel Cash, Wave, Francophone Africa |
| **`flutterwave-ussd`** | `POST /charges?type=ussd` | `POST /charges` with USSD channel | Offline/low-bandwidth payments across Nigerian banks |
| **`flutterwave-tokenized-charges`** | `POST /tokenized-charges` | `POST /charges` (`recurring: true`) | One-click checkout, saved cards, recurring billings |

---

## 3. Transactions & Post-Payment Operations

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-transactions`** | `GET /transactions/:id/verify` | `GET /charges/:id` | Status confirmation, double-spend defense, transaction audit |
| **`flutterwave-refunds`** | `POST /transactions/:id/refund` | `POST /refunds` | Full and partial refunds to original payment sources |
| **`flutterwave-chargebacks-disputes`** | `GET /chargebacks`, `PUT /chargebacks/:id` | `GET /chargebacks`, `PUT /chargebacks/:id` | Dispute alerts, evidence submission, chargeback acceptance |
| **`flutterwave-settlements`** | `GET /settlements`, `GET /settlements/:id` | `GET /settlement` | Ledger reconciliation, payout settlement batch verification |

---

## 4. Transfers & Outflow Rails

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-transfers`** | `POST /transfers` | `POST /transfers` (instant/deferred) | Single/bulk payouts, instant bank disbursements, wallet rails |
| **`flutterwave-beneficiaries`** | `POST /beneficiaries`, `GET /beneficiaries` | `POST /transfer-recipients` | Saved payout contacts, account resolution linkage |
| **`flutterwave-subaccounts`** | `POST /subaccounts` | Split payment configurations | Marketplace multi-vendor splits, automated commissions |

---

## 5. Subscriptions & Recurring Plans

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-payment-plans`** | `POST /payment-plans` | Subscription schedule configs | Automated recurring billing intervals (daily, monthly, yearly) |

---

## 6. Virtual Accounts & Cards

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-virtual-accounts`** | `POST /virtual-account-numbers` | `POST /virtual-accounts` | Static/dynamic customer bank accounts for direct deposit |
| **`flutterwave-bulk-virtual-accounts`** | `POST /bulk-virtual-account-numbers` | Batch `/virtual-accounts` creation | High-volume dedicated account allocation for fintechs |
| **`flutterwave-virtual-cards`** | `POST /virtual-cards` | Card issuing services | Digital dollar and local-currency corporate virtual cards |

---

## 7. Value-Added Services & Identity

| Skill | Primary v3 Endpoint | v4 Endpoint Equivalent | Primary Use Case |
| --- | --- | --- | --- |
| **`flutterwave-bills`** | `POST /bills` | Utility and biller endpoints | Airtime, data bundles, electricity, cable TV bill settlement |
| **`flutterwave-verification`** | `POST /accounts/resolve`, `POST /bvn/match` | `/accounts/lookup`, KYC validation | Bank account number resolution, BVN identity checks |
