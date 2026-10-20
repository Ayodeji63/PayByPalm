import "dotenv/config";
import { z } from "zod";
const origin = z
  .string()
  .url()
  .refine((v) => {
    const u = new URL(v);
    return (
      u.origin === v &&
      !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname)))
    );
  }, "Use an HTTPS origin without a path; HTTP loopback is allowed locally");
export const configSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8093),
    APP_ORIGIN: origin.default("http://127.0.0.1:5193"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SESSION_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    PAYMENT_API_BASE_URL: origin.default(
      "https://paybypalm-backend.onrender.com",
    ),
  })
  .refine(
    (c) => c.NODE_ENV !== "production" || c.APP_ORIGIN.startsWith("https:"),
    "Production APP_ORIGIN requires HTTPS",
  );
export type Config = z.infer<typeof configSchema>;
export function readConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success)
    throw Error(
      "Invalid merchant configuration: " +
        result.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
    );
  return result.data;
}
