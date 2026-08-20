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
 *   idle → amount → capture → confirm → [step-up] → result
 *                                        ^^^^^^^
 *   Everything before Confirm is identification. The confirm call is the only
 *   thing in this app that debits anyone.
 */

import { useCallback, useEffect, useState } from 'react';
import { terminalApi, TerminalApiError, type AuthenticateOutcome } from './api.js';
import { resolveTerminalKey, TIMINGS } from './config.js';
import { KioskFrame, Pane, TButton } from './ui.js';
import { Idle } from './screens/Idle.js';
import { Amount } from './screens/Amount.js';
import { Capture } from './screens/Capture.js';
import { Confirm } from './screens/Confirm.js';
import { StepUp } from './screens/StepUp.js';
import { Result } from './screens/Result.js';
import { Enrol } from './screens/Enrol.js';

type Screen =
  | { name: 'idle' }
  | { name: 'amount' }
  | { name: 'capture'; transactionId: string; amountMinor: number }
  | { name: 'confirm'; transactionId: string; amountMinor: number; outcome: AuthenticateOutcome }
  | { name: 'stepup'; transactionId: string; amountMinor: number; outcome: AuthenticateOutcome }
  | { name: 'result'; ok: boolean; title: string; detail?: string; amountMinor?: number }
  | { name: 'enrol' };

interface Identity {
  merchantName: string;
  terminalLabel: string;
}

export default function TerminalApp() {
  const [screen, setScreen] = useState<Screen>({ name: 'idle' });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [configured] = useState(() => resolveTerminalKey() !== null);
  const [online, setOnline] = useState(true);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toIdle = useCallback(() => {
    setStepUpError(null);
    setScreen({ name: 'idle' });
  }, []);

  // --- identity ----------------------------------------------------------
  const loadIdentity = useCallback(async () => {
    if (!configured) return;
    try {
      const me = await terminalApi.identity();
      setIdentity({ merchantName: me.merchantName, terminalLabel: me.terminalLabel });
      setOnline(true);
    } catch (err) {
      if (err instanceof TerminalApiError && err.isOffline) setOnline(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

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
    try {
      const txn = await terminalApi.createTransaction(amountMinor, description);
      setScreen({ name: 'capture', transactionId: txn.transactionId, amountMinor });
    } catch (err) {
      setScreen({
        name: 'result',
        ok: false,
        title: 'Could not start the sale',
        detail: err instanceof TerminalApiError ? err.message : 'Please try again.',
      });
    }
  }

  function handleOutcome(
    transactionId: string,
    amountMinor: number,
    outcome: AuthenticateOutcome,
  ) {
    if (outcome.decision === 'reject') {
      setScreen({
        name: 'result',
        ok: false,
        // The backend already phrases these for a customer to read; it knows
        // whether this was a bad match, an empty bin, or no money.
        title:
          outcome.reason === 'insufficient_funds' ? 'Not enough balance' : 'Palm not recognised',
        detail:
          outcome.reason === 'insufficient_funds'
            ? outcome.message
            : `${outcome.message} Try again or use your phone.`,
      });
      return;
    }
    setScreen({ name: 'confirm', transactionId, amountMinor, outcome });
  }

  /** The only path that moves money. */
  async function settle(transactionId: string, amountMinor: number, pin?: string) {
    setBusy(true);
    setStepUpError(null);
    try {
      const receipt = await terminalApi.confirm(transactionId, pin);
      setScreen({
        name: 'result',
        ok: true,
        title: 'Payment complete',
        detail: `${receipt.maskedName} · ${receipt.merchantName}`,
        amountMinor: receipt.amountMinor,
      });
    } catch (err) {
      const message = err instanceof TerminalApiError ? err.message : 'Payment failed.';

      // A wrong PIN keeps the customer on the PIN pad — sending them back to the
      // start over one mistyped digit would mean re-scanning their palm.
      if (
        pin !== undefined &&
        err instanceof TerminalApiError &&
        err.status === 401
      ) {
        setStepUpError(message);
        setBusy(false);
        return;
      }

      setScreen({ name: 'result', ok: false, title: 'Payment failed', detail: message, amountMinor });
    } finally {
      setBusy(false);
    }
  }

  /** Cancel the open transaction, best effort, then go home. */
  const abandon = useCallback(
    (transactionId?: string) => {
      if (transactionId) void terminalApi.cancel(transactionId).catch(() => undefined);
      toIdle();
    },
    [toIdle],
  );

  // --- not configured ----------------------------------------------------
  if (!configured) {
    return (
      <KioskFrame>
        <Pane className="items-center justify-center text-center">
          <p className="t-lg">Terminal not configured</p>
          <p className="t-sm mt-4 max-w-[600px] text-ink-muted">
            No device key. Launch with <code>?k=&lt;X-Terminal-Key&gt;</code> once — the key is
            stored on the device and removed from the address bar.
          </p>
          <p className="t-sm mt-4 text-ink-faint">See pi/README.md</p>
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
          outcome={screen.outcome}
          amountMinor={screen.amountMinor}
          merchantName={merchantName}
          onCancel={() => abandon(screen.transactionId)}
          onConfirm={() => {
            if (screen.outcome.pinRequired) {
              setScreen({ ...screen, name: 'stepup' });
              return;
            }
            void settle(screen.transactionId, screen.amountMinor);
          }}
        />
      )}

      {screen.name === 'stepup' && (
        <StepUp
          amountMinor={screen.amountMinor}
          maskedName={screen.outcome.maskedName ?? 'Customer'}
          error={stepUpError}
          busy={busy}
          onCancel={() => abandon(screen.transactionId)}
          onConfirm={(pin) => void settle(screen.transactionId, screen.amountMinor, pin)}
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
