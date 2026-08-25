/**
 * Sign in / sign up — page 2 of 4.
 *
 * One page, two modes. Phone is the identity anchor and there is no email field;
 * Supabase Auth needs an address, so the backend derives one from the number.
 */

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { ApiError } from '../lib/api.js';
import { Button, Field, Wordmark } from '../components/ui.js';

type Mode = 'login' | 'signup';

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Only accept an internal path produced by our route guard. This preserves a
  // scanned enrolment session through sign-in without creating an open redirect.
  const requestedReturn = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo =
    typeof requestedReturn === 'string' && requestedReturn.startsWith('/')
      ? requestedReturn
      : '/dashboard';

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', pin: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function switchTo(next: Mode) {
    setMode(next);
    // Stale messages from the other mode would be confusing, and a password
    // typed for sign-in should not silently become a new account's password.
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === 'login') await signIn(form.phone, form.password);
      else await signUp(form);
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.details);
      else setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-surface px-6 pt-12 pb-10">
      <Wordmark className="text-xl text-accent" />

      <h1 className="mt-10 text-3xl font-bold tracking-tight">
        {mode === 'login' ? 'Welcome back' : 'Create your wallet'}
      </h1>
      <p className="mt-2 text-ink-muted">
        {mode === 'login' ? 'Sign in to see your balance.' : 'Takes about a minute.'}
      </p>

      {/* Segmented switch */}
      <div className="mt-7 flex rounded-2xl bg-canvas p-1">
        {(['login', 'signup'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => switchTo(option)}
            aria-pressed={mode === option}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              mode === option ? 'bg-surface text-accent' : 'text-ink-muted'
            }`}
          >
            {option === 'login' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-7 space-y-5" noValidate>
        {mode === 'signup' && (
          <Field
            label="Full name"
            autoComplete="name"
            placeholder="Ada Okonkwo"
            value={form.fullName}
            onChange={(e) => set('fullName')(e.target.value)}
            error={fieldErrors.fullName}
            required
          />
        )}

        <Field
          label="Phone number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="08010001001"
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
          error={fieldErrors.phone}
          required
        />

        <Field
          label="Password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          error={fieldErrors.password}
          required
        />

        {mode === 'signup' && (
          <Field
            label="4-digit wallet PIN"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            placeholder="••••"
            hint="Asked for at a terminal when a palm match needs a second check."
            value={form.pin}
            onChange={(e) => set('pin')(e.target.value.replace(/\D/g, '').slice(0, 4))}
            error={fieldErrors.pin}
            required
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" full loading={busy}>
          {mode === 'login' ? 'Sign in' : 'Create wallet'}
        </Button>
      </form>
    </div>
  );
}
