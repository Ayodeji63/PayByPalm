---
name: flutterwave-standard-checkout
description: Initialize hosted Flutterwave Standard checkout sessions, handle redirect returns, and verify completed payments server-side.
---

# flutterwave-standard-checkout

## Purpose

Implement hosted checkout via Flutterwave Standard. The backend requests a secure payment link, redirects the user to Flutterwave's multi-rail modal, and handles the redirect return with server-side verification before fulfilling the order.

## Implementation Pattern (TypeScript)

```ts
export interface StandardCheckoutOptions {
  txRef: string;
  amount: number;
  currency: "NGN" | "USD" | "KES" | "GHS" | "ZAR" | string;
  redirectUrl: string;
  customer: {
    email: string;
    name?: string;
    phoneNumber?: string;
  };
  customizations?: {
    title?: string;
    description?: string;
    logo?: string;
  };
  meta?: Record<string, unknown>;
  paymentOptions?: string; // e.g. "card,ussd,banktransfer,mobilemoney"
}

export interface CheckoutSessionResult {
  link: string;
  txRef: string;
}

export class FlutterwaveCheckoutService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Initializes a standard hosted checkout link.
   */
  async createPaymentLink(options: StandardCheckoutOptions): Promise<CheckoutSessionResult> {
    const res = await fetch(`${this.baseUrl}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: options.txRef,
        amount: options.amount.toString(),
        currency: options.currency,
        redirect_url: options.redirectUrl,
        customer: {
          email: options.customer.email,
          name: options.customer.name,
          phonenumber: options.customer.phoneNumber,
        },
        customizations: options.customizations,
        meta: options.meta,
        payment_options: options.paymentOptions,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to create payment session: ${body.message || res.statusText}`);
    }

    return {
      link: body.data.link,
      txRef: options.txRef,
    };
  }

  /**
   * Verifies the completed transaction following customer redirect.
   */
  async verifyRedirect(transactionId: string, expectedTxRef: string, expectedAmount: number) {
    const res = await fetch(`${this.baseUrl}/transactions/${transactionId}/verify`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Payment verification failed: ${body.message}`);
    }

    const tx = body.data;
    const isValid =
      tx.status === "successful" &&
      tx.tx_ref === expectedTxRef &&
      Number(tx.amount) >= expectedAmount;

    if (!isValid) {
      throw new Error(`Invalid transaction state: status=${tx.status}, ref=${tx.tx_ref}`);
    }

    return tx;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/payments` | Create hosted payment link | https://developer.flutterwave.com/docs/collecting-payments/standard.md |
| v3 | GET | `/transactions/{id}/verify` | Server-side transaction verification | https://developer.flutterwave.com/docs/transactions/verify.md |
| v3 | GET | `/transactions/verify_by_reference?tx_ref={ref}` | Verify payment by merchant reference | https://developer.flutterwave.com/reference/verify_by_reference |
| v4 | POST | `/charges` | Next-gen charge creation intent | https://developer.flutterwave.com/reference/charges_post |
| v4 | GET | `/charges/{id}` | Inspect charge status | https://developer.flutterwave.com/reference/charges_get |

## Usage Example

```ts
import { FlutterwaveCheckoutService } from "./flutterwave-standard-checkout";

export async function checkoutDemo() {
  const checkout = new FlutterwaveCheckoutService();

  // 1. Initialize checkout session
  const session = await checkout.createPaymentLink({
    txRef: `ORD-${Date.now()}`,
    amount: 12500.00,
    currency: "NGN",
    redirectUrl: "https://mystore.example.com/checkout/callback",
    customer: {
      email: "buyer@example.com",
      name: "Chidi Okafor",
      phoneNumber: "+2348012345678",
    },
    customizations: {
      title: "Acme Store Purchase",
      description: "Order #49281",
    },
  });

  console.log("Redirect user to:", session.link);
  return session;
}
```

## Reliability Checklist

- Never trust query parameters in the redirect URL (`?status=successful&transaction_id=...`). The user can manipulate redirect URLs.
- Always execute `GET /transactions/{id}/verify` or verify with webhook before updating database order state.
- Pass a unique, non-repeating `tx_ref` for every purchase attempt.
- Always set `payment_options` if you need to restrict payment methods to specific regional rails.
