---
name: flutterwave-bank-transfers
description: Accept payments via direct Nigerian NIP bank transfers with dynamic dedicated account generation and webhook settlement.
---

# flutterwave-bank-transfers

## Purpose

Implement Pay with Bank Transfer collections. Generates dynamic, dedicated virtual bank accounts on demand. The customer transfers the exact amount via their bank app or USSD, and Flutterwave notifies your system via webhooks.

## Implementation Pattern (TypeScript)

```ts
export interface BankTransferChargeOptions {
  amount: number;
  email: string;
  txRef: string;
  currency?: string; // defaults to NGN
  duration?: number; // expiry in seconds, e.g. 3600 (1 hour)
  frequency?: number;
  narration?: string;
  isPermanent?: boolean;
}

export interface BankTransferAccountDetails {
  transferAccount: string;
  transferBank: string;
  transferAmount: number;
  transferReference: string;
  accountExpiration: string;
}

export class FlutterwaveBankTransferService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Generates dynamic bank transfer details for customer payment.
   */
  async generateTransferAccount(
    options: BankTransferChargeOptions,
  ): Promise<BankTransferAccountDetails> {
    const res = await fetch(`${this.baseUrl}/charges?type=bank_transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: options.amount.toString(),
        currency: options.currency ?? "NGN",
        email: options.email,
        tx_ref: options.txRef,
        is_permanent: options.isPermanent ?? false,
        duration: options.duration ?? 3600,
        narration: options.narration ?? "Payment for Order",
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to generate bank transfer instructions: ${body.message}`);
    }

    const meta = body.meta.authorization;
    return {
      transferAccount: meta.transfer_account,
      transferBank: meta.transfer_bank,
      transferAmount: meta.transfer_amount,
      transferReference: meta.transfer_reference,
      accountExpiration: meta.account_expiration,
    };
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/charges?type=bank_transfer` | Generate dynamic bank transfer account | https://developer.flutterwave.com/docs/collecting-payments/bank-transfer.md |
| v3 | GET | `/transactions/{id}/verify` | Verify bank transfer payment | https://developer.flutterwave.com/docs/transactions/verify.md |
| v4 | POST | `/virtual-accounts` | Next-gen dynamic virtual account generation | https://developer.flutterwave.com/reference/virtual_accounts_post |

## Usage Example

```ts
import { FlutterwaveBankTransferService } from "./flutterwave-bank-transfers";

export async function runBankTransferDemo() {
  const service = new FlutterwaveBankTransferService();
  const account = await service.generateTransferAccount({
    amount: 5000,
    email: "customer@example.com",
    txRef: `TRANSFER-${Date.now()}`,
    duration: 3600,
  });

  console.log(`Pay into Bank: ${account.transferBank}`);
  console.log(`Account Number: ${account.transferAccount}`);
  console.log(`Expires at: ${account.accountExpiration}`);
  return account;
}
```

## Reliability Checklist

- Advise customers to transfer the exact amount specified to ensure automated reconciliation.
- Clearly present the account expiration timer on checkout screens (default: 1 hour).
- Always rely on webhook notifications (`charge.completed`) rather than polling to reduce server load.
