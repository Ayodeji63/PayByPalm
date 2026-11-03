---
name: flutterwave-virtual-cards
description: Issue programmatic USD and local-currency virtual debit cards, manage card balances, and control card lifecycle states.
---

# flutterwave-virtual-cards

## Purpose

Issue and manage virtual cards (Mastercard/Visa). Enables platforms to provide users with digital dollar or local currency cards for global online subscriptions, advertising expenses, and business spend management.

## Implementation Pattern (TypeScript)

```ts
export interface CreateVirtualCardOptions {
  currency: "USD" | "NGN";
  amount: number; // Initial funding amount
  billingName: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string; // e.g. "US"
}

export interface VirtualCardRecord {
  id: string;
  account_id: number;
  amount: string;
  currency: string;
  card_pan: string;
  masked_pan: string;
  city: string;
  state: string;
  address_1: string;
  zip_code: string;
  cvv: string;
  expiration: string;
  card_type: string;
  name_on_card: string;
  is_active: boolean;
  created_at: string;
}

export class FlutterwaveVirtualCardService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Issues a new virtual card.
   */
  async createCard(options: CreateVirtualCardOptions): Promise<VirtualCardRecord> {
    const res = await fetch(`${this.baseUrl}/virtual-cards`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currency: options.currency,
        amount: options.amount,
        billing_name: options.billingName,
        billing_address: options.billingAddress,
        billing_city: options.billingCity,
        billing_state: options.billingState,
        billing_postal_code: options.billingPostalCode,
        billing_country: options.billingCountry,
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to issue virtual card: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Funds an active virtual card from merchant wallet balance.
   */
  async fundCard(cardId: string, amount: number) {
    const res = await fetch(`${this.baseUrl}/virtual-cards/${cardId}/fund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount, debit_currency: "NGN" }),
    });

    return res.json();
  }

  /**
   * Blocks or unblocks a card.
   */
  async updateCardStatus(cardId: string, status: "block" | "unblock") {
    const res = await fetch(`${this.baseUrl}/virtual-cards/${cardId}/status/${status}`, {
      method: "PUT",
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
| v3 | POST | `/virtual-cards` | Create and fund virtual card | https://developer.flutterwave.com/docs/virtual-cards/virtual-cards.md |
| v3 | GET | `/virtual-cards/{id}` | Inspect card balance and PAN | https://developer.flutterwave.com/reference/virtual_cards_get |
| v3 | POST | `/virtual-cards/{id}/fund` | Add funds to card | https://developer.flutterwave.com/reference/virtual_cards_fund |
| v3 | PUT | `/virtual-cards/{id}/status/{status}` | Freeze or activate card | https://developer.flutterwave.com/reference/virtual_cards_status |

## Usage Example

```ts
import { FlutterwaveVirtualCardService } from "./flutterwave-virtual-cards";

export async function issueMarketingDollarCard() {
  const service = new FlutterwaveVirtualCardService();
  const card = await service.createCard({
    currency: "USD",
    amount: 50,
    billingName: "TechCorp Marketing Team",
    billingAddress: "100 Innovation Way",
    billingCity: "San Francisco",
    billingState: "CA",
    billingPostalCode: "94107",
    billingCountry: "US",
  });

  console.log(`Issued Card ending in ${card.masked_pan.slice(-4)}`);
  return card;
}
```

## Reliability Checklist

- Funding virtual cards debits your live balance in real time; ensure sufficient source currency balance.
- Card PAN and CVV must be rendered only behind authenticated session views with strict access controls.
- Provide users the ability to immediately freeze/block cards if fraud is suspected.
