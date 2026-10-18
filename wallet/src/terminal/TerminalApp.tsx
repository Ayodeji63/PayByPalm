/**
 * Merchant terminal — the kiosk app.
 *
 * Mounted at /terminal, outside the wallet's AuthProvider. A terminal is a
 * device, not a user: it authenticates with X-Terminal-Key and must never carry
 * a customer session. Keeping the two trees separate is what guarantees that.
 *
 * IT HOLDS NO TENCENT KEY AND NO SUPABASE SERVICE KEY. It posts an image to our
 * backend; our backend calls the palm provider.
 *
 * The flow, and where money moves:
 *   idle → amount → capture → confirm → result
 *                                        ^^^^^^^
 *   Everything before Confirm is identification. The confirm call is the only
 *   thing in this app that debits anyone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { terminalApi, TerminalApiError, type AuthenticateOutcome } from './api.js';
import { loadPendingSale, savePendingSale, clearPendingSale } from './paymentRecovery.js';
import { resolveTerminalKey, TIMINGS } from './config.js';
import { KioskFrame, Pane, TButton } from './ui.js';
import { Idle } from './screens/Idle.js';
import { Amount } from './screens/Amount.js';
import { Capture } from './screens/Capture.js';
import { Confirm } from './screens/Confirm.js';
import { Result } from './screens/Result.js';
import { Enrol } from './screens/Enrol.js';
import { beginLEDOperation,type LEDOperation } from './leds.js';
import { preloadPalmRecognition } from './useCamera.js';

type Screen =
  | { name: 'idle' }
  | { name: 'amount' }
  | { name: 'capture'; transactionId: string; amountMinor: number }
  | { name: 'confirm'; transactionId: string; amountMinor: number; outcome: AuthenticateOutcome }
  | { name: 'result'; ok: boolean; title: string; detail?: string; amountMinor?: number }
  | { name: 'recovery' }
  | { name: 'enrol' };

interface Identity {
  merchantName: string;
  terminalLabel: string;
}

export default function TerminalApp() {
  const [screen, setScreen] = useState<Screen>(() => {
    try { return { name: loadPendingSale() ? 'recovery' : 'idle' }; }
    catch { return { name: 'recovery' }; }
  });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [configured] = useState(() => resolveTerminalKey() !== null);
  const [online, setOnline] = useState(true);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ledOperation=useRef<LEDOperation|null>(null);
  useEffect(()=>()=>ledOperation.current?.close(),[]);
  useEffect(()=>{
    if(screen.name!=='result')return;
    const leds=beginLEDOperation();ledOperation.current=leds;
    void leds.state(screen.ok?'SUCCESS':'ERROR');
    return ()=>leds.close();
  },[screen]);

  const toIdle = useCallback(() => {
    setStepUpError(null);
    try { setScreen(loadPendingSale() ? { name: 'recovery' } : { name: 'idle' }); }
    catch { setScreen({ name: 'recovery' }); }
  }, []);

  // --- identity ----------------------------------------------------------
  const loadIdentity = useCallback(async () => {
    if (!configured) return;
    const leds=beginLEDOperation();ledOperation.current=leds;void leds.state('LOADING');
    try {
      const me = await terminalApi.identity();
      setIdentity({ merchantName: me.merchantName, terminalLabel: me.terminalLabel });
      setOnline(true);
    } catch (err) {
      if (err instanceof TerminalApiError && err.isOffline) setOnline(false);
      void leds.state('ERROR');return;
    }
    leds.close();
  }, [configured]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  // MediaPipe's runtime and hand model are the largest first-use assets in the
  // kiosk. Warm them while the home screen is idle instead of after a customer
  // has already entered a sale.
  useEffect(() => {
    preloadPalmRecognition();
  }, []);

  // --- reachability ------------------------------------------------------
  // A terminal that has quietly lost the backend looks identical to one that is
  // working until someone tries to take money, so it says so up front.
  useEffect(() => {
    if (!configured) return;
    let stopped = false;

    const check = async () => {
      try {
        await terminalApi.health();
        if (!stopped) setOnline(true);
      } catch {
        if (!stopped) setOnline(false);
      }
    };

    const timer = window.setInterval(() => void check(), TIMINGS.healthPollMs);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [configured]);

  // --- actions -----------------------------------------------------------

  async function startSale(amountMinor: number, description?: string) {
    if (busy) return;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) {
      setScreen({ name: 'result', ok: false, title: 'Invalid amount', detail: 'Enter an amount up to ₦1,000,000.' });
      return;
    }
    setBusy(true);
    const leds=beginLEDOperation();ledOperation.current=leds;void leds.state('LOADING');
    try {
      if (loadPendingSale()) { setScreen({ name: 'recovery' }); return; }
      const sale = { saleId: crypto.randomUUID(), amountMinor, description, confirming: false };
      savePendingSale(sale);
      const txn = await terminalApi.createTransaction(amountMinor, description, sale.saleId);
      savePendingSale({ ...sale, transactionId: txn.transactionId });
      leds.close();
      setScreen({ name: 'capture', transactionId: txn.transactionId, amountMinor: txn.amountMinor });
    } catch {
      void leds.state('ERROR');
      // Creation might have committed. Preserve the sale reference for recovery.
      setScreen({ name: 'recovery' });
    } finally { setBusy(false); }
  }

  function handleOutcome(
    transactionId: string,
    amountMinor: number,
    outcome: AuthenticateOutcome,
  ) {
    if (outcome.decision !== 'accept') {
      void (async()=>{
        try{
          const result=await terminalApi.cancel(transactionId);
          if(result.status!=='cancelled')throw new Error('Cancellation not confirmed.');
          clearPendingSale();
          setScreen({name:'result',ok:false,title:'Palm not verified',detail:outcome.message});
        }catch{setScreen({name:'recovery'});}
      })();
      return;
    }
    setScreen({ name: 'confirm', transactionId, amountMinor, outcome });
  }

  /** The only path that moves money. */
  async function settle(transactionId: string, _amountMinor: number) {
    setBusy(true);
    setStepUpError(null);
    const leds=beginLEDOperation();ledOperation.current=leds;void leds.state('LOADING');
    try {
      const sale = loadPendingSale();
      if (!sale || sale.transactionId !== transactionId) throw new Error('Payment recovery required.');
      savePendingSale({ ...sale, confirming: true });
      const receipt = await terminalApi.confirm(transactionId);
      if (receipt.transactionId !== transactionId || receipt.amountMinor !== sale.amountMinor || !receipt.settledAt) {
        throw new Error('Settlement receipt could not be verified.');
      }
      clearPendingSale();
      setScreen({
        name: 'result',
        ok: true,
        title: 'Payment complete',
        detail: `${receipt.maskedName} · ${receipt.merchantName}`,
        amountMinor: receipt.amountMinor,
      });
    } catch (err) {
      const message = err instanceof TerminalApiError ? err.message : 'Payment failed.';

      void leds.state('ERROR');
      setStepUpError(message);
      setScreen({ name: 'recovery' });
    } finally {
      setBusy(false);
    }
  }

  /** Keep uncertain outcomes attached to the original sale. */
  const abandon = useCallback(async (transactionId?: string) => {
    try {
      const sale = loadPendingSale();
      const id = transactionId ?? sale?.transactionId;
      if (!id && sale) { setScreen({ name: 'recovery' }); return; }
      if (id) {
        const current = await terminalApi.status(id);
        if (current.status === 'settled') { setScreen({ name: 'recovery' }); return; }
        if (current.status === 'failed' || current.status === 'cancelled') {
          clearPendingSale();
          toIdle();
          return;
        }
        const cancelled = await terminalApi.cancel(id);
        if (cancelled.status !== 'cancelled') throw new Error('Cancellation not confirmed.');
      }
      clearPendingSale();
      toIdle();
    } catch { setScreen({ name: 'recovery' }); }
  }, [toIdle]);

  async function recoverSale() {
    if (busy) return;
    setBusy(true);
    setStepUpError(null);
    const leds=beginLEDOperation();ledOperation.current=leds;void leds.state('LOADING');
    try {
      let sale = loadPendingSale();
      if (!sale) { toIdle(); return; }
      if (!sale.transactionId) {
        const txn = await terminalApi.createTransaction(sale.amountMinor, sale.description, sale.saleId);
        sale = { ...sale, transactionId: txn.transactionId };
        savePendingSale(sale);
      }
      const id = sale.transactionId!;
      const state = await terminalApi.status(id);
      if (state.status === 'settled' || ((state.status === 'authenticated' || state.status === 'processing') && sale.confirming)) {
        // A retry of a previous explicit confirmation, never a fresh sale.
        await settle(id, sale.amountMinor);
      } else if (state.status === 'pending' && !sale.confirming) {
        leds.close();
        setScreen({ name: 'capture', transactionId: id, amountMinor: state.amountMinor });
      } else if (state.status === 'failed' || state.status === 'cancelled') {
        clearPendingSale();
        setScreen({ name: 'result', ok: false, title: 'Payment not completed', detail: 'No new charge was made. Start a new sale only if needed.' });
      } else {
        // An interrupted authorization without a Confirm tap is abandoned.
        await abandon(id);
      }
    } catch {
      void leds.state('ERROR');
      setStepUpError('Payment status is unknown. Keep this sale open and retry when connected.');
      setScreen({ name: 'recovery' });
    } finally { setBusy(false); }
  }

  // --- not configured ----------------------------------------------------
  if (!configured) {
    return (
      <KioskFrame>
        <Pane className="items-center justify-center text-center">
          <p className="t-lg">Terminal not configured</p>
          <p className="t-sm mt-4 max-w-[600px] text-ink-muted">
            No device credential is configured. Contact the terminal administrator to provision this device.
          </p>

        </Pane>
      </KioskFrame>
    );
  }

  const merchantName = identity?.merchantName ?? 'PayByPalm';
  const terminalLabel = identity?.terminalLabel ?? '';

  return (
    <KioskFrame>
      {!online && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-danger px-6 py-2 text-white">
          <span className="t-sm">Offline — cannot take payments</span>
          <TButton
            tone="ghost"
            size="sm"
            className="!text-white"
            onClick={() => void loadIdentity()}
          >
            Retry
          </TButton>
        </div>
      )}

      {screen.name === 'recovery' && (
        <Pane className="items-center justify-center text-center">
          <p className="t-lg">Resolve the previous payment</p>
          <p className="t-sm mt-4">Its outcome must be checked before starting another sale. Retrying uses the same payment reference.</p>
          {stepUpError && <p role="alert" className="t-sm mt-4">{stepUpError}</p>}
          <TButton className="mt-6" disabled={busy} onClick={() => void recoverSale()}>Check or retry this payment</TButton>
          <TButton tone="ghost" className="mt-4" disabled={busy} onClick={() => void abandon()}>Cancel pending sale</TButton>
        </Pane>
      )}

      {screen.name === 'idle' && (
        <Idle
          merchantName={merchantName}
          terminalLabel={terminalLabel}
          onNewSale={() => setScreen({ name: 'amount' })}
          onEnrol={() => setScreen({ name: 'enrol' })}
          onDemoReset={toIdle}
        />
      )}

      {screen.name === 'amount' && (
        <Amount onCancel={toIdle} onCharge={(minor, description) => void startSale(minor, description)} />
      )}

      {screen.name === 'capture' && (
        <Capture
          transactionId={screen.transactionId}
          amountMinor={screen.amountMinor}
          onOutcome={(outcome) => handleOutcome(screen.transactionId, screen.amountMinor, outcome)}
          onError={(message) =>
            setScreen({ name: 'result', ok: false, title: 'Could not read the palm', detail: message })
          }
          onCancel={() => abandon(screen.transactionId)}
        />
      )}

      {screen.name === 'confirm' && (
        <Confirm
          busy={busy}
          outcome={screen.outcome}
          amountMinor={screen.amountMinor}
          merchantName={merchantName}
          onCancel={() => abandon(screen.transactionId)}
          onConfirm={() => void settle(screen.transactionId, screen.amountMinor)}
        />
      )}

      {screen.name === 'result' && (
        <Result
          ok={screen.ok}
          title={screen.title}
          detail={screen.detail}
          amountMinor={screen.amountMinor}
          merchantName={merchantName}
          onDone={toIdle}
        />
      )}

      {screen.name === 'enrol' && <Enrol onExit={toIdle} />}
    </KioskFrame>
  );
}
