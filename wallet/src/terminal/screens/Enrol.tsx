/**
 * G. Enrol — first-time users only.
 *
 * Reached only from the idle screen's "Enrol new user" button. A returning
 * customer goes idle → amount → capture and never sees this.
 *
 * The QR carries a link into the wallet app. Identity comes from the PHONE,
 * authenticated with the customer's own session — the terminal never asserts
 * who anyone is. That is what stops an operator enrolling their own palm
 * against someone else's wallet.
 *
 * Capture geometry here is identical to the payment screen: same CameraPane,
 * same hand guide, same burst. A template enrolled at one framing and matched
 * at another is the quickest way to make scores drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { terminalApi, TerminalApiError, type EnrolSessionView } from '../api.js';
import { TIMINGS } from '../config.js';
import { useCamera } from '../useCamera.js';
import { CameraPane, Pane, PalmGlyph, TButton } from '../ui.js';

type Phase = 'creating' | 'waiting' | 'capturing' | 'done' | 'expired' | 'failed';

export function Enrol({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('creating');
  const [session, setSession] = useState<{ sessionId: string; linkUrl: string; expiresAt: string } | null>(null);
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  // The camera is only opened once there is someone to photograph. Holding the
  // device open through the whole QR wait would light the indicator at an idle
  // kiosk for no reason.
  const { videoRef, status, retry, captureBest } = useCamera(phase === 'capturing');

  const newSession = useCallback(async () => {
    setPhase('creating');
    setError(null);
    setDisplayName('');
    try {
      const created = await terminalApi.createEnrolSession();
      setSession(created);
      setPhase('waiting');
    } catch (err) {
      setError(err instanceof TerminalApiError ? err.message : 'Could not start enrolment.');
      setPhase('failed');
    }
  }, []);

  useEffect(() => {
    void newSession();
  }, [newSession]);

  // Countdown against the server's expiry, not a local timer, so a slow network
  // cannot leave the screen claiming time that the session no longer has.
  useEffect(() => {
    if (!session || (phase !== 'waiting' && phase !== 'capturing')) return;
    const tick = () => {
      const left = Math.max(0, Math.round((Date.parse(session.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [session, phase]);

  // Poll for the phone claiming the session.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!session || phase !== 'waiting') return;
    let stopped = false;
    let timer: number;

    const poll = async () => {
      if (stopped) return;
      try {
        const view: EnrolSessionView = await terminalApi.enrolSession(session.sessionId);
        if (stopped) return;

        if (view.status === 'claimed') {
          setDisplayName(view.userDisplayName ?? '');
          setPhase('capturing');
          return;
        }
        if (view.status === 'expired') {
          setPhase('expired');
          return;
        }
        if (view.status === 'completed') {
          setPhase('done');
          return;
        }
      } catch {
        // Keep polling through a blip; the session's own expiry ends this loop.
      }
      timer = window.setTimeout(poll, TIMINGS.enrolPollMs);
    };

    timer = window.setTimeout(poll, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [session, phase]);

  async function capture() {
    if (!session || busy || status !== 'ready') return;
    setBusy(true);
    setError(null);
    try {
      const frame = await captureBest();
      const result = await terminalApi.registerPalm(session.sessionId, frame.imageB64);
      setDisplayName(result.userDisplayName);
      setPhase('done');
    } catch (err) {
      setError(
        err instanceof TerminalApiError ? err.message : 'Could not read that palm. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // --- done ---------------------------------------------------------------
  if (phase === 'done') {
    return (
      <Pane className="items-center justify-center text-center">
        <div className="flex h-[132px] w-[132px] items-center justify-center rounded-full bg-accent">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 13l4 4L19 7"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="t-lg mt-6">Palm linked</p>
        <p className="t-sm mt-3 text-ink-muted">
          {displayName ? `${displayName} can now pay with their hand alone.` : 'Enrolment complete.'}
        </p>
        <TButton className="mt-8" onClick={onExit}>
          Done
        </TButton>
      </Pane>
    );
  }

  // --- expired / failed ---------------------------------------------------
  if (phase === 'expired' || phase === 'failed') {
    return (
      <Pane className="items-center justify-center text-center">
        <p className="t-lg">{phase === 'expired' ? 'Code expired' : 'Enrolment failed'}</p>
        <p className="t-sm mt-3 max-w-[560px] text-ink-muted">
          {error ?? 'Nobody scanned the code in time.'}
        </p>
        <div className="mt-8 flex gap-4">
          <TButton tone="secondary" onClick={onExit}>
            Back
          </TButton>
          <TButton onClick={() => void newSession()}>Generate new code</TButton>
        </div>
      </Pane>
    );
  }

  // --- capturing ----------------------------------------------------------
  if (phase === 'capturing') {
    return (
      <div className="flex h-full w-full flex-col p-5">
        <header className="flex h-[52px] shrink-0 items-center justify-between">
          <TButton tone="ghost" size="sm" onClick={onExit} disabled={busy}>
            ← Cancel
          </TButton>
          <p className="t-sm text-ink-muted">Enrolling · {secondsLeft}s</p>
        </header>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="w-[456px] shrink-0">
            <CameraPane
              videoRef={videoRef}
              status={status}
              onRetry={retry}
              busy={busy}
              caption="Hold your palm still inside the outline"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="t-lg">
              Place your palm{displayName ? `, ${displayName}` : ''}
            </p>
            <p className="t-sm mt-3 text-ink-muted">
              Hold your hand flat inside the outline until the terminal says it is done.
            </p>
            {error && <p className="t-sm mt-4 text-danger">{error}</p>}

            <TButton
              className="mt-8"
              disabled={busy || status !== 'ready'}
              onClick={() => void capture()}
            >
              {busy ? 'Reading…' : 'Capture'}
            </TButton>
          </div>
        </div>
      </div>
    );
  }

  // --- creating / waiting for the phone -----------------------------------
  return (
    <div className="flex h-full w-full flex-col p-6">
      <header className="flex h-[48px] shrink-0 items-center justify-between">
        <TButton tone="ghost" size="sm" onClick={onExit}>
          ← Cancel
        </TButton>
        <p className="t-sm text-ink-muted">
          {phase === 'waiting' ? `Expires in ${secondsLeft}s` : 'Preparing…'}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center gap-8">
        <div className="flex h-[300px] w-[300px] shrink-0 items-center justify-center rounded-3xl bg-surface">
          {session ? (
            <QRCodeSVG value={session.linkUrl} size={260} level="M" marginSize={0} />
          ) : (
            <PalmGlyph className="h-20 w-20 text-ink-faint" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="t-lg">Scan with the PayByPalm app</p>
          <p className="t-sm mt-4 text-ink-muted">
            Open the app on your phone, tap Scan, and point it at this code. Then place your palm
            on the reader.
          </p>
          <p className="t-sm mt-6 text-ink-faint">First-time customers only.</p>
        </div>
      </div>
    </div>
  );
}
