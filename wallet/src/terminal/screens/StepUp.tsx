/**
 * E. Step-up.
 *
 * Reached when the backend returns decision 'step_up' — confident enough to
 * name a person, not confident enough to move their money unaided. The customer
 * enters their wallet PIN, and the PIN travels with the confirm call.
 *
 * The PIN is masked on screen because the operator is standing over it.
 */

import { useEffect, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import { Keypad, Pane, PinBoxes, TButton } from '../ui.js';

export function StepUp({
  amountMinor,
  maskedName,
  error,
  busy,
  onConfirm,
  onCancel,
}: {
  amountMinor: number;
  maskedName: string;
  error: string | null;
  busy: boolean;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');

  // A rejected PIN clears the boxes so the next attempt starts from empty
  // rather than from four digits the customer has to delete one at a time.
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  return (
    <Pane>
      <header className="flex h-[44px] shrink-0 items-center justify-between">
        <TButton tone="ghost" size="sm" onClick={onCancel} disabled={busy}>
          ← Cancel
        </TButton>
        <p className="t-sm text-ink-muted">
          {maskedName} · {formatNaira(amountMinor)}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center gap-8">
        <div className="flex-1">
          <p className="t-lg">Enter your PIN</p>
          <p className="t-sm mt-2 text-ink-muted">
            {error ?? 'Your palm needs a second check for this payment.'}
          </p>
          <div className="mt-6">
            <PinBoxes value={pin} />
          </div>
        </div>

        <div className="w-[300px] shrink-0">
          <Keypad
            compact
            onDigit={(digit) => setPin((current) => (current + digit).slice(0, 4))}
            onBackspace={() => setPin((current) => current.slice(0, -1))}
          />
        </div>
      </div>

      <TButton
        className="h-[76px] shrink-0"
        disabled={pin.length !== 4 || busy}
        onClick={() => onConfirm(pin)}
      >
        {busy ? 'Checking…' : 'Confirm payment'}
      </TButton>
    </Pane>
  );
}
