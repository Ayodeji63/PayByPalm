/**
 * A. Idle.
 *
 * One job: offer the two things a terminal can start. Everything returns here.
 */

import { PalmGlyph, Pane, TButton, useLongPress } from '../ui.js';
import {AudioControl} from '../AudioControl.js';
import {terminalAudio} from '../audio.js';

export function Idle({
  merchantName,
  terminalLabel,
  onNewSale,
  onEnrol,
  onDemoReset,
  onPendingPayment,
  onClosedSales,
}: {
  merchantName: string;
  terminalLabel: string;
  onNewSale: () => void;
  onEnrol: () => void;
  onDemoReset: () => void;
  onPendingPayment?: () => void;
  onClosedSales?: () => void;
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
        <div className="flex items-center gap-4"><p className="t-sm text-ink-muted">{terminalLabel}</p><AudioControl /></div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className={`flex ${onClosedSales?'h-[112px] w-[112px]':'h-[168px] w-[168px]'} items-center justify-center rounded-full bg-accent-tint`}>
          <PalmGlyph className="h-[104px] w-[104px] text-accent" />
        </div>
        <p role={onPendingPayment || onClosedSales ? 'status' : undefined} className="t-sm mt-5 text-ink-muted text-center">{onPendingPayment ? 'Previous payment still unresolved. Check it before another sale.' : onClosedSales ? 'Closed sales may still be charged. Review them before retrying a purchase.' : 'Pay with your palm'}</p>
        {onClosedSales&&<TButton tone="secondary" size="sm" className="mt-3" onClick={onClosedSales}>Review closed sales</TButton>}
      </div>

      <div className="flex gap-4">
        <TButton className="flex-1" onClick={()=>{terminalAudio.unlock();(onPendingPayment ?? onNewSale)();}}>
          {onPendingPayment ? 'Check payment' : 'New sale'}
        </TButton>
        <TButton className="flex-1" tone="secondary" onClick={()=>{terminalAudio.unlock();onEnrol();}}>
          Enrol new user
        </TButton>
      </div>
    </Pane>
  );
}
