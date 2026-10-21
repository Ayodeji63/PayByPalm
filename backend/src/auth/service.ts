import { config } from '../config.js';
import { AppError, unauthorized } from '../errors.js';
import { createIdentity, deliverAuthEmail, withDeliveryStatus } from './engine.js';

let instance: ReturnType<typeof createIdentity> | undefined;
function identity() {
  if (!instance) {
    if (!config.AUTH_DATABASE_URL || !config.AUTH_SECRET || !config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL)
      throw new AppError(503, 'auth_setup_required', 'Authentication setup is incomplete.');
    instance = createIdentity({ databaseURL: config.AUTH_DATABASE_URL, secret: config.AUTH_SECRET,
      baseURL: config.AUTH_BASE_URL, walletURL: config.WALLET_BASE_URL,
      send: (email, purpose, token) => deliverAuthEmail(config.RESEND_API_KEY!, config.RESEND_FROM_EMAIL!, config.WALLET_BASE_URL, email, purpose, token) });
  }
  return instance;
}
const headers = (token: string) => new Headers({ authorization: `Bearer ${token}` });
function invalid(error: unknown, fallback: 'login' | 'token' | 'service'): never {
  if (error instanceof AppError) throw error;
  const code = (error as { body?: { code?: string } })?.body?.code;
  if (code === 'EMAIL_NOT_VERIFIED') throw new AppError(403, 'email_verification_required', 'Verify your email before signing in.');
  if (fallback === 'login' && ['INVALID_EMAIL_OR_PASSWORD', 'INVALID_PASSWORD'].includes(code ?? '')) throw unauthorized('Incorrect email or password.');
  if (fallback === 'token' && ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'INVALID_VERIFICATION_TOKEN', 'VERIFICATION_TOKEN_EXPIRED'].includes(code ?? ''))
    throw new AppError(400, 'invalid_confirmation', 'This link is invalid or expired. Request a new link.');
  throw new AppError(503, 'auth_unavailable', 'Authentication is temporarily unavailable. Please try again.');
}
export const identityService = {
  async signup(input: { fullName: string; email: string; phone: string; password: string }) {
    try {
      await identity().engine.api.signUpEmail({ body: { name: input.fullName, email: input.email, phone: input.phone, password: input.password } });
      // Send after committing signup, including safe retries for an unverified duplicate.
      await withDeliveryStatus(() => identity().engine.api.sendVerificationEmail({ body: { email: input.email } }));
    }
    catch (error) { invalid(error, 'service'); }
  },
  async login(email: string, password: string) {
    try {
      const result = await identity().engine.api.signInEmail({ body: { email, password } });
      if (!result.token) throw unauthorized('Incorrect email or password.');
      const checked = await this.session(result.token);
      if (!checked) { await identity().engine.api.signOut({headers:headers(result.token)}); throw unauthorized(); }
      return { user: checked.user, session: checked.session };
    } catch (error) { if (error instanceof AppError) throw error; invalid(error, 'login'); }
  },
  async session(token: string) {
    // Legacy Supabase JWTs are not accepted as new sessions.
    if (!token || token.length > 4096 || token.split('.').length === 3) return null;
    try {
      const result = await identity().engine.api.getSession({ headers: headers(token) });
      if (result) {
        const state = await identity().pool.query('select disabled from pbp_auth.\"user\" where id=$1', [result.user.id]);
        if (state.rows[0]?.disabled !== false) return null;
      }
      if (!result?.user.emailVerified || !result.user.email || result.user.email.endsWith('@phone.paybypalm.local')) return null;
      return { user: { id: result.user.id, email: result.user.email, email_confirmed_at: result.user.updatedAt.toISOString() },
        // Compatibility fields carry the same opaque, revocable session, not JWTs.
        session: { accessToken: result.session.token, refreshToken: result.session.token, expiresAt: Math.floor(result.session.expiresAt.getTime() / 1000) } };
    } catch (error) { invalid(error, 'service'); }
  },
  async confirm(token: string) {
    try { await identity().engine.api.verifyEmail({ query: { token } }); }
    catch (error) { invalid(error, 'token'); }
  },
  async resend(email: string) {
    try { await withDeliveryStatus(() => identity().engine.api.sendVerificationEmail({ body: { email } })); }
    catch (error) { invalid(error, 'service'); }
  },
  async logout(token: string) {
    try {
      await identity().engine.api.signOut({ headers: headers(token) });
      if (await identity().engine.api.getSession({headers:headers(token)}))
        throw new AppError(503,'auth_unavailable','Could not confirm session revocation.');
    }
    catch (error) { invalid(error, 'service'); }
  },
  async requestReset(email: string) {
    try { await withDeliveryStatus(() => identity().engine.api.requestPasswordReset({ body: { email } })); }
    catch (error) { invalid(error, 'service'); }
  },
  async reset(token: string, password: string) {
    try { await identity().engine.api.resetPassword({ body: { token, newPassword: password } }); }
    catch (error) { invalid(error, 'token'); }
  },
};
