---
name: flutterwave-tokenized-charges
description: Execute tokenized card charges for recurring billing, subscriptions, and one-click checkout flows without re-entering card details.
---

# flutterwave-tokenized-charges

## Purpose

Charge a previously tokenized customer card. When a customer successfully completes a card payment, Flutterwave returns a reusable `card.token` in the verification response. This token can be charged server-to-server for recurring billing and one-click checkouts.

## Implementation Pattern (TypeScript)

```ts
export interface TokenizedChargeOptions {
  token: string;
  amount: number;
  currency: string;
  email: string;
  txRef: string;
  narration?: string;
  ip?: string;
  retryAttempt?: number;
}

export class FlutterwaveTokenizedChargeService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Executes a tokenized charge using a stored card token.
   */
  async chargeToken(options: TokenizedChargeOptions) {
    const res = await fetch(`${this.baseUrl}/tokenized-charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: options.token,
        amount: options.amount.toString(),
        currency: options.currency,
        email: options.email,
        tx_ref: options.txRef,
        narration: options.narration ?? "Subscription Renewal",
        ip: options.ip,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Tokenized charge failed: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/tokenized-charges` | Charge saved card token | https://developer.flutterwave.com/docs/collecting-payments/tokenized-charges.md |
| v3 | GET | `/transactions/{id}/verify` | Verify charge state and obtain card token | https://developer.flutterwave.com/docs/transactions/verify.md |
| v4 | POST | `/charges` | Charge using saved `payment_method_id` with `recurring: true` | https://developer.flutterwave.com/reference/charges_post |

## Usage Example

```ts
import { FlutterwaveTokenizedChargeService } from "./flutterwave-tokenized-charges";

export async function renewSubscriptionDemo(customerToken: string, userEmail: string) {
  const service = new FlutterwaveTokenizedChargeService();
  const charge = await service.chargeToken({
    token: customerToken,
    amount: 9900.00,
    currency: "NGN",
    email: userEmail,
    txRef: `SUB-${Date.now()}`,
    narration: "Monthly Pro Plan Subscription",
  });

  console.log("Token charge completed:", charge.status);
  return charge;
}
```

## Reliability Checklist

- Ensure user gives explicit consent to store payment details for recurring charges in accordance with regional regulations.
- Store card tokens securely in encrypted database columns.
- Handle token revocation or expiry gracefully: if a tokenized charge fails with invalid token, prompt customer to complete a fresh 3DS payment session.
