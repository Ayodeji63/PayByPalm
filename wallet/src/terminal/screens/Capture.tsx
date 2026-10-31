/**
 * C. Capture (payment).
 *
 * Left 60%: live preview with the fixed hand guide.
 * Right 40%: the amount, positioning prompt and capture action.
 *
 * The original camera UI is the default; H5 remains a backend opt-in.
 * CCNet uses one filtered gallery search; legacy readers retain their
 * backend-coordinated comparisons.
 */

import { useEffect, useRef, useState } from 'react';
import { formatNaira } from '../../lib/money.js';
import type { AuthenticateOutcome } from '../api.js';
import { terminalApi, TerminalApiError } from '../api.js';
import { beginLEDOperation,type LEDOperation } from '../leds.js';
import { reportCaptureEvent } from '../captureTelemetry.js';
import { useAutoCapture, useCamera } from '../useCamera.js';
import { CameraPane, TButton } from '../ui.js';
import { H5PalmCapture } from '../H5PalmCapture.js';
import {terminalAudio} from '../audio.js';
import {useCaptureAudio} from '../useCaptureAudio.js';

type CaptureProps = {
  captureMode?: 'legacy' | 'h5' | 'ccnet';
  transactionId: string;
  amountMinor: number;
  onOutcome: (outcome: AuthenticateOutcome) => void;
  onError: (message: string, code?: string) => void;
  onCancel: () => void;
};

export function Capture(props: CaptureProps) {
  // Identity already selected the reader: open the original camera immediately,
  // without another network round trip or H5 preparation screen. Older API
  // responses still fall back to the capture-mode negotiation below.
  const [legacy, setLegacy] = useState(props.captureMode === 'legacy' || props.captureMode === 'ccnet');
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
  const [retryMessage,setRetryMessage]=useState<string|null>(null);
  const { state: autoCaptureState, landmarks } = useAutoCapture(
    videoRef,
    status === 'ready' && !busy,
  );
  useCaptureAudio(status==='ready'&&!busy,autoCaptureState,landmarks,transactionId);
  useEffect(()=>{reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'scan_started'});},[transactionId]);
  useEffect(()=>{reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'guidance',guidance:autoCaptureState});},[transactionId,autoCaptureState]);
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
    captureInProgress.current=true; setRetryMessage(null);
    reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'capture_started'});
    setBusy(true);
    const leds=beginLEDOperation();operation.current=leds;
    terminalAudio.event('hold_still');
    let finishReading=()=>{};
    try {
      const frame = await captureBest(leds,count=>reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'frame_captured',frameCount:count}));
      if(!leds.active()){frame.imageB64='';return;}
      finishReading=terminalAudio.reading();
      const started = performance.now();
      let outcome: AuthenticateOutcome;
      try { outcome = await terminalApi.authenticate(transactionId, frame.imageB64); }
      finally { frame.imageB64 = ''; performance.measure('palm.authenticate', { start: started, end: performance.now() }); }
      if(!leds.active())return;
      await leds.state(outcome.decision==='accept'?'OFF':'ERROR');
      if(outcome.decision !== 'accept') {
        terminalAudio.event('retry_scan');
        setRetryMessage(outcome.message); reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'capture_retake'}); return;
      }
      onOutcome(outcome);
    } catch (err) {
      if(!leds.active())return;
      terminalAudio.event('retry_scan');
      await leds.state('ERROR');
      if(err instanceof TerminalApiError && ['invalid_transaction_state','transaction_not_found','stale_authentication','transaction_expired','card_payment_not_configured','palm_reader_configuration','palm_capture_mode_changed','unauthorized'].includes(err.code)) { onError(err.message,err.code); return; }
      setRetryMessage(
        err instanceof TerminalApiError
          ? `${err.message}${err.requestId ? ` Support reference: ${err.requestId}.` : ''}`
          : err instanceof Error?err.message:'The camera did not produce a usable image. Try again.',
      );
    } finally {
      finishReading();
      captureInProgress.current=false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoCaptureState === 'loading' || autoCaptureState === 'place') {
      autoCaptureFired.current = false;
    }
    if (autoCaptureState !== 'ready' || autoCaptureFired.current || busy || retryMessage) return;
    autoCaptureFired.current = true;
    void scan();
  }, [autoCaptureState, busy, retryMessage]);

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
        <TButton tone="ghost" size="sm" onClick={()=>{reportCaptureEvent({scope:'payment',scopeId:transactionId,stage:'capture_cancelled'});onCancel();}} disabled={busy}>
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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col py-2">
          <div className="min-h-0 flex-1 overflow-y-auto">
          {illuminationWarning&&<p role="status" className="t-sm text-warning">{illuminationWarning}</p>}
          <p className="t-lg">{retryMessage ? 'Retake palm' : 'Place your palm'}</p>
          {!retryMessage && <p className="t-sm mt-3 text-ink-muted">Use the hand you enrolled. Keep your whole hand visible and hold it steady inside the guide.</p>}
          {retryMessage&&<p role="alert" className="t-sm mt-3 text-danger">{retryMessage} Reposition your hand and retake.</p>}
          </div>
          <TButton className="mt-4 shrink-0" disabled={busy || status !== 'ready'} onClick={() => void scan()}>
            {busy ? 'Checking palm…' : retryMessage ? 'Retake' : 'Capture'}
          </TButton>
        </div>
      </div>
    </div>
  );
}
