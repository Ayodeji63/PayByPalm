/**
 * C. Capture (payment).
 *
 * Left 60%: live preview with the fixed hand guide.
 * Right 40%: the amount, the prompt, and the OPTIONAL last-4 digits.
 *
 * Tencent uses the H5 acquisition component below. The legacy camera UI is
 * retained for the local mock provider only. Both use backend-coordinated 1:1
 * comparisons; no terminal payment requests native provider 1:N search.
 */

import { useEffect, useRef, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import type { AuthenticateOutcome } from '../api.js';
import { terminalApi, TerminalApiError } from '../api.js';
import { beginLEDOperation,type LEDOperation } from '../leds.js';
import { useAutoCapture, useCamera } from '../useCamera.js';
import { CameraPane, DigitBoxes, Keypad, TButton } from '../ui.js';
import { H5PalmCapture } from '../H5PalmCapture.js';

type CaptureProps = {
  transactionId: string;
  amountMinor: number;
  onOutcome: (outcome: AuthenticateOutcome) => void;
  onError: (message: string) => void;
  onCancel: () => void;
};

export function Capture(props: CaptureProps) {
  const [legacy, setLegacy] = useState(false);
  if (legacy) return <LegacyCapture {...props} />;
  return <H5PalmCapture scopeId={props.transactionId}
    title={`Pay ${formatNaira(props.amountMinor)} with your palm`}
    begin={() => terminalApi.beginPaymentCapture(props.transactionId)}
    complete={async (captureId, payload) => { props.onOutcome(await terminalApi.authenticateCapture(props.transactionId, captureId, payload)); }}
    onLegacy={() => setLegacy(true)} onCancel={props.onCancel} />;
}

function LegacyCapture({
  transactionId,
  amountMinor,
  onOutcome,
  onError,
  onCancel,
}: CaptureProps) {
  const { videoRef, status, retry, captureBest, illuminationWarning } = useCamera(true);
  const [last4, setLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const { state: autoCaptureState, landmarks } = useAutoCapture(
    videoRef,
    status === 'ready' && !busy,
  );
  const autoCaptureFired = useRef(false);
  const captureInProgress=useRef(false);
  const operation=useRef<LEDOperation|null>(null);
  useEffect(()=>()=>operation.current?.close(),[]);
  useEffect(()=>{
    if(busy||captureInProgress.current)return;
    const leds=beginLEDOperation();operation.current=leds;
    void leds.state(status==='ready'?'CAPTURING':status==='starting'?'LOADING':'ERROR');
    if(status==='ready'){const timer=window.setInterval(()=>void leds.state('CAPTURING'),5000);return ()=>window.clearInterval(timer);}
  },[status,busy]);

  async function scan(useLast4: boolean) {
    if (captureInProgress.current || busy || status !== 'ready') return;
    captureInProgress.current=true;
    setBusy(true);
    const leds=beginLEDOperation();operation.current=leds;
    try {
      const frame = await captureBest(leds);
      const outcome = await terminalApi.authenticate(
        transactionId,
        frame.imageB64,
        useLast4 ? last4 : undefined,
      );
      if(!leds.active())return;
      await leds.state(outcome.decision==='accept'?'OFF':'ERROR');
      onOutcome(outcome);
    } catch (err) {
      if(!leds.active())return;
      await leds.state('ERROR');
      onError(
        err instanceof TerminalApiError
          ? `${err.message}${err.requestId ? ` Support reference: ${err.requestId}.` : ''}`
          : err instanceof Error?err.message:'The camera did not produce a usable image. Try again.',
      );
    } finally {
      captureInProgress.current=false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoCaptureState === 'loading' || autoCaptureState === 'place') {
      autoCaptureFired.current = false;
    }
    if (autoCaptureState !== 'ready' || autoCaptureFired.current || busy) return;
    autoCaptureFired.current = true;
    void scan(last4.length === 4);
  }, [autoCaptureState, busy, last4]);

  const captureCaption =
    autoCaptureState === 'loading'
      ? 'Loading palm recognition…'
      : autoCaptureState === 'place'
        ? 'Show one open palm to the camera'
        : autoCaptureState === 'position'
          ? 'Move until your whole hand is visible and centred'
          : autoCaptureState === 'open'
            ? 'Open and separate all five fingers'
        : autoCaptureState === 'moving'
          ? 'Hold still — capturing automatically'
          : autoCaptureState === 'ready'
            ? 'Palm recognised — capturing now'
            : 'Palm recognition could not load';

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
            landmarks={landmarks}
            caption={captureCaption}
          />
        </div>

        {/* Controls — 40% */}
        <div className="flex min-w-0 flex-1 flex-col">
          {illuminationWarning&&<p role="status" className="t-sm text-warning">{illuminationWarning}</p>}
          <p className="t-sm text-ink-muted">Last 4 phone digits (optional)</p>
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
              Capture
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
