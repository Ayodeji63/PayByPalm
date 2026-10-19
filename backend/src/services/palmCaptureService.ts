import { createHash, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { AppError, conflict } from '../errors.js';
import { palm } from '../palm/index.js';
import { parseSdkCapture, type SdkCapture } from '../palm/sdkCapture.js';

export interface PalmCandidate {
  id: string;
  user_id: string;
  tencent_palm_id: string;
}

/** Keyset pagination: never silently compare only PostgREST's first 1000 rows. */
export async function getActivePalmCandidates(): Promise<PalmCandidate[]> {
  const candidates: PalmCandidate[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = db.from('palm_bindings')
      .select('id,user_id,tencent_palm_id,profiles!inner(palm_enrolled)')
      .is('revoked_at', null).eq('profiles.palm_enrolled', true).order('id').limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error || !data) throw new AppError(503, 'palm_candidates_unavailable', 'Could not load enrolled palms. Please try again.');
    const page = data as unknown as PalmCandidate[];
    candidates.push(...page);
    if (page.length < 500) return candidates;
    cursor = page[page.length - 1]!.id;
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const SDK_LOADER_URL = 'https://open.palmoa.youtu.qq.com/palm/x/jssdk/loader/palm-mobile-manager.js';

export interface CaptureGrant {
  captureMode: 'h5';
  captureId: string;
  userId: string;
  token: string;
  expiresAt: string;
  loaderUrl: string;
}

export async function issuePalmCapture(
  terminalId: string, scopeId: string, purpose: 'payment' | 'enrol', userId: string, expiresAt?: string,
): Promise<CaptureGrant> {
  if (!palm.createSdkToken) throw new AppError(503, 'palm_sdk_unavailable', 'The palm reader is not configured.');
  const captureId = randomUUID();
  // SDK user tokens can access their user's provider data. Never give a shared
  // merchant reader such a credential for an enrolled customer. Image-only
  // acquisition uses an isolated identity with no customer palm to delete.
  const sdkUserId = 'capture_' + captureId.replaceAll('-', '');
  const credential = await palm.createSdkToken(sdkUserId);
  const expiry = new Date(Math.min(
    Date.now() + 90_000, credential.expiresAt * 1000,
    expiresAt ? Date.parse(expiresAt) : Infinity,
  )).toISOString();
  if (Date.parse(expiry) <= Date.now()) throw conflict('palm_capture_expired', 'The palm session has expired. Start again.');
  const { data, error } = await db.from('palm_capture_sessions').insert({
    id: captureId,
    terminal_id: terminalId, scope_id: scopeId, purpose, user_id: userId,
    token_hash: digest(credential.token), expires_at: expiry,
  }).select('id').single();
  if (error || !data) throw new AppError(503, 'palm_sdk_setup_required', 'The palm reader requires database migration 0021. Ask the administrator to check setup.');
  return { captureMode: 'h5', captureId: data.id, userId: sdkUserId, token: credential.token, expiresAt: expiry, loaderUrl: SDK_LOADER_URL };
}

export interface CaptureSubmission { captureId: string; payload: string }

/** Consumed before any provider call; a failed scan requires a fresh acquisition. */
export async function consumePalmCapture(
  terminalId: string, scopeId: string, purpose: 'payment' | 'enrol', submission: CaptureSubmission,
): Promise<{ userId: string; capture: SdkCapture }> {
  if (config.PALM_PROVIDER !== 'tencent') throw new AppError(400, 'palm_sdk_unavailable', 'SDK capture requires the Tencent provider.');
  const capture = parseSdkCapture(submission.payload);
  const { data, error } = await db.rpc('consume_palm_capture', {
    p_capture: submission.captureId, p_terminal: terminalId, p_scope: scopeId, p_purpose: purpose,
    p_token_hash: digest(capture.UserToken),
    // Ignore caller-editable timestamps/token when recognizing a reused image.
    p_capture_hash: digest(JSON.stringify([capture.RgbImage.Data, capture.LivenessRgbImage.Data])),
  });
  if (error) {
    if (['PC001', '23505'].includes(error.code)) throw conflict('palm_capture_expired', 'This palm capture was used or expired. Please scan again.');
    throw new AppError(503, 'palm_sdk_setup_required', 'Could not validate the palm capture. Ask the administrator to check migration 0021.');
  }
  if (typeof data !== 'string') throw new AppError(503, 'palm_capture_unverified', 'Could not validate the palm capture. Please scan again.');
  return { userId: data, capture };
}
