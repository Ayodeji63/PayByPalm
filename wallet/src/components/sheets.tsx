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
  const absAmount = formatNaira(Math.abs(transaction.amountMinor)).replace('₦', '').trim();

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
    <Sheet title={isCredit ? 'Top Up Details' : 'Payment Details'} onClose={onClose}>
      <div className="text-center py-2">
        <div className="flex items-baseline justify-center gap-1.5 font-black">
          <span className={`text-3xl sm:text-4xl ${isCredit ? 'text-emerald-600' : 'text-slate-800'}`}>
            {isCredit ? '+' : '−'}
          </span>
          <span className="text-2xl sm:text-3xl text-slate-500 font-bold">₦</span>
          <span className="text-4xl sm:text-5xl tracking-normal text-slate-900">
            {absAmount}
          </span>
        </div>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          {transaction.merchantName ?? (isCredit ? 'Wallet Top-up' : 'Campus Payment')}
        </p>
      </div>

      <dl className="mt-5 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-xs">
        <Row
          label="Status"
          value={<span className="font-bold text-emerald-600">{transaction.status || 'Settled'}</span>}
        />
        <Row label="When" value={formatWhenLong(transaction.settledAt ?? transaction.createdAt)} />
        {transaction.terminalLabel && <Row label="Terminal" value={transaction.terminalLabel} />}
        {transaction.description && <Row label="Note" value={transaction.description} />}
        {transaction.authorisedByPalm && (
          <Row
            label="Authorised by"
            value={
              <span className="inline-flex items-center gap-1 font-bold text-[#1d4ed8]">
                <PalmIcon className="h-3.5 w-3.5" />
                Palm Biometric
                {transaction.matchScore !== null && (
                  <span className="text-slate-400 font-normal text-[10px]">· score {transaction.matchScore}</span>
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

      <div className="mt-4">
        {transaction.disputedAt ? (
          <Banner tone="warning">
            Under review — raised {formatWhenLong(transaction.disputedAt)}.
          </Banner>
        ) : showForm ? (
          <div>
            <label htmlFor="dispute-reason" className="block text-xs font-bold text-slate-700">
              What went wrong?
            </label>
            <textarea
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="I was not at this terminal…"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-[#1d4ed8] focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="mt-3 flex gap-2.5">
              <Button variant="secondary" full onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button variant="danger" full loading={disputing} onClick={submitDispute}>
                Submit
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-rose-500 active:scale-95 transition-all text-center"
          >
            Dispute this payment
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="text-slate-400 font-medium">{label}</dt>
      <dd className="text-right font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
