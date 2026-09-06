/**
 * Shared UI primitives — Premium fintech design.
 *
 * Every component is built for a mobile-first, Google Wallet-feeling interface.
 * Touch targets are 48px minimum, animations are spring-based, and the colour
 * palette is royal-blue on periwinkle.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto min-h-dvh w-full max-w-md px-5 ${className}`}>{children}</div>;
}

export function Wordmark({ className = '' }: { className?: string }) {
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
// Page Header — consistent header with back, title, optional right action
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  const goBack = onBack ?? (() => navigate(-1));

  return (
    <div className="flex items-center justify-between py-4">
      <button
        type="button"
        onClick={goBack}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-canvas"
        aria-label="Go back"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="w-10">{right}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet Card — the premium balance card
// ---------------------------------------------------------------------------

export function WalletCard({
  balance,
  name,
  phone,
  palmLinked,
  className = '',
}: {
  balance: string;
  name: string;
  phone: string;
  palmLinked: boolean;
  className?: string;
}) {
  const last4 = phone.replace(/\D/g, '').slice(-4);

  return (
    <div className={`wallet-card-gradient card-tilt relative overflow-hidden rounded-3xl p-6 text-white ${className}`}>
      {/* Palm tree icon */}
      <div className="flex items-start justify-between">
        <PalmTreeIcon className="h-8 w-8 opacity-90" />
        <span className="numeric text-sm font-medium opacity-80">•••• {last4}</span>
      </div>

      {/* Balance */}
      <p className="numeric mt-6 text-3xl font-extrabold tracking-tight">{balance}</p>

      {/* Name and palm status */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-medium opacity-90">{name}</p>
        {palmLinked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Palm Linked
          </span>
        )}
      </div>
    </div>
  );
}

function PalmTreeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16 28V16M16 16c-4-6-10-5-12-2s2 8 6 7c2-.5 4-2 6-5zM16 16c4-6 10-5 12-2s-2 8-6 7c-2-.5-4-2-6-5zM16 16c-1-7 2-12 5-13s5 4 3 7c-1 2-4 4-8 6zM16 16c1-7-2-12-5-13s-5 4-3 7c1 2 4 4 8 6z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status Chip
// ---------------------------------------------------------------------------

