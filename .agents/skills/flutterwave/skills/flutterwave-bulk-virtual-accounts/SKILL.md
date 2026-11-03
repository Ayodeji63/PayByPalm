---
name: flutterwave-bulk-virtual-accounts
description: Batch generate dedicated virtual bank accounts for high-volume customer onboarding and fintech platforms.
---

# flutterwave-bulk-virtual-accounts

## Purpose

Provision virtual bank accounts in batches. Ideal for enterprise platforms, gig worker payouts, and neobanks onboarding thousands of customers who need dedicated deposit account numbers.

## Implementation Pattern (TypeScript)

```ts
export interface BulkVirtualAccountOptions {
  accounts: number; // Number of accounts to generate in batch
  email: string;
  isPermanent?: boolean;
  txRef: string;
}

export interface BulkVirtualAccountBatchResponse {
  batch_id: string;
  status: "processing" | "completed" | string;
  total_accounts: number;
}

export class FlutterwaveBulkVirtualAccountService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Submits a request to batch generate virtual accounts.
   */
  async createBulkAccounts(
    options: BulkVirtualAccountOptions,
  ): Promise<BulkVirtualAccountBatchResponse> {
    const res = await fetch(`${this.baseUrl}/bulk-virtual-account-numbers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accounts: options.accounts,
        email: options.email,
        is_permanent: options.isPermanent ?? true,
        tx_ref: options.txRef,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to queue bulk virtual accounts: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Checks the generation status of a bulk batch.
   */
  async getBatchStatus(batchId: string) {
    const res = await fetch(`${this.baseUrl}/bulk-virtual-account-numbers/${batchId}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/bulk-virtual-account-numbers` | Queue batch virtual account creation | https://developer.flutterwave.com/docs/virtual-accounts/bulk-virtual-accounts.md |
| v3 | GET | `/bulk-virtual-account-numbers/{batch_id}` | Query batch generation status | https://developer.flutterwave.com/reference/bulk_virtual_account_numbers_get |
| v4 | POST | `/virtual-accounts` | v4 virtual account generator | https://developer.flutterwave.com/reference/virtual_accounts_post |

## Usage Example

```ts
import { FlutterwaveBulkVirtualAccountService } from "./flutterwave-bulk-virtual-accounts";

export async function queueAccountBatch() {
  const service = new FlutterwaveBulkVirtualAccountService();
  const batch = await service.createBulkAccounts({
    accounts: 100,
    email: "enterprise-ops@example.com",
    txRef: `BATCH-${Date.now()}`,
    isPermanent: true,
  });

  console.log(`Batch ${batch.batch_id} queued for processing`);
  return batch;
}
```

## Reliability Checklist

- Bulk generation executes asynchronously; poll the batch endpoint or rely on webhook notification for large batches.
- Confirm account limits and quota allocations with your Flutterwave account manager prior to submitting large batch requests.
