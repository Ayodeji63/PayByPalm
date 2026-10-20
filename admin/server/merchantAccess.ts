import type { Express, RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Failure } from "./failure.js";
export function mountMerchantAccess(
  app: Express,
  db: SupabaseClient,
  writes: RequestHandler,
) {
  const id = z.string().uuid();
  function fail(error: { code?: string } | null): never {
    if (error?.code === "MA405")
      throw new Failure(
        400,
        "verified_account_required",
        "No verified account was found for that email. Ask the merchant to create and verify a PayByPalm account first.",
      );
    if (error?.code === "MA404")
      throw new Failure(
        404,
        "access_not_found",
        "The merchant or access record no longer exists. Refresh the list.",
      );
    if (error?.code === "MA409")
      throw new Failure(
        409,
        "access_changed",
        "This access record changed. Refresh before revoking it.",
      );
    if (error?.code === "MA400")
      throw new Failure(
        400,
        "invalid_access",
        "Check the account and merchant details.",
      );
    if (["PGRST202", "42P01", "PGRST205"].includes(error?.code || ""))
      throw new Failure(
        503,
        "merchant_setup_required",
        "Apply supabase/migrations/0024_merchant_portal.sql to enable merchant access.",
      );
    throw new Failure(
      503,
      "access_unavailable",
      "Merchant access could not be confirmed. Refresh before retrying.",
    );
  }
  app.get("/api/merchants/:id/access", async (req, res) => {
    const r = await db.rpc("admin_list_merchant_access", {
      p_merchant: id.parse(req.params.id),
    });
    if (r.error) fail(r.error);
    res.json({ members: r.data });
  });
  app.post("/api/merchants/:id/access", writes, async (req, res) => {
    const input = z
      .object({ email: z.string().trim().email().max(254) })
      .strict()
      .parse(req.body);
    const r = await db.rpc("admin_grant_merchant_access", {
      p_actor: res.locals.admin.id,
      p_merchant: id.parse(req.params.id),
      p_email: input.email.toLowerCase(),
    });
    if (r.error) fail(r.error);
    res.json({ member: r.data });
  });
  app.post(
    "/api/merchants/:id/access/:userId/revoke",
    writes,
    async (req, res) => {
      const input = z
        .object({ expected: z.string().datetime({ offset: true }) })
        .strict()
        .parse(req.body);
      const r = await db.rpc("admin_revoke_merchant_access", {
        p_actor: res.locals.admin.id,
        p_merchant: id.parse(req.params.id),
        p_user: id.parse(req.params.userId),
        p_expected: input.expected,
      });
      if (r.error) fail(r.error);
      res.status(204).end();
    },
  );
}
