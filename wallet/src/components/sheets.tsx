/**
 * Bottom sheets — kept lean after the redesign.
 *
 * TopUpSheet and ProfileSheet are removed — replaced by full-page routes
 * (/topup and /profile). Only TransactionSheet remains.
 */

import { useState } from 'react';
import { api, ApiError, type TransactionSummary } from '../lib/api.js';
import { formatNaira, formatWhenLong } from '../lib/money.js';
import { useToast } from './Toast.js';
import { Banner, Button, PalmIcon, Sheet } from './ui.js';

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
