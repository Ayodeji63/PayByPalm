export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly reference?: string,
  ) {
    super(message + (reference ? " Reference: " + reference + "." : ""));
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "offline",
      "Cannot reach the admin server. Check your connection.",
      0,
    );
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("admin-session-expired"));
    throw new ApiError(
      data?.error?.code || "request_failed",
      data?.error?.message ||
        "The operation could not be confirmed. Refresh before retrying.",
      response.status,
      data?.requestId,
    );
  }
  return data as T;
}
export async function deviceCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key =
    "pbp_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return {
    key,
    hash: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export function configuration(url: string, key: string) {
  const parsed = new URL(url);
  if (
    (parsed.protocol !== "https:" &&
      !(
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)
      )) ||
    parsed.pathname !== "/terminal" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    !/^pbp_[a-f0-9]{64}$/.test(key)
  )
    throw new Error(
      "The terminal configuration is invalid. Contact the administrator.",
    );
  return `KIOSK_URL='${parsed.href}'\nTERMINAL_KEY=${key}\n`;
}
