/**
 * Auth — Sign Up and Sign In screens.
 *
 * Premium design: white background, blue accent header with logo,
 * clean card form, vibrant "Create Account" CTA.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { Field, PinInput } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

export default function Auth() {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-white">
        {mode === 'signup' ? (
          <SignUpForm onSwitch={() => setMode('signin')} />
        ) : (
          <SignInForm onSwitch={() => setMode('signup')} />
        )}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

function SignUpForm({ onSwitch }: { onSwitch: () => void }) {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const fullPhone = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!agreed) {
      setError('Please agree to the Terms & Privacy Policy.');
      return;
    }
    if (pin.length !== 4) {
      setError('Enter a 4-digit security PIN.');
      return;
    }

    setBusy(true);
    try {
      const result = await signUp({ fullName, phone: fullPhone, password, pin });
      navigate('/verify', { state: { phone: result.phone || fullPhone }, replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details) setFieldErrors(err.details);
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const isValid = fullName && phone && password && pin.length === 4;

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Blue header band with logo */}
      <div
        className="relative overflow-hidden px-5 pb-8 pt-6"
        style={{ background: 'linear-gradient(135deg, #2851c5, #1a3a9e)' }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Logo + title */}
        <div className="flex flex-col items-center">
          <img
            src="/images/logo-white.jpg"
            alt="PayByPalm"
            className="h-14 w-14 rounded-2xl"
          />
          <span className="mt-1.5 text-lg font-bold text-white tracking-tight">PayByPalm</span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            Create Your Account
          </h1>
          <p className="mt-1.5 text-center text-sm text-white/70">
            Join thousands paying with their palm
          </p>
        </div>
      </div>

      {/* Form body — pulled up over the blue header with rounded corners */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-5 pb-8 pt-6">
        <div className="space-y-4">
          <Field
            label="Full Name"
            type="text"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={fieldErrors.fullName}
            autoComplete="name"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />
              </svg>
            }
          />

          {/* Phone with +234 prefix */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-600">Phone Number</label>
            <div className="relative flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden focus-within:border-[#2851c5] focus-within:ring-2 focus-within:ring-[#2851c5]/10 transition-all">
              <div className="flex items-center gap-1.5 border-r border-gray-200 bg-gray-100 px-3 py-3.5">
                <span className="text-sm">🇳🇬</span>
                <span className="text-sm font-semibold text-gray-600">+234</span>
              </div>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="812 345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-transparent px-4 py-3.5 text-base text-gray-900 outline-none placeholder:text-gray-400"
                autoComplete="tel"
              />
            </div>
            {fieldErrors.phone && (
              <p className="text-sm text-red-500">{fieldErrors.phone}</p>
            )}
          </div>

          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            autoComplete="new-password"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                )}
              </button>
            }
          />

          {/* 4-digit PIN */}
          <div className="space-y-2 pt-1">
            <label className="block text-sm font-semibold text-gray-700">4-Digit Security PIN</label>
            <PinInput value={pin} onChange={setPin} />
          </div>
        </div>

        {/* Terms */}
        <label className="mt-6 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded-md border-2 border-gray-300 text-[#2851c5] accent-[#2851c5]"
          />
          <span className="text-sm text-gray-500 leading-snug">
            I agree to the{' '}
            <span className="font-semibold text-[#2851c5]">Terms of Service</span> and{' '}
            <span className="font-semibold text-[#2851c5]">Privacy Policy</span>
          </span>
        </label>

        {/* Error */}
        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 p-3.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-500">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!isValid || busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all duration-200 disabled:opacity-50 disabled:shadow-none"
          style={{
            background: isValid && !busy
              ? 'linear-gradient(135deg, #2851c5, #1a3a9e)'
              : '#cbd5e1',
          }}
        >
          {busy ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            'Create Account'
          )}
        </button>

        {/* Toggle */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <button type="button" onClick={onSwitch} className="font-bold text-[#2851c5]">
            Sign In
          </button>
        </p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

function SignInForm({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fullPhone = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/dashboard';
  const isValid = phone && password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(fullPhone, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* Blue header band with logo */}
      <div
        className="relative overflow-hidden px-5 pb-10 pt-6"
        style={{ background: 'linear-gradient(135deg, #2851c5, #1a3a9e)' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex flex-col items-center">
          <img
            src="/images/logo-white.jpg"
            alt="PayByPalm"
            className="h-14 w-14 rounded-2xl"
          />
          <span className="mt-1.5 text-lg font-bold text-white tracking-tight">PayByPalm</span>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-white">
            Welcome Back
          </h1>
          <p className="mt-1.5 text-sm text-white/70">Sign in to your PayByPalm wallet</p>
        </div>
      </div>

      {/* Form body — pulled up over the blue header */}
      <div className="relative -mt-6 rounded-t-3xl bg-white px-5 pb-8 pt-6">
        <div className="space-y-4">
          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-600">Phone Number</label>
            <div className="relative flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden focus-within:border-[#2851c5] focus-within:ring-2 focus-within:ring-[#2851c5]/10 transition-all">
              <div className="flex items-center gap-1.5 border-r border-gray-200 bg-gray-100 px-3 py-3.5">
                <span className="text-sm">🇳🇬</span>
                <span className="text-sm font-semibold text-gray-600">+234</span>
              </div>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="812 345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-transparent px-4 py-3.5 text-base text-gray-900 outline-none placeholder:text-gray-400"
                autoComplete="tel"
              />
            </div>
          </div>

          <Field
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                )}
              </button>
            }
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 p-3.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-red-500">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!isValid || busy}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all duration-200 disabled:opacity-50 disabled:shadow-none"
          style={{
            background: isValid && !busy
              ? 'linear-gradient(135deg, #2851c5, #1a3a9e)'
              : '#cbd5e1',
          }}
        >
          {busy ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            'Sign In'
          )}
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <button type="button" onClick={onSwitch} className="font-bold text-[#2851c5]">
            Create Account
          </button>
        </p>
      </div>
    </form>
  );
}
