---
name: flutterwave-settlements
description: Reconcile payouts and ledger deposits, inspect settlement batches, and audit transaction fee deductions.
---

# flutterwave-settlements

## Purpose

Retrieve settlement batches and fee deduction breakdowns. Flutterwave automatically aggregates settled payments and initiates payouts to the merchant's registered corporate bank account on defined cycles (T+1 for local cards, T+5 for international cards).

## Implementation Pattern (TypeScript)

```ts
export interface SettlementRecord {
  id: number;
  account_id: number;
  merchant_name: string;
  bank_name: string;
  account_number: string;
  gross_amount: number;
  net_amount: number;
  app_fee: number;
  merchant_fee: number;
  chargeback: number;
  refund: number;
  status: "completed" | "pending" | string;
  currency: string;
  due_date: string;
  processed_date: string;
}

export class FlutterwaveSettlementService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Retrieves past settlements with optional date filtering.
   */
  async listSettlements(filters: { from?: string; to?: string; page?: number } = {}) {
    const query = new URLSearchParams();
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.page) query.set("page", filters.page.toString());

    const res = await fetch(`${this.baseUrl}/settlements?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to list settlements: ${body.message}`);
    }

    return body.data as SettlementRecord[];
  }

  /**
   * Fetches detailed breakdown of a specific settlement batch.
   */
  async getSettlement(settlementId: number | string) {
    const res = await fetch(`${this.baseUrl}/settlements/${settlementId}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to fetch settlement #${settlementId}: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | GET | `/settlements` | List settlements with date range | https://developer.flutterwave.com/docs/transactions/settlements.md |
| v3 | GET | `/settlements/{id}` | Inspect settlement batch items | https://developer.flutterwave.com/reference/settlements_get |
| v4 | GET | `/settlement` | Query v4 settlements | https://developer.flutterwave.com/reference/settlement_list |

## Usage Example

```ts
import { FlutterwaveSettlementService } from "./flutterwave-settlements";

export async function auditRecentSettlements() {
  const service = new FlutterwaveSettlementService();
  const settlements = await service.listSettlements({
    from: "2026-10-01",
    to: "2026-10-31",
  });

  for (const s of settlements) {
    console.log(`Settlement ${s.id}: Net ${s.net_amount} ${s.currency} deposited to ${s.bank_name}`);
  }

  return settlements;
}
```

## Reliability Checklist

- Note settlement timelines: Local currency card transactions settle T+1 (business days); international card transactions typically settle T+5.
- Match settlement `net_amount` against your bank account statement credits for financial closing.
- Use `gross_amount` minus `merchant_fee` to verify accounting deductions.
