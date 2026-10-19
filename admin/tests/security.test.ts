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
import { seal, unseal, COOKIE, SESSION_MS } from "../server/session";
import { configSchema } from "../server/config";
import { configuration, deviceCredential } from "../src/api";
const adminId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  otherId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  sid = "cccccccc-cccc-4ccc-cccc-cccccccccccc",
  merchantId = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const config = configSchema.parse({
  NODE_ENV: "test",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-private-marker",
  SUPABASE_ANON_KEY: "anon-test",
  ADMIN_USER_IDS: adminId,
  SESSION_ENCRYPTION_KEY: "a".repeat(64),
});
const user = {
  id: adminId,
  email: "admin@example.test",
  email_confirmed_at: "2026-01-01",
  user_metadata: {},
};
const getUser = vi.fn(),
  refreshSession = vi.fn(),
  signIn = vi.fn(),
  signOut = vi.fn(),
  rpc = vi.fn();
let revoked = false,
  dbError: null | { code: string } = null;
const sessionRow = () => ({
  user_id: adminId,
  expires_at: new Date(Date.now() + 600000).toISOString(),
  revoked_at: revoked ? "2026-01-01" : null,
});
const from = vi.fn((table: string) => {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    range: async () => ({ data: [], error: dbError }),
    limit: async () => ({ data: [], error: dbError }),
    maybeSingle: async () => ({ data: sessionRow(), error: dbError }),
    insert: async () => ({ data: null, error: dbError }),
    update: () => {
      revoked = true;
      return q;
    },
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: null, error: dbError }).then(resolve, reject),
  };
  return q;
});
let server: Server, base: string;
const session = () => ({
  id: sid,
  access: "access-private-marker",
  refresh: "refresh-private-marker",
  startedAt: Date.now(),
});
const cookie = () =>
  COOKIE + "=" + seal(session(), config.SESSION_ENCRYPTION_KEY);
