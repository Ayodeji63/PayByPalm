/**
 * Transaction routes.
 *
 * This file mounts both terminal-driven and user-driven routes under
 * /transactions. They are separated by METHOD and PATH, and each route names its
 * own middleware explicitly — there is no shared "either credential" guard.
 *
 *   POST /transactions                    terminal   create
 *   POST /transactions/:id/authenticate   terminal   palm -> payer
 *   POST /transactions/:id/confirm        terminal   MONEY MOVES HERE
 *   POST /transactions/:id/cancel         terminal   abandon
 *   GET  /transactions                    user       history
 *   GET  /transactions/:id                user       detail
 *   POST /transactions/:id/dispute        user       flag it
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { AppError, forbidden, notFound } from '../errors.js';
import { requireTerminal, terminalAuth } from '../middleware/terminalAuth.js';
import { requireUser, userAuth } from '../middleware/userAuth.js';
import { validate } from '../middleware/validate.js';
import {
  authenticateTransaction,
  cancelTransaction,
  confirmTransaction,
  createTransaction,
} from '../services/paymentService.js';

export const transactionsRouter: Router = Router();

const idParam = z.object({ id: z.string().uuid('Not a valid transaction id') });

// ===========================================================================
// Terminal routes
// ===========================================================================

/**
 * POST /transactions — state an amount. Creates nothing but intent.
 *
 * Amount is in minor units (kobo) and must be a positive integer. Accepting a
 * float here is how you end up with ₦12.999999 in a ledger.
 */
transactionsRouter.post(
  '/transactions',
  terminalAuth,
  validate({
    body: z.object({
      amountMinor: z
        .number()
        .int('Amount must be a whole number of kobo')
        .positive('Amount must be greater than zero')
        .max(100_000_000, 'Amount exceeds the single-payment limit'),
      description: z.string().trim().max(200).optional(),
    }),
  }),
  async (req, res) => {
    const terminal = requireTerminal(req);
    const { amountMinor, description } = req.body as {
      amountMinor: number;
      description?: string;
    };

    const txn = await createTransaction(terminal, amountMinor, description);

    res.status(201).json({
      transactionId: txn.id,
      amountMinor: Number(txn.amount_minor),
      status: txn.status,
      merchantName: terminal.merchantName,
      terminalLabel: terminal.label,
    });
  },
);

/**
 * POST /transactions/:id/authenticate — identify the payer from their palm.
 *
 * WRITES NO LEDGER ENTRY. This step names a person and nothing more.
 *
 * With `last4`, the production path: narrow to candidates sharing those digits,
 * then run 1:1 comparisons. Without it, the demo path: a single 1:N search, palm
 * only, nothing typed.
 */
transactionsRouter.post(
  '/transactions/:id/authenticate',
  terminalAuth,
  validate({
    params: idParam,
    body: z.object({
      imageB64: z.string().min(1, 'A palm image is required'),
      last4: z
        .string()
        .regex(/^\d{4}$/, 'Enter the last 4 digits of the phone number')
        .optional(),
    }),
  }),
  async (req, res) => {
    const terminal = requireTerminal(req);
    const { imageB64, last4 } = req.body as { imageB64: string; last4?: string };

    const outcome = await authenticateTransaction(
      req.params.id as string,
      terminal,
      imageB64,
      last4,
      req.log,
    );

    res.json(outcome);
  },
);

/**
 * POST /transactions/:id/confirm — the explicit Confirm tap.
 *
 * The ONLY route in this API that debits a wallet. Fails if the transaction is
 * not authenticated, or if the palm scan behind it has gone stale.
 */
transactionsRouter.post(
  '/transactions/:id/confirm',
  terminalAuth,
  validate({
    params: idParam,
    body: z
      .object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits').optional() })
      .default({}),
  }),
  async (req, res) => {
    const terminal = requireTerminal(req);
    const { pin } = (req.body ?? {}) as { pin?: string };

    const receipt = await confirmTransaction(req.params.id as string, terminal, pin);
    res.json(receipt);
  },
);

transactionsRouter.post(
  '/transactions/:id/cancel',
  terminalAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const terminal = requireTerminal(req);
    const txn = await cancelTransaction(req.params.id as string, terminal);
    res.json({ transactionId: txn.id, status: txn.status });
  },
);

// ===========================================================================
// User routes
// ===========================================================================

