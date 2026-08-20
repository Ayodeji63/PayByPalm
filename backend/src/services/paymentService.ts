/**
 * Payment flow.
 *
 * Three steps, deliberately separate:
 *
 *   create        a terminal states an amount                 -> 'pending'
 *   authenticate  a palm names the payer                      -> 'authenticated'
 *   confirm       the payer taps Confirm and money moves      -> 'settled'
 *
 * NOTHING IS DEBITED BEFORE CONFIRM. `authenticate` identifies a person and
 * writes no ledger entry whatsoever; the only code path in this system that moves
 * money is `confirm`, and it does so by calling post_transaction() in the database.
 */

import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  getBalanceMinor,
  getCandidatesByLast4,
  getProfile,
  getWalletAccountId,
  maskBalanceMinor,
  maskName,
  type Profile,
} from '../db/queries.js';
import { AppError, badRequest, conflict, fromPostgresError, notFound, unauthorized } from '../errors.js';
import { normaliseImage } from '../lib/image.js';
import { palm } from '../palm/index.js';
import { decide, explain, rejectWithout, thresholds, type PolicyOutcome } from '../palm/policy.js';
import type { AuthedTerminal } from '../middleware/terminalAuth.js';
import type { Logger } from '../logger.js';

export interface TransactionRow {
  id: string;
  terminal_id: string | null;
  merchant_id: string | null;
  amount_minor: number;
  description: string | null;
  status: 'pending' | 'authenticated' | 'settled' | 'failed' | 'cancelled';
  matched_user_id: string | null;
  match_score: number | null;
  match_mode: 'compare' | 'search' | null;
  failure_reason: string | null;
  created_at: string;
  authenticated_at: string | null;
  settled_at: string | null;
}

