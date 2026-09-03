import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { PwaShell } from '../components/PwaShell.js';
import { Button, Card, PalmIcon, Banner } from '../components/ui.js';
import { api } from '../lib/api.js';

export default function Profile() {
  const { me, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [unlinking, setUnlinking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUnlinkPalm = async () => {
    if (!window.confirm('Are you sure you want to unlink your palm? You will need to re-enrol to pay by palm.')) {
      return;
    }
    setUnlinking(true);
    setMessage(null);
    try {
      await api.post('/palm/revoke');
      await refresh();
      setMessage('Palm biometric data successfully unlinked.');
    } catch {
      setMessage('Failed to unlink palm. Please try again.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <PwaShell title="Profile">
      <div className="mx-auto max-w-md space-y-5 px-5 pb-8">
        {message && (
          <Banner tone={message.includes('success') ? 'info' : 'warning'}>
            {message}
          </Banner>
        )}

        {/* User Identity Card */}
        <Card className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-white shadow-md shadow-accent/20">
            {me?.fullName ? me.fullName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-ink">{me?.fullName || 'User Profile'}</h1>
            <p className="truncate text-xs font-mono text-ink-muted">{me?.phone || 'Authenticated User'}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-accent-tint px-2 py-0.5 text-[10px] font-semibold text-accent">
                Customer Account
              </span>
            </div>
          </div>
        </Card>

        {/* Biometric Palm Status Card */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-tint text-accent">
                <PalmIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-ink">Palm Biometrics</h2>
                <p className="text-xs text-ink-muted">Tencent PalmAI Vector Link</p>
              </div>
            </div>
            {me?.palmEnrolled ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Linked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unlinked
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-hairline bg-canvas p-3.5 text-xs text-ink-muted">
            {me?.palmEnrolled ? (
              <p>Your palm is securely enrolled for one-touch checkout at any PayByPalm kiosk.</p>
            ) : (
              <p>You have not registered your palm print yet. Visit a kiosk or scan a terminal QR code to begin.</p>
            )}
          </div>

          <div className="flex gap-2">
            {me?.palmEnrolled ? (
              <Button
                variant="danger"
                full
                loading={unlinking}
                onClick={handleUnlinkPalm}
                className="h-10 text-xs font-semibold"
              >
                Unlink Palm Print
              </Button>
            ) : (
              <Button
                variant="primary"
                full
                onClick={() => navigate('/scan')}
                className="h-10 text-xs font-semibold"
              >
                Enrol Palm Now
              </Button>
            )}
          </div>
        </Card>

        {/* Saved Cards & Payment Authorization Card */}
        <Card className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-tint text-accent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-ink">Linked Card (Paystack)</h2>
                <p className="text-xs text-ink-muted">Direct settlement authorization</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-hairline bg-canvas p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-12 items-center justify-center rounded-lg bg-surface border border-hairline text-[10px] font-bold text-accent">
                  VISA
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">•••• 4242</p>
                  <p className="text-[11px] text-ink-faint">Expires 12/28</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                Active
              </span>
            </div>
          </div>
        </Card>

        {/* Privacy & Account Settings */}
        <Card className="space-y-3">
          <h2 className="text-sm font-bold text-ink">Account & Security</h2>
          <div className="space-y-1">
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink-muted">Data Protection & DPIA</span>
              <span className="font-medium text-accent">Compliant</span>
            </div>
            <div className="flex items-center justify-between border-t border-hairline py-2 text-xs">
              <span className="text-ink-muted">App Version</span>
              <span className="font-mono text-ink">v1.2.0-finals</span>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="secondary"
              full
              onClick={handleSignOut}
              className="h-11 text-sm font-semibold text-danger border-danger/30 hover:bg-danger-tint"
            >
              Sign Out
            </Button>
          </div>
        </Card>
      </div>
    </PwaShell>
  );
}
