import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PayByPalmLogo } from '../components/ui.js';
import { useAuth } from '../lib/auth.js';
import { readEmailConfirmation } from '../lib/emailConfirmation.js';

export default function ConfirmEmail() {
  const { confirmEmail } = useAuth();
  const location = useLocation();
  const token = useRef('');
  const initialized = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    window.history.replaceState(window.history.state, '', '/auth/confirm');
    try { token.current = readEmailConfirmation(location.hash); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Open the latest verification email.'); }
  }, [location.hash]);
  async function verify() {
    if (busy || !token.current) return;
    setBusy(true); setError('');
    try { await confirmEmail(token.current); token.current = ''; setVerified(true); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Verification failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-dvh max-w-md bg-white px-5 py-8">
    <PayByPalmLogo />
    <h1 className="mt-8 text-2xl font-bold">{verified ? 'Email verified' : 'Verify your email'}</h1>
    <p className="mt-4 text-gray-700">{verified ? 'Your email is verified. Sign in to continue to your account.' : 'Confirm your email address to finish creating your PayByPalm account.'}</p>
    {error && <p role="alert" className="mt-4 break-words text-red-700">{error}</p>}
    {!verified && <button onClick={() => void verify()} disabled={busy || (!!error && !token.current)} className="mt-6 min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Verifying email…' : 'Verify email'}</button>}
    {verified && <p role="status" className="sr-only">Your email is verified.</p>}
    <Link className="mt-6 inline-block min-h-11 font-semibold text-blue-700" to="/login" state={{ mode: 'signin' }}>Return to sign in</Link>
  </main>;
}
