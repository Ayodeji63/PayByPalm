---
name: flutterwave-beneficiaries
description: Create, store, list, and delete payout beneficiaries for recurring bank and mobile money disbursements.
---

# flutterwave-beneficiaries

## Purpose

Manage payout beneficiaries for frequent transfers. Storing beneficiaries eliminates repetitive account resolution steps and streamlines automated vendor disbursements and payroll runs.

## Implementation Pattern (TypeScript)

```ts
export interface CreateBeneficiaryPayload {
  accountNumber: string;
  accountBank: string; // 3-digit bank code or mobile operator code
  beneficiaryName: string;
  currency?: string;
}

export interface BeneficiaryRecord {
  id: number;
  account_number: string;
  account_bank: string;
  full_name: string;
  bank_name: string;
  created_at: string;
}

export class FlutterwaveBeneficiaryService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Creates a new payout beneficiary.
   */
  async createBeneficiary(payload: CreateBeneficiaryPayload): Promise<BeneficiaryRecord> {
    const res = await fetch(`${this.baseUrl}/beneficiaries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: payload.accountNumber,
        account_bank: payload.accountBank,
        beneficiary_name: payload.beneficiaryName,
        currency: payload.currency ?? "NGN",
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to create beneficiary: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Lists existing beneficiaries.
   */
  async listBeneficiaries(page = 1) {
    const res = await fetch(`${this.baseUrl}/beneficiaries?page=${page}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to fetch beneficiaries: ${body.message}`);
    }

    return body.data as BeneficiaryRecord[];
  }

  /**
   * Deletes a beneficiary by ID.
   */
  async deleteBeneficiary(id: number | string) {
    const res = await fetch(`${this.baseUrl}/beneficiaries/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    return res.json();
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/beneficiaries` | Create saved payout beneficiary | https://developer.flutterwave.com/docs/transfers/beneficiaries.md |
| v3 | GET | `/beneficiaries` | List saved beneficiaries | https://developer.flutterwave.com/reference/beneficiaries_list |
| v3 | DELETE | `/beneficiaries/{id}` | Delete beneficiary | https://developer.flutterwave.com/reference/beneficiaries_delete |
| v4 | POST | `/transfer-recipients` | Create recipient for v4 transfers | https://developer.flutterwave.com/reference/transfer_recipients_post |

## Usage Example

```ts
import { FlutterwaveBeneficiaryService } from "./flutterwave-beneficiaries";

export async function addVendorContact() {
  const service = new FlutterwaveBeneficiaryService();
  const contact = await service.createBeneficiary({
    accountNumber: "0690000031",
    accountBank: "044", // Access Bank
    beneficiaryName: "Acme Logistics Nigeria Ltd",
    currency: "NGN",
  });

  console.log(`Beneficiary created with ID: ${contact.id}`);
  return contact;
}
```

## Reliability Checklist

- Validate bank account and bank code using the account resolution API prior to saving beneficiaries.
- Provide users the ability to manage and delete outdated recipient profiles.
