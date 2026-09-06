/**
 * BankCard — Ultra-Realistic Nigerian Bank Card Component.
 *
 * Supports ALL licensed Nigerian commercial banks, digital neobanks, and MFBs:
 * - Zenith Bank, GTBank, Kuda Bank, Access Bank, FirstBank, UBA, OPay, Moniepoint,
 *   Stanbic IBTC, Fidelity, Wema/ALAT, PalmPay, FCMB, Union Bank, Sterling, Polaris, etc.
 *
 * Includes:
 * - Realistic EMV metallic chip with microcircuit pads
 * - EMV Contactless radio waves
 * - Embossed/laser-engraved card numbers with Farrington 7B styling
 * - Authentic Visa, Mastercard, and Verve vector logos
 * - Subtle PayByPalm contactless biometric indicator
 */

import React from 'react';
import { PalmIcon } from './ui.js';
import { findBank } from '../lib/banks.js';

export interface BankCardProps {
  bankKey?: string;
  bankName: string;
  cardName?: string;
  scheme: 'mastercard' | 'visa' | 'verve';
  cardNumber: string;
  last4: string;
  holderName: string;
  expiry: string;
  isPaused?: boolean;
  isDefault?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  showPalmBadge?: boolean;
}

export function BankCard({
  bankKey,
  bankName,
  scheme,
  cardNumber,
  last4,
  holderName,
  expiry,
  isPaused = false,
  isDefault = false,
  className = '',
  style = {},
  onClick,
  showPalmBadge = true,
}: BankCardProps) {
  const bank = findBank(bankKey || bankName);
  const normalizedBank = (bankKey || bankName || bank.key).toLowerCase();

  const isZenith = normalizedBank.includes('zenith');
  const isGTBank = normalizedBank.includes('gt');
  const isKuda = normalizedBank.includes('kuda');
  const isAccess = normalizedBank.includes('access');
  const isFirstBank = normalizedBank.includes('first');
  const isUBA = normalizedBank.includes('uba');
  const isOPay = normalizedBank.includes('opay');
  const isMoniepoint = normalizedBank.includes('monie');
  const isStanbic = normalizedBank.includes('stanbic');
  const isFidelity = normalizedBank.includes('fidelity');
  const isWema = normalizedBank.includes('wema') || normalizedBank.includes('alat');
  const isPalmPay = normalizedBank.includes('palmpay');

  // Format 16 digits into 4 groups of 4
  const formattedNumber = formatCardNumber(cardNumber, last4);

  return (
    <div
      onClick={onClick}
      className={`relative h-[215px] w-full max-w-[360px] rounded-2xl p-5 text-white shadow-xl transition-all select-none overflow-hidden ${className}`}
      style={{
        background: bank.gradient,
        boxShadow: `0 16px 32px -8px ${bank.primaryColor}55, 0 6px 12px -2px rgba(0,0,0,0.4)`,
        ...style,
      }}
    >
      {/* Texture / Material Overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-15 mix-blend-overlay bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.8),transparent_70%)]" />

      {/* Specific Bank Background Graphic Embellishments */}
      {isZenith && <ZenithGraphics />}
      {isGTBank && <GTBankGraphics />}
      {isKuda && <KudaGraphics />}
      {isAccess && <AccessGraphics />}
      {isFirstBank && <FirstBankGraphics />}
      {isUBA && <UBAGraphics />}
      {isOPay && <OPayGraphics />}
      {isMoniepoint && <MoniepointGraphics />}
      {isStanbic && <StanbicGraphics />}
      {isFidelity && <FidelityGraphics />}
      {isWema && <WemaGraphics />}
      {isPalmPay && <PalmPayGraphics />}

      {/* Paused Card Overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-slate-950/85 backdrop-blur-xs">
          <div className="flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300 ring-1 ring-rose-500/50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            PAUSED
          </div>
          <p className="mt-1 text-[11px] text-white/70 font-medium">Palm payments disabled</p>
        </div>
      )}

      {/* ─── CARD TOP ROW: Real Bank Logo + Debit / Scheme Type ─── */}
      <div className="relative z-10 flex items-start justify-between">
        {/* Bank Brand Logo */}
        <div className="flex items-center gap-2">
          {isZenith && <ZenithLogo />}
          {isGTBank && <GTBankLogo />}
          {isKuda && <KudaLogo />}
          {isAccess && <AccessLogo />}
          {isFirstBank && <FirstBankLogo />}
          {isUBA && <UBALogo />}
          {isOPay && <OPayLogo />}
          {isMoniepoint && <MoniepointLogo />}
          {isStanbic && <StanbicLogo />}
          {isFidelity && <FidelityLogo />}
          {isWema && <WemaLogo />}
          {isPalmPay && <PalmPayLogo />}
          {!isZenith &&
            !isGTBank &&
            !isKuda &&
            !isAccess &&
            !isFirstBank &&
            !isUBA &&
            !isOPay &&
            !isMoniepoint &&
            !isStanbic &&
            !isFidelity &&
            !isWema &&
            !isPalmPay && (
              <GenericBankLogo name={bankName || bank.short} />
            )}
        </div>

        {/* Top Right: Debit indicator & subtle PayByPalm biometric dot */}
        <div className="flex items-center gap-2">
          {isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/40 backdrop-blur-xs uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Default Palm
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            DEBIT
          </span>
        </div>
      </div>

      {/* ─── CARD MIDDLE ROW: Realistic EMV Chip & Contactless Waves ─── */}
      <div className="relative z-10 mt-3.5 flex items-center justify-between">
        {/* Physical EMV Microchip */}
        <EmvChip isGold={!isKuda && !isUBA && !isOPay} />

        {/* Contactless Waves & Discreet Biometric Palm Wave */}
        <div className="flex items-center gap-1.5 text-white/75">
          {showPalmBadge && (
            <div className="flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-0.5 backdrop-blur-xs" title="PayByPalm Enabled">
              <PalmIcon className="h-3 w-3 text-white" />
              <span className="text-[8px] font-bold tracking-wider text-white/90">PALM</span>
            </div>
          )}
          {/* EMV Contactless Symbol */}
          <ContactlessWaveIcon className="h-5 w-5 text-white/80" />
        </div>
      </div>

      {/* ─── CARD NUMBER: Embossed / Laser Banking Typography ─── */}
      <div className="relative z-10 mt-3">
        <p
          className="font-mono text-[18px] sm:text-[19px] font-bold tracking-[0.2em] text-white/95 leading-none"
          style={{
            textShadow: '0 1px 2px rgba(0,0,0,0.85), 0 -1px 1px rgba(255,255,255,0.2)',
          }}
        >
          {formattedNumber}
        </p>
      </div>

      {/* ─── CARD BOTTOM ROW: Holder, Expiry & Scheme Logo ─── */}
      <div className="relative z-10 mt-3 flex items-end justify-between">
        {/* Cardholder Name */}
        <div className="min-w-0 pr-2">
          <p className="text-[8px] font-bold uppercase tracking-widest text-white/50 leading-none">
            CARD HOLDER
          </p>
          <p
            className="mt-1 font-mono text-xs font-bold uppercase tracking-wider text-white truncate max-w-[155px]"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
          >
            {holderName || 'CARD HOLDER'}
          </p>
        </div>

        {/* Expiry Date */}
        <div className="text-center px-2">
          <p className="text-[8px] font-bold uppercase tracking-widest text-white/50 leading-none">
            VALID THRU
          </p>
          <p
            className="mt-1 font-mono text-xs font-bold text-white tracking-wider"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
          >
            {expiry || '12/28'}
          </p>
        </div>

        {/* Authentic Scheme Brand Logo */}
        <div className="flex items-center shrink-0">
          {scheme === 'mastercard' && <MastercardLogo />}
          {scheme === 'visa' && <VisaLogo />}
          {scheme === 'verve' && <VerveLogo />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank Decorative Embellishments
// ---------------------------------------------------------------------------

function ZenithGraphics() {
  return (
    <>
      <svg className="pointer-events-none absolute -right-6 -bottom-8 h-[240px] w-[180px] opacity-80" viewBox="0 0 200 240" fill="none">
        <path d="M60 0L200 0V240L20 240C70 190 140 120 60 0Z" fill="url(#zenithCrimsonGrad)" />
        <defs>
          <linearGradient id="zenithCrimsonGrad" x1="0" y1="0" x2="200" y2="240" gradientUnits="userSpaceOnUse">
            <stop stopColor="#e11d48" />
            <stop offset="0.7" stopColor="#be123c" />
            <stop offset="1" stopColor="#881337" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) 1px, transparent 0, transparent 8px)' }} />
    </>
  );
}

function GTBankGraphics() {
  return (
    <>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#ff5a00] to-[#e03a00] shadow-[-2px_0_10px_rgba(255,90,0,0.4)]" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full opacity-20 blur-2xl" style={{ background: '#ff5a00' }} />
    </>
  );
}

function KudaGraphics() {
  return (
    <>
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-20" style={{ border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 0 40px rgba(168,85,247,0.3)' }} />
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 rounded-full opacity-15" style={{ border: '1px solid rgba(255,255,255,0.4)' }} />
    </>
  );
}

function AccessGraphics() {
  return (
    <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 opacity-25">
      <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
        <path d="M50 0L100 50L50 100L0 50Z" stroke="#f97316" strokeWidth="6" />
        <path d="M50 20L80 50L50 80L20 50Z" stroke="#38bdf8" strokeWidth="4" />
      </svg>
    </div>
  );
}

function FirstBankGraphics() {
  return (
    <div className="pointer-events-none absolute right-4 bottom-4 h-32 w-32 rounded-full opacity-10 blur-xl" style={{ background: '#d97706' }} />
  );
}

function UBAGraphics() {
  return (
    <div className="pointer-events-none absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-gradient-to-br from-[#c8102e] to-[#7f091c] opacity-60 blur-lg" />
  );
}

function OPayGraphics() {
  return (
    <div className="pointer-events-none absolute -right-12 -bottom-12 h-44 w-44 rounded-full border-4 border-emerald-400/20 opacity-30" />
  );
}

function MoniepointGraphics() {
  return (
    <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-2.5 bg-gradient-to-b from-[#38bdf8] to-[#003399]" />
  );
}

function StanbicGraphics() {
  return (
    <div className="pointer-events-none absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-blue-400/10 blur-xl" />
  );
}

function FidelityGraphics() {
  return (
    <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-2 bg-[#00a86b]" />
  );
}

function WemaGraphics() {
  return (
    <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-fuchsia-500/20 blur-xl" />
  );
}

function PalmPayGraphics() {
  return (
    <div className="pointer-events-none absolute -right-6 -bottom-6 h-36 w-36 rounded-full bg-indigo-500/25 blur-lg" />
  );
}

// ---------------------------------------------------------------------------
// Authentic Bank Logos
// ---------------------------------------------------------------------------

function ZenithLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e11d48] shadow-sm ring-1 ring-white/30">
        <span className="font-serif text-base font-black italic text-white tracking-tighter">Z</span>
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="font-sans text-sm font-black tracking-wider text-white">ZENITH</span>
          <span className="text-[9px] font-bold text-slate-300 tracking-tight">BANK</span>
        </div>
        <p className="text-[7px] font-semibold text-slate-400 tracking-widest leading-none -mt-0.5">PEOPLE FIRST</p>
      </div>
    </div>
  );
}

function GTBankLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ff5a00] shadow-sm ring-1 ring-white/30">
        <span className="font-sans text-xs font-black text-white tracking-tight">GT</span>
      </div>
      <div>
        <p className="font-sans text-xs font-extrabold text-white tracking-wide leading-tight">Guaranty Trust</p>
        <p className="text-[8px] font-medium text-slate-400 tracking-wider leading-none">Bank</p>
      </div>
    </div>
  );
}

