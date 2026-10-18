/** Palm identifies the payer; confirmation charges the default linked card.
 * No internal wallet balance is read or debited. */
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  getCandidatesByLast4,
  getProfile,
  maskName,
  type Profile,
} from '../db/queries.js';
import { AppError, conflict, fromPostgresError, notFound } from '../errors.js';
import { normaliseImage } from '../lib/image.js';
import { palm } from '../palm/index.js';
import { decide, explain, rejectWithout, thresholds, type PolicyOutcome } from '../palm/policy.js';
import type { AuthedTerminal } from '../middleware/terminalAuth.js';
import type { Logger } from '../logger.js';
import { chargeCardPayment } from './cardPaymentService.js';

export interface TransactionRow {
  id: string;
  terminal_id: string | null;
  merchant_id: string | null;
  amount_minor: number;
  description: string | null;
  status: 'pending' | 'authenticated' | 'processing' | 'settled' | 'failed' | 'cancelled';
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
  cardLast4?: string;
  cardBrand?: string;
  /** Always false: direct card payments require a full-accept palm match. */
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

export const getTerminalTransaction = loadForTerminal;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTransaction(
  terminal: AuthedTerminal,
  amountMinor: number,
  description: string | undefined,
  saleId: string,
): Promise<TransactionRow> {
  const { data, error } = await db.rpc('create_terminal_transaction', {
    p_terminal_id: terminal.id,
    p_sale_id: saleId,
    p_amount: amountMinor,
    p_description: description ?? null,
  });
  if (error) {
    const mapped = fromPostgresError(error);
    if (mapped) throw mapped;
    throw new AppError(500, 'db_error', 'Could not create transaction.');
  }

  return (Array.isArray(data) ? data[0] : data) as TransactionRow;
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

  if(profile && !profile.palm_enrolled)return {decision:'reject',mode,score:outcome.score,reason:'no_active_palm',message:'Enrol your palm in PayByPalm before making a payment.'};

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

  // Palm-only payments require a full accept; marginal matches must rescan.
  if(outcome.decision !== 'accept')return {decision:'reject',mode,score:outcome.score,reason:'strong_match_required',message:'Please reposition your hand and scan again.'};
  const card=await db.from('linked_cards').select('id,last4,brand').eq('user_id',profile.id).eq('is_default',true).eq('is_paused',false).is('removed_at',null).maybeSingle();
  if(card.error)throw new AppError(503,'card_payment_unavailable','Could not check the linked card. Please try again.');
  if(!card.data)return {decision:'reject',mode,score:outcome.score,reason:'no_active_card',message:'Link an active default card in your PayByPalm account first.'};

  const { data: authenticated, error } = await db
    .from('transactions')
    .update({
      status: 'authenticated',
      authenticated_at: new Date().toISOString(),
      payment_card_id: card.data.id,
      matched_user_id: profile.id,
      match_score: outcome.score,
      match_mode: mode,
    })
    .eq('id', txn.id)
    // Only from 'pending' — if two terminals raced, the loser must not overwrite.
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) throw new AppError(500, 'db_error', `Could not authenticate: ${error.message}`);

  if (!authenticated) throw conflict('invalid_transaction_state', 'Payment state changed. Please start again.');

  return {
    decision: outcome.decision,
    mode,
    score: outcome.score,
    maskedName: maskName(profile.full_name),
    cardLast4: card.data.last4,
    cardBrand: card.data.brand,
    pinRequired: false,
    message: explain(outcome),
  };
}

// ---------------------------------------------------------------------------
// Confirm — initiate or reconcile a provider card charge
// ---------------------------------------------------------------------------

export interface Receipt {
  transactionId: string;
  amountMinor: number;
  merchantName: string;
  terminalLabel: string;
  settledAt: string | null;
  maskedName: string;
}

export async function confirmTransaction(
  transactionId: string,
  terminal: AuthedTerminal,
): Promise<Receipt> {
  const txn = await loadForTerminal(transactionId, terminal);

  if (txn.status === 'settled') return receiptFor(txn, terminal);

  if (txn.status === 'processing') {
    await chargeCardPayment(txn.id,terminal.id);
    const current=await loadForTerminal(txn.id,terminal);
    if(current.status==='settled')return receiptFor(current,terminal);
    throw conflict(current.status==='failed'?'card_declined':'card_payment_pending',current.status==='failed'?'The card payment was declined.':'The card payment is being checked. Do not start another sale.');
  }

  if (txn.status !== 'authenticated') {
    throw conflict(
      'invalid_transaction_state',
      `This transaction is ${txn.status} and cannot be confirmed.`,
    );
  }

  // Stale authentication. A palm match that has been sitting on screen is not a
  // statement about who is standing there now.
  const authenticatedAt = txn.authenticated_at ? Date.parse(txn.authenticated_at) : 0;
  const ageSeconds = (Date.now() - authenticatedAt) / 1000;

  if (!txn.authenticated_at || !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > config.AUTH_VALIDITY_SECONDS) {

    throw conflict(
      'stale_authentication',
      'That palm scan has expired. Please scan again.',
      { ageSeconds: Math.round(ageSeconds), limitSeconds: config.AUTH_VALIDITY_SECONDS },
    );
  }

  if (!txn.matched_user_id) {
    throw conflict('no_matched_user', 'This transaction has no authenticated payer.');
  }

  if(decide(txn.match_score).decision!=='accept')throw conflict('payment_match_rejected','Please scan your palm again.');
  await chargeCardPayment(txn.id,terminal.id);
  const current=await loadForTerminal(txn.id,terminal);
  if(current.status==='settled')return receiptFor(current,terminal);
  throw conflict(current.status==='failed'?'card_declined':'card_payment_pending',current.status==='failed'?'The card payment was declined.':'The card payment is being checked. Do not start another sale.');
}

async function receiptFor(txn: TransactionRow, terminal: AuthedTerminal, profile?: Profile): Promise<Receipt> {
  return {
    transactionId: txn.id,
    amountMinor: Number(txn.amount_minor),
    merchantName: terminal.merchantName,
    terminalLabel: terminal.label,
    settledAt: txn.settled_at,
    maskedName: profile ? maskName(profile.full_name) : 'Customer',
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

  if (txn.status === 'processing')throw conflict('card_payment_pending','An initiated card charge cannot be cancelled. Check its status.');
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
