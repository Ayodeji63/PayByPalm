import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export const COOKIE = "pbp_merchant_session";
export const SESSION_MS = 8 * 60 * 60 * 1000;
export interface MerchantSession {
  id: string;
  access: string;
  refresh: string;
  startedAt: number;
}
export function seal(session: MerchantSession, key: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  cipher.setAAD(Buffer.from("pbp-merchant-v1"));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal(
  cookie: string | undefined,
  key: string,
): MerchantSession | null {
  try {
    if (!cookie || cookie.length > 6000) return null;
    const raw = Buffer.from(cookie, "base64url"),
      cipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        raw.subarray(0, 12),
      );
    cipher.setAAD(Buffer.from("pbp-merchant-v1"));
    cipher.setAuthTag(raw.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([
        cipher.update(raw.subarray(28)),
        cipher.final(),
      ]).toString(),
    );
    if (
      typeof data.id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(data.id) ||
      typeof data.access !== "string" ||
      typeof data.refresh !== "string" ||
      !Number.isFinite(data.startedAt) ||
      data.startedAt > Date.now() ||
      Date.now() - data.startedAt >= SESSION_MS
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export function cookieValue(header: string | undefined): string | undefined {
  return header
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
}
