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
  type AdminSession,
} from "./session.js";

import {Failure} from "./failure.js";
import {mountPayoutRoutes} from "./payouts.js";
import {mountMerchantAccess} from "./merchantAccess.js";

const uuid = z.string().uuid();
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Control characters are not allowed",
    );
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u001f\u007f]/.test(v),
      "Control characters are not allowed",
    )
    .transform((v) => v || null);
const merchantInput = z
  .object({
    id: uuid,
    name: text(120),
    email: z
      .union([z.literal(""), z.string().trim().email().max(254)])
      .transform((v) => v || null),
    phone: optionalText(40),
    address: optionalText(300),
    subaccount: z
      .union([z.literal(""), z.string().regex(/^ACCT_[A-Za-z0-9]{1,80}$/)])
      .transform((v) => v || null),
    expected: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict();
const terminalInput = z
  .object({
    id: uuid,
    merchantId: uuid,
    label: text(120),
    keyHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const terminalChange = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("label"),
      label: text(120),
      expected: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal("rotate"),
      keyHash: z.string().regex(/^[0-9a-f]{64}$/),
      expected: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal("disable"),
      expected: z.string().datetime({ offset: true }),
    })
    .strict(),
]);
const merchantColumns =
  "id,name,contact_email,contact_phone,address,paystack_subaccount,created_at,updated_at";
