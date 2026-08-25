/**
 * Scan — page 4 of 4.
 *
 * The one-time palm enrolment flow: scan the terminal's QR, claim the session,
 * wait while the terminal reads the palm, done.
 *
 * Two ways in, converging on the same code:
 *   - /scan            in-app camera scanning
 *   - /scan/:sessionId the terminal's own link, opened from the phone's camera
 *
 * Guarded by RequireNotEnrolled — enrolment is one-time, so an already-enrolled
 * user can never reach this.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IScannerControls } from '@zxing/browser';
import { api, ApiError, type EnrolSessionView } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { Button, ErrorState, PalmIcon } from '../components/ui.js';

type Step = 'intro' | 'scan' | 'waiting' | 'done';

/** Accepts a full link URL or a bare session id. */
function extractSessionId(scanned: string): string | null {
  const match = scanned.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

export default function Scan() {
  const { sessionId: sessionIdFromUrl } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [step, setStep] = useState<Step>(sessionIdFromUrl ? 'waiting' : 'intro');
  const [sessionId, setSessionId] = useState<string | null>(sessionIdFromUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const claim = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await api.post<EnrolSessionView>(`/enrol/sessions/${id}/claim`);
        setSessionId(id);
        setStep('waiting');
      } catch (err) {
        if (!(err instanceof ApiError)) return;

        // Already enrolled is not a failure — it means they are finished. Send
        // them home rather than showing a red error to someone who did nothing
        // wrong.
        if (err.code === 'already_enrolled') {
          await refresh();
          navigate('/dashboard', { replace: true });
          return;
        }
        setError(err.message);
        setStep('intro');
      }
    },
    [navigate, refresh],
  );

  useEffect(() => {
    if (sessionIdFromUrl) void claim(sessionIdFromUrl);
  }, [sessionIdFromUrl, claim]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-10">
      <header className="flex items-center gap-3 pb-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="Back to dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface text-ink-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="text-lg font-bold tracking-tight">Link your palm</h1>
      </header>

      {error && (
        <div className="my-4">
          <ErrorState message={error} />
        </div>
      )}

      {step === 'intro' && <Intro onStart={() => setStep('scan')} />}

      {step === 'scan' && (
        <Scanner
          onCancel={() => setStep('intro')}
          onScanned={(text) => {
            const id = extractSessionId(text);
            if (!id) {
              setError('That is not a PayByPalm code. Scan the one on the terminal screen.');
              return;
            }
            setError(null);
            void claim(id);
          }}
        />
      )}

      {step === 'waiting' && sessionId && (
        <Waiting
          sessionId={sessionId}
          onComplete={async () => {
            await refresh();
            setStep('done');
          }}
          onExpired={() => {
            setError('That code expired. Ask the terminal for a new one.');
            setStep('intro');
          }}
        />
      )}

      {step === 'done' && <Success onDone={() => navigate('/dashboard', { replace: true })} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-center py-10">
        <div className="flex h-36 w-36 items-center justify-center rounded-full bg-accent-tint">
          <PalmIcon className="h-20 w-20 text-accent" />
        </div>
      </div>

      <div className="space-y-4">
        <Point
          title="You only do this once"
          body="After it is linked, you pay at any terminal with your palm alone — no phone, no card, no PIN."
        />
        <Point
          title="No image of your hand is stored"
          body="The terminal sends one photo for matching and it is discarded straight away. We keep a match reference, not a picture."
        />
        <Point
          title="You can unlink it any time"
          body="Profile › Unlink palm. You would just visit a terminal again to set it up afresh."
        />
      </div>

      <div className="mt-auto pt-8">
        <p className="mb-4 text-center text-sm text-ink-muted">
          Stand at a terminal before you start — you will scan the code on its screen.
        </p>
        <Button full onClick={onStart}>
          Scan terminal code
        </Button>
      </div>
    </div>
  );
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Scanner({
  onScanned,
  onCancel,
}: {
  onScanned: (text: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;

    // A phone opening the terminal's QR already has the session id in its URL
    // and never needs ZXing. Load the scanner only after someone explicitly
    // chooses the in-app "Scan terminal code" action.
    void import('@zxing/browser')
      .then(({ BrowserQRCodeReader }) => {
        if (cancelled) return null;
        const reader = new BrowserQRCodeReader();
        return reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
          if (result && !cancelled) onScanned(result.getText());
        });
      })
      .then((scannerControls) => {
        if (!scannerControls) return;
        if (cancelled) {
          scannerControls.stop();
          return;
        }
        controls = scannerControls;
      })
      .catch((err: unknown) => {
        // Denied permission, no camera, or an insecure context — getUserMedia is
        // only available over HTTPS or on localhost.
        setCameraError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings and try again.'
            : 'Could not start the camera. Make sure this page is on HTTPS and nothing else is using it.',
        );
      });

    return () => {
      cancelled = true;
      // Releases the camera. Without this the indicator light stays on.
      controls?.stop();
    };
  }, [onScanned]);

  return (
    <div className="flex flex-1 flex-col">
      <p className="py-4 text-center text-ink-muted">
        Point your camera at the code on the terminal screen.
      </p>

      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-ink">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          aria-label="Camera viewfinder"
        />
        {/* Corner framing guide */}
        <div className="pointer-events-none absolute inset-[16%]" aria-hidden="true">
          {[
            'left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl',
            'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl',
            'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl',
            'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl',
          ].map((corner) => (
            <span key={corner} className={`absolute h-10 w-10 border-white ${corner}`} />
          ))}
        </div>
      </div>

      {cameraError && (
        <div className="mt-5">
          <ErrorState message={cameraError} />
        </div>
      )}

      <div className="mt-auto pt-8">
        <Button variant="secondary" full onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * After claiming, the phone waits while the person puts their hand on the
 * terminal. It polls its own session — the terminal's polling route needs a
 * device key, which this app deliberately does not have.
 */
function Waiting({
  sessionId,
  onComplete,
  onExpired,
}: {
  sessionId: string;
  onComplete: () => void;
  onExpired: () => void;
}) {
  const [status, setStatus] = useState<EnrolSessionView['status']>('claimed');

  useEffect(() => {
    let stopped = false;
    let timer: number;

    const poll = async () => {
      if (stopped) return;
      try {
        const view = await api.get<EnrolSessionView>(`/enrol/sessions/${sessionId}/mine`);
        if (stopped) return;
        setStatus(view.status);
        if (view.status === 'completed') return onComplete();
        if (view.status === 'expired') return onExpired();
      } catch {
        // Keep polling through a blip; the session's own expiry ends this loop.
      }
      timer = window.setTimeout(poll, 1500);
    };

    timer = window.setTimeout(poll, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, onComplete, onExpired]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent-tint" aria-hidden="true" />
        <span className="absolute inset-4 rounded-full bg-accent-tint" aria-hidden="true" />
        <PalmIcon className="relative h-20 w-20 text-accent" />
      </div>

      <h2 className="mt-10 text-2xl font-bold tracking-tight">
        Place your palm on the terminal
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-ink-muted">
        Hold your hand flat over the reader until the terminal says it is done.
      </p>
      <p className="mt-6 text-sm text-ink-faint" aria-live="polite">
        {status === 'captured' ? 'Reading your palm…' : 'Waiting for the terminal…'}
      </p>
    </div>
  );
}

function Success({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 13l4 4L19 7"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="mt-8 text-2xl font-bold tracking-tight">Palm linked</h2>
      <p className="mx-auto mt-2 max-w-xs text-ink-muted">
        You can now pay at any PayByPalm terminal with your hand alone. Leave your phone in your
        pocket next time.
      </p>

      <div className="mt-10 w-full">
        <Button full onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
