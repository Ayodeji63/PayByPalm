/**
 * C. Capture (payment).
 *
 * Left 60%: live preview with the fixed hand guide.
 * Right 40%: the amount, the prompt, and the OPTIONAL last-4 digits.
 *
 * Both match paths are reachable from this one screen, on purpose:
 *   "Scan & match"  sends last4 — the backend narrows to a handful of
 *                   candidates and runs 1:1 comparisons. The production path.
 *   "Scan only"     sends no last4 — the backend runs a 1:N search. Palm alone,
 *                   nothing typed. The demo path.
 */

import { useEffect, useRef, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import type { AuthenticateOutcome } from '../api.js';
import { terminalApi, TerminalApiError } from '../api.js';
import { useAutoCapture, useCamera } from '../useCamera.js';
import { CameraPane, DigitBoxes, Keypad, TButton } from '../ui.js';

export function Capture({
  transactionId,
  amountMinor,
  onOutcome,
  onError,
  onCancel,
}: {
  transactionId: string;
  amountMinor: number;
  onOutcome: (outcome: AuthenticateOutcome) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const { videoRef, status, retry, captureBest } = useCamera(true);
  const [last4, setLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const autoCaptureState = useAutoCapture(videoRef, status === 'ready' && !busy);
  const autoCaptureFired = useRef(false);

  async function scan(useLast4: boolean) {
    if (busy || status !== 'ready') return;
    setBusy(true);
    try {
      const frame = await captureBest();
      const outcome = await terminalApi.authenticate(
        transactionId,
        frame.imageB64,
        useLast4 ? last4 : undefined,
      );
      onOutcome(outcome);
    } catch (err) {
      onError(
        err instanceof TerminalApiError
          ? err.message
          : 'The camera did not produce a usable image. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoCaptureState === 'calibrating' || autoCaptureState === 'place') {
      autoCaptureFired.current = false;
    }
    if (autoCaptureState !== 'ready' || autoCaptureFired.current || busy) return;
    autoCaptureFired.current = true;
    void scan(last4.length === 4);
  }, [autoCaptureState, busy, last4]);

  const captureCaption =
    autoCaptureState === 'calibrating'
      ? 'Keep the frame empty for a moment'
      : autoCaptureState === 'place'
        ? 'Place your whole hand inside the outline'
        : autoCaptureState === 'moving'
          ? 'Hold still — capturing automatically'
          : 'Perfect — capturing now';

  return (
    <div className="flex h-full w-full flex-col p-5">
      <header className="flex h-[52px] shrink-0 items-center justify-between">
        <TButton tone="ghost" size="sm" onClick={onCancel} disabled={busy}>
          ← Cancel
        </TButton>
        <span className="t-lg">{formatNaira(amountMinor)}</span>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Preview — 60% */}
        <div className="w-[456px] shrink-0">
          <CameraPane
            videoRef={videoRef}
            status={status}
            onRetry={retry}
            busy={busy}
            autoCaptureState={autoCaptureState}
            caption={captureCaption}
          />
        </div>

        {/* Controls — 40% */}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="t-sm text-ink-muted">Last 4 digits (optional)</p>
          <div className="mt-2">
            <DigitBoxes value={last4} />
          </div>

          <div className="mt-2">
            <Keypad
              compact
              onDigit={(digit) => setLast4((current) => (current + digit).slice(0, 4))}
              onBackspace={() => setLast4((current) => current.slice(0, -1))}
            />
          </div>

          <div className="mt-auto flex gap-2 pt-2">
            <TButton
              size="sm"
              tone="secondary"
              className="flex-1"
              disabled={busy || status !== 'ready'}
              onClick={() => void scan(false)}
            >
              Capture now
            </TButton>
            <TButton
              size="sm"
              className="flex-1"
              disabled={busy || status !== 'ready' || last4.length !== 4}
              onClick={() => void scan(true)}
            >
              Use digits
            </TButton>
          </div>
        </div>
      </div>
    </div>
  );
}