function KudaLogo() {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="font-sans text-lg font-black tracking-tight text-white lowercase">kuda</span>
      <span className="h-1.5 w-1.5 rounded-full bg-[#38bdf8]" />
      <span className="ml-1 text-[9px] font-bold tracking-wider text-purple-200/80 uppercase">Bank</span>
    </div>
  );
}

function AccessLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L22 12L12 22L2 12Z" fill="#f97316" />
        <path d="M12 6L18 12L12 18L6 12Z" fill="#0284c7" />
      </svg>
      <span className="font-sans text-sm font-black tracking-tight text-white lowercase">access</span>
      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Bank</span>
    </div>
  );
}

function FirstBankLogo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400/50">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fbbf24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
          <path d="M8 14c1.5-2 4-2 6 0M9 10h.01M15 10h.01" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <span className="font-sans text-xs font-black tracking-wide text-white">FirstBank</span>
        <p className="text-[7px] font-semibold text-amber-300/80 tracking-widest leading-none">SINCE 1894</p>
      </div>
    </div>
  );
}

function UBALogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-6 w-9 items-center justify-center rounded bg-[#c8102e] px-1 shadow-sm">
        <span className="font-sans text-xs font-black tracking-wider text-white">UBA</span>
      </div>
      <span className="text-[9px] font-bold text-slate-300 tracking-wider uppercase">Africa</span>
    </div>
  );
}

function OPayLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00b875] text-white font-black text-sm ring-2 ring-white/40 shadow-sm">
        O
      </div>
      <div>
        <span className="font-sans text-sm font-black tracking-tight text-white">OPay</span>
        <span className="ml-1 text-[8px] font-bold text-emerald-200 uppercase">MFB</span>
      </div>
    </div>
  );
}

function MoniepointLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#003399] border border-blue-400/40 text-white font-black text-sm shadow-sm">
        M
      </div>
      <div>
        <span className="font-sans text-xs font-black tracking-tight text-white">Moniepoint</span>
        <p className="text-[7px] font-semibold text-blue-200 tracking-wider leading-none">MFB</p>
      </div>
    </div>
  );
}

function StanbicLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-6 w-7 items-center justify-center rounded bg-[#0033aa] border border-white/30 text-white font-bold text-xs">
        IBTC
      </div>
      <span className="font-sans text-xs font-extrabold text-white tracking-wide">Stanbic</span>
    </div>
  );
}

function FidelityLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-5 w-5 rounded-full bg-gradient-to-r from-[#004b87] to-[#00a86b] ring-1 ring-white/40" />
      <span className="font-sans text-xs font-black text-white tracking-wide">Fidelity</span>
    </div>
  );
}

function WemaLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#93186c] text-white font-black text-xs ring-1 ring-white/40">
        W
      </div>
      <div>
        <span className="font-sans text-xs font-black text-white">Wema</span>
        <span className="ml-1 rounded bg-fuchsia-600 px-1 py-0.2 text-[8px] font-bold text-white uppercase">ALAT</span>
      </div>
    </div>
  );
}

