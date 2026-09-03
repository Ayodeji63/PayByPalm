/**
 * Routes and guards. Four pages, deliberately:
 *
 *   /            Landing      the pitch, and the way in
 *   /login       Auth         sign in / sign up, one page two modes
 *   /dashboard   Dashboard    balance, actions, statistics, history
 *   /scan        Scan         one-time palm enrolment
 *
 * Top-up, profile/settings, and transaction detail are bottom sheets on the
 * dashboard rather than routes of their own.
 *
 * Two guards, and the second matters as much as the first:
 *   - RequireAuth        keeps signed-out users out of the wallet
 *   - RequireNotEnrolled keeps ENROLLED users out of /scan, because enrolment
 *     is one-time and they should never see the flow that asks for it again
 */

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.js';
import { Screen, Skeleton } from './components/ui.js';
import Landing from './routes/Landing.js';
import Auth from './routes/Auth.js';
import Dashboard from './routes/Dashboard.js';

/**
 * Loaded on demand.
 */
const Scan = lazy(() => import('./routes/Scan.js'));
const Profile = lazy(() => import('./routes/Profile.js'));
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
  // Wait for the profile before deciding — redirecting on a null `me` would
  // bounce every user away from enrolment on a cold load.
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingOrDashboard />} />
      <Route path="/login" element={<Auth />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />

      <Route
        path="/profile"
        element={
          <RequireAuth>
            <Suspense fallback={<Loading />}>
              <Profile />
            </Suspense>
          </RequireAuth>
        }
      />

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

      {/* Both entry points into enrolment. The second is what the terminal's
          QR code resolves to. */}
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
