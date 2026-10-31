/** Resume explicit card/enrollment work; ordinary sign-in always opens Home. */
export function postLoginPath(returnTo: unknown): string {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) return '/dashboard';
  const target = new URL(returnTo, 'https://wallet.invalid');
  if (target.origin !== 'https://wallet.invalid') return '/dashboard';
  if (target.pathname === '/cards' || target.pathname === '/scan' || /^\/scan\/[a-f0-9-]{36}$/i.test(target.pathname))
    return `${target.pathname}${target.search}${target.hash}`;
  return '/dashboard';
}
