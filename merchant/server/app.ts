import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type RequestHandler } from "express";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Config } from "./config.js";
import {
  COOKIE,
  SESSION_MS,
  cookieValue,
  seal,
  unseal,
  type MerchantSession,
} from "./session.js";

import { Failure } from "./failure.js";

type Dependencies = {
  config: Config;
  db: SupabaseClient;
  auth: () => SupabaseClient;
  serveFrontend?: boolean;
};
export function createApp({
  config,
  db,
  auth,
  serveFrontend = true,
}: Dependencies) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  const refreshing = new Map<
    string,
    {
      until: number;
      promise: ReturnType<SupabaseClient["auth"]["refreshSession"]>;
    }
  >();
  const cookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api",
  };
  const save = (res: express.Response, s: MerchantSession) =>
    res.cookie(COOKIE, seal(s, config.SESSION_ENCRYPTION_KEY), {
      ...cookieOptions,
      maxAge: Math.max(0, SESSION_MS - (Date.now() - s.startedAt)),
    });
  const clear = (res: express.Response) =>
    res.clearCookie(COOKIE, cookieOptions);
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    if (config.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
      );
    }
    if (
      req.path.startsWith("/api/") &&
      ((req.headers.origin && req.headers.origin !== config.APP_ORIGIN) ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
          req.headers.origin !== config.APP_ORIGIN))
    )
      return next(
        new Failure(
          403,
          "origin_denied",
          "Open the merchant app from its configured address.",
        ),
      );
    next();
  });
  app.use(express.json({ limit: "24kb", strict: true }));
  const budget =
    (
      scope: string,
      limit: number,
      seconds: number,
      identity: (req: express.Request, res: express.Response) => string,
    ): RequestHandler =>
    async (req, res, next) => {
      try {
        const key = createHash("sha256")
          .update("merchant:" + scope + ":" + identity(req, res))
          .digest("hex");
        const r = await db.rpc("consume_api_budget", {
          p_key: key,
          p_limit: limit,
          p_window_seconds: seconds,
        });
        if (r.error || !Number.isSafeInteger(r.data) || r.data < 0)
          throw new Failure(
            503,
            "protection_unavailable",
            "Request protection is unavailable. Check the database setup.",
          );
        if (r.data > 0) {
          res.setHeader("Retry-After", String(r.data));
          throw new Failure(
            429,
            "rate_limited",
            "Too many requests. Wait before trying again.",
          );
        }
        next();
      } catch (e) {
        next(e);
      }
    };
  const allowed = (u: User | undefined | null) =>
    !!u?.email_confirmed_at && !!u?.email;
  const requireMerchant: RequestHandler = async (req, res, next) => {
    try {
      let session = unseal(
        cookieValue(req.headers.cookie),
        config.SESSION_ENCRYPTION_KEY,
      );
      if (!session)
        throw new Failure(
          401,
          "sign_in_required",
          "Sign in to your merchant account.",
        );
      const stored = await db
        .from("merchant_sessions")
        .select("user_id,expires_at,revoked_at")
        .eq("id", session.id)
        .maybeSingle();
      if (stored.error) dbFailure(stored.error);
      if (
        !stored.data ||
        stored.data.revoked_at ||
        Date.parse(stored.data.expires_at) <= Date.now()
      ) {
        clear(res);
        throw new Failure(
          401,
          "sign_in_required",
          "Your merchant session expired. Sign in again.",
        );
      }
      const client = auth();
      let checked = await client.auth.getUser(session.access);
      if (checked.error) {
        // Refresh only an expired credential. Provider/network failures must not
        // clear a still-valid login on a provider outage.
        if (checked.error.status !== 401 && checked.error.status !== 403)
          throw new Failure(
            503,
            "auth_unavailable",
            "Account verification is unavailable. Try again later.",
          );
        const refreshKey = createHash("sha256")
          .update(session.refresh)
          .digest("hex");
        let pending = refreshing.get(refreshKey);
        if (!pending || pending.until < Date.now()) {
          for (const [key, value] of refreshing)
            if (value.until < Date.now()) refreshing.delete(key);
          if (refreshing.size >= 100)
            throw new Failure(
              503,
              "auth_busy",
              "Account verification is busy. Try again shortly.",
            );
          pending = {
            until: Date.now() + 10000,
            promise: client.auth.refreshSession({
              refresh_token: session.refresh,
            }),
          };
          refreshing.set(refreshKey, pending);
        }
        const fresh = await pending.promise;
        if (
          fresh.error &&
          (fresh.error.status === undefined || fresh.error.status >= 500)
        )
          throw new Failure(
            503,
            "auth_unavailable",
            "Account verification is unavailable. Try again later.",
          );
        if (fresh.error || !fresh.data.session) {
          clear(res);
          throw new Failure(
            401,
            "sign_in_required",
            "Your merchant session expired. Sign in again.",
          );
        }
        session = {
          ...session,
          access: fresh.data.session.access_token,
          refresh: fresh.data.session.refresh_token,
        };
        checked = await client.auth.getUser(session.access);
        save(res, session);
      }
      if (checked.error)
        throw new Failure(
          503,
          "auth_unavailable",
          "Account verification is unavailable. Try again later.",
        );
      if (
        !allowed(checked.data.user) ||
        stored.data.user_id !== checked.data.user!.id
      ) {
        clear(res);
        throw new Failure(
          403,
          "merchant_required",
          "This account does not have merchant access.",
        );
      }
      const businesses = await memberships(checked.data.user!.id);
      if (!businesses.length) {
        clear(res);
        throw new Failure(
          403,
          "merchant_required",
          "Your account has no active merchant access. Contact the administrator.",
        );
      }
      res.locals.businesses = businesses;
      res.locals.merchantUser = checked.data.user;
      res.locals.session = session;
      next();
    } catch (e) {
      next(e);
    }
  };
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "paybypalm-merchant" }),
  );
  app.post(
    "/api/auth/login",
    budget("login-ip", 12, 900, (req) => req.ip || "unknown"),
    async (req, res) => {
      const input = z
        .object({
          email: z.string().trim().email().max(254),
          password: z.string().min(1).max(256),
        })
        .strict()
        .parse(req.body);
      const key = createHash("sha256")
        .update("merchant:login-email:" + input.email.toLowerCase())
        .digest("hex");
      const b = await db.rpc("consume_api_budget", {
        p_key: key,
        p_limit: 8,
        p_window_seconds: 900,
      });
      if (b.error || !Number.isSafeInteger(b.data) || b.data < 0)
        throw new Failure(
          503,
          "protection_unavailable",
          "Request protection is unavailable. Check the database setup.",
        );
      if (b.data > 0) {
        res.setHeader("Retry-After", String(b.data));
        throw new Failure(
          429,
          "rate_limited",
          "Too many sign-in attempts. Try again later.",
        );
      }
      const client = auth();
      const result = await client.auth.signInWithPassword(input);
      if (result.error || !result.data.session || !allowed(result.data.user))
        throw new Failure(
          401,
          "login_failed",
          "Unable to sign in with this merchant account. Check your email and password.",
        );
      const businesses = await memberships(result.data.user!.id);
      if (!businesses.length)
        throw new Failure(
          401,
          "login_failed",
          "Unable to sign in. Check your credentials and ask the administrator to confirm merchant access.",
        );
      const session = {
        id: randomUUID(),
        access: result.data.session.access_token,
        refresh: result.data.session.refresh_token,
        startedAt: Date.now(),
      };
      const stored = await db.from("merchant_sessions").insert({
        id: session.id,
        user_id: result.data.user!.id,
        expires_at: new Date(session.startedAt + SESSION_MS).toISOString(),
      });
      if (stored.error) dbFailure(stored.error);
      save(res, session);
      res.json({
        user: { id: result.data.user!.id, email: result.data.user!.email },
        businesses,
      });
    },
  );
  app.use(
    "/api",
    requireMerchant,
    budget("authenticated", 180, 60, (_req, res) => res.locals.merchantUser.id),
  );
  app.get("/api/auth/session", (_req, res) =>
    res.json({
      user: {
        id: res.locals.merchantUser.id,
        email: res.locals.merchantUser.email,
      },
      businesses: res.locals.businesses,
    }),
  );
  app.post("/api/auth/logout", async (_req, res) => {
    const r = await db
      .from("merchant_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", res.locals.session.id);
    if (r.error) dbFailure(r.error);
    clear(res);
    // Merchant session access is already durably revoked even if the upstream refresh-token
    // cleanup is unavailable. Never invalidate unrelated customer sessions.
    await db.auth.admin
      .signOut(res.locals.session.access, "local")
      .catch(() => {});
    res.status(204).end();
  });

  function dbFailure(error: { code?: string } | null): never {
    if (["42P01", "PGRST205", "PGRST202"].includes(error?.code || ""))
      throw new Failure(
        503,
        "merchant_setup_required",
        "Merchant access setup is incomplete. Ask the administrator to apply migration 0024.",
      );
    throw new Failure(
      503,
      "database_unavailable",
      "Merchant access could not be checked. Please try again.",
    );
  }
  async function memberships(userId: string) {
    const r = await db
      .from("merchant_memberships")
      .select("merchant_id,merchants!inner(id,name)")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("merchant_id")
      .limit(1000);
    if (r.error) dbFailure(r.error);
    if (!r.data || r.data.length >= 1000)
      throw new Failure(
        503,
        "merchant_access_unavailable",
        "Merchant access could not finish loading. Contact support.",
      );
    return r.data.map((row: any) => ({
      id: row.merchant_id,
      name: row.merchants.name,
    }));
  }
  app.get("/api/reports/:resource", async (req, res) => {
    const resource = z
      .enum([
        "overview",
        "transactions",
        "settlements",
        "terminals",
        "settings",
        "export",
      ])
      .parse(req.params.resource);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value !== "string")
        throw new Failure(
          400,
          "invalid_input",
          "Use a single value for each report filter.",
        );
      query.set(key, value);
    }
    let response: Response;
    try {
      response = await fetch(
        config.PAYMENT_API_BASE_URL + "/merchant/" + resource + "?" + query,
        {
          headers: {
            Authorization: "Bearer " + res.locals.session.access,
            Accept: resource === "export" ? "text/csv" : "application/json",
          },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
        },
      );
    } catch {
      throw new Failure(
        503,
        "report_unavailable",
        "The payment backend could not be reached. Try again shortly.",
      );
    }
    if (resource === "export" && response.ok) {
      if (!response.headers.get("content-type")?.startsWith("text/csv"))
        throw new Failure(
          502,
          "invalid_report",
          "The export could not be verified. Please retry.",
        );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="paybypalm-payments.csv"',
      );
      res.send(await response.text());
      return;
    }
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Failure(
        response.status,
        value?.error?.code || "report_unavailable",
        value?.error?.message || "This report is unavailable. Please retry.",
      );
    if (!value || typeof value !== "object")
      throw new Failure(
        502,
        "invalid_report",
        "The report could not be verified. Please retry.",
      );
    res.json(value);
  });
  app.use("/api", (_req, _res, next) =>
    next(new Failure(404, "not_found", "Merchant route not found.")),
  );
  if (config.NODE_ENV === "production" && serveFrontend) {
    const dist = fileURLToPath(new URL("../dist/", import.meta.url));
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      let problem =
        err instanceof Failure
          ? err
          : new Failure(
              500,
              "internal_error",
              "Unable to complete the operation. Contact support with the reference.",
            );
      if (err instanceof z.ZodError)
        problem = new Failure(
          400,
          "invalid_input",
          err.issues
            .map((i) => (i.path.join(".") || "Input") + ": " + i.message)
            .join("; "),
        );
      if ((err as { type?: string })?.type === "entity.parse.failed")
        problem = new Failure(400, "invalid_json", "Send valid JSON.");
      if ((err as { type?: string })?.type === "entity.too.large")
        problem = new Failure(413, "body_too_large", "Request is too large.");
      // Log classifications only. No body, cookie, password, key, Supabase token or raw error.
      console.warn(
        JSON.stringify({
          requestId: res.locals.requestId,
          code: problem.code,
          status: problem.status,
        }),
      );
      res.status(problem.status).json({
        error: { code: problem.code, message: problem.message },
        requestId: res.locals.requestId,
      });
    },
  );
  return app;
}
