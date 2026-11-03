---
name: flutterwave-refunds
description: Issue full or partial refunds for settled transactions, query refund status, and track refund audit trails.
---

# flutterwave-refunds

## Purpose

Issue programmatic refunds to customers for previously charged transactions. Supports full refunds, partial refunds, customer comments, and querying refund status.

## Implementation Pattern (TypeScript)

```ts
export interface RefundOptions {
  transactionId: string | number;
  amount?: number; // Omit for full refund
  comments?: string;
}

export interface RefundDetails {
  id: number;
  account_id: number;
  tx_id: number;
  flw_ref: string;
  wallet_id: number;
  amount_refunded: number;
  status: "completed" | "pending" | string;
  destination: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export class FlutterwaveRefundService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Issues a full or partial refund for a transaction.
   */
  async createRefund(options: RefundOptions): Promise<RefundDetails> {
    const payload: Record<string, unknown> = {};
    if (options.amount !== undefined) {
      payload.amount = options.amount.toString();
    }
    if (options.comments) {
      payload.comments = options.comments;
    }

    const res = await fetch(`${this.baseUrl}/transactions/${options.transactionId}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Refund failed: ${body.message || res.statusText}`);
    }

    return body.data;
  }

  /**
   * Retrieves status of an existing refund.
   */
  async getRefund(refundId: string | number): Promise<RefundDetails> {
    const res = await fetch(`${this.baseUrl}/refunds/${refundId}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to fetch refund details: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/transactions/{id}/refund` | Initiate refund on transaction | https://developer.flutterwave.com/docs/transactions/refunds.md |
| v3 | GET | `/refunds/{id}` | Retrieve specific refund details | https://developer.flutterwave.com/reference/refunds_get |
| v3 | GET | `/refunds` | List all historical refunds | https://developer.flutterwave.com/reference/refunds_list |
| v4 | POST | `/refunds` | Initiate refund via v4 API | https://developer.flutterwave.com/reference/refunds_post |

## Usage Example

```ts
import { FlutterwaveRefundService } from "./flutterwave-refunds";

export async function processCustomerReturn(txId: number, returnAmount: number) {
  const service = new FlutterwaveRefundService();
  const refund = await service.createRefund({
    transactionId: txId,
    amount: returnAmount,
    comments: "Customer returned unworn shoes within 14 days",
  });

  console.log(`Refund initiated with ID ${refund.id}. Status: ${refund.status}`);
  return refund;
}
```

## Reliability Checklist

- Ensure your Flutterwave account has sufficient available balance in the transaction's settlement currency before initiating refunds.
- Card refunds typically reflect in customer accounts within 3 to 15 business days depending on issuer bank policies.
- Record `refund.id` and `tx_id` in your local audit logs for bookkeeping.
