import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PayByPalmLogo } from '../components/ui.js';
import { useAuth } from '../lib/auth.js';
import { readEmailConfirmation } from '../lib/emailConfirmation.js';

export default function ConfirmEmail() {
  const { confirmEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const lastHash = useRef<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const hash = location.hash;
    if (lastHash.current === hash) return; // Avoid duplicate StrictMode exchanges.
    lastHash.current = hash;
    setError('');
    window.history.replaceState(window.history.state, '', '/auth/confirm');
    void (async () => {
      try {
        await confirmEmail(readEmailConfirmation(hash));
        if (lastHash.current !== hash) return;
        navigate('/dashboard', { replace: true }); // Guard routes new users to PIN setup.
      } catch (failure) {
        if (lastHash.current !== hash) return;
        setError(failure instanceof Error ? failure.message : 'Unable to confirm your email. Please sign in again.');
      }
    })();
  }, [confirmEmail, navigate, location.hash]);
  return <main className="mx-auto min-h-dvh max-w-md bg-white px-5 py-8">
    <PayByPalmLogo />
    <h1 className="mt-8 text-2xl font-bold">{error ? 'Unable to finish verification' : 'Confirming your email'}</h1>
    {error ? <><p role="alert" className="mt-4 text-gray-700">{error}</p><Link className="mt-6 inline-block min-h-11 font-semibold text-blue-700" to="/login" state={{ mode: 'signin' }}>Return to sign in</Link></> : <p role="status" className="mt-4 text-gray-700">Checking your confirmation link…</p>}
  </main>;
}
