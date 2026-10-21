import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PayByPalmLogo } from '../components/ui.js';
import { useAuth } from '../lib/auth.js';

export default function Verify() {
  const location = useLocation();
  const { resendConfirmation } = useAuth();
  const state = location.state as { email?: string; emailSent?: boolean } | null;
  const email = state?.email ?? '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [countdown, setCountdown] = useState(state?.emailSent === false ? 0 : 60);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);
  async function resend() {
    if (busy || countdown > 0) return;
    setBusy(true); setError(null); setNotice('');
    try { await resendConfirmation(email); setCountdown(60); setNotice('A new confirmation link has been sent. Check your inbox.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send a new link. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-dvh max-w-md bg-white px-5 py-8">
    <PayByPalmLogo />
    <h1 className="mt-8 text-2xl font-bold">Check your email</h1>
    {!email ? <p className="mt-4">Start registration or sign in to request a confirmation link.</p> : <div className="mt-4 space-y-6">
      <p className="break-words text-gray-700">{state?.emailSent === false ? 'Confirm your email address to continue: ' : 'We sent a confirmation link to '}{email}.</p>
      <p className="text-sm text-gray-600">Open the email, select the verification link, then choose “Verify email”. After verification, sign in to continue. Check your spam folder if you cannot find it.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      <button type="button" onClick={() => void resend()} disabled={busy || countdown > 0} className="min-h-11 text-sm font-semibold text-blue-700 disabled:text-gray-500">{busy ? 'Sending link…' : countdown > 0 ? `Resend link in ${countdown}s` : 'Resend confirmation link'}</button>
    </div>}
    <Link className="mt-8 inline-block text-sm font-semibold text-blue-700" to="/login" state={{ mode: 'signin' }}>Return to sign in</Link>
  </main>;
}
