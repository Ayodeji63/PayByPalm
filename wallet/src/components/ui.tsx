/**
 * Shared UI primitives.
 *
 * Depth comes from hairline borders and the canvas/surface contrast, never
 * shadows or gradients. Every interactive element clears a 48px touch target.
 */

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto min-h-dvh w-full max-w-md px-5 ${className}`}>{children}</div>;
}

export function Wordmark({ className = '' }: { className?: string }) {
  // Neutral placeholder. This app must never render a bank's logo or trademark.
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Pay<span className="opacity-70">By</span>Palm
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-hairline bg-surface p-5 ${className}`}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  full?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong disabled:bg-ink-faint',
  secondary: 'border border-hairline bg-surface text-ink hover:bg-canvas',
  ghost: 'text-accent hover:bg-accent-tint',
  danger: 'border border-danger text-danger hover:bg-danger-tint',
};

export function Button({
  variant = 'primary',
  loading = false,
  full = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`tap inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Field({ label, hint, error, id, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`tap w-full rounded-2xl border bg-canvas px-4 text-base outline-none transition-colors ${
          error ? 'border-danger' : 'border-transparent focus:border-accent'
        } ${className}`}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Pill({
  active,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        active ? 'bg-accent-tint text-accent' : 'text-ink-muted hover:bg-canvas'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  requestId,
}: {
  message: string;
  onRetry?: () => void;
  requestId?: string;
}) {
  return (
    <div className="rounded-2xl border border-danger/25 bg-danger-tint p-5 text-center">
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {/* Small on purpose: the handle support needs, not something to read aloud. */}
      {requestId && <p className="mt-3 text-xs text-ink-faint">Reference {requestId.slice(0, 8)}</p>}
    </div>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const styles =
    tone === 'warning'
      ? 'border-warning/25 bg-warning-tint text-warning'
      : 'border-transparent bg-accent-tint text-accent-strong';
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

/**
 * Top-up, profile, and transaction detail live in these rather than on their own
 * routes. The app is deliberately four pages; a sheet keeps the dashboard in
 * place behind it, which is also how these interactions feel on a phone.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape closes, and the page behind must not scroll while a sheet is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="animate-sheet relative w-full max-w-md rounded-t-3xl bg-surface px-5 pt-3 pb-8">
        <div className="mx-auto h-1 w-10 rounded-full bg-hairline" aria-hidden="true" />
        <div className="mt-4 mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-ink-muted"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom navigation
// ---------------------------------------------------------------------------

/**
 * Four destinations around a raised centre action, matching the reference.
 *
 * Home, Activity, and Stats are all sections of the dashboard, so they scroll
 * rather than navigate — the app has four pages and inventing routes to fill a
 * nav bar would be the tail wagging the dog. Only Scan is a real second route.
 */
export function BottomNav({ onProfile }: { onProfile: () => void }) {
  const { pathname } = useLocation();
  const onDashboard = pathname === '/dashboard';

  const jump = (id: string) => () => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-5 pb-[env(safe-area-inset-bottom)]">
      <div className="relative mb-4 flex items-center justify-between rounded-3xl border border-hairline bg-surface px-6 py-3">
        <NavItem label="Home" active={onDashboard} onClick={jump('top')}>
          <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </NavItem>
        <NavItem label="Activity" onClick={jump('history')}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </NavItem>

        {/* Centre action — the only nav item that changes page. */}
        <Link
          to="/scan"
          aria-label="Scan to link your palm"
          className="absolute left-1/2 -top-5 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-white"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <span className="w-14" aria-hidden="true" />

        <NavItem label="Stats" onClick={jump('stats')}>
          <path d="M5 20V10M12 20V4M19 20v-6" />
        </NavItem>
        <NavItem label="Profile" onClick={onProfile}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />
        </NavItem>
      </div>
    </nav>
  );
}

function NavItem({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-14 flex-col items-center gap-1 text-[11px] font-medium ${
        active ? 'text-accent' : 'text-ink-faint'
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------

export function PalmIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21c-3.9 0-6-2.6-6-6v-3.5M6 11.5V8a1.2 1.2 0 1 1 2.4 0v2M8.4 10V5.2a1.2 1.2 0 1 1 2.4 0V10M10.8 10V4.7a1.2 1.2 0 1 1 2.4 0V10M13.2 10V6a1.2 1.2 0 1 1 2.4 0v6.5c0 4.2-1.4 5.5-3.6 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
