/**
 * Link Payment Card — Paystack authorization flow.
 *
 * Opens Paystack Popup for a ₦50 refundable charge to tokenize the card.
 * On success, stores card info in localStorage via cardStore.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { openPaystackPopup } from '../lib/paystack.js';
import { addCard } from '../lib/cardStore.js';
import { Button, PageHeader } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function LinkCard() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [isDefault, setIsDefault] = useState(true);

  function handleAuthorize() {
    if (!me) return;
    setBusy(true);

    const email = `${me.phone.replace(/\D/g, '')}@paybypalm.app`;

    openPaystackPopup({
      email,
      amountKobo: 50_00, // ₦50 refundable charge
      metadata: {
        userId: me.id,
        type: 'card_authorization',
      },
      onSuccess: (response) => {
        // Store the card locally. In production, backend would store the
        // authorization_code for server-side charges.
        addCard({
          cardType: 'mastercard', // Paystack test cards are usually mastercard
          last4: response.reference.slice(-4),
          expMonth: '12',
          expYear: '28',
          bank: 'Test Bank',
          isDefault,
        });

        toast.show('Card linked successfully!', 'success');
        navigate('/cards', { replace: true });
        setBusy(false);
      },
      onClose: () => {
        setBusy(false);
      },
    });
  }

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-canvas">
        <div className="px-5">
          <PageHeader title="Link Payment Card" />
        </div>

        <div className="flex flex-1 flex-col px-5 pb-8">
          {/* Description */}
          <p className="text-center text-sm text-ink-muted">
            Authorize your debit card to fund one-touch palm checkouts
          </p>

          {/* Card preview */}
          <div className="mt-6 rounded-3xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] p-6 text-white">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#00C3F7]">paystack</span>
            </div>

            {/* Chip */}
            <div className="mt-5 h-10 w-14 rounded-lg bg-gradient-to-br from-yellow-300/60 to-yellow-600/60" />

            <p className="mt-4 numeric text-xl font-bold tracking-widest">
              •••• •••• •••• ••••
            </p>

            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-xs opacity-50">Card Holder</p>
                <p className="text-sm font-medium">{me?.fullName ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-50">Expires</p>
                <p className="text-sm font-medium">MM/YY</p>
              </div>
            </div>
          </div>

          {/* PCI notice */}
          <div className="mt-4 rounded-2xl bg-success-tint p-4">
            <div className="flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 text-success shrink-0" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <p className="text-xs text-success leading-relaxed">
                Protected with 256-bit Paystack PCI-DSS tokenization.
                A refundable ₦50 charge verifies your card.
              </p>
            </div>
          </div>

          {/* Default toggle */}
          <label className="mt-5 flex items-center justify-between">
            <span className="text-sm text-ink">Set as default palm funding source</span>
            <button
              type="button"
              role="switch"
              aria-checked={isDefault}
              onClick={() => setIsDefault(!isDefault)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                isDefault ? 'bg-accent' : 'bg-hairline'
              }`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                isDefault ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </label>

          <div className="flex-1" />

          {/* Authorize button */}
          <Button
            full
            loading={busy}
            onClick={handleAuthorize}
            className="mt-8"
          >
            Authorize & Bind Card
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