export function StatusChip({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const styles = {
    success: 'bg-success-tint text-success border-success/20',
    warning: 'bg-warning-tint text-warning border-warning/20',
    danger: 'bg-danger-tint text-danger border-danger/20',
    info: 'bg-accent-tint text-accent border-accent/20',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles[tone]}`}>
      {tone === 'success' && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Amount Display — large animated number
// ---------------------------------------------------------------------------

export function AmountDisplay({
  amount,
  className = '',
}: {
  amount: string;
  className?: string;
}) {
  return (
    <p className={`numeric text-4xl font-extrabold tracking-tight ${className}`}>
      {amount}
    </p>
  );
}

// ---------------------------------------------------------------------------
// OTP Input — 6 auto-advancing digit boxes
// ---------------------------------------------------------------------------

export function OtpInput({
  length = 6,
  value,
  onChange,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      const clean = digit.replace(/\D/g, '').slice(0, 1);
      const arr = value.split('');
      arr[index] = clean;
      const next = arr.join('').slice(0, length);
      onChange(next);
      if (clean && index < length - 1) {
        refs.current[index + 1]?.focus();
      }
    },
    [value, length, onChange],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    },
    [value],
  );

  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={`otp-box ${value[i] ? 'filled' : ''}`}
          autoFocus={i === 0}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PIN Input — 4 digit boxes for signup
// ---------------------------------------------------------------------------

export function PinInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      const clean = digit.replace(/\D/g, '').slice(0, 1);
      const arr = value.split('');
      arr[index] = clean;
      const next = arr.join('').slice(0, 4);
      onChange(next);
      if (clean && index < 3) {
        refs.current[index + 1]?.focus();
      }
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        refs.current[index - 1]?.focus();
      }
    },
    [value],
  );

  return (
    <div className="flex justify-center gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="pin-box"
          autoComplete="off"
        />
      ))}
    </div>
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
  danger: 'bg-danger text-white hover:bg-red-700',
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
      className={`btn-bounce tap inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${full ? 'w-full' : ''} ${className}`}
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
  icon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Field({ label, hint, error, id, icon, rightIcon, className = '', ...rest }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </div>
        )}
        <input
          {...rest}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`tap w-full rounded-2xl border bg-surface px-4 text-base outline-none transition-colors ${icon ? 'pl-11' : ''} ${rightIcon ? 'pr-11' : ''} ${
            error ? 'border-danger' : 'border-hairline focus:border-accent'
          } ${className}`}
        />
        {rightIcon && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint">
            {rightIcon}
          </div>
        )}
      </div>
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
        active ? 'bg-accent text-white' : 'bg-surface text-ink-muted border border-hairline hover:bg-canvas'
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

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-default"
      />
      <div className="relative z-10 w-full max-w-md rounded-t-[32px] sm:rounded-3xl bg-white px-5 pt-3 pb-[max(2.5rem,env(safe-area-inset-bottom,2.5rem))] sm:pb-8 shadow-2xl border border-slate-100 overflow-hidden max-h-[92vh] flex flex-col animate-slide-up">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 shrink-0" aria-hidden="true" />
        <div className="mt-3 mb-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Bottom navigation — 5 items with raised centre
// ---------------------------------------------------------------------------

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md pb-[env(safe-area-inset-bottom)]">
      <div className="relative flex items-center justify-around bg-white px-3 pt-2.5 pb-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] border-t border-slate-100 rounded-t-[26px]">
        <NavItem
          to="/dashboard"
          label="Home"
          active={pathname === '/dashboard'}
        >
          {pathname === '/dashboard' ? (
            <path
              d="M3 10.5 12 3.5l9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20z"
              fill="currentColor"
            />
          ) : (
            <path
              d="M3 10.5 12 3.5l9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </NavItem>

        <NavItem
          to="/cards"
          label="Cards"
          active={pathname === '/cards' || pathname === '/link-card'}
        >
          <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6 10h4M6 14h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </NavItem>

        {/* Centre action — palm scan button */}
        <Link
          to="/scan"
          aria-label="Scan palm"
          className="relative -top-5 flex h-13 w-13 items-center justify-center rounded-full bg-[#2851c5] text-white shadow-md shadow-slate-900/20 ring-4 ring-white active:scale-95 transition-all"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Palm / biometric scanner lines in centre */}
            <path
              d="M9 12h6M9 9.5h6M10 14.5h4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </Link>

        <NavItem
          to="/activity"
          label="History"
          active={pathname === '/activity'}
        >
          <rect x="3" y="4" width="18" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="m7 14 3.2-3.2 2.6 2.6L17 9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M14 9h3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </NavItem>

        <NavItem
          to="/profile"
          label="Profile"
          active={pathname === '/profile'}
        >
          <circle cx="12" cy="8" r="3.8" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.5 19.5a6.5 6.5 0 0 1 13 0"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </NavItem>
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  active = false,
  children,
}: {
  to: string;
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex w-14 flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
        active ? 'text-[#2851c5]' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className="flex h-6 w-6 items-center justify-center">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          {children}
        </svg>
      </div>
      <span>{label}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Icons
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

export function PayByPalmLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white">
        <PalmIcon className="h-5 w-5" />
      </div>
      <Wordmark className="text-lg" />
    </div>
  );
}

/** Quick action circle button used in the dashboard */
export function QuickAction({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`btn-bounce flex flex-col items-center gap-2 ${disabled ? 'opacity-40' : ''}`}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface border border-hairline text-ink">
        {icon}
      </div>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
    </button>
  );
}
