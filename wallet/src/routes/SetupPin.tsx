import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, PayByPalmLogo, PinInput } from '../components/ui.js';
import { api, loadSession } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

export default function SetupPin() {
  const { me, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me?.hasPin) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin) || pin === '1234') {
      setError('Choose four digits that are not all identical or 1234.');
      return;
    }
    if (pin !== confirmation) {
      setError('The PINs do not match. Enter the same four digits in both fields.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/me/pin', { newPin: pin });
      await refresh();
      if (!loadSession()) throw new Error('Please sign in again to continue.');
      navigate('/dashboard', { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your PIN. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-white px-5 py-8">
      <PayByPalmLogo />
      <h1 className="mt-8 text-2xl font-bold">Choose your wallet PIN</h1>
      <p className="mt-3 text-sm text-gray-600">Choose four digits to approve payments. Sign in with your email and password.</p>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <div role="group" aria-labelledby="wallet-pin-label">
          <p id="wallet-pin-label" className="mb-2 text-sm font-medium">New four-digit PIN</p>
          <PinInput value={pin} onChange={setPin} />
        </div>
        <div role="group" aria-labelledby="confirm-pin-label">
          <p id="confirm-pin-label" className="mb-2 text-sm font-medium">Confirm your PIN</p>
          <PinInput value={confirmation} onChange={setConfirmation} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button full type="submit" loading={busy} disabled={busy || pin.length !== 4 || confirmation.length !== 4}>Save wallet PIN</Button>
      </form>
      <button type="button" onClick={() => { signOut(); navigate('/login', { replace: true }); }} className="mt-8 min-h-11 text-sm font-semibold text-blue-700">Sign out</button>
    </main>
  );
}
