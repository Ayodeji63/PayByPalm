/**
 * Biometric Security & Consent Screen.
 *
 * Provides cryptographic guarantees and privacy safeguards before the user
 * proceeds to palm scanning:
 *   1. Zero photo storage (raw camera frames deleted after vector extraction)
 *   2. One-way AES-256 hash encryption
 *   3. Right to revoke or unlink anytime
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { Button, PageHeader, PalmIcon } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

const GUARANTEES = [
  {
    number: 1,
    title: 'Zero Photo Storage',
    description: 'Raw camera images are discarded immediately after cryptographic vector extraction. No photos stored.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
        <path d="M2 2l20 20" strokeWidth="2.2" />
      </svg>
    ),
  },
  {
    number: 2,
    title: 'One-Way Cryptographic Vectors',
    description: 'Palm templates are irreversible mathematical hashes (AES-256). They cannot be reconstructed into your physical hand.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    number: 3,
    title: 'Right to Revoke Anytime',
    description: 'Unlink your biometric profile or change your default payment card with one tap in wallet settings.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[#f8fafc] text-slate-900 px-5 pt-4 pb-8 select-none">
        <PageHeader title="Biometric Security & Privacy" />

        <div className="flex flex-col">
          {/* Glowing Shield & Biometric Palm Visual */}
          <div className="relative my-4 flex justify-center items-center">
            <div className="absolute h-36 w-36 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-[#1d4ed8] to-[#2563eb] text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-100">
              <PalmIcon className="h-12 w-12" />
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center px-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Your Privacy Is Protected
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
              How PayByPalm protects your biometric palm data with bank-grade encryption:
            </p>
          </div>

          {/* Privacy Guarantee Cards */}
          <div className="mt-5 space-y-2.5">
            {GUARANTEES.map((g) => (
              <div key={g.number} className="flex items-start gap-3 rounded-2xl bg-white p-3.5 border border-slate-100 shadow-sm">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                  {g.icon}
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">
                    {g.number}. {g.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
                    {g.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Consent Checkbox */}
          <label className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3.5 border border-slate-200/80 shadow-sm cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded-md border-slate-300 text-[#1d4ed8] focus:ring-[#1d4ed8]"
            />
            <span className="text-xs font-bold text-slate-800">
              I consent to biometric template creation and contactless payment authorization
            </span>
          </label>

          {/* Action Button */}
          <div className="mt-6">
            <Button
              full
              disabled={!agreed}
              onClick={handleAgree}
              className="!bg-[#1d4ed8] disabled:!bg-slate-300 hover:!bg-blue-700 !text-white !py-4 shadow-lg shadow-blue-500/25 !rounded-2xl text-base font-bold"
            >
              Agree & Continue to Link Palm
            </Button>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Protected by Nigeria Data Protection Act (NDPA) compliance
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
