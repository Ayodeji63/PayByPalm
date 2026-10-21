/** Accounts are verified by the central PayByPalm backend; Supabase stores data only. */
export type IdentityUser = { id: string; email?: string; email_confirmed_at?: string };
type Failure = { status: number; code?: string };
type Session = { access_token: string; refresh_token: string; expires_at?: number };
export function centralAuth(baseURL: string, transport = fetch) {
  async function call(path: string, body?: unknown, token?: string) {
    try {
      const response = await transport(`${baseURL}${path}`, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(12000),
      });
      const value = response.status === 204 ? {} : await response.json();
      if (!response.ok) return { value: null, error: { status: response.status, code: value?.error?.code } as Failure };
      return { value, error: null };
    } catch { return { value: null, error: { status: 503, code: 'auth_unavailable' } as Failure }; }
  }
  const session = (value: { accessToken: string; refreshToken: string; expiresAt?: number }): Session => ({
    access_token: value.accessToken, refresh_token: value.refreshToken, expires_at: value.expiresAt,
  });
  return { auth: {
    async getUser(token: string) {
      const r = await call('/auth/session', undefined, token);
      return { data: { user: r.value?.user as IdentityUser | null }, error: r.error };
    },
    async signInWithPassword(input: { email: string; password: string }) {
      const r = await call('/auth/login', input);
      return { data: { user: r.value?.user as IdentityUser | null, session: r.value?.session ? session(r.value.session) : null }, error: r.error };
    },
    async refreshSession(input: { refresh_token: string }) {
      const r = await call('/auth/refresh', { refreshToken: input.refresh_token });
      return { data: { session: r.value?.session ? session(r.value.session) : null }, error: r.error };
    },
    async signOut(token: string) { const r = await call('/auth/logout', {}, token); return { error: r.error }; },
  } };
}
export type CentralAuth = ReturnType<typeof centralAuth>;
