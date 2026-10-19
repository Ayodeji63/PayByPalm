/** Palm identifies the payer; confirmation charges the default linked card.
 * No internal wallet balance is read or debited. */
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
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
import { requirePaystack, paystackDomain } from './paystack.js';
import { consumePalmCapture, getActivePalmCandidates, issuePalmCapture, type CaptureSubmission, type PalmCandidate } from './palmCaptureService.js';
import type { CompareResult } from '../palm/provider.js';

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
    if (['PGRST202', '42703', '42883'].includes(error.code)) {
      throw new AppError(503, 'payment_setup_required', 'Sale creation requires a database update. Ask the administrator to apply the terminal sale recovery migration.');
    }
    const mapped = fromPostgresError(error);
    if (mapped) throw mapped;
    throw new AppError(500, 'db_error', 'Could not create transaction.');
  }

  return (Array.isArray(data) ? data[0] : data) as TransactionRow;
}

// ---------------------------------------------------------------------------
// Authenticate
// ---------------------------------------------------------------------------

/** Compare every active binding. Never select a payer from a partial sweep. */
export async function matchPalmCandidates(
  candidates: PalmCandidate[],
  compare: (userId: string) => Promise<CompareResult>,
): Promise<{ outcome: PolicyOutcome; userId: string | null }> {
  if (!candidates.length) return { outcome: rejectWithout('no_candidates'), userId: null };
  const deadline = Date.now() + 45_000;
  const matches: { userId: string; score: number }[] = [];
  for (const candidate of candidates) {
    if (Date.now() >= deadline) throw new AppError(503, 'palm_comparison_incomplete', 'The palm check took too long. No payment was authorized. Please try again.');
    const result = await compare(candidate.user_id);
    if (typeof result.isMatch !== 'boolean' || !Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
      throw new AppError(502, 'palm_comparison_invalid', 'The palm service returned an invalid comparison. Please scan again.');
    }
    if (Date.now() >= deadline) throw new AppError(503, 'palm_comparison_incomplete', 'The palm check took too long. Please scan again.');
    if (result.isMatch) matches.push({ userId: candidate.user_id, score: result.score });
  }
  if (matches.length !== 1) return { outcome: rejectWithout(matches.length ? 'ambiguous_match' : 'no_match'), userId: null };
  return { outcome: decide(matches[0]!.score), userId: matches[0]!.userId };
}

async function pendingTransaction(transactionId: string, terminal: AuthedTerminal): Promise<TransactionRow> {
  const txn = await loadForTerminal(transactionId, terminal);
  if (txn.status !== 'pending') throw conflict('invalid_transaction_state', `This transaction is ${txn.status} and can no longer be authenticated.`);
  return txn;
}

export async function beginPaymentCapture(transactionId: string, terminal: AuthedTerminal) {
  await pendingTransaction(transactionId, terminal);
  if (config.PALM_PROVIDER === 'mock' || config.TENCENT_CAPTURE_MODE !== 'h5') return { captureMode: 'legacy' as const };
  requireApprovedCaptureMode();
  const candidates = await getActivePalmCandidates();
  if (!candidates.length) throw conflict('no_enrolled_palms', 'No palms are linked yet. Enrol a palm before starting a payment.');
  const grant = await issuePalmCapture(terminal.id, transactionId, 'payment', candidates[0]!.user_id);
  return { ...grant, candidateCount: candidates.length };
}

