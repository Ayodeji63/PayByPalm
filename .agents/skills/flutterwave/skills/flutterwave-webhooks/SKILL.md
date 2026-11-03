---
name: flutterwave-webhooks
description: Ingest Flutterwave webhook events safely with verif-hash validation, constant-time comparison, idempotency guards, and server-side re-verification.
---

# flutterwave-webhooks

## Purpose

Implement secure webhook ingestion for Flutterwave events. Flutterwave passes a custom dashboard secret hash in the `verif-hash` request header. This skill provides timing-safe verification, event dispatching, idempotency checks, and mandatory server-side confirmation before granting value.

## Implementation Pattern (TypeScript / Next.js & Node)

```ts
import crypto from "node:crypto";

export interface FlutterwaveWebhookPayload<T = Record<string, unknown>> {
  event: "charge.completed" | "transfer.completed" | string;
  data: {
    id: number | string;
    tx_ref?: string;
    reference?: string;
    flw_ref?: string;
    amount: number;
    currency: string;
    status: "successful" | "failed" | string;
    customer?: {
      id: number;
      email: string;
      name?: string;
      phone_number?: string;
    };
    [key: string]: unknown;
  } & T;
  "event.type"?: string;
}

/**
 * Validates Flutterwave webhook secret hash using timing-safe comparison.
 */
export function verifyFlutterwaveWebhookSignature(
  headerHash: string | null | undefined,
  expectedSecretHash: string,
): boolean {
  if (!headerHash || !expectedSecretHash) {
    return false;
  }

  const headerBuffer = Buffer.from(headerHash, "utf8");
  const expectedBuffer = Buffer.from(expectedSecretHash, "utf8");

  if (headerBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuffer, expectedBuffer);
}

/**
 * Example webhook handler pattern for Next.js App Router (app/api/webhooks/flutterwave/route.ts).
 */
export async function POST(req: Request) {
  const secretHash = process.env.FLW_WEBHOOK_HASH;
  if (!secretHash) {
    console.error("FLW_WEBHOOK_HASH is not configured on server");
    return new Response("Webhook hash unconfigured", { status: 500 });
  }

  const incomingHash = req.headers.get("verif-hash");
  if (!verifyFlutterwaveWebhookSignature(incomingHash, secretHash)) {
    return new Response("Unauthorized webhook", { status: 401 });
  }

  const payload = (await req.json()) as FlutterwaveWebhookPayload;

  // Acknowledge receipt within Flutterwave's 60-second SLA immediately
  // Trigger background verification & processing
  queueMicrotask(async () => {
    try {
      await processWebhookEvent(payload);
    } catch (err) {
      console.error("Error processing webhook asynchronously:", err);
    }
  });

  return new Response(JSON.stringify({ status: "success" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Asynchronous worker that enforces idempotency and double-checks status with the API.
 */
async function processWebhookEvent(payload: FlutterwaveWebhookPayload) {
  const { event, data } = payload;
  const transactionId = data.id;
  const expectedTxRef = data.tx_ref || data.reference;

  if (event === "charge.completed" && data.status === "successful") {
    // 1. Check idempotency store to prevent duplicate credits
    const alreadyProcessed = await isTransactionHandled(transactionId);
    if (alreadyProcessed) {
      return;
    }

    // 2. CRITICAL: Re-verify transaction with Flutterwave API before fulfillment
    const verification = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const verifiedBody = await verification.json();
    if (
      !verification.ok ||
      verifiedBody.data.status !== "successful" ||
      verifiedBody.data.tx_ref !== expectedTxRef
    ) {
      console.warn("Webhook spoof or mismatch detected during re-verification:", verifiedBody);
      return;
    }

    // 3. Mark processed and credit customer
    await markTransactionHandled(transactionId, verifiedBody.data);
  }
}

async function isTransactionHandled(_id: string | number): Promise<boolean> {
  // Replace with DB query: e.g. prisma.transaction.findUnique({ where: { flutterwaveId: String(_id) } })
  return false;
}

async function markTransactionHandled(_id: string | number, _data: unknown): Promise<void> {
  // Replace with DB upsert/credit logic
}
```

## Endpoint Operations and References

| Event Type | Direction | Payload Header | Key Action | Reference |
| --- | --- | --- | --- | --- |
| `charge.completed` | Inbound | `verif-hash` | Payment successful or failed notification | https://developer.flutterwave.com/docs/events/webhooks.md |
| `transfer.completed` | Inbound | `verif-hash` | Payout terminal status update | https://developer.flutterwave.com/docs/transfers/transfers.md |
| `GET /transactions/{id}/verify` | Outbound | `Authorization: Bearer <key>` | Server-side verification before value grant | https://developer.flutterwave.com/docs/transactions/verify.md |
| `GET /charges/{id}` (v4) | Outbound | `Authorization: Bearer <token>` | Next-gen charge state confirmation | https://developer.flutterwave.com/v4.0.0/llms.txt |

## Common Webhook Events

- `charge.completed`: Triggered on card, bank transfer, USSD, or mobile money payment completion.
- `transfer.completed`: Triggered when an outbound transfer succeeds, fails, or is reversed.
- `chargeback.created`: Triggered when a customer opens a dispute against a transaction.

## Reliability Checklist

- Compare `verif-hash` using constant-time string comparison (`crypto.timingSafeEqual`) to avoid timing side channels.
- Return HTTP 200 within 60 seconds. Do not block the HTTP response with external email, SMS, or slow DB transactions.
- Always re-query the transaction by ID using the official verify endpoint (`/transactions/{id}/verify`) to validate `status === "successful"`, `currency`, and `amount`.
- Ensure webhook handlers are completely idempotent; Flutterwave retries webhooks automatically on network timeouts or non-200 responses.
