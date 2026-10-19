import { useEffect, useRef, useState } from 'react';
import { capturePalmSdk, type PalmCaptureGrant } from './palmSdk.js';
import { beginLEDOperation, captureWithLight, type LEDOperation } from './leds.js';
import { TerminalApiError } from './api.js';
import { Pane, PalmGlyph, TButton } from './ui.js';

interface Props {
  scopeId: string;
  title: string;
  begin: () => Promise<PalmCaptureGrant | {captureMode: 'legacy'}>;
  complete: (captureId: string, payload: string) => Promise<void>;
  onLegacy?: () => void;
  onCancel: () => void;
}

export function H5PalmCapture(props: Props) {
  const [phase, setPhase] = useState<'ready' | 'preparing' | 'capturing' | 'checking'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController>();
  const operation = useRef<LEDOperation>();
  const callbacks = useRef(props);
  callbacks.current = props;

  async function start() {
    if (busy.current) return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const leds = beginLEDOperation();
    operation.current = leds;
    setError(null); setWarning(null); setPhase('preparing');
    try {
      await leds.state('LOADING');
      const grant = await callbacks.current.begin();
      if (abort.signal.aborted) return;
      if (grant.captureMode === 'legacy') { leds.close(); callbacks.current.onLegacy?.(); return; }
      const payload = await captureWithLight(leds, async () => {
        setPhase('capturing');
        const heartbeat = window.setInterval(() => void leds.state('CAPTURING'), 5000);
        try { return await capturePalmSdk(grant, abort.signal); }
        finally { window.clearInterval(heartbeat); }
      }, 300, setWarning);
      if (abort.signal.aborted) return;
      setPhase('checking');
      await callbacks.current.complete(grant.captureId, payload);
    } catch (err) {
      if (!abort.signal.aborted) {
        await leds.state('ERROR');
        setError(err instanceof TerminalApiError ? `${err.message}${err.requestId ? ` Reference: ${err.requestId}.` : ''}` : err instanceof Error ? err.message : 'Palm capture failed. Please try again.');
      }
    } finally {
      busy.current = false;
      if (!abort.signal.aborted) setPhase('ready');
    }
  }

  useEffect(() => {
    // Deferring avoids opening two sessions under React StrictMode's effect replay.
    const timer = window.setTimeout(() => void start(), 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); operation.current?.close(); };
  }, [props.scopeId]);

  const working = phase !== 'ready';
  const status = phase === 'preparing' ? 'Preparing the palm reader…' : phase === 'capturing' ? 'Follow the palm reader’s hand movement prompts.' : phase === 'checking' ? 'Verifying your palm…' : 'Place your hand in front of the camera.';
  return <Pane className="items-center justify-center gap-5 overflow-y-auto text-center">
    <PalmGlyph className="h-20 w-20 text-accent" />
    <h1 className="t-lg">{props.title}</h1>
    <p role="status" aria-live="polite" className="t-sm max-w-[600px] text-ink-muted">{status}</p>
    {warning && <p role="status" className="t-sm max-w-[600px] text-warning">{warning}</p>}
    {error && <p role="alert" className="t-sm max-w-[640px] text-danger">{error}</p>}
    <div className="flex flex-wrap justify-center gap-4">
      <TButton disabled={working} onClick={() => void start()}>{working ? 'Reading palm…' : error ? 'Try another scan' : 'Start palm scan'}</TButton>
      <TButton tone="secondary" disabled={working} onClick={props.onCancel}>Cancel</TButton>
    </div>
  </Pane>;
}
