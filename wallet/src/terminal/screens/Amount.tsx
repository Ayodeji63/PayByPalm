/**
 * B. Amount entry.
 *
 * DIGITS ARE WHOLE NAIRA, not kobo. The usual card-terminal convention shifts
 * every keypress into the minor unit, so "1250" means £12.50. Campus prices
 * here are whole naira in the hundreds and thousands, and an operator typing
 * 1250 means ₦1,250 — following the card convention would put every sale out by
 * a factor of a hundred until someone noticed.
 *
 * The description is a set of presets rather than a text field: there is no
 * keyboard on this panel, and an on-screen QWERTY at 800x480 would swallow the
 * screen for something optional.
 */

import { useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import { Keypad, Pane, TButton } from '../ui.js';

const PRESETS = ['Meal', 'Drinks', 'Snacks', 'Books'];

/** Nine digits of naira is far past any campus sale and keeps the display in bounds. */
const MAX_DIGITS = 7;

export function Amount({
  onCancel,
  onCharge,
}: {
  onCancel: () => void;
  onCharge: (amountMinor: number, description?: string) => void;
}) {
  const [digits, setDigits] = useState('');
  const [description, setDescription] = useState<string | null>(null);

  const naira = Number(digits || '0');
  const amountMinor = naira * 100;

  const append = (value: string) =>
    setDigits((current) => {
      const next = (current + value).replace(/^0+/, '');
      return next.slice(0, MAX_DIGITS);
    });

  return (
    <Pane>
      <header className="flex items-center justify-between">
        <TButton tone="ghost" size="sm" onClick={onCancel}>
          ← Cancel
        </TButton>
        <p className="t-sm text-ink-muted">New sale</p>
      </header>

      <div className="mt-3 flex flex-1 gap-5">
        {/* Keypad */}
        <div className="w-[360px]">
          <Keypad
            onDigit={append}
            onBackspace={() => setDigits((current) => current.slice(0, -1))}
            extraKey="00"
            onExtra={() => digits && append('00')}
          />
        </div>

        {/* Amount and actions */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-[104px] items-center justify-end rounded-2xl bg-surface px-5">
            <span className="t-lg tabular-nums">{formatNaira(amountMinor)}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDescription((current) => (current === preset ? null : preset))}
                className={`flex min-h-[48px] items-center justify-center rounded-xl t-sm ${
                  description === preset
                    ? 'bg-accent text-white'
                    : 'bg-surface text-ink-muted'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <TButton
            className="mt-auto"
            disabled={amountMinor <= 0}
            onClick={() => onCharge(amountMinor, description ?? undefined)}
          >
            Charge
          </TButton>
        </div>
      </div>
    </Pane>
  );
}
