---
name: flutterwave-ussd
description: Initiate USSD payment sessions across major Nigerian banks, obtain bank-specific dial strings, and verify completion.
---

# flutterwave-ussd

## Purpose

Implement Nigerian USSD payment flows. The merchant requests a USSD session for a specific bank code, Flutterwave returns an interactive dialing string (e.g. `*737*...#`), and the customer dials it on any mobile device to authorize payment.

## Implementation Pattern (TypeScript)

```ts
export interface UssdChargeOptions {
  amount: number;
  email: string;
  txRef: string;
  accountBank: string; // 3-digit bank code, e.g. "058" (GTBank), "044" (Access Bank)
  phoneNumber?: string;
  currency?: string; // default: "NGN"
}

export interface UssdChargeResult {
  paymentCode: string;
  note: string;
  txRef: string;
}

export class FlutterwaveUssdService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Generates a USSD dialing string for the customer.
   */
  async initiateUssd(options: UssdChargeOptions): Promise<UssdChargeResult> {
    const res = await fetch(`${this.baseUrl}/charges?type=ussd`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_bank: options.accountBank,
        amount: options.amount.toString(),
        currency: options.currency ?? "NGN",
        email: options.email,
        tx_ref: options.txRef,
        phone_number: options.phoneNumber,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`USSD initialization failed: ${body.message}`);
    }

    const auth = body.meta.authorization;
    return {
      paymentCode: auth.note, // Contains dial string e.g. "*737*000*4928#"
      note: auth.note,
      txRef: options.txRef,
    };
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/charges?type=ussd` | Generate USSD dial code | https://developer.flutterwave.com/docs/collecting-payments/ussd.md |
| v3 | GET | `/banks/NG` | Fetch Nigerian bank codes | https://developer.flutterwave.com/docs/collecting-payments/banks.md |
| v3 | GET | `/transactions/{id}/verify` | Verify USSD payment status | https://developer.flutterwave.com/docs/transactions/verify.md |

## Common Bank USSD Codes

| Bank | Code | Dial Pattern |
| --- | --- | --- |
| GTBank | `058` | `*737*...#` |
| Access Bank | `044` | `*901*...#` |
| Zenith Bank | `057` | `*966*...#` |
| United Bank for Africa (UBA) | `033` | `*919*...#` |
| Sterling Bank | `232` | `*822*...#` |
| First Bank of Nigeria | `011` | `*894*...#` |

## Usage Example

```ts
import { FlutterwaveUssdService } from "./flutterwave-ussd";

export async function runUssdDemo() {
  const service = new FlutterwaveUssdService();
  const session = await service.initiateUssd({
    accountBank: "058", // GTBank
    amount: 3000,
    email: "customer@example.com",
    txRef: `USSD-${Date.now()}`,
  });

  console.log("Customer instructions:", session.paymentCode);
  return session;
}
```

## Reliability Checklist

- Display USSD dial codes in large, clear, tap-to-call formats (`tel:*737*...#`) on mobile browsers.
- USSD sessions usually expire within 5 to 10 minutes; present a countdown timer.
- Fulfill payments exclusively upon webhook confirmation or verified polling status.
