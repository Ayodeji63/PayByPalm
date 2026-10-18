/**
 * Profile & Security — Full-Page User Settings & Identity.
 *
 * Includes:
 *   - Rich stylized SVG vector avatar (Male & Female presets with instant toggle)
 *   - Account verification badge & identity
 *   - Actionable Biometric Palm Status (direct CTA to /scan when not linked)
 *   - Ultra-clean realistic Payment Methods cards with bank branding, thumbnail & sanitized last4
 *   - Availability notice for unsupported security settings
 *   - Activity Logs shortcut & confirmed Sign Out
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { type LinkedCard } from '../lib/cardStore.js';
import { useServerCards } from '../lib/serverCards.js';
import { findBank } from '../lib/banks.js';
import { Button, PageHeader, StatusChip } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { InstallWallet } from '../components/InstallWallet.js';
import { useToast } from '../components/Toast.js';
import { PalmLinkStatus } from '../components/PalmLinkStatus.js';

export default function Profile() {
  const { me, signOut, refresh, consentGiven, setConsentGiven } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const cards = useServerCards();

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

  // Sign out confirmation
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (!me) return null;

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[#f8fafc] text-slate-900 px-5 py-4 pb-28 select-none">
        <PageHeader
          title="Profile & Security"
          onBack={() => navigate('/dashboard')}
        />

        <div className="space-y-4 pt-1">
          <InstallWallet />
          {/* ── 1. USER IDENTITY CARD ── */}
          <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                User Identity
              </span>
              <StatusChip tone="success">Email verified</StatusChip>
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
                <p className="text-xs text-slate-500 font-semibold">{me.phone || 'No phone number added'}</p>
                <p className="break-all text-xs text-slate-500">{me.email}</p>
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

          <PalmLinkStatus linked={me.palmEnrolled} onEnroll={() => navigate(consentGiven ? '/scan' : '/consent')}
            onUnlinked={async () => { setConsentGiven(false); await refresh(); }} />

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
              <p className="py-3 text-xs text-slate-600">
                PIN changes and biometric app unlock are currently unavailable.
                Sign out when you finish using a shared device.
              </p>

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

      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Miniature Realistic Payment Card Row
// ---------------------------------------------------------------------------

function PaymentCardRow({ card, onClick }: { card: LinkedCard; onClick: () => void }) {
  const bankMeta = findBank(card.bank);
  const cleanLast4 = card.last4;

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
                Default card
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
