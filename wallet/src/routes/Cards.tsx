/**
 * Cards — Google Wallet-style card stack.
 *
 * Shows palm biometric card + linked bank cards from localStorage.
 * Tap to see details, swipe/tap to remove. Add card button at bottom.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { getCards, removeCard, type LinkedCard } from '../lib/cardStore.js';
import { PalmIcon, StatusChip, PageHeader } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function Cards() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cards, setCards] = useState<LinkedCard[]>(getCards);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleRemove = (id: string) => {
    removeCard(id);
    setCards(getCards());
    setConfirmDelete(null);
    toast.show('Card removed.', 'info');
  };

  return (
    <PageTransition>
      <div className="px-5 py-2">
        <PageHeader title="My Cards" />

        <div className="mt-2 space-y-4 stagger">
          {/* Palm Biometric Card */}
          <div className="wallet-card-gradient relative overflow-hidden rounded-3xl p-6 text-white">
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                <PalmIcon className="h-7 w-7" />
              </div>
              <StatusChip tone={me?.palmEnrolled ? 'success' : 'warning'}>
                {me?.palmEnrolled ? 'Active' : 'Not Linked'}
              </StatusChip>
            </div>

            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider opacity-60">Biometric ID</p>
              <p className="mt-1 text-lg font-bold">Palm Biometric Card</p>
            </div>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-xs opacity-60">Holder</p>
                <p className="text-sm font-medium">{me?.fullName ?? '—'}</p>
              </div>
              {me?.palmEnrolled && (
                <div className="text-right">
                  <p className="text-xs opacity-60">Active Since</p>
                  <p className="text-sm font-medium">
                    {me?.createdAt
                      ? new Date(me.createdAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Linked bank cards */}
          {cards.map((card) => (
            <div key={card.id} className="relative rounded-3xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-50">{card.bank || 'Bank Card'}</p>
                  <p className="mt-1 text-lg font-bold capitalize">{card.cardType}</p>
                </div>
                <CardBrandLogo brand={card.cardType} />
              </div>

              <p className="mt-6 numeric text-xl font-bold tracking-widest">
                •••• •••• •••• {card.last4}
              </p>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs opacity-50">Holder</p>
                  <p className="text-sm font-medium">{me?.fullName ?? '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-50">Expires</p>
                  <p className="text-sm font-medium">{card.expMonth}/{card.expYear}</p>
                </div>
              </div>

              {/* Remove action */}
              <div className="mt-4 border-t border-white/10 pt-3">
                {confirmDelete === card.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(card.id)}
                      className="flex-1 rounded-xl bg-red-500/80 py-2 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(card.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove card
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add card button */}
          <button
            type="button"
            onClick={() => navigate('/link-card')}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-hairline p-8 text-ink-muted hover:border-accent hover:text-accent transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <span className="text-sm font-semibold">Add Payment Card</span>
          </button>
        </div>
      </div>
    </PageTransition>
  );
}

function CardBrandLogo({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  if (b.includes('visa')) {
    return <span className="text-2xl font-bold italic opacity-80">VISA</span>;
  }
  if (b.includes('master')) {
    return (
      <div className="flex -space-x-2">
        <div className="h-8 w-8 rounded-full bg-red-500 opacity-80" />
        <div className="h-8 w-8 rounded-full bg-yellow-500 opacity-80" />
      </div>
    );
  }
  return <span className="text-lg font-bold opacity-50">{brand}</span>;
}
