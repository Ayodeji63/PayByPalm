import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { db } from '../db/client.js';
import { AppError } from '../errors.js';

// Cache only rejections: an allowed request always consumes the shared budget.
const rejected = new Map<string, number>();
const MAX_REJECTIONS = 5000;
export async function consumeBudget(scope: string, identity: string, limit: number, seconds: number): Promise<void> {
  const key = createHash('sha256').update(`${scope}:${identity}`).digest('hex');
  const until = rejected.get(key);
  if (until && until > Date.now()) {
    throw new AppError(429, 'rate_limited', 'Too many requests. Please try again later.', { retryAfter: Math.ceil((until - Date.now()) / 1000) });
  }
  const { data, error } = await db.rpc('consume_api_budget', {
    p_key: key, p_limit: limit, p_window_seconds: seconds,
  });
  if (error || typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
    throw new AppError(503, 'abuse_protection_unavailable', 'Please try again later.');
  }
  if (data > 0) {
    if (rejected.size >= MAX_REJECTIONS) rejected.delete(rejected.keys().next().value!);
    rejected.set(key, Date.now() + data * 1000);
    throw new AppError(429, 'rate_limited', 'Too many requests. Please try again later.', { retryAfter: data });
  }
  rejected.delete(key);
}

export function rateLimit(scope: string, limit: number, seconds: number, identity: (req: Request) => string): RequestHandler {
  return async (req, _res, next) => {
    try { await consumeBudget(scope, identity(req), limit, seconds); next(); }
    catch (error) { next(error); }
  };
}
const ip = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';
export const ipRateLimit = (scope: string, limit: number, seconds: number) => rateLimit(scope, limit, seconds, ip);
export const userRateLimit = (scope: string, limit: number, seconds: number) => rateLimit(scope, limit, seconds, req => {
  if (!req.user) throw new AppError(401, 'unauthorized', 'Authentication required.');
  return req.user.id;
});
export const terminalRateLimit = (scope: string, limit: number, seconds: number) => rateLimit(scope, limit, seconds, req => {
  if (!req.terminal) throw new AppError(401, 'unauthorized', 'Authentication required.');
  return req.terminal.id;
});