function PalmPayLogo() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2a4bff] text-white font-black text-xs ring-1 ring-white/40">
        P
      </div>
      <span className="font-sans text-xs font-black text-white">PalmPay</span>
    </div>
  );
}

function GenericBankLogo({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-xs text-white font-black text-xs border border-white/30 shadow-sm">
        {initials || 'NB'}
      </div>
      <span className="font-sans text-xs font-black tracking-wide text-white uppercase truncate max-w-[140px]">
        {name}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Realistic EMV Metallic Microchip
// ---------------------------------------------------------------------------

function EmvChip({ isGold = true }: { isGold?: boolean }) {
  const bgGrad = isGold
    ? 'linear-gradient(135deg, #fef08a 0%, #eab308 40%, #ca8a04 70%, #a16207 100%)'
    : 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 45%, #94a3b8 100%)';

  const trackBorder = isGold ? 'rgba(113, 63, 18, 0.4)' : 'rgba(71, 85, 105, 0.45)';

  return (
    <div
      className="relative h-8 w-11 rounded-md p-0.5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.6),0_2px_4px_rgba(0,0,0,0.35)] ring-1 ring-black/30 overflow-hidden"
      style={{ background: bgGrad }}
    >
      <div
        className="h-full w-full rounded-[4px] relative"
        style={{ border: `1px solid ${trackBorder}` }}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px]" style={{ background: trackBorder }} />
        <div className="absolute top-0 bottom-0 left-[35%] w-[1px]" style={{ background: trackBorder }} />
        <div className="absolute top-0 bottom-0 right-[35%] w-[1px]" style={{ background: trackBorder }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-4 rounded-sm" style={{ border: `1px solid ${trackBorder}` }} />
      </div>
    </div>
  );
}

function ContactlessWaveIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8.5 16.5a5 5 0 0 1 0-9" />
      <path d="M12 19a8.5 8.5 0 0 0 0-14" />
      <path d="M15.5 21.5a12 12 0 0 0 0-19" />
    </svg>
  );
}

