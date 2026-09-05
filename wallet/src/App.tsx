/**
 * Routes and guards — redesigned with AppShell.
 *
 * Authenticated pages are wrapped in <AppShell> for the unified bottom nav.
 * New routes: /verify, /consent, /topup, /cards, /link-card, /activity, /receipt
 *
 * Guards:
 *   - RequireAuth        keeps signed-out users out of the wallet
 *   - RequireNotEnrolled keeps ENROLLED users out of /scan
 */

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Screen, Skeleton } from './components/ui.js';
import { AppShell } from './components/AppShell.js';
import Landing from './routes/Landing.js';
import Auth from './routes/Auth.js';
import Dashboard from './routes/Dashboard.js';

/**
 * Lazy-loaded routes — only fetched when needed.
 */
const Verify = lazy(() => import('./routes/Verify.js'));
const Scan = lazy(() => import('./routes/Scan.js'));
const Profile = lazy(() => import('./routes/Profile.js'));
const TopUp = lazy(() => import('./routes/TopUp.js'));
const Cards = lazy(() => import('./routes/Cards.js'));
const LinkCard = lazy(() => import('./routes/LinkCard.js'));
const Consent = lazy(() => import('./routes/Consent.js'));
const Activity = lazy(() => import('./routes/Activity.js'));
const Receipt = lazy(() => import('./routes/Receipt.js'));
const MerchantDashboard = lazy(() => import('./routes/MerchantDashboard.js'));

function Loading() {
  return (
    <Screen>
      <div className="space-y-4 py-12">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-52" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </Screen>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <>{children}</>;
}

function RequireNotEnrolled({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  if (!me) return <Loading />;
  if (me.palmEnrolled) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Anyone with a session skips the pitch and lands on their balance. */
function LandingOrDashboard() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

/** Wraps a route element with RequireAuth + AppShell + Suspense. */
function AuthedShell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>
        <Suspense fallback={<Loading />}>
          {children}
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}

/** Wraps a route element with RequireAuth + Suspense (NO AppShell — full-page). */
function AuthedFull({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Suspense fallback={<Loading />}>
        {children}
      </Suspense>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingOrDashboard />} />
      <Route path="/login" element={<Auth />} />

      {/* OTP verification — after signup, before dashboard */}
      <Route
        path="/verify"
        element={
          <Suspense fallback={<Loading />}>
            <Verify />
          </Suspense>
        }
      />

      {/* ── Authenticated routes WITH AppShell (bottom nav) ── */}

      <Route path="/dashboard" element={<AuthedShell><Dashboard /></AuthedShell>} />
      <Route path="/cards" element={<AuthedShell><Cards /></AuthedShell>} />
      <Route path="/activity" element={<AuthedShell><Activity /></AuthedShell>} />
      <Route path="/profile" element={<AuthedShell><Profile /></AuthedShell>} />

      {/* ── Authenticated routes WITHOUT AppShell (full-page flows) ── */}

      <Route path="/topup" element={<AuthedFull><TopUp /></AuthedFull>} />
      <Route path="/link-card" element={<AuthedFull><LinkCard /></AuthedFull>} />
      <Route path="/consent" element={<AuthedFull><Consent /></AuthedFull>} />
      <Route path="/receipt" element={<AuthedFull><Receipt /></AuthedFull>} />

      {/* Palm enrolment — guarded by RequireNotEnrolled */}
      {['/scan', '/scan/:sessionId'].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <RequireAuth>
              <RequireNotEnrolled>
                <Suspense fallback={<Loading />}>
                  <Scan />
                </Suspense>
              </RequireNotEnrolled>
            </RequireAuth>
          }
        />
      ))}

      {/* Merchant/terminal — no wallet auth needed */}
      <Route
        path="/merchant"
        element={
          <Suspense fallback={<Loading />}>
            <MerchantDashboard />
          </Suspense>
        }
      />
      <Route
        path="/merchant/*"
        element={
          <Suspense fallback={<Loading />}>
            <MerchantDashboard />
          </Suspense>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