interface HistoryRow {
  id: string;
  amount_minor: number;
  description: string | null;
  status: string;
  match_score: number | null;
  match_mode: string | null;
  created_at: string;
  settled_at: string | null;
  disputed_at: string | null;
  merchants: { name: string } | null;
  terminals: { label: string } | null;
}

const shapeHistoryRow = (row: HistoryRow) => ({
  id: row.id,
  amountMinor: Number(row.amount_minor),
  description: row.description,
  status: row.status,
  // A top-up has no merchant; the wallet renders it as a credit.
  merchantName: row.merchants?.name ?? null,
  terminalLabel: row.terminals?.label ?? null,
  // The wallet shows a palm icon when this is set.
  authorisedByPalm: row.match_mode !== null,
  matchScore: row.match_score,
  matchMode: row.match_mode,
  createdAt: row.created_at,
  settledAt: row.settled_at,
  disputedAt: row.disputed_at,
  direction: row.merchants ? ('debit' as const) : ('credit' as const),
});

transactionsRouter.get(
  '/transactions',
  userAuth,
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  }),
  async (req, res) => {
    const user = requireUser(req);
    const { limit, offset } = res.locals.query as { limit: number; offset: number };

    const { data, error, count } = await db
      .from('transactions')
      .select('*, merchants(name), terminals(label)', { count: 'exact' })
      .eq('matched_user_id', user.id)
      // Only outcomes the user can act on. A 'pending' row is a till mid-sale and
      // means nothing on a phone.
      .in('status', ['settled', 'failed', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new AppError(500, 'db_error', `Could not load history: ${error.message}`);

    res.json({
      transactions: (data as unknown as HistoryRow[]).map(shapeHistoryRow),
      total: count ?? 0,
      limit,
      offset,
    });
  },
);

transactionsRouter.get(
  '/transactions/:id',
  userAuth,
  validate({ params: idParam }),
  async (req, res) => {
    const user = requireUser(req);

    const { data, error } = await db
      .from('transactions')
      .select('*, merchants(name), terminals(label)')
      .eq('id', req.params.id as string)
      .maybeSingle();

    if (error) throw new AppError(500, 'db_error', `Could not load transaction: ${error.message}`);
    if (!data) throw notFound('Transaction not found.');

    const row = data as unknown as HistoryRow & { matched_user_id: string | null };
    // Same 404 as a missing row, so this cannot be used to probe which ids exist.
    if (row.matched_user_id !== user.id) throw notFound('Transaction not found.');

    res.json(shapeHistoryRow(row));
  },
);

/**
 * POST /transactions/:id/dispute — flag a payment the user does not recognise.
 *
 * Records the dispute against the transaction. The palm_audit row for the match
 * that authorised it is what an investigator reads next: score, mode, provider
 * request id, and latency are all there.
 */
transactionsRouter.post(
  '/transactions/:id/dispute',
  userAuth,
  validate({
    params: idParam,
    body: z
      .object({ reason: z.string().trim().min(3, 'Tell us briefly what went wrong').max(500) })
      .default({ reason: 'Not recognised by the account holder' }),
  }),
  async (req, res) => {
    const user = requireUser(req);
    const { reason } = req.body as { reason: string };

    const { data, error } = await db
      .from('transactions')
      .select('id, matched_user_id, status, disputed_at')
      .eq('id', req.params.id as string)
      .maybeSingle();

    if (error) throw new AppError(500, 'db_error', `Could not load transaction: ${error.message}`);
    if (!data) throw notFound('Transaction not found.');

    const row = data as { id: string; matched_user_id: string | null; disputed_at: string | null };
    if (row.matched_user_id !== user.id) throw forbidden('This is not your transaction.');

    if (row.disputed_at) {
      res.json({ disputed: true, disputedAt: row.disputed_at, alreadyDisputed: true });
      return;
    }

    const { error: updateError } = await db
      .from('transactions')
      .update({ disputed_at: new Date().toISOString(), dispute_reason: reason })
      .eq('id', row.id);

    if (updateError) {
      throw new AppError(500, 'db_error', `Could not record dispute: ${updateError.message}`);
    }

    req.log.warn({ transactionId: row.id, userId: user.id }, 'transaction disputed');

    res.json({
      disputed: true,
      disputedAt: new Date().toISOString(),
      alreadyDisputed: false,
      message: 'Dispute recorded. Someone will review this payment.',
    });
  },
);
