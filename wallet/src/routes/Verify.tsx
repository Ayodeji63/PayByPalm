/**
 * OTP Verification screen.
 *
 * Matches the design: 3D shield icon, 6-digit boxes with auto-advance,
 * masked phone number, countdown timer for resend, and NDPR privacy footer.
 *
 * SIMULATED: Any 6-digit code works. When backend adds POST /auth/verify-otp
 * with Termii, swap one function call.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { OtpInput, Button, PayByPalmLogo } from '../components/ui.js';
import { useCompleteAuth } from '../lib/auth.js';
import { PageTransition } from '../components/transitions.js';

const RESEND_SECONDS = 60;

export default function Verify() {
  const navigate = useNavigate();
  const location = useLocation();
  const completeAuth = useCompleteAuth();
  const phone = (location.state as { phone?: string } | null)?.phone ?? '+234 XXX XXXX XX';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Mask phone: +234 812 •••• 45
  const maskedPhone = maskPhone(phone);

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) return;
    setError(null);
    setBusy(true);

    try {
      // SIMULATED: any 6-digit code is accepted.
      // When backend adds POST /auth/verify-otp:
      //   await api.post('/auth/verify-otp', { pinId, pin: code });
      await new Promise((r) => setTimeout(r, 800)); // simulate network delay

      // Complete the auth flow — fetches /me and sets status to 'authenticated'
      await completeAuth();
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [code, completeAuth, navigate]);

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !busy) {
      handleVerify();
    }
  }, [code, busy, handleVerify]);

  const handleResend = () => {
    if (countdown > 0) return;
    // SIMULATED: would call POST /auth/send-otp
    setCountdown(RESEND_SECONDS);
    setCode('');
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <PayByPalmLogo />
          <div className="w-10" />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col items-center px-5">
          {/* Card container */}
          <div className="mt-4 w-full rounded-3xl bg-surface px-5 py-8">
            {/* Shield icon */}
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft/30 to-accent/20">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent-soft to-accent shadow-lg">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
                  <path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
                  <rect x="9" y="10" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 10V8a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-center text-2xl font-extrabold tracking-tight">
              Verify Your Number
            </h1>
            <p className="mt-3 text-center text-sm text-ink-muted leading-relaxed">
              We sent a 6-digit verification code<br />to {maskedPhone}
            </p>

            {/* OTP boxes */}
            <div className="mt-8">
              <OtpInput value={code} onChange={setCode} />
            </div>

            {/* Resend */}
            <div className="mt-6 text-center">
              {countdown > 0 ? (
                <p className="text-sm text-ink-muted">
                  Didn't receive a code? Resend in{' '}
                  <span className="font-semibold text-accent">
                    {minutes}:{seconds.toString().padStart(2, '0')}
                  </span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-sm font-semibold text-accent"
                >
                  Resend Code
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-danger-tint p-3 text-center text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex-1" />

          {/* Button */}
          <Button
            full
            loading={busy}
            disabled={code.length !== 6}
            onClick={handleVerify}
            className="mb-4"
          >
            Verify & Continue
          </Button>

          {/* NDPR privacy note */}
          <p className="mb-8 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Your contact details are protected under NDPR
          </p>
        </div>
      </div>
    </PageTransition>
  );
}

/** Masks a phone number: +234 812 345 6789 → +234 812 •••• 89 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;
  const last2 = digits.slice(-2);
  const prefix = digits.slice(0, -6);
  return `+${prefix} ${digits.slice(prefix.length, prefix.length + 3)} •••• ${last2}`;
}
