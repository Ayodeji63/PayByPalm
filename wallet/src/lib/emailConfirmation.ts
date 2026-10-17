/** Consume the default Supabase implicit-flow result; never persist URL tokens. */
export function readEmailConfirmation(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('error') || params.has('error_code')) {
    throw new Error('This confirmation link is invalid or expired. Sign in to request a new link.');
  }
  const token = params.get('refresh_token');
  if (params.get('type') !== 'signup' || !token || token.length > 4096) {
    throw new Error('This confirmation link is incomplete. Open the latest signup email, or sign in if you already confirmed your email.');
  }
  return token;
}
