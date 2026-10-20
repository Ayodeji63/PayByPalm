import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
const m = vi.hoisted(() => ({
  mode: "test",
  member: true,
  offline: false,
  calls: [] as any[],
  rows: [] as any[],
  paystack: vi.fn(),
  rpc: vi.fn(),
}));
const merchantA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
  merchantB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
  user = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
vi.mock("../middleware/userAuth.js", () => ({
  userAuth: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) {
      res.status(401).json({ error: { code: "unauthorized" } });
      return;
    }
    req.user = { id: user };
    next();
  },
  requireUser: (req: any) => req.user,
}));
vi.mock("../middleware/abuseLimits.js", () => ({
  userRateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../services/paystack.js", () => ({
  paystackDomain: () => m.mode,
  paystack: m.paystack,
}));
vi.mock("../db/client.js", () => ({
  db: {
    rpc: m.rpc,
    from: (table: string) => {
      const filters: any[] = [],
        columns = { value: "" };
      let low = 0,
        high = Infinity;
      const run = () => {
        m.calls.push({ table, filters: [...filters], columns: columns.value });
        if (m.offline) return { data: null, error: { code: "offline" } };
        let rows: any[] =
          table === "merchant_memberships"
            ? m.member
              ? [{ merchant_id: merchantA, user_id: user, revoked_at: null }]
              : []
            : table === "merchant_payment_reports"
              ? m.rows
              : table === "merchants"
                ? [
                    {
                      id: merchantA,
                      name: "Ayo Stores",
                      paystack_subaccount: "ACCT_liveA",
                      paystack_test_subaccount: "ACCT_testA",
                    },
                    {
                      id: merchantB,
                      name: "Other merchant",
                      paystack_subaccount: "ACCT_liveB",
                    },
                  ]
                : table === "terminals"
                  ? [
                      {
                        id: "terminalA",
                        merchant_id: merchantA,
                        label: "Counter A",
                        api_key_hash: "private-key-hash",
                        last_seen_at: null,
                        disabled_at: null,
                      },
                      {
                        id: "terminalB",
                        merchant_id: merchantB,
                        label: "Other counter",
                        api_key_hash: "other-private-key",
                      },
                    ]
                  : [];
        for (const [key, value, op] of filters)
          rows = rows.filter((row) =>
            op === "gte"
              ? row[key] >= value
              : op === "lt"
                ? row[key] < value
                : row[key] === value,
          );
        rows = rows.slice(low, high + 1);
        return {
          data: rows.map((row) =>
            Object.fromEntries(
              columns.value.split(",").map((k) => [k, row[k] ?? null]),
            ),
          ),
          error: null,
        };
      };
      const q: any = {
        select: (v: string) => {
          columns.value = v;
          return q;
        },
        eq: (k: string, v: any) => {
          filters.push([k, v, "eq"]);
          return q;
        },
        is: (k: string, v: any) => {
          filters.push([k, v, "eq"]);
          return q;
        },
        gte: (k: string, v: any) => {
          filters.push([k, v, "gte"]);
          return q;
        },
        lt: (k: string, v: any) => {
          filters.push([k, v, "lt"]);
          return q;
        },
        order: () => q,
        limit: (n: number) => {
          high = n - 1;
          return q;
        },
        range: (a: number, b: number) => {
          low = a;
          high = b;
          return q;
        },
        maybeSingle: async () => {
          const r = run();
          return { ...r, data: r.data?.[0] ?? null };
        },
        then: (r: any, j: any) => Promise.resolve(run()).then(r, j),
      };
      return q;
    },
  },
}));
import { merchantRouter } from "./merchant.js";
let server: Server, base: string;
const get = (resource: string, extra = "", authenticated = true) =>
  fetch(
    base +
      "/merchant/" +
      resource +
      "?merchantId=" +
      merchantA +
      "&from=2026-10-01&to=2026-10-20" +
      extra,
    { headers: authenticated ? { Authorization: "Bearer fixture" } : {} },
  );
