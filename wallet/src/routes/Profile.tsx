/**
 * Profile & Security — Full-Page User Settings & Identity.
 *
 * Includes:
 *   - Rich stylized SVG vector avatar (Male & Female presets with instant toggle)
 *   - Account verification badge & identity
 *   - Actionable Biometric Palm Status (direct CTA to /scan when not linked)
 *   - Ultra-clean realistic Payment Methods cards with bank branding, thumbnail & sanitized last4
 *   - Interactive Change 4-Digit PIN modal
 *   - Stateful Biometric App Unlock toggle
 *   - Activity Logs shortcut & confirmed Sign Out
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { getCards, type LinkedCard } from '../lib/cardStore.js';
import { findBank } from '../lib/banks.js';
import { Button, PageHeader, StatusChip, PalmIcon } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function Profile() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const cards = getCards();

  // Avatar gender preference ('male' | 'female')
  const [avatarGender, setAvatarGender] = useState<'male' | 'female'>(() => {
    try {
      return (localStorage.getItem('paybypalm.avatar_gender') as 'male' | 'female') || 'male';
    } catch {
      return 'male';
    }
  });

  const toggleAvatarGender = () => {
    const next = avatarGender === 'male' ? 'female' : 'male';
    setAvatarGender(next);
    try {
      localStorage.setItem('paybypalm.avatar_gender', next);
    } catch {
      /* noop */
    }
    toast.show(`Avatar updated to ${next === 'male' ? 'Male' : 'Female'} style.`, 'info');
  };

  // Biometric app unlock state
  const [biometricUnlock, setBiometricUnlock] = useState(() => {
    try {
      return localStorage.getItem('paybypalm.biometric_unlock') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleBiometricUnlock = () => {
    const next = !biometricUnlock;
    setBiometricUnlock(next);
    try {
      localStorage.setItem('paybypalm.biometric_unlock', String(next));
    } catch {
      /* noop */
    }
    toast.show(
      next ? 'Biometric App Unlock enabled.' : 'Biometric App Unlock disabled.',
      next ? 'success' : 'info'
    );
  };

  // Change PIN modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Sign out confirmation
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (!me) return null;

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentPin.length !== 4) {
      setPinError('Current PIN must be 4 digits.');
      return;
    }
    if (newPin.length !== 4) {
      setPinError('New PIN must be 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }

    try {
      localStorage.setItem('paybypalm.user_pin', newPin);
    } catch {
      /* noop */
    }

    toast.show('4-digit PIN updated successfully.', 'success');
    setIsPinModalOpen(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
  };

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[#f8fafc] text-slate-900 px-5 py-4 pb-28 select-none">
        <PageHeader
          title="Profile & Security"
          onBack={() => navigate('/dashboard')}
        />

        <div className="space-y-4 pt-1">
          {/* ── 1. USER IDENTITY CARD ── */}
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                User Identity
              </span>
              <StatusChip tone="success">Account Verified ✓</StatusChip>
            </div>

            <div className="mt-3 flex items-center gap-4">
              {/* Illustrated Vector Avatar */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={toggleAvatarGender}
                  title="Click to switch between male and female avatar"
                  className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full overflow-hidden shadow-md ring-2 ring-blue-500/20 active:scale-95 transition-transform"
                >
                  {avatarGender === 'male' ? <MaleAvatarIllustration /> : <FemaleAvatarIllustration />}
                </button>
                <button
                  type="button"
                  onClick={toggleAvatarGender}
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1d4ed8] text-white shadow text-[10px] font-bold hover:bg-blue-700 transition-colors"
                  title="Switch avatar style"
                >
                  ⇄
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold text-slate-900 truncate">
                  {me.fullName}
                </p>
                <p className="text-xs text-slate-500 font-semibold">{me.phone}</p>
                <button
                  type="button"
                  onClick={toggleAvatarGender}
                  className="mt-1 text-[11px] font-bold text-[#1d4ed8] hover:underline"
                >
                  Switch Avatar ({avatarGender === 'male' ? '♂ Male' : '♀ Female'})
                </button>
              </div>
            </div>
          </div>

          {/* ── 2. BIOMETRIC STATUS CARD (Actionable & Informative) ── */}
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Biometric Status</h3>
              <StatusChip tone={me.palmEnrolled ? 'success' : 'warning'}>
                {me.palmEnrolled ? 'Palm Active' : 'Not Linked'}
              </StatusChip>
            </div>

            <div className="mt-3.5 flex items-center gap-3.5">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  me.palmEnrolled ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#1d4ed8]'
                }`}
              >
                <PalmIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {me.palmEnrolled ? 'Tencent PalmAI Vector Linked' : 'Palm Vein Vector Not Linked'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {me.palmEnrolled
                    ? 'Your palm print is bound to your primary bank card for touchless terminal debits.'
                    : 'Enroll your palm print to pay at campus cafeteria and store terminals with just your hand.'}
                </p>
              </div>
            </div>

            {/* Action CTA depending on biometric status */}
            {!me.palmEnrolled ? (
              <button
                type="button"
                onClick={() => navigate('/scan')}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1d4ed8] py-2.5 px-4 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.99] transition-all"
              >
                <PalmIcon className="h-4 w-4 text-white" />
                <span>Enroll Palm Print Now</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => navigate('/scan')}
                  className="font-bold text-[#1d4ed8] hover:underline"
                >
                  Test Palm Terminal
                </button>
                <button
                  type="button"
                  onClick={() => toast.show('Contact support to unlink biometric palm template.', 'info')}
                  className="font-semibold text-rose-500 hover:text-rose-600"
                >
                  Unlink Palm
                </button>
              </div>
            )}
          </div>

          {/* ── 3. PAYMENT METHODS (Realistic Card Thumbnails) ── */}
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Payment Methods</h3>
                <p className="text-[11px] text-slate-400">Tokenized Card-on-File</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/cards')}
                className="text-xs font-bold text-[#1d4ed8] hover:underline"
              >
                Manage
              </button>
            </div>

            {cards.length > 0 ? (
              <div className="mt-3.5 space-y-2.5">
                {cards.map((card) => (
                  <PaymentCardRow
                    key={card.id}
                    card={card}
                    onClick={() => navigate('/cards')}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">No payment cards linked yet.</p>
            )}

            {/* Quick Link New Card CTA */}
            <button
              type="button"
              onClick={() => navigate('/cards?action=add')}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:border-[#1d4ed8] hover:text-[#1d4ed8] hover:bg-blue-50/30 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Link Another Bank Card</span>
            </button>
          </div>

          {/* ── 4. SECURITY SETTINGS ── */}
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
            <h3 className="text-sm font-extrabold text-slate-900">Security</h3>
            <div className="mt-2 divide-y divide-slate-100">
              {/* Change 4-Digit PIN */}
              <button
                type="button"
                onClick={() => {
                  setPinError('');
                  setIsPinModalOpen(true);
                }}
                className="flex w-full items-center justify-between py-3 text-xs font-semibold text-slate-800 hover:text-[#1d4ed8] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <span>Change 4-Digit PIN</span>
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Stateful Biometric App Unlock */}
              <div className="flex items-center justify-between py-3 text-xs font-semibold text-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <PalmIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Biometric App Unlock</p>
                    <p className="text-[10px] text-slate-400 font-normal">Require biometric scan to open wallet</p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={biometricUnlock}
                  onClick={toggleBiometricUnlock}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
                    biometricUnlock ? 'bg-[#1d4ed8]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      biometricUnlock ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Activity Logs */}
              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-xs font-semibold text-slate-800 hover:text-[#1d4ed8] transition-colors"
                onClick={() => navigate('/activity')}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </div>
                  <span>Activity & Audit Logs</span>
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── 5. SIGN OUT ── */}
          <div className="pt-2">
            {confirmSignOut ? (
              <div className="flex gap-2.5">
                <Button
                  variant="secondary"
                  full
                  onClick={() => setConfirmSignOut(false)}
                  className="!rounded-2xl !py-3 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  full
                  onClick={signOut}
                  className="!rounded-2xl !py-3 text-xs font-bold !bg-rose-600 hover:!bg-rose-700"
                >
                  Yes, Sign Out
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmSignOut(true)}
                className="w-full rounded-2xl bg-rose-50 py-3.5 text-center text-xs font-extrabold text-rose-600 hover:bg-rose-100 border border-rose-100 transition-colors"
              >
                Sign Out of PayByPalm
              </button>
            )}
          </div>
        </div>

        {/* ── 6. CHANGE PIN MODAL ── */}
        {isPinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-scale-in">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">Change 4-Digit PIN</h3>
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 font-bold flex items-center justify-center hover:bg-slate-200"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSavePin} className="mt-4 space-y-3.5">
                {pinError && (
                  <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                    {pinError}
                  </p>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700">Current 4-Digit PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="••••"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-center text-lg font-mono tracking-widest outline-none focus:border-[#1d4ed8]"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">New 4-Digit PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-center text-lg font-mono tracking-widest outline-none focus:border-[#1d4ed8]"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Confirm New PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-center text-lg font-mono tracking-widest outline-none focus:border-[#1d4ed8]"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    full
                    onClick={() => setIsPinModalOpen(false)}
                    className="!rounded-xl text-xs font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    full
                    className="!bg-[#1d4ed8] !rounded-xl text-xs font-bold !text-white"
                  >
                    Update PIN
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Miniature Realistic Payment Card Row
// ---------------------------------------------------------------------------

function PaymentCardRow({ card, onClick }: { card: LinkedCard; onClick: () => void }) {
  const bankMeta = findBank(card.bank);
  const cleanLast4 = (card.last4 || '').replace(/\D/g, '') || '9241';

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-2.5 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Miniature Bank Card Icon with genuine gradient */}
        <div
          className="relative h-9 w-14 shrink-0 rounded-lg p-1.5 shadow-xs overflow-hidden flex flex-col justify-between"
          style={{ background: bankMeta.gradient || card.theme.gradient }}
        >
          {/* Mini EMV circuit chip */}
          <div className="h-2 w-2.5 rounded-xs bg-amber-300/90 shadow-2xs" />
          {/* Scheme logo */}
          <span className="text-[7.5px] font-black uppercase text-white tracking-wider self-end opacity-90 leading-none">
            {card.cardType === 'mastercard' ? 'MC' : card.cardType === 'visa' ? 'VISA' : 'VERVE'}
          </span>
        </div>

        {/* Bank & Card Details */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-slate-900 truncate">
              {card.bank || 'Bank Card'}
            </p>
            {card.isDefault && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.2 text-[9px] font-extrabold text-emerald-700 border border-emerald-200">
                Default Palm
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 capitalize">
            {card.cardType} •••• {cleanLast4}
          </p>
        </div>
      </div>

      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Illustrated Vector Avatars (Male & Female)
// ---------------------------------------------------------------------------

function MaleAvatarIllustration() {
  return (
    <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
      {/* Background radial gradient */}
      <circle cx="50" cy="50" r="50" fill="url(#maleAvatarBg)" />
      {/* Shirt / Shoulders */}
      <path d="M20 95C20 78 33 72 50 72C67 72 80 78 80 95V100H20V95Z" fill="#1e3a8a" />
      {/* Collar / V-neck */}
      <path d="M43 72L50 82L57 72" fill="#3b82f6" />
      {/* Neck */}
      <rect x="43" y="60" width="14" height="15" rx="3" fill="#8d5524" />
      {/* Head / Face */}
      <ellipse cx="50" cy="46" rx="19" ry="22" fill="#8d5524" />
      {/* Hair (neat fade cut) */}
      <path d="M31 43C31 30 38 23 50 23C62 23 69 30 69 43C69 44 67 43 65 37C60 33 40 33 35 37C33 43 31 44 31 43Z" fill="#1c1917" />
      {/* Ears */}
      <ellipse cx="30.5" cy="46" rx="3" ry="5" fill="#783e16" />
      <ellipse cx="69.5" cy="46" rx="3" ry="5" fill="#783e16" />
      {/* Eyeglasses */}
      <rect x="36" y="42" width="11" height="8" rx="2" stroke="#0f172a" strokeWidth="1.8" fill="none" />
      <rect x="53" y="42" width="11" height="8" rx="2" stroke="#0f172a" strokeWidth="1.8" fill="none" />
      <path d="M47 45H53" stroke="#0f172a" strokeWidth="1.8" />
      {/* Friendly Smile */}
      <path d="M44 58C46 61 54 61 56 58" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <defs>
        <linearGradient id="maleAvatarBg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dbeafe" />
          <stop offset="1" stopColor="#bfdbfe" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function FemaleAvatarIllustration() {
  return (
    <svg viewBox="0 0 100 100" fill="none" className="h-full w-full">
      {/* Background radial gradient */}
      <circle cx="50" cy="50" r="50" fill="url(#femaleAvatarBg)" />
      {/* Top / Blouse */}
      <path d="M22 95C22 79 34 73 50 73C66 73 78 79 78 95V100H22V95Z" fill="#047857" />
      {/* Neck */}
      <rect x="43" y="60" width="14" height="15" rx="3" fill="#8d5524" />
      {/* Head / Face */}
      <ellipse cx="50" cy="47" rx="18" ry="21" fill="#8d5524" />
      {/* Hair (braided updo / top bun) */}
      <circle cx="50" cy="20" r="14" fill="#1c1917" />
      <path d="M30 46C30 31 38 25 50 25C62 25 70 31 70 46C70 47 67 43 65 37C60 32 40 32 35 37C33 43 30 47 30 46Z" fill="#1c1917" />
      {/* Ears & Gold Hoop Earrings */}
      <ellipse cx="31.5" cy="47" rx="2.5" ry="4.5" fill="#783e16" />
      <ellipse cx="68.5" cy="47" rx="2.5" ry="4.5" fill="#783e16" />
      <circle cx="30" cy="52" r="3.5" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
      <circle cx="70" cy="52" r="3.5" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
      {/* Eyes */}
      <ellipse cx="43" cy="45" rx="2" ry="1.2" fill="#1c1917" />
      <ellipse cx="57" cy="45" rx="2" ry="1.2" fill="#1c1917" />
      {/* Smile */}
      <path d="M44 58C46 61 54 61 56 58" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <defs>
        <linearGradient id="femaleAvatarBg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fef3c7" />
          <stop offset="1" stopColor="#fed7aa" />
        </linearGradient>
      </defs>
    </svg>
  );
}
