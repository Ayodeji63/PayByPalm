/**
 * F. Result.
 *
 * Returns to idle on its own, so the next customer never walks up to somebody
 * else's receipt.
 */

import { useEffect, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import { TIMINGS } from '../config.js';
import { Pane, TButton } from '../ui.js';

export function Result({
  ok,
  title,
  detail,
  amountMinor,
  merchantName,
  onDone,
}: {
  ok: boolean;
  title: string;
  detail?: string;
  amountMinor?: number;
  merchantName: string;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(Math.round(TIMINGS.resultTimeoutMs / 1000));

  useEffect(() => {
    const tick = window.setInterval(() => setRemaining((n) => n - 1), 1000);
    const done = window.setTimeout(onDone, TIMINGS.resultTimeoutMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <Pane className="items-center justify-center text-center">
      <div
        className={`flex h-[132px] w-[132px] items-center justify-center rounded-full ${
          ok ? 'bg-accent' : 'bg-danger-tint'
        }`}
      >
        {ok ? (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 13l4 4L19 7"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M7 7l10 10M17 7L7 17"
              stroke="currentColor"
              className="text-danger"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <p className="t-lg mt-6">{title}</p>

      {amountMinor !== undefined && (
        <p className="t-lg mt-2 text-accent">{formatNaira(amountMinor)}</p>
      )}

      <p className="t-sm mt-3 max-w-[560px] text-ink-muted">{detail ?? merchantName}</p>

      <TButton tone="ghost" size="sm" className="mt-7" onClick={onDone}>
        Done ({remaining})
      </TButton>
    </Pane>
  );
}
