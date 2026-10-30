/**
 * Enrolment flow — linking a palm to a wallet, once.
 *
 *   terminal  POST /enrol/sessions          -> 'pending'   (QR goes on screen)
 *   phone     POST /enrol/sessions/:id/claim -> 'claimed'  (user session token names the user)
 *   terminal  POST /enrol/sessions/:id/palm  -> 'completed'(palm registered)
 *
 * The identity comes from the PHONE, authenticated with a PayByPalm session token. The
 * terminal never asserts who the user is — it only proves a device and captures
 * an image. That is what stops a terminal operator from enrolling their own palm
 * against someone else's wallet.
 */

import { createHash, randomUUID } from 'node:crypto';
import { activeProviderBinding } from './ccnetBindings.js';
import type { PalmSide } from '../palm/provider.js';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { getProfile, maskName } from '../db/queries.js';
import { AppError, conflict, notFound } from '../errors.js';
import { normaliseImage } from '../lib/image.js';
import { palm } from '../palm/index.js';
import type { AuthedTerminal } from '../middleware/terminalAuth.js';
import { consumePalmCapture, issuePalmCapture, type CaptureSubmission } from './palmCaptureService.js';

export type SessionStatus = 'pending' | 'claimed' | 'captured' | 'completed' | 'expired';

export interface EnrolSessionRow {
  id: string;
  terminal_id: string;
  user_id: string | null;
  status: SessionStatus;
  expires_at: string;
  created_at: string;
  provider?: string;
}

export interface SessionView {
  sessionId: string;
  status: SessionStatus;
  expiresAt: string;
  /** Masked. Present once the phone has claimed the session. */
  userDisplayName?: string;
}

// ---------------------------------------------------------------------------
// Loading and expiry
// ---------------------------------------------------------------------------

