/**
 * Toasts.
 *
 * Used for one thing above all: telling someone a payment just landed while they
 * were looking at the app. That is the moment the whole product is trying to
 * create, so it gets an announcement rather than a silent number change.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONE_STYLES: Record<ToastTone, string> = {
  info: 'bg-ink text-white',
  success: 'bg-accent text-white',
  error: 'bg-danger text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-4"
        // Announced to screen readers without stealing focus.
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium ${TONE_STYLES[toast.tone]}`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