export interface AuthenticateOutcome {
  decision: 'accept' | 'step_up' | 'reject';
  /** Which path resolved the payer. Absent when we never reached the biometrics. */
  mode: 'compare' | 'search' | null;
  score: number | null;
  message: string;
  reason?: string;
  /** Present only on accept/step_up. Masked — never the full name. */
  maskedName?: string;
  /** Present only on accept/step_up. Rounded down to the nearest ₦100. */
  maskedBalanceMinor?: number;
  /** True when confirm will require the wallet PIN. */
  pinRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadForTerminal(transactionId: string, terminal: AuthedTerminal): Promise<TransactionRow> {
  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle();

  if (error) throw new AppError(500, 'db_error', `Could not load transaction: ${error.message}`);
  if (!data) throw notFound('Transaction not found.');

  const txn = data as TransactionRow;

  // A terminal may only touch its own transactions. Without this check a stolen
  // key from one merchant could drive another merchant's payments.
  if (txn.terminal_id !== terminal.id) {
    throw notFound('Transaction not found.');
  }

  return txn;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTransaction(
  terminal: AuthedTerminal,
  amountMinor: number,
  description?: string,
): Promise<TransactionRow> {
  const { data, error } = await db
    .from('transactions')
    .insert({
      terminal_id: terminal.id,
      merchant_id: terminal.merchantId,
      amount_minor: amountMinor,
      description: description ?? null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw new AppError(500, 'db_error', `Could not create transaction: ${error.message}`);
  return data as TransactionRow;
}

// ---------------------------------------------------------------------------
// Authenticate
// ---------------------------------------------------------------------------

interface Candidate {
  profile: Profile;
  score: number;
}

/**
 * Production path: narrow by the last four digits of the phone, then run a small
 * number of 1:1 comparisons.
 *
 * A 1:N search over a whole campus gallery has a false-match rate that grows with
 * the gallery. Binning on four typed digits collapses it to a handful of
 * candidates, which is why this is the path a real deployment uses.
 */
async function authenticateByLast4(
  last4: string,
  imageB64: string,
  log: Logger,
): Promise<{ outcome: PolicyOutcome; profile: Profile | null }> {
  const candidates = await getCandidatesByLast4(last4);

  if (candidates.length === 0) {
    return { outcome: rejectWithout('no_candidates'), profile: null };
  }

  if (candidates.length > thresholds.maxCandidates) {
    // Comparing an arbitrary subset would silently make the answer depend on row
    // order. Ask for more digits instead.
    log.warn({ last4, count: candidates.length }, 'last4 bin too wide');
    return { outcome: rejectWithout('ambiguous_bin'), profile: null };
  }

  const scored: Candidate[] = [];
  for (const profile of candidates) {
    const result = await palm.compare(profile.id, imageB64);
    scored.push({ profile, score: result.score });
  }

  // Highest score wins, then policy decides whether it is good enough.
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;

  log.info(
    { candidates: candidates.length, bestScore: best.score },
    'last4 comparison complete',
  );

  return { outcome: decide(best.score), profile: best.profile };
}

/** Demo path: pure 1:N. Nothing typed, palm only. */
async function authenticateBySearch(
  imageB64: string,
): Promise<{ outcome: PolicyOutcome; profile: Profile | null }> {
  const result = await palm.search(imageB64);
  if (!result) return { outcome: decide(null), profile: null };

  const profile = await getProfile(result.userId);
  return { outcome: decide(result.score), profile };
}

export async function authenticateTransaction(
  transactionId: string,
  terminal: AuthedTerminal,
  rawImage: string,
  last4: string | undefined,
  log: Logger,
): Promise<AuthenticateOutcome> {
  const txn = await loadForTerminal(transactionId, terminal);

  if (txn.status !== 'pending') {
    throw conflict(
      'invalid_transaction_state',
      `This transaction is ${txn.status} and can no longer be authenticated.`,
    );
  }

  // Held in memory for this request only. Never logged, never stored.
  const image = normaliseImage(rawImage);
  const mode: 'compare' | 'search' = last4 ? 'compare' : 'search';

  const { outcome, profile } =
    mode === 'compare'
      ? await authenticateByLast4(last4!, image.data, log)
      : await authenticateBySearch(image.data);

  // --- rejected -----------------------------------------------------------
  if (outcome.decision === 'reject' || !profile) {
    // Left 'pending' on purpose: repositioning a hand and trying again is the
    // normal response, and it should not need a fresh transaction.
    log.info({ reason: outcome.reason, score: outcome.score, mode }, 'authentication rejected');
    return {
      decision: 'reject',
      mode,
      score: outcome.score,
      reason: outcome.reason ?? 'no_match',
      message: explain(outcome),
    };
  }

  // --- identified, but can they pay? --------------------------------------
  const accountId = await getWalletAccountId(profile.id);
  const balanceMinor = await getBalanceMinor(accountId);

  if (balanceMinor < txn.amount_minor) {
    // Terminal state, not retryable: presenting the palm again will not conjure
    // funds. Better to say so now than to let someone tap Confirm on a payment
    // that is guaranteed to fail.
    await db
      .from('transactions')
      .update({
        status: 'failed',
        matched_user_id: profile.id,
        match_score: outcome.score,
        match_mode: mode,
        failure_reason: 'insufficient_funds',
      })
      .eq('id', txn.id);

    return {
      decision: 'reject',
      mode,
      score: outcome.score,
      reason: 'insufficient_funds',
      message: 'Not enough balance for this payment.',
    };
  }

  // --- accepted or step-up ------------------------------------------------
  const { error } = await db
    .from('transactions')
    .update({
      status: 'authenticated',
      authenticated_at: new Date().toISOString(),
      matched_user_id: profile.id,
      match_score: outcome.score,
      match_mode: mode,
    })
    .eq('id', txn.id)
    // Only from 'pending' — if two terminals raced, the loser must not overwrite.
    .eq('status', 'pending');

  if (error) throw new AppError(500, 'db_error', `Could not authenticate: ${error.message}`);

  const pinRequired = outcome.decision === 'step_up';

  if (pinRequired && !profile.pin_hash) {
    // A mid-confidence match with no PIN on file has no safe way forward.
    return {
      decision: 'reject',
      mode,
      score: outcome.score,
      reason: 'no_pin_set',
      message: 'Additional confirmation needed, but no wallet PIN is set on this account.',
    };
  }

  return {
    decision: outcome.decision,
    mode,
    score: outcome.score,
    maskedName: maskName(profile.full_name),
    maskedBalanceMinor: maskBalanceMinor(balanceMinor),
    pinRequired,
    message: explain(outcome),
  };
}

// ---------------------------------------------------------------------------
// Confirm — the only path that moves money
// ---------------------------------------------------------------------------

export interface Receipt {
  transactionId: string;
  amountMinor: number;
  merchantName: string;
  terminalLabel: string;
  settledAt: string | null;
  maskedName: string;
  balanceMinor: number;
}

export async function confirmTransaction(
  transactionId: string,
  terminal: AuthedTerminal,
  pin: string | undefined,
): Promise<Receipt> {
  const txn = await loadForTerminal(transactionId, terminal);

  if (txn.status !== 'authenticated') {
    throw conflict(
      'invalid_transaction_state',
      txn.status === 'settled'
        ? 'This payment has already been completed.'
        : `This transaction is ${txn.status} and cannot be confirmed.`,
    );
  }

  // Stale authentication. A palm match that has been sitting on screen is not a
  // statement about who is standing there now.
  const authenticatedAt = txn.authenticated_at ? Date.parse(txn.authenticated_at) : 0;
  const ageSeconds = (Date.now() - authenticatedAt) / 1000;

  if (!txn.authenticated_at || ageSeconds > config.AUTH_VALIDITY_SECONDS) {
    await db
      .from('transactions')
      .update({ status: 'failed', failure_reason: 'stale_auth' })
      .eq('id', txn.id);

    throw conflict(
      'stale_authentication',
      'That palm scan has expired. Please scan again.',
      { ageSeconds: Math.round(ageSeconds), limitSeconds: config.AUTH_VALIDITY_SECONDS },
    );
  }

  if (!txn.matched_user_id) {
    throw conflict('no_matched_user', 'This transaction has no authenticated payer.');
  }

  const profile = await getProfile(txn.matched_user_id);

  // Whether a PIN is required is re-derived from the stored score rather than
  // trusted from the client, so a terminal cannot skip step-up by omitting a flag.
  const requiresPin = decide(txn.match_score).decision === 'step_up';

  if (requiresPin) {
    if (!pin) {
      throw unauthorized('Wallet PIN required to confirm this payment.');
    }
    if (!profile.pin_hash) {
      throw conflict('no_pin_set', 'No wallet PIN is set on this account.');
    }
    const ok = await bcrypt.compare(pin, profile.pin_hash);
    if (!ok) {
      throw unauthorized('Incorrect PIN.');
    }
  }

  // The database does the rest atomically: locks the row, re-checks the balance
  // under that lock, writes the balanced pair, flips the status.
  const { data, error } = await db.rpc('post_transaction', { txn_id: txn.id });

  if (error) {
    const mapped = fromPostgresError(error as { code?: string; message?: string });
    if (mapped) throw mapped;
    throw new AppError(500, 'settlement_failed', `Could not settle payment: ${error.message}`);
  }

  const settled = (Array.isArray(data) ? data[0] : data) as TransactionRow;
  const balanceMinor = await getBalanceMinor(await getWalletAccountId(profile.id));

  return {
    transactionId: settled.id,
    amountMinor: Number(settled.amount_minor),
    merchantName: terminal.merchantName,
    terminalLabel: terminal.label,
    settledAt: settled.settled_at,
    maskedName: maskName(profile.full_name),
    balanceMinor,
  };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelTransaction(
  transactionId: string,
  terminal: AuthedTerminal,
): Promise<TransactionRow> {
  const txn = await loadForTerminal(transactionId, terminal);

  if (txn.status === 'settled') {
    throw conflict('already_settled', 'This payment has already been completed.');
  }
  if (txn.status === 'cancelled') return txn;

  const { data, error } = await db
    .from('transactions')
    .update({ status: 'cancelled', failure_reason: 'cancelled_at_terminal' })
    .eq('id', txn.id)
    .in('status', ['pending', 'authenticated'])
    .select('*')
    .single();

  if (error) throw new AppError(500, 'db_error', `Could not cancel: ${error.message}`);
  return data as TransactionRow;
}

// ---------------------------------------------------------------------------
// Top-up
// ---------------------------------------------------------------------------

/**
 * HACKATHON SCOPE — simulated funding.
 *
 * This is where a real Wema funding rail plugs in. In production an inbound
 * NIP / virtual-account webhook would verify that money actually arrived and then
 * call this same post_topup() function. The ledger shape does not change; only
 * the trigger for calling it does.
 */
export async function topUp(
  userId: string,
  amountMinor: number,
  description = 'Wallet top-up',
): Promise<{ transactionId: string; balanceMinor: number }> {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw badRequest('invalid_amount', 'Top-up amount must be a positive whole number of kobo.');
  }

  const { data, error } = await db.rpc('post_topup', {
    p_user_id: userId,
    p_amount: amountMinor,
    p_description: description,
  });

  if (error) {
    const mapped = fromPostgresError(error as { code?: string; message?: string });
    if (mapped) throw mapped;
    throw new AppError(500, 'topup_failed', `Could not complete top-up: ${error.message}`);
  }

  const txn = (Array.isArray(data) ? data[0] : data) as TransactionRow;
  const balanceMinor = await getBalanceMinor(await getWalletAccountId(userId));

  return { transactionId: txn.id, balanceMinor };
}
