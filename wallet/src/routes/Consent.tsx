/**
 * Biometric Security & Consent screen.
 *
 * Matches the design: shield+palm icon, 3 privacy guarantee cards,
 * consent checkbox, and "Agree & Continue to Scan" button.
 * Stores consent in localStorage. /scan redirects here if not consented.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { Button, PageHeader } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

const GUARANTEES = [
  {
    number: 1,
    title: 'Zero Photo Storage',
    description: 'Raw images are discarded immediately after cryptographic vector extraction',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
        <path d="M2 2l20 20" strokeWidth="2" />
      </svg>
    ),
  },
  {
    number: 2,
    title: 'One-Way Encryption',
    description: 'Biometric templates cannot be reverse-engineered into physical palm prints',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    number: 3,
    title: 'Right to Revoke',
    description: 'Unlink your biometric profile or delete all records with one tap anytime',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6L6 18M6 6l12 12" />
        <path d="M15 3h6v6M9 21H3v-6" />
      </svg>
    ),
  },
];

export default function Consent() {
  const navigate = useNavigate();
  const { setConsentGiven } = useAuth();
  const [agreed, setAgreed] = useState(false);

  function handleAgree() {
    setConsentGiven(true);
    navigate('/scan', { replace: true });
  }

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-canvas">
        <div className="px-5">
          <PageHeader title="Biometric Security & Consent" />
        </div>

        <div className="flex flex-col px-5 pb-8">
          {/* Shield + palm icon */}
          <div className="mx-auto mt-2 flex h-28 w-28 items-center justify-center">
            <div className="relative">
              {/* Shield */}
              <svg width="80" height="90" viewBox="0 0 80 90" fill="none">
                <path
                  d="M40 5L10 20v25c0 22 15 36 30 40 15-4 30-18 30-40V20L40 5z"
                  fill="url(#shield-gradient)"
                  stroke="#3b68e8"
                  strokeWidth="2"
                />
                <defs>
                  <linearGradient id="shield-gradient" x1="10" y1="5" x2="70" y2="90">
                    <stop offset="0%" stopColor="#6b8ef0" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b68e8" stopOpacity="0.15" />
                  </linearGradient>
                </defs>
              </svg>
              {/* Palm overlay */}
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent">
                <path
                  d="M12 21c-3.9 0-6-2.6-6-6v-3.5M6 11.5V8a1.2 1.2 0 1 1 2.4 0v2M8.4 10V5.2a1.2 1.2 0 1 1 2.4 0V10M10.8 10V4.7a1.2 1.2 0 1 1 2.4 0V10M13.2 10V6a1.2 1.2 0 1 1 2.4 0v6.5c0 4.2-1.4 5.5-3.6 5.5"
                  stroke="#0f9d58"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="mt-4 text-center text-2xl font-extrabold tracking-tight">
            Your Privacy Is Protected
          </h1>
          <p className="mt-2 text-center text-sm text-ink-muted leading-relaxed">
            Understand how PayByPalm processes your biometric palm data safely:
          </p>

          {/* Guarantee cards */}
          <div className="mt-6 space-y-3 stagger">
            {GUARANTEES.map((g) => (
              <div key={g.number} className="flex items-start gap-4 rounded-2xl bg-surface p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-tint text-accent">
                  {g.icon}
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {g.number}) {g.title}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    {g.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Consent checkbox */}
          <label className="mt-6 flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded-md border-2 border-hairline text-accent accent-accent"
            />
            <span className="text-sm text-ink">
              I consent to biometric payment processing
            </span>
          </label>

          {/* Button */}
          <Button
            full
            disabled={!agreed}
            onClick={handleAgree}
            className="mt-6"
          >
            Agree & Continue to Scan
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
