/**
 * The palm provider contract.
 *
 * Every biometric operation in PayByPalm goes through this interface. Two
 * implementations satisfy it — Tencent PalmAI and a deterministic in-memory mock —
 * and swapping between them is a single environment variable. Nothing above this
 * layer knows or cares which is running.
 *
 * The provider is a pure matching oracle. It is given our Supabase user id and an
 * image, and answers "is this the same palm?". It never receives a name, a phone
 * number, a balance, or any other personal detail.
 */

/**
 * Audit metadata a provider may attach to any result.
 *
 * Not part of the logical answer — this exists so the auditing decorator can
 * record what actually happened on the wire without every call site having to
 * thread it through.
 */
export interface ProviderMeta {
  /** The provider's own request identifier. The only handle support can trace a call with. */
  requestId?: string;
  /**
   * The provider's own match verdict, recorded alongside our score so our
   * thresholds can be calibrated against it rather than guessed at. Distinct from
   * our accept/step-up/reject decision, which is made in policy.ts.
   */
  providerIsMatch?: boolean;
}

export interface RegisterResult {
  palmId: string;
  meta?: ProviderMeta;
}

export interface CompareResult {
  isMatch: boolean;
  /** 0–100. */
  score: number;
  meta?: ProviderMeta;
}

export interface SearchResult {
  /** Our Supabase user id, as returned by the provider's gallery. */
  userId: string;
  /** 0–100. */
  score: number;
  meta?: ProviderMeta;
}

export interface PalmProvider {
  /** Identifies the implementation in logs and audit rows: 'tencent' | 'mock'. */
  readonly name: string;

  /**
   * Enrol a palm against a user. One-time per user — the caller enforces that;
   * this method has no memory of prior enrolments.
   */
  register(userId: string, imageB64: string): Promise<RegisterResult>;

  /** 1:1. Is this palm the palm we hold for this specific user? */
  compare(userId: string, imageB64: string): Promise<CompareResult>;

  /** 1:N across the whole gallery. Resolves to null when nothing matches. */
  search(imageB64: string): Promise<SearchResult | null>;
}

/** The three operations, as recorded in palm_audit.endpoint. */
export type PalmOperation = 'register' | 'compare' | 'search';
