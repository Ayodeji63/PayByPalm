---
name: flutterwave-verification
description: Verify bank account holder names, validate Bank Verification Numbers (BVN), and inspect card BIN issuer metadata.
---

# flutterwave-verification

## Purpose

Perform KYC and account validation before executing payouts or account creation. Resolves Nigerian bank account numbers to verify the account holder's registered legal name, validates BVN data, and checks card BIN details.

## Implementation Pattern (TypeScript)

```ts
export interface ResolvedAccountDetails {
  account_number: string;
  account_name: string;
}

export interface CardBinDetails {
  issuing_country: string;
  bin: string;
  card_type: string;
  issuer_info: string;
}

export class FlutterwaveVerificationService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Resolves a bank account number to obtain the official account holder name.
   */
  async resolveBankAccount(accountNumber: string, bankCode: string): Promise<ResolvedAccountDetails> {
    const res = await fetch(`${this.baseUrl}/accounts/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: accountNumber,
        account_bank: bankCode,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Account resolution failed: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Resolves card BIN metadata (issuer, country, card type).
   */
  async resolveCardBin(bin: string): Promise<CardBinDetails> {
    const res = await fetch(`${this.baseUrl}/card-bins/${bin}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Card BIN resolution failed: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/accounts/resolve` | Resolve Nigerian bank account name | https://developer.flutterwave.com/docs/transactions/account-verification.md |
| v3 | POST | `/bvn/match` | Verify BVN matches user KYC name/DOB | https://developer.flutterwave.com/reference/bvn_match |
| v3 | GET | `/card-bins/{bin}` | Look up card issuer and brand | https://developer.flutterwave.com/reference/card_bins_get |
| v4 | POST | `/accounts/lookup` | Next-gen account resolution | https://developer.flutterwave.com/reference/accounts_lookup |

## Usage Example

```ts
import { FlutterwaveVerificationService } from "./flutterwave-verification";

export async function verifyRecipient() {
  const service = new FlutterwaveVerificationService();
  const account = await service.resolveBankAccount("0690000031", "044"); // Access Bank

  console.log(`Verified Name: ${account.account_name}`);
  return account;
}
```

## Reliability Checklist

- Always call `/accounts/resolve` before initiating high-value transfers or storing new beneficiaries.
- Present the resolved account name to the user for confirmation on frontend review screens.
- Card BIN lookups provide valuable fraud prevention signals (e.g. comparing card issuing country with user IP/billing country).
