---
name: flutterwave-transactions
description: Verify payments by ID or tx_ref, list and filter transaction history, and audit payment timelines.
---

# flutterwave-transactions

## Purpose

Retrieve, filter, and verify transaction records. Serves as the primary defensive barrier against double crediting and unauthorized order fulfillment by validating payment state directly against the Flutterwave ledger.

## Implementation Pattern (TypeScript)

```ts
export interface TransactionRecord {
  id: number;
  tx_ref: string;
  flw_ref: string;
  amount: number;
  currency: string;
  charged_amount: number;
  app_fee: number;
  merchant_fee: number;
  processor_response: string;
  auth_model: string;
  ip: string;
  narration: string;
  status: "successful" | "failed" | string;
  payment_type: string;
  created_at: string;
  customer: {
    id: number;
    name: string;
    phone_number: string;
    email: string;
    created_at: string;
  };
  card?: {
    first_6digits: string;
    last_4digits: string;
    issuer: string;
    country: string;
    type: string;
    token: string;
    expiry: string;
  };
}

export class FlutterwaveTransactionService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Verifies a transaction by its numeric Flutterwave ID.
   */
  async verifyById(transactionId: number | string): Promise<TransactionRecord> {
    const res = await fetch(`${this.baseUrl}/transactions/${transactionId}/verify`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Transaction verification failed: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Verifies a transaction using the merchant's custom tx_ref.
   */
  async verifyByReference(txRef: string): Promise<TransactionRecord> {
    const params = new URLSearchParams({ tx_ref: txRef });
    const res = await fetch(`${this.baseUrl}/transactions/verify_by_reference?${params}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Reference verification failed: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Lists transactions with optional filters.
   */
  async listTransactions(filters: {
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
    page?: number;
    status?: "successful" | "failed";
    currency?: string;
  } = {}) {
    const query = new URLSearchParams();
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.page) query.set("page", filters.page.toString());
    if (filters.status) query.set("status", filters.status);
    if (filters.currency) query.set("currency", filters.currency);

    const res = await fetch(`${this.baseUrl}/transactions?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    return body;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | GET | `/transactions/{id}/verify` | Verify transaction by ID | https://developer.flutterwave.com/docs/transactions/verify.md |
| v3 | GET | `/transactions/verify_by_reference` | Verify transaction by tx_ref | https://developer.flutterwave.com/reference/verify_by_reference |
| v3 | GET | `/transactions` | List all transactions with filters | https://developer.flutterwave.com/reference/transactions_list |
| v4 | GET | `/charges/{id}` | Inspect v4 charge status | https://developer.flutterwave.com/reference/charges_get |
| v4 | GET | `/charges` | List v4 charges | https://developer.flutterwave.com/reference/charges_list |

## Usage Example

```ts
import { FlutterwaveTransactionService } from "./flutterwave-transactions";

export async function checkPayment(txRef: string, orderAmount: number) {
  const service = new FlutterwaveTransactionService();
  const tx = await service.verifyByReference(txRef);

  if (tx.status === "successful" && tx.amount >= orderAmount) {
    console.log("Payment confirmed for customer:", tx.customer.email);
    return true;
  }

  return false;
}
```

## Reliability Checklist

- Always verify both `status === "successful"` and `amount >= expectedAmount` to prevent underpayment attacks.
- Confirm `tx.currency` matches your order billing currency.
- Save `tx.card.token` if you intend to enable tokenized recurring payments.
