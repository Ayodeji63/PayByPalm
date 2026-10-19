import "dotenv/config";
import { z } from "zod";
export const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8090),
    APP_ORIGIN: z
      .string()
      .url()
      .default("http://127.0.0.1:5190")
      .refine(
        (v) => new URL(v).origin === v,
        "Use an origin without a trailing slash or path",
      ),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    ADMIN_USER_IDS: z
      .string()
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().uuid()).min(1)),
    PAYSTACK_MODE: z.enum(["test","live"]).default("test"),
    PAYSTACK_SECRET_KEY: z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).optional(),
    SESSION_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    TERMINAL_URL: z
      .string()
      .url()
      .default("https://pay-by-palm.vercel.app/terminal")
      .refine((v) => {
        const u = new URL(v);
        return (
          (u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(u.hostname))) &&
          u.pathname === "/terminal" &&
          !u.search &&
          !u.hash &&
          !u.username &&
          !u.password
        );
      }, "Use the HTTPS wallet URL ending exactly in /terminal"),
  })
  .refine(c=>!c.PAYSTACK_SECRET_KEY||c.PAYSTACK_SECRET_KEY.startsWith(`sk_${c.PAYSTACK_MODE}_`),"Paystack secret must match PAYSTACK_MODE")
  .refine(
    (c) => c.NODE_ENV !== "production" || c.APP_ORIGIN.startsWith("https://"),
    "Production APP_ORIGIN requires HTTPS",
  );
export type Config = z.infer<typeof configSchema>;
export function readConfig(): Config {
  const r = configSchema.safeParse(process.env);
  if (!r.success)
    throw new Error(
      "Invalid configuration: " +
        r.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
    );
  return r.data;
}
