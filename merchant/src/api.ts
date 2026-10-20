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
      window.dispatchEvent(new Event("merchant-session-expired"));
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
