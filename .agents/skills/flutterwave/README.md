# 🌊 Flutterwave Skills (`flutterwave-skills`)

[![npm version](https://img.shields.io/npm/v/flutterwave-skills.svg?style=flat-square&color=0070F3)](https://www.npmjs.com/package/flutterwave-skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Skills.sh](https://img.shields.io/badge/skills.sh-DevMubarak1%2FFlutterwave-blueviolet.svg?style=flat-square)](https://skills.sh/)
[![Flutterwave API](https://img.shields.io/badge/Flutterwave-v3%20%7C%20v4%20Public%20Beta-orange.svg?style=flat-square)](https://developer.flutterwave.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Types-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

The premier open-source AI agent skills collection for integrating the **Flutterwave payment engine** across all versions: **v3 (Production Stable)** and **v4.0.0 (Next-Gen Public Beta)**.

Designed for AI coding agents (**Claude Code**, **Cursor**, **GitHub Copilot**, **Antigravity**, **Lovable**, **Windsurf**, and **OpenClaw**), this collection provides battle-tested TypeScript integration patterns, zero third-party proxy lock-in, and multi-rail African coverage across 30+ countries.

---

## ⚡ One-Line Install (All Skills Included)

Install the complete, production-ready Flutterwave capabilities in a single command with zero prompts:

```bash
npx skills add DevMubarak1/Flutterwave
```

This single command installs the full Flutterwave skillset across checkout, cards, bank transfers, mobile money, payouts, virtual accounts, and webhooks for all AI coding agents.

View all installed skills in your project anytime:
```bash
npx skills list
```

---

## 🏆 Why This Collection is Better

| Dimension | `flutterwave-skills` (This Repo) | Generic CLI Wrappers (e.g. Membrane) |
| --- | --- | --- |
| **Dependencies & Lock-In** | **Zero CLI lock-in.** Pure native TypeScript/Node that executes directly in your codebase. | Requires installing proprietary global CLI (`@membranehq/cli`) and routing traffic through external third-party proxies. |
| **API Version Support** | **Full Dual-Version Support (v3 Stable + v4 Public Beta).** Switch between versions seamlessly or adopt next-gen v4 without breaking changes. | Limited to legacy single-version wrappers with no fine-grained control over v3 vs v4 features. |
| **African Rail Coverage** | **30+ African markets.** Native support for Nigerian NIP bank transfers, Kenya M-Pesa STK push, Ghana MTN/Telecel vouchers, Wave, and USSD. | Generic payment schemas that miss regional mobile money STK push flows and USSD dial codes. |
| **Webhook Security** | **Official `verif-hash` standard** with timing-safe constant-time equality checks and 60-second response SLA compliance. | Often misidentifies webhook authentication or leaves verification to unauthenticated callbacks. |
| **AI & LLM Integration** | Deep-links to Flutterwave's official machine-readable AI documentation: `/llms.txt`, `/v4.0.0/llms.txt`, and `.md` doc URLs. | Closed schemas inaccessible to autonomous agent context windows. |

---

## 🧭 Multi-Version API Architecture

Flutterwave runs on two primary surfaces. This skill understands **both**, allowing you or your agent to execute against whichever version you choose:

```
                          ┌──────────────────────────────────────┐
                          │         Flutterwave Client           │
                          └──────────────────┬───────────────────┘
                                             │
                    ┌────────────────────────┴────────────────────────┐
                    ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │  v3 (Production Stable) │                       │  v4 (Next-Gen Beta)     │
        ├─────────────────────────┤                       ├─────────────────────────┤
        │ Base: api.flutterwave   │                       │ Base: developersandbox  │
        │ Auth: Bearer Secret Key │                       │ Auth: OAuth 2.0 (OIDC)  │
        │ Flow: Simple Payloads   │                       │ Headers: X-Trace-Id     │
        └─────────────────────────┘                       └─────────────────────────┘
```

### 1. Version Matrix
- **v3 (Production Stable):**
  - **Base URL:** `https://api.flutterwave.com/v3`
  - **Auth:** Static Secret Key header: `Authorization: Bearer FLWSECK_TEST-...`
  - **Best For:** Existing production backends, standard hosted checkout (`/payments`), direct 3DES-encrypted card charges, dynamic NIP bank accounts, and USSD.
  - **AI Index:** [https://developer.flutterwave.com/llms.txt](https://developer.flutterwave.com/llms.txt)
- **v4 (Next-Gen Public Beta):**
  - **IDP Token URL:** `https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token`
  - **Sandbox Base URL:** `https://developersandbox-api.flutterwave.com`
  - **Production Base URL:** `https://f4bexperience.flutterwave.com/`
  - **Auth:** OAuth 2.0 OpenID Connect client credentials (`client_id` + `client_secret`) with in-memory token caching.
  - **Required Headers:** `X-Trace-Id` (12–255 char UUID) and `X-Idempotency-Key`.
  - **Best For:** High-throughput microservices, Transfer Orchestrator, resource-centric `/charges`, and stablecoin settlement corridors.
  - **AI Index:** [https://developer.flutterwave.com/v4.0.0/llms.txt](https://developer.flutterwave.com/v4.0.0/llms.txt)
- **Agent Tip:** Append `.md` to any Flutterwave documentation URL (e.g. `https://developer.flutterwave.com/docs/getting-started.md`) to read clean, token-efficient markdown.

---

## 📋 Popular Actions Directory

Every action is implemented for both v3 and v4:

| Action Name | Method | v3 Route | v4 Beta Route | Key Parameters & Description |
| --- | --- | --- | --- | --- |
| **Standard Checkout** | `POST` | `/payments` | `/charges` | `tx_ref`, `amount`, `currency`, `redirect_url`, `customer`. Returns hosted payment link. |
| **Verify Transaction (by ID)** | `GET` | `/transactions/{id}/verify` | `/charges/{id}` | Confirms final payment status, currency, settled amount, and card token before order fulfillment. |
| **Verify Transaction (by Ref)** | `GET` | `/transactions/verify_by_reference?tx_ref=...` | `/charges?reference=...` | Re-queries payment status using merchant's unique custom order reference. |
| **Direct Card Charge** | `POST` | `/charges?type=card` | `/charges` | v3 submits 3DES-encrypted payload; v4 submits `customer_id` and `payment_method_id`. |
| **Validate Charge (OTP)** | `POST` | `/validate-charge` | `/charges/{id}/validate` | Submits customer OTP challenge code (`flw_ref`, `otp`). |
| **Bank Transfer Collection** | `POST` | `/charges?type=bank_transfer` | `/virtual-accounts` | Generates dedicated dynamic Nigerian NIP bank account with expiration countdown. |
| **Mobile Money (M-Pesa)** | `POST` | `/charges?type=mpesa` | `/charges` | Triggers instant STK push prompt on customer's phone in Kenya (`KES`). |
| **Mobile Money (Ghana)** | `POST` | `/charges?type=mobile_money_ghana` | `/charges` | Charges MTN, Telecel (Vodafone voucher code), or AirtelTigo wallets (`GHS`). |
| **USSD Payment** | `POST` | `/charges?type=ussd` | `/charges` | Generates bank-specific interactive dial string (`*737*...#` for GTBank) for feature phones. |
| **Tokenized Charge** | `POST` | `/tokenized-charges` | `/charges` (`recurring: true`) | Re-bills stored `card.token` for 1-click checkout and subscriptions without re-entering cards. |
| **Initiate Transfer (Payout)** | `POST` | `/transfers` | `/transfers` | Outbound disbursements to bank accounts or mobile wallets. v4 uses `payment_instruction`. |
| **Get Transfer Status** | `GET` | `/transfers/{id}` | `/transfers/{id}` | Queries payout status (`SUCCESSFUL`, `FAILED`, `PENDING`). |
| **Retry Transfer** | `POST` | `/transfers/{id}/retries` | `/transfers/{id}/retry` | Resubmits failed transfer for reprocessing. |
| **List Beneficiaries** | `GET` | `/beneficiaries` | `/transfer-recipients` | Lists saved bank account and mobile wallet payout contacts. |
| **Create Beneficiary** | `POST` | `/beneficiaries` | `/transfer-recipients` | Stores recipient details (`account_number`, `account_bank`, `beneficiary_name`). |
| **Create Virtual Account** | `POST` | `/virtual-account-numbers` | `/virtual-accounts` | Provisions permanent or dynamic virtual accounts for direct customer wallet funding. |
| **Bulk Virtual Accounts** | `POST` | `/bulk-virtual-account-numbers` | `/virtual-accounts` | High-volume batch generation of deposit accounts for neobanks and platforms. |
| **Create Subaccount (Split)** | `POST` | `/subaccounts` | Split configuration | Configures vendor subaccount for marketplace splits (`split_type: "percentage" \| "flat"`). |
| **Create Payment Plan** | `POST` | `/payment-plans` | Subscription plans | Sets automated subscription billing intervals (`daily`, `weekly`, `monthly`, `yearly`). |
| **Create Virtual Card** | `POST` | `/virtual-cards` | Card issuing | Issues digital dollar (`USD`) or local currency debit cards with billing address. |
| **Resolve Bank Account** | `POST` | `/accounts/resolve` | `/accounts/lookup` | Verifies Nigerian bank account number and resolves official registered holder name. |
| **Validate BVN** | `POST` | `/bvn/match` | KYC validation | Verifies Bank Verification Number matches customer legal identity for compliance. |
| **Issue Refund** | `POST` | `/transactions/{id}/refund` | `/refunds` | Issues full or partial refunds directly to customer's source account. |
| **Manage Chargebacks** | `GET` / `PUT` | `/chargebacks` | `/chargebacks` | Inspects open disputes and submits defense evidence before response deadlines. |
| **List Settlements** | `GET` | `/settlements` | `/settlement` | Reconciles bank deposits, gross transactions, and processor fee deductions. |
| **Pay Bills & Airtime** | `POST` | `/bills` | Utility bills | Purchases airtime, mobile data bundles, power tokens, and renews cable TV subscriptions. |

---

## 🛠️ Universal TypeScript Implementation

Here is the universal client pattern that handles both v3 and v4 natively:

```ts
import crypto from "node:crypto";

export class Flutterwave {
  private v4TokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config = {
      secretKey: process.env.FLW_SECRET_KEY,
      v4ClientId: process.env.FLW_V4_CLIENT_ID,
      v4ClientSecret: process.env.FLW_V4_CLIENT_SECRET,
      v3BaseUrl: process.env.FLW_V3_BASE_URL ?? "https://api.flutterwave.com/v3",
      v4BaseUrl: process.env.FLW_V4_BASE_URL ?? "https://developersandbox-api.flutterwave.com",
      v4IdpUrl: "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token",
    },
  ) {}

  private async getV4Token(): Promise<string> {
    const now = Date.now();
    if (this.v4TokenCache && this.v4TokenCache.expiresAt > now + 60_000) {
      return this.v4TokenCache.token;
    }

    const res = await fetch(this.config.v4IdpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.v4ClientId!,
        client_secret: this.config.v4ClientSecret!,
      }).toString(),
    });

    const data = await res.json();
    this.v4TokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return data.access_token;
  }

  async request<T>(
    version: "v3" | "v4",
    path: string,
    options: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<{ status: string; message: string; data: T }> {
    const { idempotencyKey, headers: customHeaders, ...init } = options;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(customHeaders as Record<string, string>),
    };

    let baseUrl: string;
    if (version === "v3") {
      baseUrl = this.config.v3BaseUrl;
      headers["Authorization"] = `Bearer ${this.config.secretKey}`;
    } else {
      baseUrl = this.config.v4BaseUrl;
      headers["Authorization"] = `Bearer ${await this.getV4Token()}`;
      headers["X-Trace-Id"] = crypto.randomUUID();
      if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, { ...init, headers });
    const body = await res.json();
    if (!res.ok || body.status === "error") throw new Error(body.message || `Request failed (${res.status})`);
    return body;
  }
}
```

---

## 🔒 Webhook Security Standard

Flutterwave verifies incoming webhook notifications via a **secret hash** configured on your dashboard (**Settings > Webhooks**) and passed in the **`verif-hash`** HTTP header:

```ts
import crypto from "node:crypto";

export function verifyWebhook(req: Request): boolean {
  const incomingHash = req.headers.get("verif-hash");
  const secretHash = process.env.FLW_WEBHOOK_HASH;

  if (!incomingHash || !secretHash) return false;

  const a = Buffer.from(incomingHash, "utf8");
  const b = Buffer.from(secretHash, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

> **Mandatory Rule:** Always return an HTTP `200 OK` within Flutterwave's 60-second SLA, then independently call `GET /transactions/{id}/verify` or `GET /charges/{id}` to verify `status === "successful"`, `currency`, and `amount` before updating order status or granting customer entitlements.

---

## 🧪 Test Sandbox Vectors

| Rail / Scenario | Test Input | Expected Result |
| --- | --- | --- |
| **3DS Mastercard** | `5531881111111111`, CVV: `123`, Exp: `09/32` | Requires OTP -> Submit `12345` -> Successful |
| **Verve Card (PIN)** | `5060666666666666`, CVV: `111`, Exp: `05/29` | Requires PIN `1234`, then OTP `12345` |
| **Declined Card** | `5531882222222222`, CVV: `123`, Exp: `09/32` | Immediate decline (`Insufficient funds`) |
| **Kenya M-Pesa** | `2540700000000` | Auto-approves STK push in sandbox |
| **Bank Resolution** | Account: `0690000031`, Bank: `044` (Access Bank) | Resolves name: `FLW TEST ACCOUNT` |

---

## 📁 Repository Structure & Skills Directory

```text
flutterwave-skills/
├── .github/
│   └── workflows/
├── skills/
│   ├── flutterwave/SKILL.md                  # Comprehensive All-In-One Master Skill
│   ├── flutterwave-setup/SKILL.md            # Client config, Bearer auth, OAuth2 token caching
│   ├── flutterwave-webhooks/SKILL.md         # verif-hash guard, timingSafeEqual, re-query
│   ├── flutterwave-testing/SKILL.md          # Sandbox keys, 3DS cards, test MSISDNs
│   ├── flutterwave-standard-checkout/SKILL.md# Hosted checkout session & redirect verification
│   ├── flutterwave-card-payments/SKILL.md    # 3DES encryption, PIN/OTP/3DS, card tokenization
│   ├── flutterwave-bank-transfers/SKILL.md   # Dynamic Nigerian NIP accounts, expiry timers
│   ├── flutterwave-mobile-money/SKILL.md     # Kenya M-Pesa, Ghana MTN/Telecel, Wave, Francophone
│   ├── flutterwave-ussd/SKILL.md             # Nigerian bank USSD dial strings (*737*...#)
│   ├── flutterwave-tokenized-charges/SKILL.md# Re-billing saved card tokens, 1-click checkout
│   ├── flutterwave-transactions/SKILL.md     # Verify by ID or tx_ref, double-spend defense
│   ├── flutterwave-refunds/SKILL.md          # Programmatic full and partial refunds
│   ├── flutterwave-chargebacks-disputes/SKILL.md # Dispute monitoring and evidence submission
│   ├── flutterwave-settlements/SKILL.md      # Payout batch auditing, fee deduction checks
│   ├── flutterwave-transfers/SKILL.md        # Single & bulk payouts, instant bank disbursements
│   ├── flutterwave-beneficiaries/SKILL.md    # Saved payout contacts & account resolution
│   ├── flutterwave-subaccounts/SKILL.md      # Marketplace split payments (percentage/flat)
│   ├── flutterwave-payment-plans/SKILL.md    # Recurring subscriptions (daily, monthly, yearly)
│   ├── flutterwave-virtual-accounts/SKILL.md # Dedicated customer deposit accounts with BVN KYC
│   ├── flutterwave-bulk-virtual-accounts/SKILL.md # Batch virtual accounts for neobanks
│   ├── flutterwave-virtual-cards/SKILL.md    # Digital dollar & local currency debit cards
│   ├── flutterwave-bills/SKILL.md            # Utility bills, airtime, data, power tokens
│   └── flutterwave-verification/SKILL.md     # Bank account resolution, BVN match, card BIN
├── docs/
│   ├── api-surface.md                        # Architecture, base URLs, OAuth2 token exchange
│   ├── country-coverage.md                   # 30+ country rail matrix & local payment insights
│   ├── skill-map.md                          # Domain grouping & v3-to-v4 endpoint mapping
│   └── release-checklist.md                  # Release verification and publishing runbook
├── README.md
├── package.json
└── skills-lock.json
```

---

## 📜 Contributing & License

Contributions, issue reports, and PRs are welcome! Check [docs/release-checklist.md](file:///c:/Users/XPS/Flutterwave/docs/release-checklist.md) before publishing updates.

Distributed under the **MIT License**.