/** Tencent H5 ciphertext is checked at Tencent; our DB only selects identities. */
export async function authenticateSdkTransaction(
  transactionId: string, terminal: AuthedTerminal, submission: CaptureSubmission, log: Logger,
): Promise<AuthenticateOutcome> {
  const txn = await pendingTransaction(transactionId, terminal);
  if (config.TENCENT_CAPTURE_MODE !== 'h5') throw conflict('palm_capture_mode_changed', 'The reader configuration changed. Start a new scan.');
  requireApprovedCaptureMode();
  const { capture, userId } = await consumePalmCapture(terminal.id, transactionId, 'payment', submission);
  const candidates = await getActivePalmCandidates();
  if (!candidates.some(c => c.user_id === userId)) throw conflict('palm_binding_changed', 'An enrolled palm changed. Please scan again.');
  if (!palm.compareCapture) throw new AppError(503, 'palm_sdk_unavailable', 'The palm reader is not configured.');
  const matched = await matchPalmCandidates(candidates, candidateId => palm.compareCapture!(candidateId, capture));
  // Detect revocation, re-enrolment or an added candidate during the sweep.
  const current = await getActivePalmCandidates();
  if (JSON.stringify(candidates.map(c => [c.id, c.tencent_palm_id])) !== JSON.stringify(current.map(c => [c.id, c.tencent_palm_id]))) {
    throw conflict('palm_binding_changed', 'The enrolled palms changed during verification. Please scan again.');
  }
  log.info({ candidates: candidates.length, decision: matched.outcome.decision }, 'H5 1:1 palm sweep complete');
  const profile = matched.userId ? await getProfile(matched.userId) : null;
  return finaliseAuthentication(txn, profile, matched.outcome, log);
}

function requireApprovedCaptureMode(): void {
  if (config.PAYSTACK_MODE === 'live' && !config.TENCENT_H5_IMAGE_ONLY_APPROVED) {
    throw new AppError(503, 'palm_liveness_confirmation_required', 'Tencent must confirm the capture-only liveness and multi-user comparison contract before live card payments are enabled.');
  }
}

/** Original camera capture; the server still performs every 1:1 comparison. */
export async function authenticateTransaction(
  transactionId: string, terminal: AuthedTerminal, rawImage: string,
  _last4: string | undefined, log: Logger,
): Promise<AuthenticateOutcome> {
  const txn = await pendingTransaction(transactionId, terminal);
  if (config.PALM_PROVIDER === 'tencent' && config.TENCENT_CAPTURE_MODE === 'h5') throw conflict('palm_sdk_required', 'This terminal is configured to use the Tencent palm reader. Start a new scan.');
  const image = normaliseImage(rawImage);
  const candidates = await getActivePalmCandidates();
  const matched = await matchPalmCandidates(candidates, userId => palm.compare(userId, image.data));
  const current = await getActivePalmCandidates();
  if (JSON.stringify(candidates.map(c => [c.id, c.tencent_palm_id])) !== JSON.stringify(current.map(c => [c.id, c.tencent_palm_id]))) {
    throw conflict('palm_binding_changed', 'The enrolled palms changed during verification. Please scan again.');
  }
  log.info({ candidates: candidates.length, decision: matched.outcome.decision }, 'Camera 1:1 palm sweep complete');
  const profile = matched.userId ? await getProfile(matched.userId) : null;
  return finaliseAuthentication(txn, profile, matched.outcome, log);
}

async function finaliseAuthentication(
  txn: TransactionRow, profile: Profile | null, outcome: PolicyOutcome, log: Logger,
): Promise<AuthenticateOutcome> {
  const mode = 'compare' as const;
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
      message: outcome.reason === 'ambiguous_match' ? 'More than one enrolled palm matched. No payment was authorized. Please contact support.' : outcome.reason === 'no_candidates' ? 'No active palms are enrolled. Link your palm before paying.' : explain(outcome),
    };
  }

  // Palm-only payments require a full accept; marginal matches must rescan.
  if(outcome.decision !== 'accept')return {decision:'reject',mode,score:outcome.score,reason:'strong_match_required',message:'Please reposition your hand and scan again.'};
  // Do not offer card confirmation when this deployment cannot charge a card.
  // Charge still checks again before claiming a payment attempt.
  requirePaystack('payment');
  const card=await db.from('linked_cards').select('id,last4,brand').eq('user_id',profile.id).eq('domain',paystackDomain()).eq('is_default',true).eq('is_paused',false).is('removed_at',null).maybeSingle();
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
