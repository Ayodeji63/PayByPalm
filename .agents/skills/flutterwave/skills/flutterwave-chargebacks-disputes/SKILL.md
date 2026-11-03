---
name: flutterwave-chargebacks-disputes
description: Monitor chargebacks, submit evidence against card disputes, accept claims, and track dispute lifecycle statuses.
---

# flutterwave-chargebacks-disputes

## Purpose

Manage card and transaction disputes (chargebacks). Allows merchants to query open dispute notices, upload proof-of-delivery or fulfillment evidence before response deadlines, or accept liability to settle claims quickly.

## Implementation Pattern (TypeScript)

```ts
export interface ChargebackRecord {
  id: number;
  amount: number;
  currency: string;
  flw_ref: string;
  transaction_id: number;
  status: "pending" | "declined" | "accepted" | "lost" | "won";
  stage: string;
  due_date: string;
  comment?: string;
  meta?: Record<string, unknown>;
  created_at: string;
}

export class FlutterwaveChargebackService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Lists chargebacks with optional status filters.
   */
  async listChargebacks(status?: "pending" | "declined" | "accepted" | "lost" | "won") {
    const query = status ? `?status=${status}` : "";
    const res = await fetch(`${this.baseUrl}/chargebacks${query}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to list chargebacks: ${body.message}`);
    }

    return body.data as ChargebackRecord[];
  }

  /**
   * Responds to a chargeback by accepting liability or declining with proof.
   */
  async respondToChargeback(
    chargebackId: number | string,
    action: "accept" | "decline",
    explanation?: string,
  ) {
    const res = await fetch(`${this.baseUrl}/chargebacks/${chargebackId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        comment: explanation,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to update chargeback: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | GET | `/chargebacks` | List chargebacks | https://developer.flutterwave.com/docs/transactions/chargebacks.md |
| v3 | GET | `/chargebacks/{id}` | Retrieve specific chargeback | https://developer.flutterwave.com/reference/chargebacks_get |
| v3 | PUT | `/chargebacks/{id}` | Accept or decline dispute | https://developer.flutterwave.com/reference/chargebacks_put |
| v4 | GET | `/chargebacks` | v4 dispute query | https://developer.flutterwave.com/reference/chargebacks_list |

## Usage Example

```ts
import { FlutterwaveChargebackService } from "./flutterwave-chargebacks-disputes";

export async function reviewPendingDisputes() {
  const service = new FlutterwaveChargebackService();
  const pending = await service.listChargebacks("pending");

  for (const dispute of pending) {
    console.log(`Dispute #${dispute.id} on Tx #${dispute.transaction_id}. Due by: ${dispute.due_date}`);
  }

  return pending;
}
```

## Reliability Checklist

- Note the `due_date` timestamp on chargebacks; failing to respond before the due date results in automatic loss of funds.
- Maintain proof of fulfillment (tracking numbers, signed courier receipts, IP logs) for evidence submission.
- Listen for `chargeback.created` webhooks to trigger immediate internal compliance reviews.
