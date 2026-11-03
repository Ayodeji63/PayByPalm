---
name: flutterwave-mobile-money
description: Charge mobile money wallets across Africa including Kenya M-Pesa STK push, Ghana MTN/Telecel, Rwanda, Uganda, and Francophone Africa.
---

# flutterwave-mobile-money

## Purpose

Initiate mobile money wallet payments across Kenya, Ghana, Uganda, Rwanda, Zambia, and Francophone West/Central Africa with STK push prompts, network voucher validation, and webhook settlement.

## Implementation Pattern (TypeScript)

```ts
export type MobileMoneyChannel =
  | "mpesa"
  | "mobile_money_ghana"
  | "mobile_money_rwanda"
  | "mobile_money_uganda"
  | "mobile_money_franco";

export interface MobileMoneyChargeOptions {
  channel: MobileMoneyChannel;
  amount: number;
  currency: "KES" | "GHS" | "UGX" | "RWF" | "XOF" | "XAF" | string;
  phoneNumber: string;
  email: string;
  txRef: string;
  network?: "MTN" | "VODAFONE" | "TIGO" | "AIRTEL" | "ORANGE" | string;
  voucher?: string; // Required for Vodafone / Telecel Ghana
}

export class FlutterwaveMobileMoneyService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Initiates mobile money push charge.
   */
  async chargeMobileMoney(options: MobileMoneyChargeOptions) {
    const res = await fetch(`${this.baseUrl}/charges?type=${options.channel}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: options.amount.toString(),
        currency: options.currency,
        phone_number: options.phoneNumber,
        email: options.email,
        tx_ref: options.txRef,
        network: options.network,
        voucher: options.voucher,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Mobile money charge failed: ${body.message}`);
    }

    return body;
  }
}
```

## Endpoint Operations and References

| Rail / Country | Type Query | Currency | Action | Reference |
| --- | --- | --- | --- | --- |
| Kenya (M-Pesa) | `type=mpesa` | `KES` | Triggers STK Push prompt on user phone | https://developer.flutterwave.com/docs/collecting-payments/m-pesa.md |
| Ghana | `type=mobile_money_ghana` | `GHS` | Charges MTN, Telecel, or AirtelTigo | https://developer.flutterwave.com/docs/collecting-payments/ghana-mobile-money.md |
| Uganda | `type=mobile_money_uganda` | `UGX` | Prompts MTN or Airtel Uganda wallet | https://developer.flutterwave.com/docs/collecting-payments/uganda-mobile-money.md |
| Rwanda | `type=mobile_money_rwanda` | `RWF` | Prompts MTN or Airtel Rwanda wallet | https://developer.flutterwave.com/docs/collecting-payments/rwanda-mobile-money.md |
| Francophone Africa | `type=mobile_money_franco` | `XOF`/`XAF` | Charges Orange, MTN, Wave, Moov | https://developer.flutterwave.com/docs/collecting-payments/franco-mobile-money.md |

## Usage Example

```ts
import { FlutterwaveMobileMoneyService } from "./flutterwave-mobile-money";

export async function runMpesaPushDemo() {
  const service = new FlutterwaveMobileMoneyService();

  // Initiates M-Pesa STK Push in Kenya
  const result = await service.chargeMobileMoney({
    channel: "mpesa",
    amount: 1500,
    currency: "KES",
    phoneNumber: "254712345678",
    email: "customer@example.ke",
    txRef: `MPESA-${Date.now()}`,
  });

  console.log("STK push initiated:", result.data);
  return result;
}
```

## Reliability Checklist

- Format phone numbers consistently: Kenya numbers should be formatted as `2547XXXXXXXX`.
- For Vodafone/Telecel Ghana, instruct customers to generate a voucher code (`*110#`) before submitting the charge.
- Rely on webhook notifications to confirm payment arrival; mobile money push approvals can take up to 45 seconds for user confirmation.