async function load(sessionId: string, signal?: AbortSignal): Promise<EnrolSessionRow> {
  let query = db.from('enrol_sessions').select('*').eq('id', sessionId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();

  if (error) throw new AppError(500, 'db_error', `Could not load session: ${error.message}`);
  if (!data) throw notFound('This enrolment session does not exist.');
  return data as EnrolSessionRow;
}

/**
 * Expire a session lazily, on read.
 *
 * A background sweeper would be tidier but is one more thing to keep running; the
 * only moment expiry actually matters is when someone tries to use the session,
 * and that always goes through here.
 */
async function expireIfStale(session: EnrolSessionRow, signal?: AbortSignal): Promise<EnrolSessionRow> {
  const isOpen = session.status === 'pending' || session.status === 'claimed';
  if (!isOpen) return session;
  if (Date.parse(session.expires_at) > Date.now()) return session;

  const query = db.from('enrol_sessions').update({ status: 'expired' }).eq('id', session.id).eq('status', session.status);
  await (signal ? query.abortSignal(signal) : query);
  return { ...session, status: 'expired' };
}

// ---------------------------------------------------------------------------
// Terminal: create
// ---------------------------------------------------------------------------

export async function createSession(
  terminal: AuthedTerminal,
): Promise<{ sessionId: string; expiresAt: string; linkUrl: string; captureMode: 'h5' | 'legacy' | 'ccnet' }> {
  const expiresAt = new Date(Date.now() + config.ENROL_SESSION_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await db
    .from('enrol_sessions')
    .insert({ terminal_id: terminal.id, provider: config.PALM_PROVIDER, status: 'pending', expires_at: expiresAt })
    .select('*')
    .single();

  if (error) throw new AppError(500, 'db_error', `Could not create session: ${error.message}`);
  const session = data as EnrolSessionRow;

  return {
    sessionId: session.id,
    captureMode: config.PALM_PROVIDER === 'ccnet' ? 'ccnet' : config.PALM_PROVIDER === 'tencent' && config.TENCENT_CAPTURE_MODE === 'h5' ? 'h5' : 'legacy',
    expiresAt: session.expires_at,
    // This is what goes into the QR code the terminal renders.
    linkUrl: `${config.WALLET_BASE_URL}/scan/${session.id}`,
  };
}

// ---------------------------------------------------------------------------
// Terminal: poll
// ---------------------------------------------------------------------------

export async function getSessionView(sessionId: string, signal?: AbortSignal, terminalId?: string): Promise<SessionView> {
  const loaded = await load(sessionId, signal);
  if (terminalId && loaded.terminal_id !== terminalId) throw notFound('This enrollment session does not exist.');
  const session = await expireIfStale(loaded, signal);

  const view: SessionView = {
    sessionId: session.id,
    status: session.status,
    expiresAt: session.expires_at,
  };

  if (session.user_id) {
    const profile = await getProfile(session.user_id, signal);
    // Masked even here. The terminal shows "Hi Samson O." — enough to confirm the
    // right phone claimed the session, not a name broadcast to the queue behind.
    view.userDisplayName = maskName(profile.full_name);
  }

  return view;
}

// ---------------------------------------------------------------------------
// Phone: claim
// ---------------------------------------------------------------------------

export async function claimSession(sessionId: string, userId: string): Promise<SessionView> {
  const session = await expireIfStale(await load(sessionId));

  if (config.PALM_PROVIDER === 'ccnet' && session.provider !== 'ccnet') throw conflict('palm_capture_mode_changed', 'This QR uses the previous reader. Ask for a new enrollment code.');
  if (session.status === 'expired') {
    throw conflict('session_expired', 'This QR code has expired. Ask the terminal for a new one.');
  }

  if (session.status !== 'pending') {
    throw conflict(
      'session_already_claimed',
      'This enrolment session has already been used.',
    );
  }

  const profile = await getProfile(userId);

  // ENROLMENT IS ONE-TIME. This is the guard the whole flow hangs on, and it is
  // checked against the database rather than anything the client sent.
  if (config.PALM_PROVIDER === 'ccnet' ? await activeProviderBinding(userId) : profile.palm_enrolled) {
    throw conflict(
      'already_enrolled',
      'Your palm is already linked. Unlink it under Profile before enrolling again.',
    );
  }

  const { data: claimed, error } = await db
    .from('enrol_sessions')
    .update({ user_id: userId, status: 'claimed' })
    .eq('id', sessionId)
    // Only from 'pending' — two phones scanning the same QR must not both win.
    .eq('status', 'pending').select('id').maybeSingle();

  if (error) throw new AppError(500, 'db_error', 'Could not claim session.');
  if (!claimed) throw conflict('session_already_claimed', 'This enrollment session has already been used.');

  return {
    sessionId,
    status: 'claimed',
    expiresAt: session.expires_at,
    userDisplayName: maskName(profile.full_name),
  };
}

// ---------------------------------------------------------------------------
// Terminal: capture and register
// ---------------------------------------------------------------------------

export interface RegisterOutcome {
  status: 'completed';
  userDisplayName: string;
  /** True when this call did nothing because the session was already completed. */
  alreadyCompleted: boolean;
}

export async function beginEnrolCapture(sessionId: string, terminal: AuthedTerminal) {
  const session = await expireIfStale(await load(sessionId));
  if (session.terminal_id !== terminal.id) throw notFound('This enrolment session does not exist.');
  if (session.status !== 'claimed' || !session.user_id) throw conflict('session_not_claimed', 'Claim an active enrolment QR code before scanning a palm.');
  const profile = await getProfile(session.user_id);
  if (profile.palm_enrolled) throw conflict('already_enrolled', 'Unlink your existing palm before enrolling again.');
  if (config.PALM_PROVIDER !== 'tencent' || config.TENCENT_CAPTURE_MODE !== 'h5') {
    throw conflict('palm_capture_mode_changed', 'The terminal uses the original camera. Start a new enrolment scan.');
  }
  return issuePalmCapture(terminal.id, session.id, 'enrol', profile.id, session.expires_at);
}

export async function registerPalmForSession(
  sessionId: string,
  terminal: AuthedTerminal,
  rawImage: string | CaptureSubmission | CcnetSamples,
): Promise<RegisterOutcome> {
  const session = await expireIfStale(await load(sessionId));

  if (session.terminal_id !== terminal.id) {
    throw notFound('This enrolment session does not exist.');
  }

  if (config.PALM_PROVIDER === 'ccnet') return registerCcnet(session, terminal, rawImage);

  // Idempotent: a retried request after a flaky response must not enrol twice.
  if (session.status === 'completed') {
    const profile = await getProfile(session.user_id!);
    return {
      status: 'completed',
      userDisplayName: maskName(profile.full_name),
      alreadyCompleted: true,
    };
  }

  if (session.status === 'expired') {
    throw conflict('session_expired', 'This enrolment session has expired.');
  }

  if (session.status !== 'claimed' || !session.user_id) {
    throw conflict(
      'session_not_claimed',
      'Nobody has scanned this QR code yet.',
    );
  }

  const profile = await getProfile(session.user_id);

  // Re-checked here, not just at claim time: the two steps are seconds apart, but
  // this is the step that actually creates a binding.
  if (profile.palm_enrolled) {
    throw conflict('already_enrolled', 'This account already has a palm linked.');
  }

  let palmId: string;
  if (typeof rawImage === 'string') {
    if (config.PALM_PROVIDER === 'tencent' && config.TENCENT_CAPTURE_MODE === 'h5') throw conflict('palm_sdk_required', 'This terminal is configured to use the Tencent palm reader. Start a new scan.');
    const image = normaliseImage(rawImage);
    ({ palmId } = await palm.register(profile.id, image.data));
  } else {
    if ('imagesB64' in rawImage) throw conflict('palm_capture_mode_changed', 'The reader configuration changed. Start a new scan.');
    if (config.TENCENT_CAPTURE_MODE !== 'h5') throw conflict('palm_capture_mode_changed', 'The reader configuration changed. Start a new enrolment scan.');
    const verified = await consumePalmCapture(terminal.id, session.id, 'enrol', rawImage);
    if (verified.userId !== profile.id) throw conflict('palm_capture_wrong_user', 'The palm capture belongs to a different enrolment. Please scan again.');
    if (!palm.registerCapture) throw new AppError(503, 'palm_sdk_unavailable', 'The palm reader is not configured.');
    ({ palmId } = await palm.registerCapture(profile.id, verified.capture));
  }

  // Despite its historical name, this RPC validates/saves either camera mode.
  // Keep binding, profile flag and session completion in one database transaction.
  const {error} = await db.rpc('complete_h5_palm_enrolment', {
    p_session: sessionId, p_terminal: terminal.id, p_user: profile.id, p_palm_id: palmId,
  });
  if (error) throw conflict('enrolment_completion_failed', 'The provider registered the palm, but local linking could not finish. Check your palm status or unlink before enrolling again.');

  return {
    status: 'completed',
    userDisplayName: maskName(profile.full_name),
    alreadyCompleted: false,
  };
}

// ---------------------------------------------------------------------------
// Phone: revoke
// ---------------------------------------------------------------------------

/**
 * Delete and verify the provider template, then remove local palm binding rows
 * and reset enrollment. Non-biometric provider-call audit metadata is retained.
 *
 * Provider deletion happens first. We must not tell the customer unlinking
 * succeeded while Tencent still retains a biometric template that blocks the
 * next enrolment.
 */
export async function revokePalm(userId: string): Promise<{ revoked: boolean }> {
  await getProfile(userId);

  if (config.PALM_PROVIDER === 'ccnet') return revokeCcnet(userId);

  await palm.delete(userId);

  await clearLocalPalmBinding(userId);
  return { revoked: true };
}

/** Also used by the explicit administrator reset for historical/deleted users. */
export async function clearLocalPalmBinding(userId: string): Promise<void> {
  const { error: sessionError } = await db.from('enrol_sessions')
    .update({ status: 'expired' }).eq('user_id', userId).in('status', ['claimed', 'captured']);
  if (sessionError) throw new AppError(503, 'palm_unlink_incomplete', 'Palm cleanup is incomplete. Retry unlinking before enrolling again.');

  const { error: bindingError } = await db
    .from('palm_bindings')
    .delete()
    .eq('user_id', userId);

  if (bindingError) {
    throw new AppError(503, 'palm_unlink_incomplete', 'The palm provider was cleared but local cleanup is incomplete. Retry unlinking.');
  }

  const { error: profileError } = await db
    .from('profiles')
    .update({ palm_enrolled: false })
    .eq('id', userId);

  if (profileError) {
    throw new AppError(503, 'palm_unlink_incomplete', 'The palm provider was cleared but local cleanup is incomplete. Retry unlinking.');
  }
}

export interface CcnetSamples { imagesB64: [string, string, string]; palmSide: PalmSide }
async function registerCcnet(session: EnrolSessionRow, terminal: AuthedTerminal, raw: string | CaptureSubmission | CcnetSamples): Promise<RegisterOutcome> {
  if (typeof raw !== 'object' || !('imagesB64' in raw) || raw.imagesB64.length !== 3 || !['left','right'].includes(raw.palmSide))
    throw new AppError(422, 'palm_samples_required', 'Three fresh captures and a palm side are required.');
  if (!session.user_id || session.provider !== 'ccnet') throw conflict('session_not_claimed', 'Claim a new enrollment QR before capturing.');
  const images = raw.imagesB64.map(value => {
    const image = normaliseImage(value);
    if (image.bytes > 512 * 1024) throw new AppError(422, 'image_too_large', 'Each capture must be at most 512 KiB.');
    return image.data;
  }) as [string,string,string];
  const hashes = images.map(value => createHash('sha256').update(Buffer.from(value, 'base64')).digest('hex'));
  if (new Set(hashes).size !== 3) throw new AppError(422, 'distinct_frames_required', 'Capture three independent camera frames.');
  const fingerprint = createHash('sha256').update(JSON.stringify([raw.palmSide, ...hashes])).digest('hex');
  const owner = randomUUID();
  const args = { p_session: session.id, p_terminal: terminal.id, p_user: session.user_id, p_fingerprint: fingerprint };
  const reserved = await db.rpc('reserve_ccnet_enrolment', { ...args, p_side: raw.palmSide, p_owner: owner });
  if (reserved.error) throw conflict(reserved.error.code === 'PC004' ? 'registration_in_progress' : 'enrolment_retry_required',
    reserved.error.code === 'PC004' ? 'Enrollment is still being checked. Please wait and retry the same captures.' : 'The enrollment changed or expired. Retry the original captures or start a new QR session.');
  const profile = await getProfile(session.user_id);
  if (reserved.data === 'completed') return { status: 'completed', userDisplayName: maskName(profile.full_name), alreadyCompleted: true };
  try {
    if (!palm.registerSamples) throw new AppError(503, 'palm_reader_configuration', 'The palm reader is not configured.');
    await palm.registerSamples(profile.id, { subjectId: session.id, palmSide: raw.palmSide, imagesB64: images });
    const completed = await db.rpc('complete_ccnet_enrolment', { ...args, p_owner: owner });
    if (completed.error) throw new AppError(503, 'enrolment_completion_pending', 'Palm linking could not finish. Retry the same captures; do not start another enrollment.');
    return { status: 'completed', userDisplayName: maskName(profile.full_name), alreadyCompleted: false };
  } finally {
    images.fill('');
    // An uncertain upstream write may still be running. Keep the short database
    // lease until expiry; retries remain tied to the exact same captures.
  }
}
async function revokeCcnet(userId: string): Promise<{ revoked: boolean }> {
  const revoked = await db.rpc('revoke_ccnet_palms', { p_user: userId });
  if (revoked.error) throw new AppError(503, 'palm_unlink_incomplete', 'Could not revoke your palm. Please retry.');
  const sessions = await db.from('enrol_sessions').select('id,palm_side,registration_until').eq('user_id', userId)
    .eq('provider', 'ccnet').not('capture_fingerprint', 'is', null).is('templates_deleted_at', null);
  if (sessions.error) throw new AppError(503, 'palm_unlink_incomplete', 'Your palm is disabled. Retry unlinking to finish template cleanup.');
  for (const session of sessions.data ?? []) {
    if (session.registration_until && Date.parse(session.registration_until) > Date.now()) throw new AppError(503, 'palm_unlink_incomplete', 'Your palm is disabled. Wait a minute and retry unlinking to finish an in-flight enrollment.');
    await palm.delete(userId, { id: session.id, userId, subjectId: session.id, palmSide: session.palm_side });
    const bindingCleaned = await db.from('palm_bindings').update({ templates_deleted_at: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', 'ccnet').eq('provider_subject_id', session.id);
    if (bindingCleaned.error) throw new AppError(503, 'palm_unlink_incomplete', 'Your palm is disabled. Retry unlinking to confirm cleanup.');
    const cleaned = await db.from('enrol_sessions').update({ templates_deleted_at: new Date().toISOString() }).eq('id', session.id);
    if (cleaned.error) throw new AppError(503, 'palm_unlink_incomplete', 'Your palm is disabled. Retry unlinking to confirm cleanup.');
  }
  return { revoked: true };
}
