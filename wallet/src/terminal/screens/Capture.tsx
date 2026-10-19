/**
 * C. Capture (payment).
 *
 * Left 60%: live preview with the fixed hand guide.
 * Right 40%: the amount, positioning prompt and capture action.
 *
 * The original camera UI is the default; H5 remains a backend opt-in.
 * Both use backend-coordinated 1:1
 * comparisons; no terminal payment requests native provider 1:N search.
 */

import { useEffect, useRef, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import type { AuthenticateOutcome } from '../api.js';
import { terminalApi, TerminalApiError } from '../api.js';
import { beginLEDOperation,type LEDOperation } from '../leds.js';
import { useAutoCapture, useCamera } from '../useCamera.js';
import { CameraPane, TButton } from '../ui.js';
import { H5PalmCapture } from '../H5PalmCapture.js';

type CaptureProps = {
  captureMode?: 'legacy' | 'h5';
  transactionId: string;
  amountMinor: number;
  onOutcome: (outcome: AuthenticateOutcome) => void;
  onError: (message: string) => void;
  onCancel: () => void;
};

export function Capture(props: CaptureProps) {
  // Identity already selected the reader: open the original camera immediately,
  // without another network round trip or H5 preparation screen. Older API
  // responses still fall back to the capture-mode negotiation below.
  const [legacy, setLegacy] = useState(props.captureMode === 'legacy');
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

  async function scan() {
    if (captureInProgress.current || busy || status !== 'ready') return;
    captureInProgress.current=true;
    setBusy(true);
    const leds=beginLEDOperation();operation.current=leds;
    try {
      const frame = await captureBest(leds);
      const outcome = await terminalApi.authenticate(
        transactionId,
        frame.imageB64,
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
    void scan();
  }, [autoCaptureState, busy]);

  const captureCaption =
    autoCaptureState === 'loading'
      ? 'Loading hand guidance…'
      : autoCaptureState === 'place'
        ? 'Show one open palm to the camera'
        : autoCaptureState === 'position'
          ? 'Move until your whole hand is visible and centred'
          : autoCaptureState === 'open'
            ? 'Open and separate all five fingers'
        : autoCaptureState === 'moving'
          ? 'Hold still — capturing automatically'
          : autoCaptureState === 'ready'
            ? 'Hand positioned — capturing now'
            : 'Hand guidance unavailable — use Capture';

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
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {illuminationWarning&&<p role="status" className="t-sm text-warning">{illuminationWarning}</p>}
          <p className="t-lg">Place your palm</p>
          <p className="t-sm mt-3 text-ink-muted">Use the hand you enrolled. Keep your whole hand visible and hold it steady inside the guide.</p>
          <TButton className="mt-8" disabled={busy || status !== 'ready'} onClick={() => void scan()}>
            {busy ? 'Checking palm…' : 'Capture'}
          </TButton>
        </div>
      </div>
    </div>
  );
}
