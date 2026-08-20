/**
 * Bottom sheets.
 *
 * These carry what used to be three separate routes — top-up, settings, and
 * transaction detail. The app is deliberately four pages, so this is where that
 * functionality lives. Nothing was dropped in the consolidation: unlinking a
 * palm, changing a PIN, and disputing a payment all still work.
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira, formatWhenLong, parseNairaToMinor } from '../lib/money.js';
import { useToast } from './Toast.js';
import { Banner, Button, Field, PalmIcon, Sheet } from './ui.js';

// ---------------------------------------------------------------------------
// Top up
// ---------------------------------------------------------------------------

const PRESETS_MINOR = [1_000_00, 2_000_00, 5_000_00, 10_000_00];

export function TopUpSheet({ onClose }: { onClose: () => void }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountMinor = parseNairaToMinor(amount);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter an amount, for example 2000.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post('/topup', { amountMinor });
      await refresh();
      toast.show(`${formatNaira(amountMinor)} added`, 'success');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add funds. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Top up" onClose={onClose}>
      <Banner tone="warning">
        <strong className="font-semibold">Sandbox funds.</strong> This is a demo wallet — no real
        money moves.
      </Banner>

      <form onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
        <Field
          label="Amount"
          type="text"
          inputMode="decimal"
          placeholder="2000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={error ?? undefined}
          autoFocus
        />

        <div className="grid grid-cols-4 gap-2">
          {PRESETS_MINOR.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setAmount(String(preset / 100));
                setError(null);
              }}
              className="rounded-xl bg-canvas py-2.5 text-sm font-semibold text-ink-muted hover:bg-accent-tint hover:text-accent"
            >
              {(preset / 100).toLocaleString('en-NG')}
            </button>
          ))}
        </div>

        <Button type="submit" full loading={busy} disabled={amountMinor === null}>
          {amountMinor !== null ? `Add ${formatNaira(amountMinor)}` : 'Add funds'}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Profile / settings
// ---------------------------------------------------------------------------

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { me, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [view, setView] = useState<'menu' | 'pin' | 'unlink'>('menu');

  return (
    <Sheet title="Profile" onClose={onClose}>
      <div className="flex items-center gap-3 rounded-2xl bg-canvas p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
          {(me?.fullName ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{me?.fullName ?? '—'}</p>
          <p className="numeric text-sm text-ink-muted">{me?.phone ?? ''}</p>
        </div>
      </div>

      {view === 'menu' && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-hairline p-4">
            <PalmIcon className={`h-6 w-6 ${me?.palmEnrolled ? 'text-accent' : 'text-ink-faint'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {me?.palmEnrolled ? 'Palm linked' : 'No palm linked'}
              </p>
              <p className="text-xs text-ink-muted">
                {me?.palmEnrolled
                  ? 'Pay at any terminal without your phone.'
                  : 'Scan a terminal code to set it up.'}
              </p>
            </div>
          </div>

          {me?.palmEnrolled ? (
            <Button variant="danger" full onClick={() => setView('unlink')}>
              Unlink palm
            </Button>
          ) : (
            <Button
              full
              onClick={() => {
                onClose();
                navigate('/scan');
              }}
            >
              Link your palm
            </Button>
          )}

          <Button variant="secondary" full onClick={() => setView('pin')}>
            {me?.hasPin ? 'Change wallet PIN' : 'Set a wallet PIN'}
          </Button>

          <Button
            variant="ghost"
            full
            onClick={() => {
              signOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      )}

      {view === 'pin' && (
        <ChangePin
          hasExistingPin={me?.hasPin ?? false}
          onCancel={() => setView('menu')}
          onDone={async () => {
            setView('menu');
            await refresh();
            toast.show('PIN updated.', 'success');
          }}
        />
      )}

      {view === 'unlink' && (
        <UnlinkPalm
          onCancel={() => setView('menu')}
          onDone={async () => {
            setView('menu');
            await refresh();
            toast.show('Palm unlinked.', 'info');
          }}
        />
      )}
    </Sheet>
  );
}

function ChangePin({
  hasExistingPin,
  onDone,
  onCancel,
}: {
  hasExistingPin: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 4);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/me/pin', { ...(hasExistingPin ? { currentPin } : {}), newPin });
      await onDone();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.details?.newPin ?? err.message : 'Could not update your PIN.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      {hasExistingPin && (
        <Field
          label="Current PIN"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={currentPin}
          onChange={(e) => setCurrentPin(digits(e.target.value))}
          required
        />
      )}
      <Field
        label="New PIN"
        type="password"
        inputMode="numeric"
        maxLength={4}
        hint="Four digits. Avoid 1234 or four of the same digit."
        value={newPin}
        onChange={(e) => setNewPin(digits(e.target.value))}
        error={error ?? undefined}
        required
      />
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" full onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" full loading={busy} disabled={newPin.length !== 4}>
          Save
        </Button>
      </div>
    </form>
  );
}

function UnlinkPalm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/palm/revoke');
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not unlink your palm.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <p className="text-sm text-ink-muted">
        You will not be able to pay with your palm until you set it up again — and that has to be
        done in person at a terminal, not from this app.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" full onClick={onCancel} disabled={busy}>
          Keep it
        </Button>
        <Button variant="danger" full loading={busy} onClick={confirm}>
          Unlink
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction detail
// ---------------------------------------------------------------------------

export function TransactionSheet({
  transaction,
  onClose,
  onChanged,
}: {
  transaction: TransactionSummary;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [disputing, setDisputing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');

  const isCredit = transaction.direction === 'credit';

  async function submitDispute() {
    setDisputing(true);
    try {
      await api.post(`/transactions/${transaction.id}/dispute`, {
        reason: reason.trim() || 'Not recognised by the account holder',
      });
      toast.show('Dispute recorded. Someone will review this payment.', 'success');
      setShowForm(false);
      onChanged();
      onClose();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not record the dispute.', 'error');
    } finally {
      setDisputing(false);
    }
  }

  return (
    <Sheet title={isCredit ? 'Top up' : 'Payment'} onClose={onClose}>
      <div className="text-center">
        <p className="numeric text-4xl font-bold tracking-tight">
          {isCredit ? '+' : '−'}
          {formatNaira(transaction.amountMinor)}
        </p>
        <p className="mt-1 text-ink-muted">{transaction.merchantName ?? 'Wallet top-up'}</p>
      </div>

      <dl className="mt-6 divide-y divide-hairline rounded-2xl bg-canvas px-4 text-sm">
        <Row label="Status" value={transaction.status} />
        <Row label="When" value={formatWhenLong(transaction.settledAt ?? transaction.createdAt)} />
        {transaction.terminalLabel && <Row label="Terminal" value={transaction.terminalLabel} />}
        {transaction.description && <Row label="Note" value={transaction.description} />}
        {transaction.authorisedByPalm && (
          <Row
            label="Authorised by"
            value={
              <span className="inline-flex items-center gap-1.5">
                <PalmIcon className="h-4 w-4 text-accent" />
                Palm
                {transaction.matchScore !== null && (
                  <span className="text-ink-faint">· score {transaction.matchScore}</span>
                )}
              </span>
            }
          />
        )}
        {transaction.matchMode && (
          <Row
            label="Match mode"
            value={
              transaction.matchMode === 'compare' ? 'Verified against your number' : 'Palm search'
            }
          />
        )}
      </dl>

      <div className="mt-5">
        {transaction.disputedAt ? (
          <Banner tone="warning">
            Under review — raised {formatWhenLong(transaction.disputedAt)}.
          </Banner>
        ) : showForm ? (
          <div>
            <label htmlFor="dispute-reason" className="block text-sm font-medium">
              What went wrong?
            </label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="I was not at this terminal…"
              className="mt-2 w-full rounded-2xl border border-transparent bg-canvas p-3 text-base outline-none focus:border-accent"
            />
            <div className="mt-3 flex gap-3">
              <Button variant="secondary" full onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button variant="danger" full loading={disputing} onClick={submitDispute}>
                Submit
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" full onClick={() => setShowForm(true)}>
            Dispute this payment
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}
