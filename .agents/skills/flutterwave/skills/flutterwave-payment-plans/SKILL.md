---
name: flutterwave-payment-plans
description: Create recurring payment plans with customizable billing intervals (daily, weekly, monthly, yearly) and attach them to customer checkout sessions.
---

# flutterwave-payment-plans

## Purpose

Define recurring subscription plans. When attached to checkout sessions (`payment_plan` parameter), Flutterwave automatically rebills the customer on the defined interval (daily, weekly, monthly, quarterly, yearly) without requiring manual recurring charge requests.

## Implementation Pattern (TypeScript)

```ts
export type BillingInterval = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface CreatePaymentPlanOptions {
  name: string;
  amount: number;
  interval: BillingInterval;
  duration?: number; // Number of billing cycles (0 or omitted for indefinite)
  currency?: string; // default "NGN"
}

export interface PaymentPlanRecord {
  id: number;
  name: string;
  amount: number;
  interval: BillingInterval;
  duration: number;
  status: "active" | "cancelled";
  currency: string;
  plan_token: string;
  created_at: string;
}

export class FlutterwavePaymentPlanService {
  constructor(
    private readonly secretKey: string = process.env.FLW_SECRET_KEY!,
    private readonly baseUrl: string = "https://api.flutterwave.com/v3",
  ) {
    if (!this.secretKey) {
      throw new Error("Missing FLW_SECRET_KEY");
    }
  }

  /**
   * Creates a new recurring subscription plan.
   */
  async createPlan(options: CreatePaymentPlanOptions): Promise<PaymentPlanRecord> {
    const res = await fetch(`${this.baseUrl}/payment-plans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: options.name,
        amount: options.amount.toString(),
        interval: options.interval,
        duration: options.duration ?? 0,
        currency: options.currency ?? "NGN",
      }),
    });

    const body = await res.json();
    if (!res.ok || body.status !== "success") {
      throw new Error(`Failed to create payment plan: ${body.message}`);
    }

    return body.data;
  }

  /**
   * Cancels an active payment plan.
   */
  async cancelPlan(planId: number | string) {
    const res = await fetch(`${this.baseUrl}/payment-plans/${planId}/cancel`, {
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
| v3 | POST | `/payment-plans` | Create subscription plan | https://developer.flutterwave.com/docs/collecting-payments/payment-plans.md |
| v3 | GET | `/payment-plans` | List active payment plans | https://developer.flutterwave.com/reference/payment_plans_list |
| v3 | GET | `/payment-plans/{id}` | Inspect specific plan | https://developer.flutterwave.com/reference/payment_plans_get |
| v3 | PUT | `/payment-plans/{id}/cancel` | Cancel plan | https://developer.flutterwave.com/reference/payment_plans_cancel |

## Attaching Plan to Standard Checkout

To subscribe a customer upon checkout, pass `payment_plan: plan.id` in `POST /payments`:

```json
{
  "tx_ref": "SUB-ORD-9182",
  "amount": "15000",
  "currency": "NGN",
  "payment_plan": 12048,
  "redirect_url": "https://myapp.com/billing/callback",
  "customer": {
    "email": "subscriber@example.com"
  }
}
```

## Usage Example

```ts
import { FlutterwavePaymentPlanService } from "./flutterwave-payment-plans";

export async function createSaaSPlan() {
  const service = new FlutterwavePaymentPlanService();
  const plan = await service.createPlan({
    name: "Enterprise Cloud Monthly",
    amount: 50000,
    interval: "monthly",
    currency: "NGN",
  });

  console.log(`Plan ID created: ${plan.id}`);
  return plan;
}
```

## Reliability Checklist

- Listen for the `subscription.cancelled` webhook event to revoke customer privileges when subscriptions are terminated.
- Test intervals in sandbox to verify recurring webhook triggers.