const terminalColumns =
  "id,merchant_id,label,last_seen_at,created_at,updated_at,disabled_at";
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
  const save = (res: express.Response, s: AdminSession) =>
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
          "Open the admin app from its configured address.",
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
          .update("admin:" + scope + ":" + identity(req, res))
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
    !!u?.email_confirmed_at && config.ADMIN_USER_IDS.includes(u.id);
  const requireAdmin: RequestHandler = async (req, res, next) => {
    try {
      let session = unseal(
        cookieValue(req.headers.cookie),
        config.SESSION_ENCRYPTION_KEY,
      );
      if (!session)
        throw new Failure(
          401,
          "sign_in_required",
          "Sign in to your administrator account.",
        );
      const stored = await db
        .from("admin_sessions")
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
          "Your administrator session expired. Sign in again.",
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
        if (fresh.error || !fresh.data.session) {
          clear(res);
          throw new Failure(
            401,
            "sign_in_required",
            "Your administrator session expired. Sign in again.",
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
          "admin_required",
          "This account does not have administrator access.",
        );
      }
      res.locals.admin = checked.data.user;
      res.locals.session = session;
      next();
    } catch (e) {
      next(e);
    }
  };
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", service: "paybypalm-admin" }),
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
        .update("admin:login-email:" + input.email.toLowerCase())
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
          "Unable to sign in with this administrator account. Check your email and password.",
        );
      const session = {
        id: randomUUID(),
        access: result.data.session.access_token,
        refresh: result.data.session.refresh_token,
        startedAt: Date.now(),
      };
      const stored = await db.from("admin_sessions").insert({
        id: session.id,
        user_id: result.data.user!.id,
        expires_at: new Date(session.startedAt + SESSION_MS).toISOString(),
      });
      if (stored.error) dbFailure(stored.error);
      save(res, session);
      res.json({
        user: { id: result.data.user!.id, email: result.data.user!.email },
      });
    },
  );
  app.use(
    "/api",
    requireAdmin,
    budget("authenticated", 180, 60, (_req, res) => res.locals.admin.id),
  );
  app.get("/api/auth/session", (_req, res) =>
    res.json({
      user: { id: res.locals.admin.id, email: res.locals.admin.email },
    }),
  );
  app.post("/api/auth/logout", async (_req, res) => {
    const r = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", res.locals.session.id);
    if (r.error) dbFailure(r.error);
    clear(res);
    // Admin access is already durably revoked even if the upstream refresh-token
    // cleanup is unavailable. Never invalidate unrelated customer sessions.
    await db.auth.admin
      .signOut(res.locals.session.access, "local")
      .catch(() => {});
    res.status(204).end();
  });

  function dbFailure(error: { code?: string } | null): never {
    if (error?.code === "PA409" || error?.code === "23505")
      throw new Failure(
        409,
        "conflict",
        "This record changed or its key is already registered. Refresh the list and try again.",
      );
    if (error?.code === "PA404" || error?.code === "23503")
      throw new Failure(
        404,
        "not_found",
        "The selected merchant or terminal no longer exists. Refresh the list.",
      );
    if (error?.code === "PA400")
      throw new Failure(
        400,
        "invalid_input",
        "Check the merchant and terminal details.",
      );
    if (
      ["PGRST202", "PGRST204", "PGRST205", "42P01", "42703"].includes(
        error?.code || "",
      )
    )
      throw new Failure(
        503,
        "setup_required",
        "Admin database setup is incomplete. Apply migrations 0020 and 0023 from the admin db folder.",
      );
    throw new Failure(
      503,
      "database_unavailable",
      "The database could not confirm this operation. Refresh before retrying.",
    );
  }
  async function readAll(table: string, columns: string) {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10000; offset += 1000) {
      const r = await db
        .from(table)
        .select(columns)
        .order("id")
        .range(offset, offset + 999);
      if (r.error) dbFailure(r.error);
      rows.push(...(r.data as unknown as Record<string, unknown>[]));
      if (r.data!.length < 1000) return rows;
    }
    throw new Failure(
      503,
      "inventory_limit",
      "Inventory exceeds this deployment’s 10,000-record limit. Contact the administrator.",
    );
  }
  app.get("/api/overview", async (_req, res) => {
    const [merchants, terminals, activity] = await Promise.all([
      readAll("merchants", merchantColumns),
      readAll("terminals", terminalColumns),
      db
        .from("admin_audit")
        .select("id,action,entity_id,merchant_id,label,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (activity.error) dbFailure(activity.error);
    res.json({
      merchants,
      terminals,
      activity: activity.data,
      terminalUrl: config.TERMINAL_URL,
    });
  });
  const writes = budget("write", 30, 60, (_req, res) => res.locals.admin.id);
  mountPayoutRoutes(app,{config,db,writes,dbFailure});
  mountMerchantAccess(app,db,writes);
  app.post("/api/merchants", writes, async (req, res) => {
    const i = merchantInput.parse(req.body);
    const r = await db.rpc("admin_save_merchant", {
      p_actor: res.locals.admin.id,
      p_id: i.id,
      p_name: i.name,
      p_email: i.email,
      p_phone: i.phone,
      p_address: i.address,
      p_subaccount: i.subaccount,
      p_expected: i.expected,
    });
    if (r.error) dbFailure(r.error);
    res.status(i.expected ? 200 : 201).json({ merchant: r.data });
  });
  app.post("/api/terminals", writes, async (req, res) => {
    const i = terminalInput.parse(req.body);
    const r = await db.rpc("admin_save_terminal", {
      p_actor: res.locals.admin.id,
      p_id: i.id,
      p_merchant: i.merchantId,
      p_label: i.label,
      p_hash: i.keyHash,
      p_action: "create",
      p_expected: null,
    });
    if (r.error) dbFailure(r.error);
    res.status(201).json({ terminal: r.data });
  });
  app.post("/api/terminals/:id", writes, async (req, res) => {
    const id = uuid.parse(req.params.id),
      i = terminalChange.parse(req.body);
    const hash =
      i.action === "rotate"
        ? i.keyHash
        : i.action === "disable"
          ? createHash("sha256").update(randomBytes(32)).digest("hex")
          : null;
    const r = await db.rpc("admin_save_terminal", {
      p_actor: res.locals.admin.id,
      p_id: id,
      p_merchant: null,
      p_label: i.action === "label" ? i.label : null,
      p_hash: hash,
      p_action: i.action,
      p_expected: i.expected,
    });
    if (r.error) dbFailure(r.error);
    res.json({ terminal: r.data });
  });
  app.use("/api", (_req, _res, next) =>
    next(new Failure(404, "not_found", "Admin route not found.")),
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