const sale = (merchant_id = merchantA, domain = "test", i = 1) => ({
  id: `payment-${i}`,
  merchant_id,
  domain,
  reference: "pbp_pay_" + String(i).padStart(32, "0"),
  amount_minor: 5000,
  description: "Lunch",
  status: "settled",
  created_at: "2026-10-19T12:00:00Z",
  settled_at: "2026-10-19T12:01:00Z",
  terminal_label: "Counter A",
  matched_user_id: "private-payer",
  authorization_ciphertext: "private-card-token",
});
beforeAll(async () => {
  const app = express();
  app.use(merchantRouter);
  app.use((e: any, _req: any, res: any, _next: any) =>
    res
      .status(e.status ?? 500)
      .json({ error: { code: e.code ?? "internal", message: e.message } }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});
beforeEach(() => {
  m.mode = "test";
  m.member = true;
  m.offline = false;
  m.calls.length = 0;
  m.rows = [sale(), sale(merchantB), sale(merchantA, "live")];
  m.rpc
    .mockReset()
    .mockResolvedValue({
      data: {
        paidAmountMinor: 5000,
        paidCount: 1,
        pendingCount: 0,
        failedCount: 0,
        totalCount: 1,
        daily: [],
      },
      error: null,
    });
  m.paystack
    .mockReset()
    .mockImplementation(async (path: string) =>
      path.startsWith("/subaccount/")
        ? { id: 101, subaccount_code: "ACCT_testA", domain: "test" }
        : [],
    );
});
describe("merchant reporting boundaries", () => {
  it.each([
    "overview",
    "transactions",
    "settlements",
    "settings",
    "terminals",
    "export",
  ])("requires authentication for %s", async (resource) => {
    expect((await get(resource, "", false)).status).toBe(401);
    expect(m.calls).toHaveLength(0);
    expect(m.paystack).not.toHaveBeenCalled();
  });
  it.each([
    "overview",
    "transactions",
    "settlements",
    "settings",
    "terminals",
    "export",
  ])("requires active membership for %s", async (resource) => {
    m.member = false;
    expect((await get(resource)).status).toBe(403);
    expect(m.calls.every((c) => c.table === "merchant_memberships")).toBe(true);
    expect(m.paystack).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects a forged merchant selector even if the user owns another merchant", async () => {
    const r = await fetch(
      base + "/merchant/transactions?merchantId=" + merchantB,
      { headers: { Authorization: "Bearer fixture" } },
    );
    expect(r.status).toBe(403);
    expect(m.calls).toHaveLength(1);
  });
  it("isolates payment rows by both merchant and active mode", async () => {
    const result = await (await get("transactions")).json();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].domain).toBe("test");
    expect(JSON.stringify(result)).not.toMatch(
      /private-payer|private-card-token|Other merchant/,
    );
    m.mode = "live";
    const live = await (await get("transactions")).json();
    expect(live.paymentMode).toBe("live");
    expect(live.transactions).toHaveLength(1);
    expect(live.transactions[0].domain).toBe("live");
  });
  it("rechecks grants and rejects access immediately after revocation", async () => {
    expect((await get("transactions")).status).toBe(200);
    m.member = false;
    expect((await get("transactions")).status).toBe(403);
  });
  it("uses Lagos midnight boundaries and a service-side aggregate for totals", async () => {
    expect((await get("overview")).status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("merchant_report_snapshot", {
      p_user: user,
      p_merchant: merchantA,
      p_domain: "test",
      p_from: "2026-09-30T23:00:00.000Z",
      p_to: "2026-10-20T23:00:00.000Z",
    });
  });
  it.each([
    "&from=2026-02-30",
    "&page=-1",
    "&page=10001",
    "&status=madeup",
    "&actor=another",
    "&subaccount=ACCT_other",
  ])("rejects invalid or injected filters %s", async (patch) => {
    expect((await get("transactions", patch)).status).toBe(400);
    expect(m.calls).toHaveLength(0);
  });
  it("rejects an inverted period and oversized reporting ranges", async () => {
    for (const params of [
      "from=2026-10-20&to=2026-10-01",
      "from=2024-01-01&to=2026-10-01",
    ]) {
      const r = await fetch(
        base + "/merchant/transactions?merchantId=" + merchantA + "&" + params,
        { headers: { Authorization: "Bearer fixture" } },
      );
      expect(r.status).toBe(400);
    }
  });
  it("rejects stale-mode exports before querying financial records", async () => {
    m.mode = "live";
    expect((await get("export", "&paymentMode=test")).status).toBe(409);
    expect(m.calls).toHaveLength(0);
  });
  it("exports only owned payments and neutralizes spreadsheet formulas", async () => {
    m.rows = [
      { ...sale(), description: ' =HYPERLINK("https://evil.example")' },
      sale(merchantB),
    ];
    const r = await get("export");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    const text = await r.text();
    expect(text).toContain("' =HYPERLINK");
    expect(text).not.toContain("private-card-token");
    expect(text.match(/pbp_pay_/g)).toHaveLength(1);
  });
  it("exports beyond the first database page without truncating", async () => {
    m.rows = Array.from({ length: 1101 }, (_, i) => sale(merchantA, "test", i));
    const r = await get("export");
    expect(r.status).toBe(200);
    expect((await r.text()).match(/pbp_pay_/g)).toHaveLength(1101);
  });
  it("refuses exports above 5000 instead of silently losing records", async () => {
    m.rows = Array.from({ length: 5001 }, (_, i) => sale(merchantA, "test", i));
    expect((await get("export")).status).toBe(413);
  });
  it("returns paginated safe terminal fields without keys or another merchant", async () => {
    const r = await (await get("terminals")).json();
    expect(r.terminals).toHaveLength(1);
    expect(r.terminals[0].label).toBe("Counter A");
    expect(JSON.stringify(r)).not.toMatch(/private-key|Other counter/);
  });
  it("fails closed when membership storage is down", async () => {
    m.offline = true;
    expect((await get("transactions")).status).toBe(503);
    expect(m.paystack).not.toHaveBeenCalled();
  });
  it("exposes no write endpoint for payments, refunds or business settings", async () => {
    const r = await fetch(base + "/merchant/settings?merchantId=" + merchantA, {
      method: "POST",
      headers: { Authorization: "Bearer fixture" },
    });
    expect(r.status).toBe(404);
  });
});
describe("merchant Paystack settlement isolation", () => {
  it("resolves and uses only the owned subaccount numeric ID for settlement reads", async () => {
    const data = await (await get("settlements")).json();
    expect(data).toMatchObject({
      configured: true,
      paymentMode: "test",
      settlements: [],
    });
    expect(m.paystack.mock.calls[0][0]).toBe("/subaccount/ACCT_testA");
    const q = new URL(m.paystack.mock.calls[1][0], "https://api.paystack.co");
    expect(q.pathname).toBe("/settlement");
    expect(q.searchParams.get("subaccount")).toBe("101");
    expect(q.searchParams.get("page")).toBe("1");
  });
  it("never requests all-business settlements if the account lookup is wrong", async () => {
    m.paystack.mockResolvedValue({
      id: 101,
      subaccount_code: "ACCT_other",
      domain: "test",
    });
    expect((await get("settlements")).status).toBe(502);
    expect(m.paystack).toHaveBeenCalledTimes(1);
  });
  it("rejects a provider result for another mode", async () => {
    m.paystack.mockResolvedValue({
      id: 101,
      subaccount_code: "ACCT_testA",
      domain: "live",
    });
    expect((await get("settlements")).status).toBe(502);
    expect(m.paystack).toHaveBeenCalledTimes(1);
  });
  it("whitelists financial settlement fields without returning raw provider metadata", async () => {
    m.paystack
      .mockResolvedValueOnce({
        id: 101,
        subaccount_code: "ACCT_testA",
        domain: "test",
      })
      .mockResolvedValueOnce([
        {
          id: 12,
          domain: "test",
          currency: "NGN",
          status: "pending",
          total_amount: 4900,
          effective_amount: 4400,
          total_fees: 100,
          total_processed: 5000,
          settlement_date: "2026-10-19T00:00:00Z",
          integration: 12345,
          bank_account_number: "private-bank-number",
        },
      ]);
    const result = await (await get("settlements")).json();
    expect(result.settlements[0]).toMatchObject({
      status: "pending",
      amountMinor: 4900,
      effectiveAmountMinor: 4400,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private-bank-number|integration/,
    );
  });
  it("rejects any settlement explicitly belonging to another subaccount", async () => {
    m.paystack
      .mockResolvedValueOnce({
        id: 101,
        subaccount_code: "ACCT_testA",
        domain: "test",
      })
      .mockResolvedValueOnce([
        {
          id: 12,
          domain: "test",
          currency: "NGN",
          status: "success",
          total_amount: 4900,
          effective_amount: 4900,
          total_fees: 100,
          total_processed: 5000,
          settlement_date: "2026-10-19T00:00:00Z",
          subaccount: 999,
        },
      ]);
    expect((await get("settlements")).status).toBe(502);
  });
  it("does not turn a provider outage into an empty successful settlement report", async () => {
    m.paystack.mockRejectedValue(new Error("provider unavailable"));
    expect((await get("settlements")).status).toBe(500);
  });
});
