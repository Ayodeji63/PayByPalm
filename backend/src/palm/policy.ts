/**
 * Match policy — the single source of truth for what a score means.
 *
 * These are OUR thresholds. They are deliberately independent of the provider's
 * own boolean verdict: a provider tuned for convenience will happily call a
 * marginal match a match, and we are deciding whether to move someone's money.
 * Both numbers are recorded in palm_audit so the two can be compared.
 *
 * No other module may branch on a raw score. If you find yourself writing
 * `if (score > 80)` somewhere else, the logic belongs here instead.
 *
 * CALIBRATION: the defaults are a starting point, not measured values. Real
 * thresholds should come from palm_audit data collected on the actual Pi camera
 * under the actual kiosk lighting. A threshold picked by intuition is the most
 * likely cause of a failed live demo.
 */

import { config } from '../config.js';

export type MatchDecision = 'accept' | 'step_up' | 'reject';

export type RejectReason =
  | 'no_match'
  | 'low_score'
  | 'no_candidates'
  | 'ambiguous_bin';

export interface PolicyOutcome {
  decision: MatchDecision;
  score: number | null;
  reason?: RejectReason;
}

export const thresholds = Object.freeze({
  accept: config.PALM_ACCEPT_SCORE,
  stepUp: config.PALM_STEP_UP_SCORE,
  maxCandidates: config.MAX_CANDIDATES,
});

/**
 * Classify a score.
 *
 * A null score means the provider returned no match at all, which is a reject and
 * not a zero — the distinction matters when reading audit rows later.
 */
export function decide(score: number | null): PolicyOutcome {
  if (score === null) {
    return { decision: 'reject', score: null, reason: 'no_match' };
  }
  if (score >= thresholds.accept) {
    return { decision: 'accept', score };
  }
  if (score >= thresholds.stepUp) {
    // Confident enough to name a user, not confident enough to move their money
    // unaided. The terminal asks for the wallet PIN.
    return { decision: 'step_up', score };
  }
  return { decision: 'reject', score, reason: 'low_score' };
}

/** A reject that never reached the biometric stage. */
export function rejectWithout(reason: RejectReason): PolicyOutcome {
  return { decision: 'reject', score: null, reason };
}

/** Human-readable text for a terminal screen. Never names the user on a reject. */
export function explain(outcome: PolicyOutcome): string {
  switch (outcome.reason) {
    case 'no_candidates':
      return 'No enrolled palm matches those digits. Check the number and try again.';
    case 'ambiguous_bin':
      return 'Too many accounts share those digits. Ask for more digits of the phone number.';
    case 'low_score':
    case 'no_match':
      return 'Palm not recognised. Please reposition your hand and try again.';
    default:
      return outcome.decision === 'step_up'
        ? 'Please enter your wallet PIN to confirm.'
        : 'Palm recognised.';
  }
}
