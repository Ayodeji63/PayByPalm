/**
 * Profile & Security — full-page profile screen.
 *
 * Matches the design: user identity card with avatar and verified badge,
 * biometric status, payment methods from cardStore, security settings,
 * and sign-out button.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { getCards } from '../lib/cardStore.js';
import { Button, PageHeader, StatusChip, PalmIcon } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function Profile() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const cards = getCards();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (!me) return null;

  const initials = me.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <PageTransition>
      <div className="px-5 py-2">
        <PageHeader title="Profile & Security" />

        <div className="space-y-4 stagger">
          {/* User identity card */}
          <div className="rounded-3xl bg-surface p-5">
            <div className="flex justify-end">
              <StatusChip tone="success">Account Verified ✓</StatusChip>
            </div>
            <div className="mt-2 flex items-center gap-4">
              {/* Avatar */}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-tint text-accent text-xl font-bold">
                {initials}
              </div>
              <div>
                <p className="text-lg font-bold">{me.fullName}</p>
                <p className="text-sm text-ink-muted">{me.phone}</p>
              </div>
            </div>
          </div>

          {/* Biometric status */}
          <div className="rounded-3xl bg-surface p-5">
            <h3 className="text-base font-bold">Biometric Status</h3>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-tint">
                <PalmIcon className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {me.palmEnrolled ? 'Palm Vector Linked' : 'Not Linked'}
                </p>
                {me.palmEnrolled && (
                  <p className="text-xs text-ink-muted">(Tencent PalmAI)</p>
                )}
              </div>
            </div>
            {me.palmEnrolled && (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-danger"
                onClick={() => toast.show('Contact support to unlink palm', 'info')}
              >
                Unlink Palm
              </button>
            )}
          </div>

          {/* Payment methods */}
          <div className="rounded-3xl bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Payment Methods</h3>
              <button
                type="button"
                onClick={() => navigate('/cards')}
                className="text-sm font-semibold text-accent"
              >
                Manage
              </button>
            </div>
            {cards.length > 0 ? (
              <div className="mt-3 space-y-2">
                {cards.map((card) => (
                  <div key={card.id} className="flex items-center gap-3">
                    <CardBrandBadge brand={card.cardType} />
                    <span className="numeric text-sm text-ink-muted">•••• {card.last4}</span>
                    {card.isDefault && (
                      <span className="text-[10px] rounded-full bg-accent-tint text-accent px-2 py-0.5 font-medium">Default</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">No cards linked</p>
            )}
          </div>

          {/* Security */}
          <div className="rounded-3xl bg-surface p-5">
            <h3 className="text-base font-bold">Security</h3>
            <div className="mt-3 divide-y divide-hairline">
              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-sm"
                onClick={() => toast.show('PIN change coming soon', 'info')}
              >
                <span>Change 4-Digit PIN</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              <div className="flex items-center justify-between py-3">
                <span className="text-sm">Biometric App Unlock</span>
                <div className="relative h-7 w-12 rounded-full bg-accent">
                  <span className="absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-white shadow" />
                </div>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between py-3 text-sm"
                onClick={() => navigate('/activity')}
              >
                <span>Activity Logs</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sign out */}
          {confirmSignOut ? (
            <div className="flex gap-3">
              <Button variant="secondary" full onClick={() => setConfirmSignOut(false)}>
                Cancel
              </Button>
              <Button variant="danger" full onClick={signOut}>
                Yes, Sign Out
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              full
              onClick={() => setConfirmSignOut(true)}
            >
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function CardBrandBadge({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  return (
    <div className="flex h-8 w-12 items-center justify-center rounded-md border border-hairline bg-canvas text-[10px] font-bold uppercase text-ink-muted">
      {b.includes('visa') ? 'VISA' : b.includes('master') ? 'MC' : brand.slice(0, 4)}
    </div>
  );
}
