---
name: flutterwave-testing
description: Validate Flutterwave integrations using test cards, simulated OTP/PIN responses, sandbox environments, and automated testing patterns.
---

# flutterwave-testing

## Purpose

Provide deterministic test credentials, cards, mobile numbers, and test assertions to validate payments, payouts, and webhook processing in Flutterwave sandbox environments.

## Implementation Pattern (TypeScript / Vitest / Jest)

```ts
import { describe, expect, it } from "vitest";

export const FLUTTERWAVE_TEST_CARDS = {
  // Successful 3DS card
  MASTERCARD_SUCCESS: {
    cardNumber: "5531881111111111",
    cvv: "123",
    expiryMonth: "09",
    expiryYear: "32",
    pin: "3310",
    otp: "12345",
  },
  // Successful Visa card
  VISA_SUCCESS: {
    cardNumber: "4084084084084081",
    cvv: "884",
    expiryMonth: "12",
    expiryYear: "30",
    otp: "12345",
  },
  // Verve local Nigerian card
  VERVE_SUCCESS: {
    cardNumber: "5060666666666666",
    cvv: "111",
    expiryMonth: "05",
    expiryYear: "29",
    pin: "1234",
    otp: "12345",
  },
  // Card that triggers insufficient funds
  INSUFFICIENT_FUNDS: {
    cardNumber: "5531882222222222",
    cvv: "123",
    expiryMonth: "09",
    expiryYear: "32",
  },
};

export const FLUTTERWAVE_TEST_MOBILE_MONEY = {
  KENYA_MPESA: "2540700000000",
  GHANA_MTN: "0540000000",
  RWANDA_MTN: "0780000000",
  UGANDA_AIRTEL: "256700000000",
};

export const FLUTTERWAVE_TEST_BANK_ACCOUNTS = {
  NIGERIA_ACCESS_BANK: {
    accountNumber: "0690000031",
    bankCode: "044",
    accountName: "FLW TEST ACCOUNT",
  },
};

describe("Flutterwave Sandbox Integration Test", () => {
  it("initializes a test checkout payment link", async () => {
    const secretKey = process.env.FLW_SECRET_KEY;
    if (!secretKey?.startsWith("FLWSECK_TEST")) {
      throw new Error("Integration tests must be executed with sandbox FLWSECK_TEST keys");
    }

    const testTxRef = `TEST-${Date.now()}`;
    const res = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: testTxRef,
        amount: "1500.00",
        currency: "NGN",
        redirect_url: "https://example.com/callback",
        customer: {
          email: "qa-tester@example.com",
          name: "Test Runner",
        },
      }),
    });

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("success");
    expect(body.data.link).toContain("https://");
  });
});
```

## Testing Credentials & Simulation Matrix

| Rail / Capability | Test Credential / Input | Expected Challenge / Outcome |
| --- | --- | --- |
| 3DS Mastercard | `5531881111111111`, CVV `123` | Prompts for OTP; submit `12345` -> Successful |
| Verve Card (PIN) | `5060666666666666`, CVV `111` | Prompts for PIN `1234`, then OTP `12345` |
| Decline Simulation | `5531882222222222` | Direct decline (`Insufficient funds`) |
| Kenya M-Pesa | `2540700000000` | Auto-completes STK push authorization in sandbox |
| Ghana Vodafone | `0500000000` + Voucher `123456` | Approves payment against simulated voucher |
| Bank Account Resolution | Account `0690000031`, Bank `044` | Resolves account name successfully |

## Usage Example

```ts
import { FLUTTERWAVE_TEST_CARDS } from "./flutterwave-testing";

export function getMockCardPaymentPayload(txRef: string, amount: number) {
  const card = FLUTTERWAVE_TEST_CARDS.MASTERCARD_SUCCESS;
  return {
    card_number: card.cardNumber,
    cvv: card.cvv,
    expiry_month: card.expiryMonth,
    expiry_year: card.expiryYear,
    currency: "NGN",
    amount,
    email: "test.customer@example.com",
    tx_ref: txRef,
  };
}
```

## Reliability Checklist

- Ensure CI/CD test runners only have access to `FLWSECK_TEST-...` and `FLWPUBK_TEST-...` keys.
- Never run automated tests against live production endpoints or real debit cards.
- Sandbox charges and virtual accounts do not move real money and cannot be settled to physical bank accounts.
- In v4 testing, make requests against `https://developersandbox-api.flutterwave.com`.
