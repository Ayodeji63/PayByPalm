/**
 * Enrolment flow — linking a palm to a wallet, once.
 *
 *   terminal  POST /enrol/sessions          -> 'pending'   (QR goes on screen)
 *   phone     POST /enrol/sessions/:id/claim -> 'claimed'  (user JWT names the user)
 *   terminal  POST /enrol/sessions/:id/palm  -> 'completed'(palm registered)
 *
 * The identity comes from the PHONE, authenticated with a Supabase JWT. The
 * terminal never asserts who the user is — it only proves a device and captures
 * an image. That is what stops a terminal operator from enrolling their own palm
 * against someone else's wallet.
 */

import { config } from '../config.js';
import { db } from '../db/client.js';
import { getProfile, maskName } from '../db/queries.js';
import { AppError, conflict, notFound } from '../errors.js';
import { normaliseImage } from '../lib/image.js';
import { palm } from '../palm/index.js';
import type { AuthedTerminal } from '../middleware/terminalAuth.js';

export type SessionStatus = 'pending' | 'claimed' | 'captured' | 'completed' | 'expired';

export interface EnrolSessionRow {
  id: string;
  terminal_id: string;
  user_id: string | null;
  status: SessionStatus;
  expires_at: string;
  created_at: string;
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

async function load(sessionId: string): Promise<EnrolSessionRow> {
  const { data, error } = await db
    .from('enrol_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

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
async function expireIfStale(session: EnrolSessionRow): Promise<EnrolSessionRow> {
  const isOpen = session.status === 'pending' || session.status === 'claimed';
  if (!isOpen) return session;
  if (Date.parse(session.expires_at) > Date.now()) return session;

  await db.from('enrol_sessions').update({ status: 'expired' }).eq('id', session.id);
  return { ...session, status: 'expired' };
}

// ---------------------------------------------------------------------------
// Terminal: create
// ---------------------------------------------------------------------------

export async function createSession(
  terminal: AuthedTerminal,
): Promise<{ sessionId: string; expiresAt: string; linkUrl: string }> {
  const expiresAt = new Date(Date.now() + config.ENROL_SESSION_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await db
    .from('enrol_sessions')
    .insert({ terminal_id: terminal.id, status: 'pending', expires_at: expiresAt })
    .select('*')
    .single();

  if (error) throw new AppError(500, 'db_error', `Could not create session: ${error.message}`);
  const session = data as EnrolSessionRow;

  return {
    sessionId: session.id,
    expiresAt: session.expires_at,
    // This is what goes into the QR code the terminal renders.
    linkUrl: `${config.WALLET_BASE_URL}/scan/${session.id}`,
  };
}

// ---------------------------------------------------------------------------
// Terminal: poll
// ---------------------------------------------------------------------------

export async function getSessionView(sessionId: string): Promise<SessionView> {
  const session = await expireIfStale(await load(sessionId));

  const view: SessionView = {
    sessionId: session.id,
    status: session.status,
    expiresAt: session.expires_at,
  };

  if (session.user_id) {
    const profile = await getProfile(session.user_id);
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
  if (profile.palm_enrolled) {
    throw conflict(
      'already_enrolled',
      'Your palm is already linked. Unlink it under Profile before enrolling again.',
    );
  }

  const { error } = await db
    .from('enrol_sessions')
    .update({ user_id: userId, status: 'claimed' })
    .eq('id', sessionId)
    // Only from 'pending' — two phones scanning the same QR must not both win.
    .eq('status', 'pending');

  if (error) throw new AppError(500, 'db_error', `Could not claim session: ${error.message}`);

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

export async function registerPalmForSession(
  sessionId: string,
  terminal: AuthedTerminal,
  rawImage: string,
): Promise<RegisterOutcome> {
  const session = await expireIfStale(await load(sessionId));

  if (session.terminal_id !== terminal.id) {
    throw notFound('This enrolment session does not exist.');
  }

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

  const image = normaliseImage(rawImage);
  const { palmId } = await palm.register(profile.id, image.data);

  // Binding first. If the profile flag update below were to fail, the binding row
  // still exists and the partial unique index prevents a duplicate — whereas a
  // flag set with no binding would claim an enrolment that does not exist.
  const { error: bindingError } = await db
    .from('palm_bindings')
    .insert({ user_id: profile.id, tencent_palm_id: palmId });

  if (bindingError) {
    throw new AppError(500, 'binding_failed', `Could not save palm binding: ${bindingError.message}`);
  }

  const { error: profileError } = await db
    .from('profiles')
    .update({ palm_enrolled: true })
    .eq('id', profile.id);

  if (profileError) {
    throw new AppError(500, 'db_error', `Could not update profile: ${profileError.message}`);
  }

  await db.from('enrol_sessions').update({ status: 'completed' }).eq('id', sessionId);

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
 * Soft-revoke the active binding so the user can enrol again at a terminal.
 *
 * The binding row is kept, with revoked_at set — the audit history of who was
 * enrolled and when must survive. The partial unique index in the schema is what
 * makes a subsequent re-enrolment possible.
 *
 * Note: the provider has no delete endpoint, so the template remains in its
 * gallery. Since matching is always resolved back through palm_bindings, a
 * revoked binding cannot authorise a payment.
 */
export async function revokePalm(userId: string): Promise<{ revoked: boolean }> {
  const profile = await getProfile(userId);

  if (!profile.palm_enrolled) {
    return { revoked: false };
  }

  const { error: bindingError } = await db
    .from('palm_bindings')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (bindingError) {
    throw new AppError(500, 'db_error', `Could not revoke binding: ${bindingError.message}`);
  }

  const { error: profileError } = await db
    .from('profiles')
    .update({ palm_enrolled: false })
    .eq('id', userId);

  if (profileError) {
    throw new AppError(500, 'db_error', `Could not update profile: ${profileError.message}`);
  }

  return { revoked: true };
}
