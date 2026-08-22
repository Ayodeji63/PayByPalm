/**
 * Terminal UI kit.
 *
 * Rules this file exists to enforce:
 *   - exactly two type sizes, .t-lg and .t-sm (see index.css)
 *   - every touch target at least 48x48, most far larger
 *   - no hover states — there is no cursor on the panel
 *   - nothing scrolls, ever
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TIMINGS } from './config.js';
import type { AutoCaptureState, HandLandmark } from './useCamera.js';

const DESIGN_W = 800;
const DESIGN_H = 480;

/**
 * Locks the UI to exactly 800x480 and scales that frame to fit whatever it is
 * actually displayed on.
 *
 * On the Pi the scale is 1 and this does nothing. On a development laptop it
 * means what you see is geometrically identical to the panel, rather than a
 * roomier layout that will surprise you on the hardware.
 */
export function KioskFrame({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="kiosk fixed inset-0 grid place-items-center overflow-hidden bg-ink">
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
        className="relative overflow-hidden bg-canvas text-ink"
      >
        {children}
      </div>
    </div>
  );
}

/** Full-bleed screen body with consistent padding. */
export function Pane({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex h-full w-full flex-col p-6 ${className}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost';

const TONES: Record<Tone, string> = {
  primary: 'bg-accent text-white active:bg-accent-strong',
  secondary: 'bg-surface text-ink border-2 border-hairline active:bg-canvas',
  danger: 'bg-surface text-danger border-2 border-danger active:bg-danger-tint',
  ghost: 'bg-transparent text-ink-muted active:bg-canvas',
};

export function TButton({
  children,
  tone = 'primary',
  onClick,
  disabled,
  className = '',
  size = 'lg',
}: {
  children: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** 'lg' for anything the customer acts on; 'sm' still clears 48px. */
  size?: 'lg' | 'sm';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-3 rounded-2xl transition-none disabled:opacity-40 ${
        size === 'lg' ? 'min-h-[72px] px-8 t-lg' : 'min-h-[48px] px-5 t-sm'
      } ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Keypad
// ---------------------------------------------------------------------------

/**
 * Numeric keypad. Used for amounts, last-4 digits, and PIN entry — one
 * component so the digit positions never move between screens. An operator
 * builds muscle memory on a till within an hour; moving the keys between
 * screens throws that away.
 */
export function Keypad({
  onDigit,
  onBackspace,
  extraKey,
  onExtra,
  compact = false,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  /** Optional bottom-left key, e.g. "00" on the amount screen. */
  extraKey?: string;
  onExtra?: () => void;
  compact?: boolean;
}) {
  // 48px is the floor set by the touch-target rule. The capture screen needs
  // every pixel this frees to keep its actions above the fold at 480px.
  const height = compact ? 'h-[48px]' : 'h-[72px]';
  const keyClass = `flex ${height} items-center justify-center rounded-2xl bg-surface t-lg active:bg-accent-tint`;

  return (
    <div className={`grid grid-cols-3 ${compact ? 'gap-2' : 'gap-3'}`}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button key={digit} type="button" className={keyClass} onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}

      {extraKey ? (
        <button type="button" className={keyClass} onClick={onExtra}>
          {extraKey}
        </button>
      ) : (
        <span aria-hidden="true" />
      )}

      <button type="button" className={keyClass} onClick={() => onDigit('0')}>
        0
      </button>

      <button
        type="button"
        aria-label="Delete"
        className={keyClass}
        onClick={onBackspace}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 5h10a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12 10l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * Live preview with MediaPipe's detected hand skeleton overlaid in real time.
 */
export function CameraPane({
  videoRef,
  status,
  onRetry,
  caption,
  busy = false,
  autoCaptureState,
  landmarks = [],
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: 'starting' | 'ready' | 'denied' | 'missing' | 'error';
  onRetry: () => void;
  caption?: string;
  busy?: boolean;
  autoCaptureState?: AutoCaptureState;
  landmarks?: HandLandmark[];
}) {
  const failed = status === 'denied' || status === 'missing' || status === 'error';

  const failureText =
    status === 'denied'
      ? 'Camera access is blocked. Allow it in the kiosk settings and restart.'
      : status === 'missing'
        ? 'No camera detected. Check the ribbon cable and restart.'
        : 'The camera could not be started.';

  return (
    <div className="relative h-full w-full overflow-hidden rounded-3xl bg-ink">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        muted
        autoPlay
        aria-label="Palm camera"
      />

      {status === 'ready' && landmarks.length === 21 && (
        <HandLandmarksOverlay landmarks={landmarks} ready={autoCaptureState === 'ready'} />
      )}

      {status === 'ready' && autoCaptureState === 'ready' && !busy && (
        <div className="pointer-events-none absolute inset-3 rounded-[18px] border-4 border-success" />
      )}

      {status === 'starting' && (
        <div className="absolute inset-0 grid place-items-center bg-ink">
          <p className="t-sm text-white/70">Starting camera…</p>
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-ink px-8 text-center">
          <div>
            <p className="t-lg text-white">Camera unavailable</p>
            <p className="t-sm mt-3 text-white/70">{failureText}</p>
            <TButton tone="secondary" size="sm" className="mt-6" onClick={onRetry}>
              Retry
            </TButton>
          </div>
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 grid place-items-center bg-accent/70">
          <p className="t-lg text-white">Reading…</p>
        </div>
      )}

      {caption && status === 'ready' && !busy && (
        <p className="absolute inset-x-0 bottom-0 bg-ink/70 py-3 text-center t-sm text-white">
          {caption}
        </p>
      )}
    </div>
  );
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
] as const;

function HandLandmarksOverlay({
  landmarks,
  ready,
}: {
  landmarks: HandLandmark[];
  ready: boolean;
}) {
  const colour = ready ? '#34d17b' : '#ffffff';
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center" aria-hidden="true">
      <svg viewBox="0 0 100 56.25" className="w-full" preserveAspectRatio="xMidYMid meet">
        {HAND_CONNECTIONS.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            x1={landmarks[from]!.x * 100}
            y1={landmarks[from]!.y * 56.25}
            x2={landmarks[to]!.x * 100}
            y2={landmarks[to]!.y * 56.25}
            stroke={colour}
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        ))}
        {landmarks.map((point, index) => (
          <circle
            key={index}
            cx={point.x * 100}
            cy={point.y * 56.25}
            r={index === 0 ? 1.25 : 0.85}
            fill={colour}
            stroke="#0f1729"
            strokeWidth="0.3"
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Long-press (hidden demo reset)
// ---------------------------------------------------------------------------

/**
 * Fires after a sustained press. Used for the demo reset hidden behind the
 * merchant name, so there is a way out of a stuck state on stage without a
 * visible "reset" button inviting a customer to press it.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined);

  const start = () => {
    timer.current = window.setTimeout(onLongPress, TIMINGS.longPressMs);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };

  useEffect(() => cancel, []);

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

// ---------------------------------------------------------------------------

export function PalmGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21c-3.9 0-6-2.6-6-6v-3.5M6 11.5V8a1.2 1.2 0 1 1 2.4 0v2M8.4 10V5.2a1.2 1.2 0 1 1 2.4 0V10M10.8 10V4.7a1.2 1.2 0 1 1 2.4 0V10M13.2 10V6a1.2 1.2 0 1 1 2.4 0v6.5c0 4.2-1.4 5.5-3.6 5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four fixed boxes for the optional last-4 phone digits. */
export function DigitBoxes({ value, count = 4 }: { value: string; count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={`flex h-[56px] flex-1 items-center justify-center rounded-xl border-2 t-lg ${
            index === value.length
              ? 'border-accent bg-surface'
              : 'border-hairline bg-surface text-ink'
          }`}
        >
          {value[index] ?? ''}
        </span>
      ))}
    </div>
  );
}

/** Same, but masked — used for the customer's PIN. */
export function PinBoxes({ value, count = 4 }: { value: string; count?: number }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <span
          key={index}
          className={`flex h-[64px] w-[56px] items-center justify-center rounded-xl border-2 t-lg ${
            index === value.length ? 'border-accent bg-surface' : 'border-hairline bg-surface'
          }`}
        >
          {index < value.length ? '•' : ''}
        </span>
      ))}
    </div>
  );
}
