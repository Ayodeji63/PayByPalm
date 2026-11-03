---
name: flutterwave-bills
description: Pay utility bills, buy airtime and data bundles, and validate customer meter/smartcard numbers across Africa.
---

# flutterwave-bills

## Purpose

Integrate bill payments and value-added services. Supports airtime top-ups, data bundles, electricity token purchases, and cable TV subscription renewals across Nigeria, Ghana, and Kenya with pre-payment customer account validation.

## Implementation Pattern (TypeScript)

```ts
export interface PurchaseBillOptions {
  country: "NG" | "GH" | "KE";
  customer: string; // Phone number, smartcard number, or meter number
  amount: number;
  type: "AIRTIME" | "DSTV" | "POWER" | "INTERNET" | string;
  reference: string;
  billerCode?: string;
  itemCode?: string;
}

export class FlutterwaveBillService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Validates customer meter or smartcard number before payment.
   */
  async validateCustomer(itemCode: string, customerIdentifier: string) {
    const params = new URLSearchParams({
      item_code: itemCode,
      code: customerIdentifier,
      customer: customerIdentifier,
    });

    const res = await fetch(`${this.baseUrl}/bill-items/${itemCode}/validate?${params}`, {
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json();
    return body.data;
  }

  /**
   * Executes bill payment (airtime, power, cable TV).
   */
  async payBill(options: PurchaseBillOptions) {
    const res = await fetch(`${this.baseUrl}/bills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        country: options.country,
        customer: options.customer,
        amount: options.amount,
        recurrence: "ONCE",
        type: options.type,
        reference: options.reference,
        biller_code: options.billerCode,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Bill payment failed: ${body.message}`);
    }

    return body.data;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | GET | `/bill-categories` | Fetch available billers and item codes | https://developer.flutterwave.com/docs/bills-payments/bills-payments.md |
| v3 | GET | `/bill-items/{code}/validate` | Validate meter / smartcard account | https://developer.flutterwave.com/reference/bill_items_validate |
| v3 | POST | `/bills` | Submit bill purchase | https://developer.flutterwave.com/reference/bills_create |
| v3 | GET | `/bills/{reference}` | Query bill payment status | https://developer.flutterwave.com/reference/bills_get |

## Usage Example

```ts
import { FlutterwaveBillService } from "./flutterwave-bills";

export async function buyAirtime() {
  const service = new FlutterwaveBillService();
  const result = await service.payBill({
    country: "NG",
    customer: "08012345678",
    amount: 1000,
    type: "AIRTIME",
    reference: `AIRTIME-${Date.now()}`,
  });

  console.log("Airtime purchase confirmation:", result);
  return result;
}
```

## Reliability Checklist

- Always validate meter and smartcard numbers prior to initiating power or pay-TV payments to prevent misallocated funds.
- Bill payments are non-refundable once approved by the utility operator.
- Store the biller transaction reference to assist with customer support queries.
