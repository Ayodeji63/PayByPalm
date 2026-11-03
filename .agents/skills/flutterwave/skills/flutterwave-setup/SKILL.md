---
name: flutterwave-setup
description: Bootstrap a production-safe Flutterwave client supporting v3 Bearer Secret Key auth and v4 OAuth 2.0 client credentials with token caching.
---

# flutterwave-setup

## Purpose

Bootstrap a production-safe Flutterwave client in TypeScript that cleanly separates stable v3 endpoints from next-gen v4 Public Beta services, handles authentication tokens, and injects required tracing and idempotency headers.

## Implementation Pattern (TypeScript)

```ts
import crypto from "node:crypto";

export interface FlutterwaveConfig {
  secretKey?: string; // v3 secret key (e.g. FLWSECK-xxx or FLWSECK_TEST-xxx)
  v4ClientId?: string; // v4 OAuth2 client_id
  v4ClientSecret?: string; // v4 OAuth2 client_secret
  v3BaseUrl?: string; // default: https://api.flutterwave.com/v3
  v4BaseUrl?: string; // sandbox: https://developersandbox-api.flutterwave.com | live: https://f4bexperience.flutterwave.com/
  v4IdpUrl?: string; // default: https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token
}

export interface FlwResponse<T> {
  status: "success" | "error";
  message: string;
  data: T;
}

export class FlutterwaveApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "FlutterwaveApiError";
  }
}

export class FlutterwaveClient {
  private readonly config: FlutterwaveConfig;
  private v4TokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config: FlutterwaveConfig = {}) {
    this.config = {
      secretKey: config.secretKey ?? process.env.FLW_SECRET_KEY,
      v4ClientId: config.v4ClientId ?? process.env.FLW_V4_CLIENT_ID,
      v4ClientSecret: config.v4ClientSecret ?? process.env.FLW_V4_CLIENT_SECRET,
      v3BaseUrl: config.v3BaseUrl ?? process.env.FLW_V3_BASE_URL ?? "https://api.flutterwave.com/v3",
      v4BaseUrl: config.v4BaseUrl ?? process.env.FLW_V4_BASE_URL ?? "https://developersandbox-api.flutterwave.com",
      v4IdpUrl: config.v4IdpUrl ?? "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token",
    };
  }

  /**
   * Retrieves a cached OAuth 2.0 Bearer token for v4 API requests.
   */
  private async getV4AccessToken(): Promise<string> {
    const now = Date.now();
    if (this.v4TokenCache && this.v4TokenCache.expiresAt > now + 60_000) {
      return this.v4TokenCache.token;
    }

    if (!this.config.v4ClientId || !this.config.v4ClientSecret) {
      throw new Error("Missing v4 credentials: FLW_V4_CLIENT_ID and FLW_V4_CLIENT_SECRET are required for v4 requests.");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.v4ClientId,
      client_secret: this.config.v4ClientSecret,
    });

    const res = await fetch(this.config.v4IdpUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new FlutterwaveApiError(`Failed to authenticate with v4 IDP: ${res.statusText}`, res.status);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.v4TokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };

    return data.access_token;
  }

  /**
   * Universal typed request wrapper for Flutterwave v3 and v4 APIs.
   */
  async request<T>(
    version: "v3" | "v4",
    path: string,
    options: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<FlwResponse<T>> {
    const { idempotencyKey, headers: customHeaders, ...init } = options;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(customHeaders as Record<string, string>),
    };

    let baseUrl: string;
    if (version === "v3") {
      if (!this.config.secretKey) {
        throw new Error("Missing FLW_SECRET_KEY for v3 request");
      }
      baseUrl = this.config.v3BaseUrl!;
      headers["Authorization"] = `Bearer ${this.config.secretKey}`;
    } else {
      baseUrl = this.config.v4BaseUrl!;
      const token = await this.getV4AccessToken();
      headers["Authorization"] = `Bearer ${token}`;
      headers["X-Trace-Id"] = crypto.randomUUID();
      if (idempotencyKey) {
        headers["X-Idempotency-Key"] = idempotencyKey;
      }
    }

    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, { ...init, headers });
    const responseBody = (await response.json()) as FlwResponse<T>;

    if (!response.ok || responseBody.status === "error") {
      throw new FlutterwaveApiError(
        responseBody.message || `Flutterwave ${version} request failed (${response.status})`,
        response.status,
        responseBody,
      );
    }

    return responseBody;
  }
}
```

## Endpoint Operations and References

| Version | Method | Route / Operation | Description | Documentation Reference |
| --- | --- | --- | --- | --- |
| v3 | GET | `/banks/{country}` | List banks for validation | https://developer.flutterwave.com/docs/collecting-payments/banks.md |
| v3 | GET | `/transactions/{id}/verify` | Verify payment status | https://developer.flutterwave.com/docs/transactions/verify.md |
| v4 | POST | `/openid-connect/token` | Obtain OAuth 2.0 Bearer token | https://developer.flutterwave.com/v4.0.0/llms.txt |
| v4 | GET | `/customers` | List or inspect customers | https://developer.flutterwave.com/reference/customers_list |

## Environment Configuration Matrix

| Variable | Required In | Purpose | Example |
| --- | --- | --- | --- |
| `FLW_SECRET_KEY` | v3 | Bearer authorization key for v3 APIs | `FLWSECK_TEST-d7...-X` |
| `FLW_PUBLIC_KEY` | v3 Frontend | Client-side inline checkout initialization | `FLWPUBK_TEST-5c...-X` |
| `FLW_V4_CLIENT_ID` | v4 | Client ID for OAuth 2.0 OpenID Connect | `client_prod_xyz` |
| `FLW_V4_CLIENT_SECRET` | v4 | Client secret for OAuth 2.0 OpenID Connect | `sec_98f...` |
| `FLW_WEBHOOK_HASH` | Both | Secret hash configured in Flutterwave Dashboard | `my_webhook_secret_hash_2026` |

## Usage Example

```ts
import { FlutterwaveClient } from "./flutterwave-client";

export async function bootstrapFlutterwave() {
  const client = new FlutterwaveClient({
    secretKey: process.env.FLW_SECRET_KEY,
    v4ClientId: process.env.FLW_V4_CLIENT_ID,
    v4ClientSecret: process.env.FLW_V4_CLIENT_SECRET,
  });

  // Verify connection by querying supported Nigerian banks via v3
  const banks = await client.request<Array<{ id: number; code: string; name: string }>>(
    "v3",
    "/banks/NG",
    { method: "GET" },
  );

  return banks.data;
}
```

## Reliability Checklist

- Store credentials strictly in environment variables; never check secret keys or client secrets into version control.
- Cache v4 OAuth tokens in memory with a safety margin (e.g. refresh 60 seconds before expiry).
- Attach unique `X-Trace-Id` headers to all v4 calls for cross-system observability.
- Append `.md` to Flutterwave documentation URLs when retrieving live specifications for AI agent tasks.