async function send(
  path: string,
  body?: unknown,
  opts: { cookie?: string; origin?: string; authorization?: string } = {},
) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            Origin: opts.origin || config.APP_ORIGIN,
          }),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.authorization ? { Authorization: opts.authorization } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  server = createApp({
    config,
    db: { rpc, from, auth: { admin: { signOut } } } as any,
    auth: () =>
      ({
        auth: { getUser, refreshSession, signInWithPassword: signIn },
      }) as any,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as any).port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  vi.clearAllMocks();
  revoked = false;
  dbError = null;
  getUser.mockResolvedValue({ data: { user }, error: null });
  signIn.mockResolvedValue({
    data: {
      user,
      session: {
        access_token: "access-private-marker",
        refresh_token: "refresh-private-marker",
      },
    },
    error: null,
  });
  refreshSession.mockResolvedValue({
    data: {
      session: { access_token: "fresh-access", refresh_token: "fresh-refresh" },
    },
    error: null,
  });
  signOut.mockResolvedValue({ error: null });
  rpc.mockImplementation(async (name: string, args: any) =>
    name === "consume_api_budget"
      ? { data: 0, error: null }
      : { data: { id: args.p_id }, error: null },
  );
});
describe("administrator boundaries", () => {
  it.each(["/api/overview", "/api/auth/session"])(
    "rejects anonymous access to %s",
    async (path) => {
      expect((await send(path)).status).toBe(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("does not accept a customer JWT or a client-supplied admin role", async () => {
    const r = await send(
      "/api/merchants",
      { role: "admin" },
      { authorization: "Bearer customer-jwt" },
    );
    expect(r.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a server allowlist entry even if metadata claims administrator", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { ...user, id: otherId, user_metadata: { role: "admin" } },
      },
      error: null,
    });
    expect(
      (await send("/api/overview", undefined, { cookie: cookie() })).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires email confirmation", async () => {
    getUser.mockResolvedValue({
      data: { user: { ...user, email_confirmed_at: null } },
      error: null,
    });
    expect(
      (await send("/api/overview", undefined, { cookie: cookie() })).status,
    ).toBe(403);
  });
  it("rejects a tampered encrypted cookie", async () => {
    expect(
      (
        await send("/api/overview", undefined, {
          cookie: cookie() + "modified",
        })
      ).status,
    ).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations before database or authentication calls", async () => {
    expect(
      (
        await send(
          "/api/terminals",
          {},
          { cookie: cookie(), origin: "https://attacker.example" },
        )
      ).status,
    ).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns only identity and an HTTP-only encrypted session on login", async () => {
    const r = await send("/api/auth/login", {
      email: "admin@example.test",
      password: "password-private-marker",
    });
    expect(r.status).toBe(200);
    const serialized = JSON.stringify(await r.json());
    expect(serialized).not.toContain("private-marker");
    const header = r.headers.get("set-cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/api");
    expect(header).not.toContain("access-private-marker");
    expect(header).not.toContain("refresh-private-marker");
  });
  it("rejects valid credentials belonging to a non-admin", async () => {
    signIn.mockResolvedValue({
      data: {
        user: { ...user, id: otherId },
        session: { access_token: "a", refresh_token: "b" },
      },
      error: null,
    });
    const r = await send("/api/auth/login", {
      email: "other@example.test",
      password: "password",
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("fails closed when abuse protection is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "missing" } });
    expect(
      (
        await send("/api/auth/login", {
          email: "admin@example.test",
          password: "password",
        })
      ).status,
    ).toBe(503);
    expect(signIn).not.toHaveBeenCalled();
  });
  it("invalidates replay of the old cookie immediately after logout", async () => {
    const saved = cookie();
    expect((await send("/api/auth/logout", {}, { cookie: saved })).status).toBe(
      204,
    );
    expect(
      (await send("/api/overview", undefined, { cookie: saved })).status,
    ).toBe(401);
  });
  it("preserves the cookie on an authentication-provider outage", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 500 } });
    const r = await send("/api/overview", undefined, { cookie: cookie() });
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });
  it("reports missing setup without exposing Supabase diagnostics", async () => {
    dbError = { code: "42703" };
    const r = await send("/api/overview", undefined, { cookie: cookie() });
    expect(r.status).toBe(503);
    const b = await r.json();
    expect(b.error.code).toBe("setup_required");
    expect(JSON.stringify(b)).not.toContain("service-private-marker");
  });
});
describe("onboarding writes", () => {
  const merchant = {
    id: merchantId,
    name: "Ayo Stores",
    email: "",
    phone: "",
    address: "",
    subaccount: "",
    expected: null,
  };
  it("binds the audit actor to the verified admin, not submitted data", async () => {
    expect(
      (await send("/api/merchants", merchant, { cookie: cookie() })).status,
    ).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "admin_save_merchant",
      expect.objectContaining({
        p_actor: adminId,
        p_id: merchantId,
        p_name: "Ayo Stores",
      }),
    );
  });
  it("rejects mass assignment of actor or account IDs", async () => {
    expect(
      (
        await send(
          "/api/merchants",
          { ...merchant, actorId: otherId, account_id: otherId },
          { cookie: cookie() },
        )
      ).status,
    ).toBe(400);
    expect(
      rpc.mock.calls.every(([name]) => name === "consume_api_budget"),
    ).toBe(true);
  });
  it.each(["wrong", "ACCT_bad value", "ACCT_;drop table merchants"])(
    "rejects malformed settlement identifier %s",
    async (subaccount) => {
      expect(
        (
          await send(
            "/api/merchants",
            { ...merchant, subaccount },
            { cookie: cookie() },
          )
        ).status,
      ).toBe(400);
    },
  );
  it("accepts only a hash during terminal creation", async () => {
    expect(
      (
        await send(
          "/api/terminals",
          { id: sid, merchantId, label: "Counter 1", keyHash: "b".repeat(64) },
          { cookie: cookie() },
        )
      ).status,
    ).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "admin_save_terminal",
      expect.objectContaining({
        p_hash: "b".repeat(64),
        p_merchant: merchantId,
        p_actor: adminId,
      }),
    );
  });
  it("rejects plaintext device keys", async () => {
    expect(
      (
        await send(
          "/api/terminals",
          {
            id: sid,
            merchantId,
            label: "Counter 1",
            keyHash: "pbp_" + "c".repeat(64),
          },
          { cookie: cookie() },
        )
      ).status,
    ).toBe(400);
  });
  it("cannot reassign an existing terminal to another merchant", async () => {
    expect(
      (
        await send(
          "/api/terminals/" + sid,
          {
            action: "label",
            label: "Other shop",
            merchantId: otherId,
            expected: new Date().toISOString(),
          },
          { cookie: cookie() },
        )
      ).status,
    ).toBe(400);
  });
  it("revokes access using a new unpredictable hash without returning a usable key", async () => {
    const r = await send(
      "/api/terminals/" + sid,
      { action: "disable", expected: new Date().toISOString() },
      { cookie: cookie() },
    );
    expect(r.status).toBe(200);
    const call = rpc.mock.calls.find(
      ([name]) => name === "admin_save_terminal",
    )!;
    expect(call[1].p_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(await r.json())).not.toContain(call[1].p_hash);
  });
  it("does not report success after an atomic database failure", async () => {
    rpc.mockImplementation(async (name) =>
      name === "consume_api_budget"
        ? { data: 0, error: null }
        : { data: null, error: { code: "PA409" } },
    );
    expect(
      (await send("/api/merchants", merchant, { cookie: cookie() })).status,
    ).toBe(409);
  });
});
describe("device and session material", () => {
  it("encrypts a session and rejects expiry, wrong keys and future issuance", () => {
    const s = session(),
      key = config.SESSION_ENCRYPTION_KEY;
    expect(unseal(seal(s, key), key)).toEqual(s);
    expect(unseal(seal(s, key), "b".repeat(64))).toBeNull();
    expect(
      unseal(seal({ ...s, startedAt: Date.now() - SESSION_MS - 1 }, key), key),
    ).toBeNull();
    expect(
      unseal(seal({ ...s, startedAt: Date.now() + 10000 }, key), key),
    ).toBeNull();
  });
  it("generates distinct device keys and their actual SHA-256 hashes", async () => {
    const a = await deviceCredential(),
      b = await deviceCredential();
    expect(a.key).not.toBe(b.key);
    expect(a.key).toMatch(/^pbp_[a-f0-9]{64}$/);
    const { createHash } = await import("node:crypto");
    expect(a.hash).toBe(createHash("sha256").update(a.key).digest("hex"));
  });
  it("produces the Pi parser format and rejects credential-bearing URLs", () => {
    const key = "pbp_" + "a".repeat(64);
    expect(configuration("https://pay-by-palm.vercel.app/terminal", key)).toBe(
      `KIOSK_URL='https://pay-by-palm.vercel.app/terminal'\nTERMINAL_KEY=${key}\n`,
    );
    expect(() =>
      configuration("https://evil.example/terminal?k=secret", key),
    ).toThrow();
  });
});
