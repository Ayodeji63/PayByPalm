---
name: flutterwave-subaccounts
description: Create subaccounts for marketplace vendors, configure split fees (flat or percentage), and automate multi-party payouts.
---

# flutterwave-subaccounts

## Purpose

Manage merchant subaccounts for marketplaces and multi-vendor platforms. Subaccounts allow platforms to split inbound payments automatically between vendors and the platform at the moment of payment collection, eliminating manual reconciliation.

## Implementation Pattern (TypeScript)

```ts
export interface CreateSubaccountOptions {
  accountBank: string; // 3-digit bank code
  accountNumber: string; // Vendor's bank account number
  businessName: string;
  businessEmail: string;
  businessContact?: string;
  businessMobile?: string;
  country?: string; // default "NG"
  splitType: "percentage" | "flat";
  splitValue: number; // e.g. 0.1 for 10% (percentage) or 500 (flat amount in minor/major)
}

export interface SubaccountRecord {
  id: number;
  account_number: string;
  account_bank: string;
  full_name: string;
  subaccount_id: string; // e.g. "RS_D8F8171092..."
  split_type: string;
  split_value: number;
  created_at: string;
}

export class FlutterwaveSubaccountService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Creates a subaccount for a marketplace vendor.
   */
  async createSubaccount(options: CreateSubaccountOptions): Promise<SubaccountRecord> {
    const res = await fetch(`${this.baseUrl}/subaccounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: options.accountBank,
        account_number: options.accountNumber,
        business_name: options.businessName,
        business_email: options.businessEmail,
        business_contact: options.businessContact,
        business_mobile: options.businessMobile,
        country: options.country ?? "NG",
        split_type: options.splitType,
        split_value: options.splitValue,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to create subaccount: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Lists subaccounts.
   */
  async listSubaccounts() {
    const res = await fetch(`${this.baseUrl}/subaccounts`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    return body.data as SubaccountRecord[];
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/subaccounts` | Create subaccount and assign split ratio | https://developer.flutterwave.com/docs/collecting-payments/split-payments.md |
| v3 | GET | `/subaccounts` | List all platform subaccounts | https://developer.flutterwave.com/reference/subaccounts_list |
| v3 | GET | `/subaccounts/{id}` | Inspect subaccount details | https://developer.flutterwave.com/reference/subaccounts_get |
| v3 | PUT | `/subaccounts/{id}` | Update bank account or split values | https://developer.flutterwave.com/reference/subaccounts_update |

## Passing Subaccounts to Standard Checkout

To split a payment dynamically at checkout, include `subaccounts` in the `POST /payments` payload:

```json
{
  "tx_ref": "ORD-12345",
  "amount": "10000",
  "currency": "NGN",
  "subaccounts": [
    {
      "id": "RS_D8F8171092B08819",
      "transaction_charge_type": "flat_subaccount",
      "transaction_charge": "8000"
    }
  ]
}
```

## Usage Example

```ts
import { FlutterwaveSubaccountService } from "./flutterwave-subaccounts";

export async function onboardMarketplaceSeller() {
  const service = new FlutterwaveSubaccountService();
  const subaccount = await service.createSubaccount({
    accountBank: "058", // GTBank
    accountNumber: "0123456789",
    businessName: "Lagos Crafts Boutique",
    businessEmail: "seller@crafts.ng",
    splitType: "percentage",
    splitValue: 0.15, // Platform takes 15% fee, vendor receives 85%
  });

  console.log("Subaccount ID for checkout:", subaccount.subaccount_id);
  return subaccount;
}
```

## Reliability Checklist

- Ensure vendor bank account details are verified using account resolution before subaccount creation.
- Keep record of `subaccount_id` (starts with `RS_`) to attach to future checkout and charge payloads.
- Test split settlement calculations in sandbox before going live.
