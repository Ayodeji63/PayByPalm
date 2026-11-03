---
name: flutterwave-card-payments
description: Charge debit and credit cards directly with 3DES encryption, PIN/OTP/3DS authorization flows, and card tokenization.
---

# flutterwave-card-payments

## Purpose

Execute direct card charges via the Flutterwave API. Covers 3DES payload encryption, authorization handling (PIN, OTP, 3D Secure redirect), charge validation, and card tokenization for subsequent one-click charges.

## Implementation Pattern (TypeScript)

```ts
import crypto from "node:crypto";

export interface CardChargePayload {
  cardNumber: string;
  cvv: string;
  expiryMonth: string;
  expiryYear: string;
  currency: string;
  amount: number;
  email: string;
  txRef: string;
  fullname?: string;
  pin?: string;
}

/**
 * Encrypts raw card details using Triple DES (3DES-24) as required by Flutterwave v3.
 */
export function encryptCardPayload(key: string, text: string): string {
  const cipher = crypto.createCipheriv("des-ede3", Buffer.from(key, "utf8"), "");
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

export class FlutterwaveCardPaymentService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly encKey: string = process.env.FLW_ENCRYPTION_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey || !this.encKey) {
      throw new Error("Missing FLW_SECRET_KEY or FLW_ENCRYPTION_KEY");
    }
  }

  /**
   * Initiates direct encrypted card charge.
   */
  async chargeCard(cardPayload: CardChargePayload) {
    const rawData = JSON.stringify({
      card_number: cardPayload.cardNumber,
      cvv: cardPayload.cvv,
      expiry_month: cardPayload.expiryMonth,
      expiry_year: cardPayload.expiryYear,
      currency: cardPayload.currency,
      amount: cardPayload.amount.toString(),
      email: cardPayload.email,
      fullname: cardPayload.fullname,
      tx_ref: cardPayload.txRef,
      pin: cardPayload.pin,
      authorization: cardPayload.pin ? { mode: "pin", pin: cardPayload.pin } : undefined,
    });

    const client = encryptCardPayload(this.encKey, rawData);

    const res = await fetch(`${this.baseUrl}/charges?type=card`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client }),
    });

    const body = await res.json();
    return body;
  }

  /**
   * Validates a card charge that required OTP authorization.
   */
  async validateOtpCharge(flwRef: string, otp: string) {
    const res = await fetch(`${this.baseUrl}/validate-charge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flw_ref: flwRef,
        otp,
        type: "card",
      }),
    });

    return res.json();
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Reference |
| --- | --- | --- | --- | --- |
| v3 | POST | `/charges?type=card` | Submit 3DES-encrypted card charge | https://developer.flutterwave.com/docs/collecting-payments/cards.md |
| v3 | POST | `/validate-charge` | Submit OTP / challenge code | https://developer.flutterwave.com/reference/validate_charge |
| v3 | GET | `/transactions/{id}/verify` | Verify final transaction state | https://developer.flutterwave.com/docs/transactions/verify.md |
| v4 | POST | `/charges` | Charge stored `payment_method_id` | https://developer.flutterwave.com/reference/charges_post |

## Authorization Modes

- `mode: "pin"`: Issuer requires 4-digit card PIN. Pass the PIN in payload or re-submit charge with `pin`.
- `mode: "otp"`: Charge is pending OTP. Prompt customer and call `/validate-charge` with `flw_ref`.
- `mode: "redirect"`: 3D Secure web challenge required. Redirect user to `meta.authorization.redirect`.

## Reliability Checklist

- Ensure PCI DSS compliance. Direct raw card processing requires PCI DSS certification or tokenization in production.
- Store the returned `card.token` from successful verification responses to allow tokenized 1-click charges.
- Never log raw card PAN or CVV numbers in server logs or telemetry.
