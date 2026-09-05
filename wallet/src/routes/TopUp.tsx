/**
 * Top-Up Wallet — full-page with Paystack Popup integration.
 *
 * Matches the design: large editable amount, quick-amount pills, payment source
 * section with Paystack branding, and "Fund Wallet" button that opens the
 * Paystack hosted checkout. After Paystack success, credits wallet via the
 * existing /topup endpoint.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira, parseNairaToMinor } from '../lib/money.js';
import { openPaystackPopup } from '../lib/paystack.js';
import { getDefaultCard } from '../lib/cardStore.js';
import { Button, PageHeader } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

const PRESETS = [500, 1_000, 2_500, 5_000];

export default function TopUp() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  const amountMinor = parseNairaToMinor(amount);
  const defaultCard = getDefaultCard();

  function selectPreset(value: number) {
    setAmount(String(value));
    setSelectedPreset(value);
    setError(null);
  }

  async function handleFund(e: FormEvent) {
    e.preventDefault();

    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter an amount, for example 2000.');
      return;
    }
    if (amountMinor < 100_00) {
      setError('Minimum top-up is ₦100.');
      return;
    }
    if (amountMinor > 500_000_00) {
      setError('Maximum top-up is ₦500,000.');
      return;
    }

    setError(null);
    setBusy(true);

    // Open Paystack Popup — card details handled by Paystack
    const email = `${me?.phone?.replace(/\D/g, '') ?? 'user'}@paybypalm.app`;

    openPaystackPopup({
      email,
      amountKobo: amountMinor,
      metadata: {
        userId: me?.id,
        type: 'wallet_topup',
      },
      onSuccess: async (_response) => {
        try {
          // Credit the wallet via existing backend endpoint
          await api.post('/topup', { amountMinor });
          await refresh();
          toast.show(`${formatNaira(amountMinor)} added to wallet!`, 'success');
          navigate('/dashboard', { replace: true });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Payment received but wallet credit failed.');
        } finally {
          setBusy(false);
        }
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
          <PageHeader title="Top-Up Wallet" />
        </div>

        <form onSubmit={handleFund} className="px-5 pb-8">
          {/* Amount card */}
          <div className="rounded-3xl bg-surface p-6 text-center">
            {/* Large amount input */}
            <div className="flex items-center justify-center gap-1">
              <span className="text-4xl font-extrabold text-ink">₦</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^0-9.]/g, ''));
                  setSelectedPreset(null);
                  setError(null);
                }}
                className="w-40 bg-transparent text-center text-4xl font-extrabold text-ink outline-none placeholder:text-ink-faint"
                autoFocus
              />
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Enter amount (Min ₦100 • Max ₦500,000)
            </p>

            {/* Quick amount pills */}
            <div className="mt-5 flex justify-center gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    selectedPreset === preset
                      ? 'bg-accent text-white'
                      : 'border border-hairline bg-canvas text-ink-muted hover:bg-accent-tint hover:text-accent'
                  }`}
                >
                  ₦{preset.toLocaleString('en-NG')}
                </button>
              ))}
            </div>
          </div>

          {/* Payment source */}
          <div className="mt-6">
            <h3 className="text-base font-bold">Payment Source</h3>
            <div className="mt-3 rounded-2xl bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Paystack logo */}
                  <div className="flex h-10 w-16 items-center justify-center rounded-lg bg-[#00C3F7]/10">
                    <span className="text-xs font-bold text-[#00C3F7]">paystack</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Paystack</p>
                    {defaultCard ? (
                      <p className="text-xs text-ink-muted">
                        {cardBrandEmoji(defaultCard.cardType)} •••• {defaultCard.last4}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-muted">Debit / Credit Card</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/link-card')}
                  className="text-sm font-semibold text-accent"
                >
                  {defaultCard ? 'Change' : 'Add'}
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="mt-4 rounded-2xl bg-danger-tint p-3 text-center text-sm text-danger">
              {error}
            </p>
          )}

          {/* Fund button */}
          <div className="mt-auto pt-8">
            <Button
              type="submit"
              full
              loading={busy}
              disabled={amountMinor === null || amountMinor <= 0}
            >
              {amountMinor && amountMinor > 0
                ? `Fund Wallet — ${formatNaira(amountMinor)}`
                : 'Fund Wallet'}
            </Button>

            <p className="mt-3 text-center text-xs text-ink-faint">
              🔒 Secured by Paystack 256-bit SSL encryption
            </p>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}

function cardBrandEmoji(brand: string): string {
  const b = brand.toLowerCase();
  if (b.includes('visa')) return '💳';
  if (b.includes('master')) return '💳';
  return '💳';
}
