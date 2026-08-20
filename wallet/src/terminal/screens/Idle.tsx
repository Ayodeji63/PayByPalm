/**
 * A. Idle.
 *
 * One job: offer the two things a terminal can start. Everything returns here.
 */

import { PalmGlyph, Pane, TButton, useLongPress } from '../ui.js';

export function Idle({
  merchantName,
  terminalLabel,
  onNewSale,
  onEnrol,
  onDemoReset,
}: {
  merchantName: string;
  terminalLabel: string;
  onNewSale: () => void;
  onEnrol: () => void;
  onDemoReset: () => void;
}) {
  // Hidden demo reset. Deliberately not a visible button — a stage prop that a
  // customer could press is a liability.
  const longPress = useLongPress(onDemoReset);

  return (
    <Pane>
      <header className="flex items-baseline justify-between">
        <h1 className="t-lg" {...longPress}>
          {merchantName}
        </h1>
        <p className="t-sm text-ink-muted">{terminalLabel}</p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex h-[168px] w-[168px] items-center justify-center rounded-full bg-accent-tint">
          <PalmGlyph className="h-[104px] w-[104px] text-accent" />
        </div>
        <p className="t-sm mt-5 text-ink-muted">Pay with your palm</p>
      </div>

      <div className="flex gap-4">
        <TButton className="flex-1" onClick={onNewSale}>
          New sale
        </TButton>
        <TButton className="flex-1" tone="secondary" onClick={onEnrol}>
          Enrol new user
        </TButton>
      </div>
    </Pane>
  );
}
