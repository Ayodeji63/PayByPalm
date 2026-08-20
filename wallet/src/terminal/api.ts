/**
 * Terminal API client.
 *
 * Authenticates with `X-Terminal-Key` and nothing else. It never sends an
 * Authorization header, because a terminal is a device — it is not a user, and
 * the backend's two authentication planes are deliberately disjoint.
 *
 * THIS CLIENT HOLDS NO TENCENT KEY AND NO SUPABASE SERVICE KEY. The Pi posts an
 * image to our backend; our backend calls the palm provider. There is no code
 * path from here to Tencent.
 */

import { resolveTerminalKey } from './config.js';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export class TerminalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'TerminalApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  /** No response arrived at all — the backend is unreachable. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

async function send<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const key = resolveTerminalKey();
  const headers: Record<string, string> = {};
  if (key) headers['X-Terminal-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new TerminalApiError(0, 'offline', 'Cannot reach the payment service.');
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
      error?: { code?: string; message?: string };
      requestId?: string;
    } | null;
    throw new TerminalApiError(
      response.status,
      envelope?.error?.code ?? 'unknown_error',
      envelope?.error?.message ?? 'Something went wrong.',
      envelope?.requestId,
    );
  }

  return payload as T;
}

export const terminalApi = {
  identity: () =>
    send<{ terminalId: string; terminalLabel: string; merchantName: string }>(
      '/terminal/me',
      'GET',
    ),

  health: () => send<{ status: string }>('/health', 'GET'),

  createTransaction: (amountMinor: number, description?: string) =>
    send<{ transactionId: string; amountMinor: number; merchantName: string; terminalLabel: string }>(
      '/transactions',
      'POST',
      { amountMinor, ...(description ? { description } : {}) },
    ),

  authenticate: (transactionId: string, imageB64: string, last4?: string) =>
    send<AuthenticateOutcome>(`/transactions/${transactionId}/authenticate`, 'POST', {
      imageB64,
      ...(last4 ? { last4 } : {}),
    }),

  confirm: (transactionId: string, pin?: string) =>
    send<Receipt>(`/transactions/${transactionId}/confirm`, 'POST', pin ? { pin } : {}),

  cancel: (transactionId: string) =>
    send<{ transactionId: string; status: string }>(
      `/transactions/${transactionId}/cancel`,
      'POST',
    ),

  createEnrolSession: () =>
    send<{ sessionId: string; expiresAt: string; linkUrl: string; merchantName: string }>(
      '/enrol/sessions',
      'POST',
    ),

  enrolSession: (sessionId: string) =>
    send<EnrolSessionView>(`/enrol/sessions/${sessionId}`, 'GET'),

  registerPalm: (sessionId: string, imageB64: string) =>
    send<{ status: string; userDisplayName: string; alreadyCompleted: boolean }>(
      `/enrol/sessions/${sessionId}/palm`,
      'POST',
      { imageB64 },
    ),
};

// ---------------------------------------------------------------------------
// Response shapes — mirror the backend
// ---------------------------------------------------------------------------

export interface AuthenticateOutcome {
  decision: 'accept' | 'step_up' | 'reject';
  mode: 'compare' | 'search' | null;
  score: number | null;
  message: string;
  reason?: string;
  maskedName?: string;
  maskedBalanceMinor?: number;
  pinRequired?: boolean;
}

export interface Receipt {
  transactionId: string;
  amountMinor: number;
  merchantName: string;
  terminalLabel: string;
  settledAt: string | null;
  maskedName: string;
  balanceMinor: number;
}

export interface EnrolSessionView {
  sessionId: string;
  status: 'pending' | 'claimed' | 'captured' | 'completed' | 'expired';
  expiresAt: string;
  userDisplayName?: string;
}