export function VisaLogo({ className = 'h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 78 24" fill="none" className={className}>
      <path
        d="M29.5 2L20.8 22H15.1L9.2 6.8C8.8 5.4 8.5 4.9 7.4 4.3C5.5 3.3 2.6 2.4 0 1.8L0.2 0.9H10.7C12.1 0.9 13.3 1.8 13.6 3.4L16.2 16.9L23.7 0.9H29.5V2ZM55.5 15.2C55.5 9.4 47.4 9.1 47.5 6.5C47.5 5.7 48.3 4.9 50 4.7C50.9 4.6 53.3 4.5 55.6 5.6L56.6 0.9C55.2 0.4 53.4 0 51.1 0C44.9 0 40.5 3.3 40.4 8.1C40.3 11.6 43.5 13.6 45.9 14.8C48.4 16 49.2 16.8 49.2 17.9C49.2 19.6 47.2 20.3 45.3 20.3C42.1 20.3 40.2 19.8 38.3 18.9L37.2 23.8C39 24.6 42.3 25.3 45.8 25.3C52.4 25.3 56.6 22 56.7 17.1M72.2 22H77.2L72.9 0.9H68.3C67.3 0.9 66.5 1.5 66.1 2.4L56.5 22H62.5L63.7 18.7H71L72.2 22ZM65.4 14.2L68.4 6.2L70.1 14.2H65.4ZM38.9 0.9L34.2 22H28.7L33.4 0.9H38.9Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function MastercardLogo({ className = 'h-7' }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <svg width="40" height="26" viewBox="0 0 40 26" fill="none">
        <circle cx="13" cy="13" r="13" fill="#eb001b" />
        <circle cx="27" cy="13" r="13" fill="#f79e1b" fillOpacity="0.9" />
        <path d="M20 2.87a12.98 12.98 0 0 1 0 20.26 12.98 12.98 0 0 1 0-20.26z" fill="#ff5f00" />
      </svg>
    </div>
  );
}

export function VerveLogo({ className = 'h-5' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 rounded bg-[#008272] px-2 py-0.5 shadow-sm ${className}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M4 4L12 20L20 4" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-sans text-[10px] font-black tracking-widest text-white uppercase">VERVE</span>
    </div>
  );
}

function formatCardNumber(rawNumber: string, last4: string): string {
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length === 16) {
    return `${digits.slice(0, 4)}  ${digits.slice(4, 8)}  ${digits.slice(8, 12)}  ${digits.slice(12, 16)}`;
  }
  return `••••  ••••  ••••  ${last4 || '1517'}`;
}
