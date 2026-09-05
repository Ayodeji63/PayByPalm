/**
 * API client.
 *
 * One fetch wrapper, so every call gets the same auth header, the same error
 * shape, and the same 401 handling. Components never call fetch directly.
 *
 * NOTHING SECRET LIVES IN THIS APP. There is no Supabase service role key and no
 * palm provider key in the bundle — the backend holds both. `pnpm guard:secrets`
 * greps the build output to keep that true.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

const STORAGE_KEY = 'paybypalm.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

/** Mirrors the backend's error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, string> | undefined;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, string>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** True when the network never delivered a response at all. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

// ---------------------------------------------------------------------------
// Session storage
// ---------------------------------------------------------------------------

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // Corrupt or unavailable storage (private mode, disabled cookies) is not a
    // reason to crash the app; the user simply has to sign in again.
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* Session lives in memory for this tab only. */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Skip the Authorization header (login, signup). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Called when a request comes back 401 so the app can drop to the login screen. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/** Guards against several concurrent 401s all trying to refresh at once. */
let refreshInFlight: Promise<Session | null> | null = null;

async function refreshSession(): Promise<Session | null> {
  const current = loadSession();
  if (!current?.refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { session: Session };
        saveSession(data.session);
        return data.session;
      } catch {
        return null;
      } finally {
        // Cleared on the next tick so simultaneous callers all see this attempt.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }

  return refreshInFlight;
}

async function send<T>(path: string, options: RequestOptions, retrying = false): Promise<T> {
  const session = options.anonymous ? null : loadSession();

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (err) {
    // An aborted request is the caller cancelling, not a failure to report.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'No connection. Check your network and try again.');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const envelope = payload as {
      error?: { code?: string; message?: string; details?: Record<string, string> };
      requestId?: string;
    } | null;

    // One retry after a token refresh, then give up and send them to sign in.
    if (response.status === 401 && !options.anonymous && !retrying) {
      const refreshed = await refreshSession();
      if (refreshed) return send<T>(path, options, true);

      clearSession();
      onUnauthorized?.();
    }

    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'unknown_error',
      envelope?.error?.message ?? 'Something went wrong. Please try again.',
      envelope?.error?.details,
      envelope?.requestId,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    send<T>(path, { method: 'POST', ...(body !== undefined ? { body } : {}), ...(signal ? { signal } : {}) }),
  patch: <T>(path: string, body: unknown) =>
    send<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) =>
    send<T>(path, { method: 'DELETE' }),
  anonPost: <T>(path: string, body: unknown) =>
    send<T>(path, { method: 'POST', body, anonymous: true }),
};

// ---------------------------------------------------------------------------
// Response types — mirror the backend
// ---------------------------------------------------------------------------

export interface Me {
  id: string;
  fullName: string;
  phone: string;
  palmEnrolled: boolean;
  hasPin: boolean;
  balanceMinor: number;
  currency: string;
  createdAt: string;
}

export interface TransactionSummary {
  id: string;
  amountMinor: number;
  description: string | null;
  status: 'settled' | 'failed' | 'cancelled' | 'pending' | 'authenticated';
  merchantName: string | null;
  terminalLabel: string | null;
  authorisedByPalm: boolean;
  matchScore: number | null;
  matchMode: 'compare' | 'search' | null;
  createdAt: string;
  settledAt: string | null;
  disputedAt: string | null;
  direction: 'debit' | 'credit';
}

export interface TransactionPage {
  transactions: TransactionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface EnrolSessionView {
  sessionId: string;
  status: 'pending' | 'claimed' | 'captured' | 'completed' | 'expired';
  expiresAt: string;
  userDisplayName?: string;
}
