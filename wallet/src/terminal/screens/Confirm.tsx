/**
 * D. Confirm.
 *
 * NOTHING HAS BEEN DEBITED WHEN THIS SCREEN APPEARS. The palm match named a
 * person and wrote no ledger entry; only the Confirm tap does that.
 *
 * Auto-cancels after 30 seconds. A customer who walked off must not leave a
 * chargeable transaction sitting on the screen for whoever is next in the queue.
 */

import { useEffect, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import type { AuthenticateOutcome } from '../api.js';
import { TIMINGS } from '../config.js';
import { Pane, TButton } from '../ui.js';

function initialsOf(maskedName: string): string {
  return maskedName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Confirm({
  outcome,
  amountMinor,
  merchantName,
  onConfirm,
  onCancel,
}: {
  outcome: AuthenticateOutcome;
  amountMinor: number;
  merchantName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [remaining, setRemaining] = useState(Math.round(TIMINGS.confirmTimeoutMs / 1000));

  useEffect(() => {
    const tick = window.setInterval(() => setRemaining((n) => n - 1), 1000);
    const expire = window.setTimeout(onCancel, TIMINGS.confirmTimeoutMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(expire);
    };
  }, [onCancel]);

  const name = outcome.maskedName ?? 'Customer';

  return (
    <Pane>
      <header className="flex h-[44px] shrink-0 items-center justify-between">
        <p className="t-sm text-ink-muted">{merchantName}</p>
        <p className="t-sm text-ink-muted">Cancels in {remaining}s</p>
      </header>

      <div className="flex min-h-0 flex-1 items-center gap-6">
        <div className="flex h-[128px] w-[128px] shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <span className="t-lg">{initialsOf(name)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="t-lg truncate">{name}</p>
          <p className="t-sm mt-2 text-ink-muted">
            Match {outcome.score ?? '—'}
            {outcome.mode === 'compare' ? ' · verified by number' : ' · palm search'}
          </p>
          {outcome.maskedBalanceMinor !== undefined && (
            <p className="t-sm mt-1 text-ink-muted">
              Balance about {formatNaira(outcome.maskedBalanceMinor)}
            </p>
          )}
          {outcome.pinRequired && (
            <p className="t-sm mt-3 rounded-xl bg-warning-tint px-3 py-2 text-warning">
              PIN required to complete
            </p>
          )}
        </div>

        <div className="shrink-0 rounded-3xl bg-surface px-8 py-6 text-right">
          <p className="t-sm text-ink-muted">Amount</p>
          <p className="t-lg mt-1 text-accent">{formatNaira(amountMinor)}</p>
        </div>
      </div>

      {/* Confirm is the larger target — it is the action the customer came to take. */}
      <div className="flex h-[84px] shrink-0 gap-4">
        <TButton tone="danger" className="flex-[2]" onClick={onCancel}>
          Cancel
        </TButton>
        <TButton className="flex-[4]" onClick={onConfirm}>
          {outcome.pinRequired ? 'Continue' : 'Confirm'}
        </TButton>
      </div>
    </Pane>
  );
}
