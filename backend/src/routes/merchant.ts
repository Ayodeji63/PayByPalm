/** Merchant-only, read-only reports. Every request rechecks an explicit grant. */
import { Router, type Request } from "express";
import { z } from "zod/v3";
import { db } from "../db/client.js";
import { AppError } from "../errors.js";
import { userAuth, requireUser } from "../middleware/userAuth.js";
import { userRateLimit } from "../middleware/abuseLimits.js";
import { paystack, paystackDomain } from "../services/paystack.js";

export const merchantRouter: Router = Router();
merchantRouter.use(
  "/merchant",
  userAuth,
  userRateLimit("merchant-reports", 90, 60),
);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date",
  );
const query = z
  .object({
    merchantId: z.string().uuid(),
    from: date.optional(),
    to: date.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    status: z
      .enum(["all", "settled", "processing", "failed", "cancelled"])
      .default("all"),
    reference: z.string().trim().max(100).default(""),
    paymentMode: z.enum(["test", "live"]).optional(),
  })
  .strict();
const fields =
  "id,amount_minor,description,status,created_at,settled_at,reference,domain,terminal_label";
function databaseError(error: { code?: string } | null): never {
  if (["42P01", "PGRST205", "PGRST202", "42703"].includes(error?.code || ""))
    throw new AppError(
      503,
      "merchant_setup_required",
      "Merchant reports require database migration 0024.",
    );
  if (error?.code === "MA403")
    throw new AppError(
      403,
      "merchant_access_required",
      "This account cannot access that merchant.",
    );
  throw new AppError(
    503,
    "merchant_report_unavailable",
    "Merchant reporting is temporarily unavailable.",
  );
}
async function context(req: Request) {
  const parsed = query.safeParse(req.query);
  if (!parsed.success)
    throw new AppError(
      400,
      "invalid_report_filters",
      "Check the merchant, dates, page and status filters.",
    );
  const input = parsed.data,
    mode = paystackDomain();
  if (input.paymentMode && input.paymentMode !== mode)
    throw new AppError(
      409,
      "payment_mode_changed",
      "Payment mode changed. Reload the report.",
    );
  const user = requireUser(req);
  const access = await db
    .from("merchant_memberships")
    .select("merchant_id")
    .eq("merchant_id", input.merchantId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (access.error) databaseError(access.error);
  if (!access.data)
    throw new AppError(
      403,
      "merchant_access_required",
      "This account cannot access that merchant.",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const to = input.to ?? today,
    from =
      input.from ??
      new Date(Date.parse(to + "T00:00:00Z") - 29 * 86400000)
        .toISOString()
        .slice(0, 10);
  const start = new Date(from + "T00:00:00+01:00"),
    end = new Date(Date.parse(to + "T00:00:00+01:00") + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
    throw new AppError(
      400,
      "invalid_report_period",
      "Choose a date range of up to 366 days.",
    );
  return {
    input,
    mode,
    userId: user.id,
    from,
    to,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
type Context = Awaited<ReturnType<typeof context>>;
function payments(c: Context) {
  let q = db
    .from("merchant_payment_reports")
    .select(fields)
    .eq("merchant_id", c.input.merchantId)
    .eq("domain", c.mode)
    .gte("created_at", c.start)
    .lt("created_at", c.end);
  if (c.input.status !== "all") q = q.eq("status", c.input.status);
  if (c.input.reference) q = q.eq("reference", c.input.reference);
  return q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}
async function merchant(c: Context) {
  const result = await db
    .from("merchants")
    .select(
      "id,name,contact_email,contact_phone,address,paystack_subaccount,paystack_test_subaccount",
    )
    .eq("id", c.input.merchantId)
    .maybeSingle();
  if (result.error) databaseError(result.error);
  if (!result.data)
    throw new AppError(404, "merchant_not_found", "Merchant not found.");
  return result.data;
}
merchantRouter.get("/merchant/overview", async (req, res) => {
  const c = await context(req);
  const [summary, recent, settings, terminals] = await Promise.all([
    db.rpc("merchant_report_snapshot", {
      p_user: c.userId,
      p_merchant: c.input.merchantId,
      p_domain: c.mode,
      p_from: c.start,
      p_to: c.end,
    }),
    payments(c).range(0, 7),
    payoutSettings(c),
    db
      .from("terminals")
      .select("id,label,last_seen_at,disabled_at,created_at")
      .eq("merchant_id", c.input.merchantId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(4),
  ]);
  if (summary.error) databaseError(summary.error);
  if (recent.error) databaseError(recent.error);
  if (terminals.error) databaseError(terminals.error);
  res.json({
    paymentMode: c.mode,
    from: c.from,
    to: c.to,
    summary: summary.data,
    recent: recent.data ?? [],
    settings,
    terminals: terminals.data ?? [],
  });
});
merchantRouter.get("/merchant/transactions", async (req, res) => {
  const c = await context(req),
    offset = (c.input.page - 1) * 25;
  const r = await payments(c).range(offset, offset + 25);
  if (r.error) databaseError(r.error);
  const rows = r.data ?? [];
  res.json({
    paymentMode: c.mode,
    transactions: rows.slice(0, 25),
    page: c.input.page,
    hasMore: rows.length > 25,
  });
});
merchantRouter.get("/merchant/terminals", async (req, res) => {
  const c = await context(req),
    offset = (c.input.page - 1) * 25;
  const r = await db
    .from("terminals")
    .select("id,label,last_seen_at,disabled_at,created_at")
    .eq("merchant_id", c.input.merchantId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + 25);
  if (r.error) databaseError(r.error);
  const rows = r.data ?? [];
  res.json({
    paymentMode: c.mode,
    terminals: rows.slice(0, 25),
    page: c.input.page,
    hasMore: rows.length > 25,
  });
});
async function payoutSettings(c: Context) {
  const m = await merchant(c);
  const setup = await db
    .from("merchant_payout_setups")
    .select(
      "bank_name,account_last4,account_name,percentage_charge,status,provider_verified,provider_active",
    )
    .eq("merchant_id", m.id)
    .eq("domain", c.mode)
    .maybeSingle();
  if (setup.error) databaseError(setup.error);
  return {
    paymentMode: c.mode,
    business: {
      id: m.id,
      name: m.name,
      email: m.contact_email,
      phone: m.contact_phone,
      address: m.address,
    },
    payout: setup.data ?? null,
    payoutConfigured: !!(c.mode === "live"
      ? m.paystack_subaccount
      : m.paystack_test_subaccount),
  };
}
merchantRouter.get("/merchant/settings", async (req, res) =>
  res.json(await payoutSettings(await context(req))),
);
const settlement = z.object({
  id: z.number().int().positive().safe(),
  domain: z.enum(["test", "live"]),
  currency: z.literal("NGN"),
  status: z.enum(["success", "processing", "pending", "failed"]),
  total_amount: z.number().int().nonnegative().safe(),
  effective_amount: z.number().int().nonnegative().safe(),
  total_fees: z.number().int().nonnegative().safe(),
  total_processed: z.number().int().nonnegative().safe(),
  settlement_date: z.string().datetime({ offset: true }),
});
merchantRouter.get("/merchant/settlements", async (req, res) => {
  const c = await context(req),
    m = await merchant(c),
    code =
      c.mode === "live" ? m.paystack_subaccount : m.paystack_test_subaccount;
  if (!code) {
    res.json({
      paymentMode: c.mode,
      configured: false,
      settlements: [],
      hasMore: false,
      page: c.input.page,
    });
    return;
  }
  // Resolve the business's canonical numeric ID. Never accept a caller-supplied
  // provider code or omit the subaccount filter (which would expose all payouts).
  const account = await paystack("/subaccount/" + encodeURIComponent(code));
  if (
    account?.subaccount_code !== code ||
    account.domain !== c.mode ||
    !Number.isSafeInteger(account.id) ||
    account.id <= 0
  )
    throw new AppError(
      502,
      "merchant_settlement_invalid",
      "The payout account could not be verified.",
    );
  const params = new URLSearchParams({
    subaccount: String(account.id),
    from: c.start,
    to: new Date(Date.parse(c.end) - 1).toISOString(),
    page: String(c.input.page),
    perPage: "25",
  });
  const raw = await paystack("/settlement?" + params);
  // paystack() unwraps data. Pagination uses a bounded page; no business-global totals.
  if (!Array.isArray(raw))
    throw new AppError(
      502,
      "merchant_settlement_invalid",
      "The settlement response could not be verified.",
    );
  const rows = raw.map((row) => {
    const parsed = settlement.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.domain !== c.mode ||
      (row.subaccount != null &&
        String(
          typeof row.subaccount === "object"
            ? row.subaccount.id
            : row.subaccount,
        ) !== String(account.id))
    )
      throw new AppError(
        502,
        "merchant_settlement_invalid",
        "The settlement response could not be verified.",
      );
    const s = parsed.data;
    return {
      id: s.id,
      status: s.status,
      currency: s.currency,
      amountMinor: s.total_amount,
      effectiveAmountMinor: s.effective_amount,
      feesMinor: s.total_fees,
      processedAmountMinor: s.total_processed,
      settlementDate: s.settlement_date,
    };
  });
  res.json({
    paymentMode: c.mode,
    configured: true,
    settlements: rows,
    page: c.input.page,
    hasMore: rows.length === 25,
  });
});
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
merchantRouter.get(
  "/merchant/export",
  userRateLimit("merchant-export", 5, 60),
  async (req, res) => {
    const c = await context(req),
      rows: any[] = [];
    // PostgREST's row cap applies per request. Iterate bounded pages rather than
    // silently exporting only its first 1000 records.
    for (let offset = 0; offset <= 5000; offset += 500) {
      const r = await payments(c).range(offset, offset + 499);
      if (r.error) databaseError(r.error);
      rows.push(...(r.data ?? []));
      if (rows.length > 5000)
        throw new AppError(
          413,
          "export_too_large",
          "Narrow the filters to export at most 5,000 payments.",
        );
      if ((r.data ?? []).length < 500) break;
    }
    const content = [
      [
        "Reference",
        "Created at (UTC)",
        "Amount (kobo)",
        "Currency",
        "Status",
        "Terminal",
        "Description",
        "Payment mode",
      ],
      ...rows.map((r) => [
        r.reference,
        r.created_at,
        r.amount_minor,
        "NGN",
        r.status,
        r.terminal_label,
        r.description,
        c.mode,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    res
      .type("text/csv")
      .set(
        "Content-Disposition",
        'attachment; filename="paybypalm-payments.csv"',
      )
      .send("\ufeff" + content);
  },
);
