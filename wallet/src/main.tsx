import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.js';
import { AuthProvider } from './lib/auth.js';
import { ToastProvider } from './components/Toast.js';
import './index.css';

/**
 * The kiosk is loaded on demand so a customer opening the wallet never
 * downloads the terminal, and a Pi never downloads the wallet's QR decoder.
 */
const TerminalApp = lazy(() => import('./terminal/TerminalApp.js'));

/**
 * Two apps, one bundle, split at the root.
 *
 * The terminal renders OUTSIDE AuthProvider on purpose. A terminal is a device,
 * not a user: it authenticates with X-Terminal-Key and must never hold or poll
 * a customer session. Mounting it inside the wallet's auth tree would put a
 * `/me` poller on a kiosk that has no business having one.
 */
function Root() {
  const { pathname } = useLocation();

  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) {
    return (
      <Suspense fallback={null}>
        <TerminalApp />
      </Suspense>
    );
  }

  return (
    // ToastProvider wraps AuthProvider: the balance poller announces incoming
    // payments through a toast, so it needs the toast API to already exist.
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
