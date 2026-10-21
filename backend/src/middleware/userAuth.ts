/**
 * Wallet authentication — centrally validated, revocable Better Auth sessions.
 *
 * This is one of two authentication planes, and they are kept strictly disjoint.
 * A route protected by this middleware accepts a user session token and nothing else; a
 * route protected by terminalAuth accepts a device key and nothing else. There is
 * deliberately no middleware that accepts "either", because that is how a stolen
 * terminal key eventually becomes a way to act as a user.
 */

import type { NextFunction, Request, Response } from 'express';
import { identityService } from '../auth/service.js';
import { AppError, unauthorized } from '../errors.js';

export interface AuthedUser {
  id: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function userAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('authorization');

  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing bearer token.'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthorized('Missing bearer token.'));
    return;
  }

  const checked = await identityService.session(token);
  const data = { user: checked?.user };
  const error = !checked;

  if (error || !data.user) {
    req.log.debug('rejected user token');
    next(unauthorized('Session expired or invalid. Please sign in again.'));
    return;
  }

  if (!data.user.email || !data.user.email_confirmed_at || data.user.email.toLowerCase().endsWith('@phone.paybypalm.local')) {
    next(new AppError(403, 'email_verification_required', 'Sign in with a verified email address to continue.'));
    return;
  }

  req.user = { id: data.user.id, email: data.user.email ?? null };
  req.log = req.log.child({ userId: data.user.id });
  next();
}

/** Narrow `req.user` for handlers mounted behind userAuth. */
export function requireUser(req: Request): AuthedUser {
  if (!req.user) {
    // Reaching here means a route was mounted without userAuth — a wiring bug,
    // not a client error.
    throw unauthorized('Authentication required.');
  }
  return req.user;
}
