import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PayByPalmLogo } from '../components/ui.js';
import { api } from '../lib/api.js';

export default function PasswordRecovery() {
  const location = useLocation();
  const resetting = location.pathname === '/auth/reset';
  const token = useRef('');
  const initialized = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (initialized.current || !resetting) return;
    initialized.current = true;
    const parsed = new URLSearchParams(location.hash.slice(1)).get('token');
    window.history.replaceState(window.history.state, '', '/auth/reset');
    if (!parsed || parsed.length > 4096) setError('This reset link is incomplete. Request a new link.');
    else token.current = parsed;
  }, [location.hash, resetting]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (resetting && password !== confirmation) { setError('Your passwords must match.'); return; }
    setBusy(true);
    try {
      if (resetting) await api.anonPost('/auth/reset-password', { token: token.current, password });
      else await api.anonPost('/auth/request-password-reset', { email: email.trim().toLowerCase() });
      token.current = ''; setPassword(''); setConfirmation(''); setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  const input = 'mt-2 min-h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base';
  return <main className="mx-auto min-h-dvh max-w-md bg-white px-5 py-8">
    <PayByPalmLogo />
    <h1 className="mt-8 text-2xl font-bold">{done ? (resetting ? 'Password updated' : 'Check your email') : resetting ? 'Choose a new password' : 'Reset your password'}</h1>
    {done ? <p role="status" className="mt-4 text-gray-700">{resetting ? 'Sign in with your new password. Your previous sessions have been signed out.' : 'If this email has a PayByPalm account, we’ll send a password reset link. Check your spam folder too.'}</p> : <form className="mt-6 space-y-5" onSubmit={event => void submit(event)}>
      {resetting ? <><label className="block">New password<input className={input} type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <p className="text-sm text-gray-600">Use at least 8 characters.</p><label className="block">Confirm password<input className={input} type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></> : <label className="block">Email address<input className={input} type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {error && <p role="alert" className="break-words text-red-700">{error}</p>}
      <button disabled={busy || (resetting && !token.current)} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : resetting ? 'Update password' : 'Send reset link'}</button>
    </form>}
    <Link className="mt-6 inline-block min-h-11 font-semibold text-blue-700" to={error && resetting ? '/auth/forgot' : '/login'} state={{ mode: 'signin' }}>{error && resetting ? 'Request a new reset link' : 'Return to sign in'}</Link>
  </main>;
}
