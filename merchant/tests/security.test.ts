import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type { Server } from "node:http";
import { createApp } from "../server/app";
import { configSchema } from "../server/config";
import { COOKIE, seal, unseal } from "../server/session";
import { createCipheriv, randomBytes } from "node:crypto";
function sealAdmin(value: unknown, key: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from("pbp-admin-v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
const user = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  merchant = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const config = configSchema.parse({
  NODE_ENV: "test",
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "private-service-fixture",
  SUPABASE_ANON_KEY: "fixture-anon",
  SESSION_ENCRYPTION_KEY: "a".repeat(64),
  PAYMENT_API_BASE_URL: "https://payments.example.test",
});
let member = true,
  verified = true,
  revoked = false,
  dbOffline = false,
  budget = 0,
  upstreamStatus = 200;
const nativeFetch = globalThis.fetch;
const login = vi.fn(),
  getUser = vi.fn(),
  refresh = vi.fn(),
  signOut = vi.fn(),
  upstream = vi.fn();
let stored: any = null,
  server: Server,
  base: string;
const db: any = {
  auth: { admin: { signOut } },
  rpc: vi.fn(async () => ({
    data: budget,
    error: dbOffline ? { code: "offline" } : null,
  })),
  from: (table: string) => {
    const filters: any[] = [];
    let patch: any, insert: any;
    const run = () => {
      if (dbOffline) return { data: null, error: { code: "offline" } };
      if (table === "merchant_memberships") {
        expect(filters).toContainEqual(["user_id", user]);
        expect(filters).toContainEqual(["revoked_at", null]);
        return {
          data: member
            ? [
                {
                  merchant_id: merchant,
                  merchants: { id: merchant, name: "Ayo Stores" },
                },
              ]
            : [],
          error: null,
        };
      }
      if (table === "merchant_sessions") {
        if (insert) stored = { ...insert, revoked_at: null };
        if (patch) stored = { ...stored, ...patch };
        return {
          data: stored
            ? {
                ...stored,
                revoked_at: revoked ? "2026-01-01" : stored.revoked_at,
              }
            : null,
          error: null,
        };
      }
      throw Error("unexpected table " + table);
    };
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        filters.push([k, v]);
        return q;
      },
      is: (k: string, v: any) => {
        filters.push([k, v]);
        return q;
      },
      order: () => q,
      limit: () => q,
      insert: (v: any) => {
        insert = v;
        return q;
      },
      update: (v: any) => {
        patch = v;
        return q;
      },
      maybeSingle: async () => run(),
      then: (r: any, j: any) => Promise.resolve(run()).then(r, j),
    };
    return q;
  },
};
const session = () => ({
  id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
  access: "private-access-fixture",
  refresh: "private-refresh-fixture",
  startedAt: Date.now(),
});
const cookie = () =>
  COOKIE + "=" + seal(session(), config.SESSION_ENCRYPTION_KEY);
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  nativeFetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie(),
      ...(body === undefined
        ? {}
        : { Origin: config.APP_ORIGIN, "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeAll(async () => {
  server = createApp({
    config,
    db,
    auth: () =>
      ({
        auth: { signInWithPassword: login,
        signOut, getUser, refreshSession: refresh },
      }) as any,
    serveFrontend: false,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  vi.clearAllMocks();
  member = true;
  verified = true;
  revoked = false;
  dbOffline = false;
  budget = 0;
  upstreamStatus = 200;
  stored = {
    id: session().id,
    user_id: user,
    expires_at: new Date(Date.now() + 600000).toISOString(),
    revoked_at: null,
  };
  const account = () => ({
    id: user,
    email: "merchant@example.test",
    email_confirmed_at: verified ? "2026-01-01" : null,
  });
  getUser.mockImplementation(async () => ({
    data: { user: account() },
    error: null,
  }));
  login.mockImplementation(async () => ({
    data: {
      user: account(),
      session: {
        access_token: session().access,
        refresh_token: session().refresh,
      },
    },
    error: null,
  }));
  signOut.mockResolvedValue({ error: null });
  refresh.mockResolvedValue({
    data: { session: null },
    error: { status: 401 },
  });
  upstream.mockImplementation(
    async () =>
      new Response(
        JSON.stringify(
          upstreamStatus === 200
            ? { paymentMode: "live", transactions: [] }
            : {
                error: {
                  code: "merchant_access_required",
                  message: "This account cannot access that merchant.",
                },
              },
        ),
        {
          status: upstreamStatus,
          headers: { "Content-Type": "application/json" },
        },
      ),
  );
  vi.stubGlobal("fetch", upstream);
});
describe("merchant authentication and session isolation", () => {
  it("requires the merchant cookie and does not accept customer or admin credentials", async () => {
    for (const headers of [
      { Cookie: "" },
      { Cookie: "pbp_admin_session=anything" },
      { Cookie: "", Authorization: "Bearer customer-jwt" },
      { Cookie: "", "X-Terminal-Key": "terminal" },
    ] as Record<string, string>[])
      expect(
        (await request("/api/auth/session", undefined, headers)).status,
      ).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
  it("returns a HttpOnly session only to an explicitly granted, verified account", async () => {
    const r = await request("/api/auth/login", {
      email: "merchant@example.test",
      password: "fixture-password",
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("pbp_merchant_session=");
    expect(r.headers.get("set-cookie")).toContain("HttpOnly");
    expect(r.headers.get("set-cookie")).toContain("SameSite=Strict");
    const result = await r.json();
    expect(result.businesses).toEqual([{ id: merchant, name: "Ayo Stores" }]);
    expect(JSON.stringify(result)).not.toContain("private-access-fixture");
  });
  it("rejects a verified customer with no merchant grant", async () => {
    member = false;
    expect(
      (
        await request("/api/auth/login", {
          email: "merchant@example.test",
          password: "password",
        })
      ).status,
    ).toBe(401);
  });
  it("rejects unverified accounts even if a grant exists", async () => {
    verified = false;
    expect(
      (
        await request("/api/auth/login", {
          email: "merchant@example.test",
          password: "password",
        })
      ).status,
    ).toBe(401);
  });
  it("rechecks membership on every request, making revocation immediate", async () => {
    expect((await request("/api/auth/session")).status).toBe(200);
    member = false;
    expect(
      (await request("/api/reports/overview?merchantId=" + merchant)).status,
    ).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects a revoked or expired server session before reports", async () => {
    revoked = true;
    expect((await request("/api/reports/overview")).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("fails closed when the database is unavailable", async () => {
    dbOffline = true;
    expect((await request("/api/auth/session")).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("retains cookies during an authentication provider outage", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    const r = await request("/api/auth/session");
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("retains cookies during a refresh provider outage", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    refresh.mockResolvedValue({
      data: { session: null },
      error: { status: 503 },
    });
    const r = await request("/api/auth/session");
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("durably invalidates cookie replay on logout", async () => {
    expect((await request("/api/auth/logout", {})).status).toBe(204);
    expect((await request("/api/auth/session")).status).toBe(401);
  });
  it("rejects cross-origin writes and sibling-app origins", async () => {
    for (const origin of [
      "https://evil.example",
      "https://admin.paybypalm.app",
      "https://www.paybypalm.app",
    ])
      expect(
        (
          await request(
            "/api/auth/login",
            { email: "owner@example.test", password: "password" },
            { Origin: origin },
          )
        ).status,
      ).toBe(403);
    expect(login).not.toHaveBeenCalled();
  });
  it("enforces shared login budgets before checking credentials", async () => {
    budget = 30;
    const r = await request("/api/auth/login", {
      email: "owner@example.test",
      password: "password",
    });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("30");
    expect(login).not.toHaveBeenCalled();
  });
  it("does not accept self-assigned roles on login", async () => {
    expect(
      (
        await request("/api/auth/login", {
          email: "owner@example.test",
          password: "password",
          role: "merchant",
          merchantId: merchant,
        })
      ).status,
    ).toBe(400);
    expect(login).not.toHaveBeenCalled();
  });
  it("uses a distinct authenticated encryption context from the admin app", () => {
    const value = seal(session(), config.SESSION_ENCRYPTION_KEY);
    expect(unseal(value, config.SESSION_ENCRYPTION_KEY)).toMatchObject({
      id: session().id,
    });
    expect(unseal(value.slice(2), config.SESSION_ENCRYPTION_KEY)).toBeNull();
    expect(
      unseal(
        sealAdmin(session(), config.SESSION_ENCRYPTION_KEY),
        config.SESSION_ENCRYPTION_KEY,
      ),
    ).toBeNull();
  });
});
describe("fixed reporting proxy", () => {
  it("forwards only the verified session credential to the configured backend", async () => {
    const r = await request("/api/reports/transactions?merchantId=" + merchant);
    expect(r.status).toBe(200);
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe(
      config.PAYMENT_API_BASE_URL +
        "/merchant/transactions?merchantId=" +
        merchant,
    );
    expect(options.headers.Authorization).toBe("Bearer private-access-fixture");
    expect(options.redirect).toBe("error");
    expect(options.cache).toBe("no-store");
  });
  it("preserves backend tenant rejection without exposing credentials", async () => {
    upstreamStatus = 403;
    const r = await request("/api/reports/transactions?merchantId=other");
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain(
      "private-access-fixture",
    );
  });
  it("cannot proxy arbitrary endpoints or mutate payments", async () => {
    expect((await request("/api/reports/refund")).status).toBe(400);
    expect((await request("/api/reports/transactions", {})).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("serves only CSV exports with a fixed filename", async () => {
    upstream.mockResolvedValue(
      new Response('"Reference"\r\n"fixture"', {
        headers: { "Content-Type": "text/csv" },
      }),
    );
    const r = await request("/api/reports/export?merchantId=" + merchant);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="paybypalm-payments.csv"',
    );
  });
  it("never redirects credentials to another upstream host", async () => {
    upstream.mockRejectedValue(new Error("redirect denied"));
    const r = await request("/api/reports/overview");
    expect(r.status).toBe(503);
    expect(JSON.stringify(await r.json())).not.toContain("redirect denied");
  });
  it("disables caching of account and financial responses", async () => {
    const r = await request("/api/auth/session");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
