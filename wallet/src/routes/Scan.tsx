/**
 * Scan — Palm Biometric Terminal Enrolment.
 *
 * Premium biometric enrolment flow matching Google Wallet / Apple Pay standards.
 * Guides the user to bind their palm biometrics to their tokenized Nigerian bank card.
 *
 * Steps:
 *   - intro: Futuristic glowing biometric palm scanner hero, tokenized card binding pill,
 *            three security/privacy guarantee cards, and "Scan Terminal QR" button.
 *   - scan: High-tech QR viewfinder with animated laser line and corner brackets.
 *   - waiting: Real-time terminal radar pulse while placing hand on physical terminal.
 *   - done: Celebration checkmark with active palm status confirmation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { IScannerControls } from '@zxing/browser';
import { api, ApiError, type EnrolSessionView } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { getDefaultCard } from '../lib/cardStore.js';
import { Button, ErrorState, PalmIcon } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

type Step = 'intro' | 'scan' | 'waiting' | 'done';

/** Accepts a full link URL or a bare session id. */
function extractSessionId(scanned: string): string | null {
  const match = scanned.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

export default function Scan() {
  const { sessionId: sessionIdFromUrl } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const { refresh, consentGiven } = useAuth();

  // Redirect to consent screen if not yet agreed
  useEffect(() => {
    if (!consentGiven && !sessionIdFromUrl) {
      navigate('/consent', { replace: true });
    }
  }, [consentGiven, sessionIdFromUrl, navigate]);

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

        // Already enrolled is not a failure — it means they are finished.
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
    <PageTransition>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#f8fafc] text-slate-900 px-5 pt-6 pb-10 select-none">
        {/* Header */}
        <header className="flex items-center justify-between pb-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            aria-label="Back to dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <h1 className="text-base font-extrabold tracking-tight text-slate-900">
            Link Your Palm
          </h1>

          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#1d4ed8]">
            One-Time Setup
          </span>
        </header>

        {error && (
          <div className="my-3">
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
                setError('That is not a PayByPalm code. Scan the code on the terminal screen.');
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
              setError('That session expired. Request a new code from the terminal screen.');
              setStep('intro');
            }}
          />
        )}

        {step === 'done' && <Success onDone={() => navigate('/dashboard', { replace: true })} />}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// 1. Futuristic Biometric Intro
// ---------------------------------------------------------------------------

