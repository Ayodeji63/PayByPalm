---
name: flutterwave-transfers
description: Execute single and bulk outbound payouts, handle instant bank and mobile money disbursements, and query transfer status.
---

# flutterwave-transfers

## Purpose

Disburse funds to bank accounts and mobile money wallets across Africa and international corridors. Supports single payouts, bulk disbursements, transfer fee quotes, status checking, and v4 Next-Gen Transfer Orchestrator flows.

## Implementation Pattern (TypeScript)

```ts
export interface SingleTransferOptions {
  accountBank: string; // e.g. "044" for Access Bank, or "MPS" for Kenya M-Pesa
  accountNumber: string; // Bank account number or mobile money MSISDN
  amount: number;
  currency: "NGN" | "KES" | "GHS" | "ZAR" | "USD" | string;
  narration?: string;
  reference: string;
  callbackUrl?: string;
  debitCurrency?: string;
}

export interface V4TransferInstruction {
  action: "instant" | "deferred" | "scheduled";
  reference: string;
  narration?: string;
  callbackUrl?: string;
  paymentInstruction: {
    amount: number;
    currency: string;
    recipientId: string;
  };
}

export class FlutterwaveTransferService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Executes a single transfer via the v3 API.
   */
  async initiateTransfer(options: SingleTransferOptions) {
    const res = await fetch(`${this.baseUrl}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: options.accountBank,
        account_number: options.accountNumber,
        amount: options.amount,
        narration: options.narration ?? "Payout disbursement",
        currency: options.currency,
        reference: options.reference,
        callback_url: options.callbackUrl,
        debit_currency: options.debitCurrency,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Transfer initiation failed: ${body.message || res.statusText}`);
    }

    return body.data;
  }

  /**
   * Fetches status of an existing transfer.
   */
  async getTransferStatus(transferId: number | string) {
    const res = await fetch(`${this.baseUrl}/transfers/${transferId}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to fetch transfer #${transferId}: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/transfers` | Initiate single payout | https://developer.flutterwave.com/docs/transfers/transfers.md |
| v3 | GET | `/transfers/{id}` | Query transfer status | https://developer.flutterwave.com/reference/transfers_get |
| v3 | POST | `/bulk-transfers` | Initiate batch transfers | https://developer.flutterwave.com/docs/transfers/bulk-transfers.md |
| v3 | GET | `/transfers/rates` | Fetch transfer exchange rates | https://developer.flutterwave.com/reference/transfers_rates |
| v4 | POST | `/transfers` | Next-gen transfer orchestrator with recipient_id | https://developer.flutterwave.com/v4.0.0/llms.txt |
| v4 | POST | `/transfers/{id}/retry` | Retry failed transfer | https://developer.flutterwave.com/reference/transfer_post_retry |

## Usage Example

```ts
import { FlutterwaveTransferService } from "./flutterwave-transfers";

export async function sendVendorPayout() {
  const service = new FlutterwaveTransferService();
  const payout = await service.initiateTransfer({
    accountBank: "058", // GTBank
    accountNumber: "0123456789",
    amount: 75000,
    currency: "NGN",
    reference: `PAYOUT-${Date.now()}`,
    narration: "Invoice #1092 Settlement",
  });

  console.log(`Transfer #${payout.id} queued with status: ${payout.status}`);
  return payout;
}
```

## Reliability Checklist

- Resolve recipient bank account names using `/accounts/resolve` prior to submitting transfers to avoid failed payouts.
- Pass a deterministic, collision-resistant `reference` to prevent double-debiting your wallet on network retries.
- Balance check: Ensure your Flutterwave balance in the debit currency is sufficient before queuing payouts.
- Subscribe to the `transfer.completed` webhook event for final confirmation (instant bank rails can occasionally delay up to 15 minutes before final settlement or reversal).
