---
name: flutterwave-virtual-accounts
description: Generate dedicated permanent or dynamic virtual bank accounts for customer direct deposits and automated wallet funding.
---

# flutterwave-virtual-accounts

## Purpose

Create reserved virtual bank accounts for customers. Each account functions as a real Nigerian bank account (e.g. Wema Bank, Sterling Bank). Transfers into these account numbers automatically credit the merchant's Flutterwave wallet and trigger `charge.completed` webhook notifications tied to the customer's reference.

## Implementation Pattern (TypeScript)

```ts
export interface CreateVirtualAccountOptions {
  email: string;
  isPermanent?: boolean;
  bvn?: string; // Nigerian Bank Verification Number (required for permanent KYC accounts)
  txRef: string;
  phonenumber?: string;
  firstname: string;
  lastname: string;
  narration?: string;
  amount?: number; // Specify amount for fixed dynamic accounts, or 0/omit for static
}

export interface VirtualAccountRecord {
  response_code: string;
  response_message: string;
  order_ref: string;
  account_number: string;
  bank_name: string;
  account_status: string;
  created_at: string;
}

export class FlutterwaveVirtualAccountService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Generates a permanent dedicated virtual account for a customer.
   */
  async createVirtualAccount(
    options: CreateVirtualAccountOptions,
  ): Promise<VirtualAccountRecord> {
    const res = await fetch(`${this.baseUrl}/virtual-account-numbers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: options.email,
        is_permanent: options.isPermanent ?? true,
        bvn: options.bvn,
        tx_ref: options.txRef,
        phonenumber: options.phonenumber,
        firstname: options.firstname,
        lastname: options.lastname,
        narration: options.narration ?? `${options.firstname} ${options.lastname} Wallet`,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to create virtual account: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Retrieves virtual account details by order reference.
   */
  async getVirtualAccount(orderRef: string): Promise<VirtualAccountRecord> {
    const res = await fetch(`${this.baseUrl}/virtual-account-numbers/${orderRef}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to retrieve virtual account: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/virtual-account-numbers` | Create permanent virtual account | https://developer.flutterwave.com/docs/virtual-accounts/virtual-accounts.md |
| v3 | GET | `/virtual-account-numbers/{order_ref}` | Fetch virtual account details | https://developer.flutterwave.com/reference/virtual_account_numbers_get |
| v4 | POST | `/virtual-accounts` | Next-gen static/dynamic virtual accounts | https://developer.flutterwave.com/reference/virtual_accounts_post |
| v4 | GET | `/virtual-accounts` | List all virtual accounts | https://developer.flutterwave.com/reference/virtual_accounts_list |

## Usage Example

```ts
import { FlutterwaveVirtualAccountService } from "./flutterwave-virtual-accounts";

export async function provisionCustomerWallet() {
  const service = new FlutterwaveVirtualAccountService();
  const account = await service.createVirtualAccount({
    email: "john.doe@example.com",
    firstname: "John",
    lastname: "Doe",
    phonenumber: "08012345678",
    bvn: "12345678901",
    txRef: `USR-WALLET-${Date.now()}`,
    isPermanent: true,
  });

  console.log(`Dedicated Account Created: ${account.account_number} (${account.bank_name})`);
  return account;
}
```

## Reliability Checklist

- In compliance with Central Bank regulations in Nigeria, permanent virtual accounts require a valid Bank Verification Number (BVN) matching the customer's name.
- Store `order_ref` and `account_number` in your user records.
- Listen for `charge.completed` webhooks and match by `customer.email` or `tx_ref` to credit the user wallet immediately upon incoming bank transfers.
