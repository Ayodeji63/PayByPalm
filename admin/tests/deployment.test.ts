import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { createApp } from "../server/app.js";
import { configSchema } from "../server/config.js";
const deployment = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const adminId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const config = configSchema.parse({
  NODE_ENV: "production",
  APP_ORIGIN: "https://admin.paybypalm.app",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-private-fixture",
  SUPABASE_ANON_KEY: "anon-fixture",
  ADMIN_USER_IDS: adminId,
  SESSION_ENCRYPTION_KEY: "a".repeat(64),
});
const rpc = vi.fn(),
  from = vi.fn(),
  signIn = vi.fn();
let server: Server, base: string;
beforeAll(async () => {
  server = createApp({
    config,
    serveFrontend: false,
    db: { rpc, from } as any,
    auth: () => ({ auth: { signInWithPassword: signIn } }) as any,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: 0, error: null });
  from.mockReturnValue({ insert: async () => ({ error: null }) });
  signIn.mockResolvedValue({
    data: {
      user: {
        id: adminId,
        email: "admin@example.test",
        email_confirmed_at: "2026-01-01",
      },
      session: {
        access_token: "access-fixture",
        refresh_token: "refresh-fixture",
      },
    },
    error: null,
  });
});
const login = (
  origin: string,
  body: unknown = { email: "admin@example.test", password: "fixture-password" },
) =>
  fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("same-origin Vercel deployment", () => {
  it("returns API JSON and health without depending on a packaged frontend", async () => {
    const health = await fetch(base + "/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ service: "paybypalm-admin" });
    const api = await fetch(base + "/api/auth/session");
    expect(api.status).toBe(401);
    expect(api.headers.get("content-type")).toContain("application/json");
    expect((await fetch(base + "/")).status).toBe(404);
  });
  it("issues a secure host-only administrator cookie on the configured subdomain", async () => {
    const result = await login(config.APP_ORIGIN);
    expect(result.status).toBe(200);
    const cookie = result.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api");
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).not.toContain("access-fixture");
    expect(cookie).not.toContain("refresh-fixture");
  });
  it.each([
    "https://www.paybypalm.app",
    "https://paybypalm.app",
    "https://admin.paybypalm.app.attacker.example",
  ])(
    "rejects writes from %s before provider or database work",
    async (origin) => {
      const result = await login(origin);
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({
        error: { code: "origin_denied" },
      });
      expect(rpc).not.toHaveBeenCalled();
      expect(signIn).not.toHaveBeenCalled();
    },
  );
  it("keeps the Express body limit when serving only the function API", async () => {
    const result = await login(config.APP_ORIGIN, {
      email: "admin@example.test",
      password: "x".repeat(25000),
    });
    expect(result.status).toBe(413);
    expect(signIn).not.toHaveBeenCalled();
  });
  it("applies the same production security policy to CDN files and function responses", async () => {
    const response = await fetch(base + "/health");
    const headers = deployment.headers.find(
      (h: { source: string }) => h.source === "/(.*)",
    ).headers;
    for (const { key, value } of headers)
      expect(response.headers.get(key), key).toBe(value);
  });
});