function Intro({ onStart }: { onStart: () => void }) {
  const defaultCard = getDefaultCard();

  return (
    <div className="flex flex-1 flex-col pt-2 animate-fade-in">
      {/* Glowing Biometric Scanner Hero Visual */}
      <div className="relative my-4 flex justify-center items-center">
        {/* Multi-layered radial glowing halos */}
        <div className="absolute h-44 w-44 rounded-full bg-blue-500/15 blur-2xl animate-pulse" />
        <div className="absolute h-36 w-36 rounded-full border border-blue-400/30 animate-ping opacity-25" />
        <div className="absolute h-32 w-32 rounded-full border border-blue-500/40" />

        {/* Circular Scanner Plate */}
        <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#1e40af] text-white shadow-xl shadow-blue-500/30 ring-4 ring-blue-100">
          {/* Animated subtle laser sweep line */}
          <div className="pointer-events-none absolute inset-x-2 top-2 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent animate-pulse" />

          {/* Palm Icon */}
          <PalmIcon className="h-14 w-14 text-white drop-shadow-md" />

          {/* Biometric Scan Dot */}
          <span className="absolute bottom-2 right-2 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400 ring-2 ring-white" />
          </span>
        </div>
      </div>

      {/* Hero Headline & Subtitle */}
      <div className="text-center px-2">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Touchless Palm Biometrics
        </h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          Bind your palm print once. Pay at any campus terminal with just a wave of your hand.
        </p>
      </div>

      {/* Target Tokenized Card Pill */}
      {defaultCard && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3.5 border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-12 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-extrabold text-white">
              {defaultCard.bank}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Primary Payment Card
              </p>
              <p className="text-xs font-extrabold text-slate-800">
                {defaultCard.name} •••• {defaultCard.last4}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-600/20">
            Auto-debited
          </span>
        </div>
      )}

      {/* Feature Guarantee Cards */}
      <div className="mt-4 space-y-2.5">
        <FeatureCard
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          }
          title="One-Touch Contactless Checkout"
          description="After linking, leave your phone and cards in your pocket. Pay at campus POS in under 1 second."
        />

        <FeatureCard
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          }
          title="Zero Image Storage (Privacy First)"
          description="Terminal captures biometric vein vectors and discards the image immediately. No photos stored."
        />

        <FeatureCard
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
          title="Instant Revocation Anytime"
          description="Easily pause, unlink, or switch your linked payment card anytime from your wallet."
        />
      </div>

      {/* Bottom CTA Card */}
      <div className="mt-auto pt-6">
        <div className="mb-3 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1d4ed8]">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Stand before any PayByPalm campus terminal screen</span>
        </div>

        <Button
          full
          onClick={onStart}
          className="!bg-[#1d4ed8] hover:!bg-blue-700 !text-white !py-4 shadow-lg shadow-blue-500/25 !rounded-2xl text-base font-bold flex items-center justify-center gap-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Scan Terminal QR Code</span>
        </Button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-3.5 border border-slate-100 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
        {icon}
      </div>
      <div>
        <p className="text-xs font-extrabold text-slate-900 leading-tight">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. High-Tech Camera QR Scanner
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
        setCameraError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was blocked. Please enable it in browser settings and try again.'
            : 'Could not activate camera. Ensure this device is over HTTPS or localhost.',
        );
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onScanned]);

  return (
    <div className="flex flex-1 flex-col animate-fade-in">
      <div className="my-2 rounded-2xl bg-blue-50 p-3 text-center border border-blue-100">
        <p className="text-xs font-bold text-[#1d4ed8]">
          Align the terminal screen's QR code within the viewfinder
        </p>
      </div>

      {/* Viewfinder with Cybernetic Corner Brackets */}
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-slate-950 shadow-2xl mt-3">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          aria-label="Camera viewfinder"
        />

        {/* Animated Scanning Laser Line */}
        <div className="pointer-events-none absolute inset-x-8 top-1/4 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce" />

        {/* Framing Guides */}
        <div className="pointer-events-none absolute inset-[14%]" aria-hidden="true">
          {[
            'left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl border-[#38bdf8]',
            'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl border-[#38bdf8]',
            'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl border-[#38bdf8]',
            'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl border-[#38bdf8]',
          ].map((corner) => (
            <span key={corner} className={`absolute h-8 w-8 ${corner}`} />
          ))}
        </div>
      </div>

      {cameraError && (
        <div className="mt-4">
          <ErrorState message={cameraError} />
        </div>
      )}

      <div className="mt-auto pt-6">
        <Button
          variant="secondary"
          full
          onClick={onCancel}
          className="!rounded-2xl !py-3.5 text-sm font-bold bg-white border border-slate-200"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Biometric Handshake Waiting State
// ---------------------------------------------------------------------------

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
        // Continue polling
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
    <div className="flex flex-1 flex-col items-center justify-center text-center px-4 animate-fade-in">
      {/* Radar Handshake Visual */}
      <div className="relative flex h-48 w-48 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" aria-hidden="true" />
        <span className="absolute inset-6 animate-pulse rounded-full bg-blue-500/25" aria-hidden="true" />
        <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-[#1d4ed8] text-white shadow-xl shadow-blue-500/40">
          <PalmIcon className="h-16 w-16" />
        </div>
      </div>

      <h2 className="mt-8 text-2xl font-black text-slate-900 tracking-tight">
        Place your palm on the terminal
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-xs text-slate-500 leading-relaxed">
        Hold your hand flat approximately 5cm over the scanner reader until the terminal chirps.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-xs font-bold text-[#1d4ed8]">
        <span className="h-2 w-2 rounded-full bg-[#1d4ed8] animate-ping" />
        <span>{status === 'captured' ? 'Reading palm biometrics…' : 'Waiting for terminal…'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Success State
// ---------------------------------------------------------------------------

function Success({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center px-4 animate-fade-in">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-500 text-white shadow-xl shadow-emerald-500/30">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 13l4 4L19 7"
            stroke="white"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="mt-8 text-2xl font-black text-slate-900 tracking-tight">
        Palm Successfully Linked!
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-xs text-slate-500 leading-relaxed">
        Your biometric profile is now securely bound to your payment card. You can now checkout anywhere with just your palm!
      </p>

      <div className="mt-8 w-full">
        <Button
          full
          onClick={onDone}
          className="!bg-[#1d4ed8] hover:!bg-blue-700 !text-white !py-4 shadow-lg shadow-blue-500/25 !rounded-2xl text-base font-bold"
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
