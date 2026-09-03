import { useEffect, useState } from 'react';
import { Button } from './ui.js';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running in standalone mode (PWA installed)
    const isRunningStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(isRunningStandalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || dismissed || !deferredPrompt) {
    return null;
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="animate-sheet mx-auto mb-4 w-full max-w-md rounded-2xl border border-accent/20 bg-accent-tint/90 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 2v14M5 9l7 7 7-7M3 20h18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Install PayByPalm App</p>
            <p className="text-xs text-ink-muted">Add to Home Screen for one-tap payments</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-ink-faint hover:text-ink"
          aria-label="Dismiss banner"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={handleInstall} className="h-9 w-full text-xs font-semibold">
          Install App
        </Button>
      </div>
    </div>
  );
}
