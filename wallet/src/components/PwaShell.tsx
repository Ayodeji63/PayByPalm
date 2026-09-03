import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Wordmark, PalmIcon } from './ui.js';
import { useAuth } from '../lib/auth.js';
import { InstallBanner } from './InstallBanner.js';

export function PwaShell({
  children,
  showNav = true,
  title,
}: {
  children: ReactNode;
  showNav?: boolean;
  title?: string;
}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pathname = location.pathname;
  const isDashboard = pathname === '/dashboard';
  const isProfile = pathname === '/profile';
  const isMerchant = pathname.startsWith('/merchant');

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink antialiased">
      {/* Offline Connectivity Alert Bar */}
      {!isOnline && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-xs font-semibold text-white shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>Offline Mode — Showing cached records</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-hairline/60 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-5">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <PalmIcon className="h-5 w-5" />
            </div>
            <Wordmark className="text-lg text-ink" />
          </Link>

          {title && <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">{title}</span>}

          <div className="flex items-center gap-2">
            {/* Merchant Portal Quick Switch */}
            <Link
              to="/merchant"
              title="Merchant Portal"
              className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
                isMerchant
                  ? 'bg-accent text-white'
                  : 'border border-hairline bg-surface text-ink-muted hover:bg-canvas'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Merchant</span>
            </Link>

            {/* Profile Avatar / Link */}
            <button
              type="button"
              onClick={() => navigate('/profile')}
              aria-label="User Profile"
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                isProfile
                  ? 'border-accent bg-accent text-white'
                  : 'border-hairline bg-surface text-ink hover:bg-canvas'
              }`}
            >
              {me?.fullName ? me.fullName.charAt(0).toUpperCase() : 'U'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 ${showNav ? 'pb-nav' : ''}`}>
        <div className="mx-auto w-full max-w-md px-5 pt-4">
          <InstallBanner />
        </div>
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-5 pb-[env(safe-area-inset-bottom)]">
          <div className="relative mb-3 flex items-center justify-between rounded-3xl border border-hairline/80 bg-surface/90 px-4 py-2.5 shadow-lg backdrop-blur-lg">
            {/* Wallet Home */}
            <Link
              to="/dashboard"
              className={`flex w-12 flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
                isDashboard ? 'text-accent font-semibold' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
              </svg>
              <span>Home</span>
            </Link>

            {/* Activity */}
            <button
              type="button"
              onClick={() => {
                if (isDashboard) {
                  document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                  navigate('/dashboard');
                  setTimeout(() => {
                    document.getElementById('history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 100);
                }
              }}
              className="flex w-12 flex-col items-center gap-1 text-[11px] font-medium text-ink-faint hover:text-ink-muted transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              <span>History</span>
            </button>

            {/* Raised Centre Action: Palm Enrolment */}
            <Link
              to="/scan"
              aria-label="Scan or Link Palm"
              className="absolute left-1/2 -top-5 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-white shadow-md shadow-accent/30 transition-transform active:scale-95"
            >
              <PalmIcon className="h-7 w-7" />
            </Link>
            <span className="w-14" aria-hidden="true" />

            {/* Merchant Portal */}
            <Link
              to="/merchant"
              className={`flex w-12 flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
                isMerchant ? 'text-accent font-semibold' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span>Store</span>
            </Link>

            {/* Profile & Security */}
            <Link
              to="/profile"
              className={`flex w-12 flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
                isProfile ? 'text-accent font-semibold' : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0" />
              </svg>
              <span>Profile</span>
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
