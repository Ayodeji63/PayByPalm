/**
 * Terminal authentication — device keys.
 *
 * The second of the two authentication planes. A terminal proves itself with
 * `X-Terminal-Key`; we store only the SHA-256 of that value, so a database dump
 * yields no working credential. Revoking a lost or stolen terminal is a single
 * row delete.
 *
 * A terminal identifies the DEVICE and its merchant. It never identifies a user
 * and can never be used in place of a user JWT.
 */

import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/client.js';
import { unauthorized } from '../errors.js';
import { logger } from '../logger.js';

export interface AuthedTerminal {
  id: string;
  merchantId: string;
  merchantName: string;
  label: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      terminal?: AuthedTerminal;
    }
  }
}

export function hashTerminalKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export async function terminalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header('x-terminal-key');

  if (!key) {
    next(unauthorized('Missing X-Terminal-Key.'));
    return;
  }

  const { data, error } = await db
    .from('terminals')
    .select('id, label, merchant_id, merchants(name)')
    .eq('api_key_hash', hashTerminalKey(key))
    .maybeSingle();

  if (error) {
    req.log.error({ err: error }, 'terminal lookup failed');
    next(unauthorized('Could not verify this terminal.'));
    return;
  }

  if (!data) {
    // No detail about why — an attacker probing keys learns nothing from this.
    req.log.warn('rejected unknown terminal key');
    next(unauthorized('This terminal is not registered.'));
    return;
  }

  const merchant = data.merchants as unknown as { name: string } | null;

  req.terminal = {
    id: data.id as string,
    merchantId: data.merchant_id as string,
    merchantName: merchant?.name ?? 'Unknown merchant',
    label: data.label as string,
  };
  req.log = req.log.child({ terminalId: data.id });

  // Fire and forget: a heartbeat is useful for spotting a dead kiosk, but a slow
  // write here must never add latency to a payment.
  void db
    .from('terminals')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error: hbError }) => {
      if (hbError) logger.debug({ err: hbError }, 'terminal heartbeat failed');
    });

  next();
}

/** Narrow `req.terminal` for handlers mounted behind terminalAuth. */
export function requireTerminal(req: Request): AuthedTerminal {
  if (!req.terminal) {
    throw unauthorized('Terminal authentication required.');
  }
  return req.terminal;
}
