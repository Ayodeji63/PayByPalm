/**
 * Activity — full transaction history.
 *
 * Shows all transactions grouped by date, with expense/income filter pills.
 * Each row is tappable to open the TransactionSheet.
 */

import { useState, useEffect } from 'react';
import { api, type TransactionPage, type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira, formatWhen } from '../lib/money.js';
import { PageHeader, Pill, Skeleton, EmptyState, PalmIcon } from '../components/ui.js';
import { TransactionSheet } from '../components/sheets.js';
import { PageTransition } from '../components/transitions.js';

type Filter = 'all' | 'debit' | 'credit';

export default function Activity() {
  const { me, refresh } = useAuth();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedTx, setSelectedTx] = useState<TransactionSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<TransactionPage>('/transactions?limit=50&offset=0');
        if (!cancelled) setTransactions(data.transactions);
      } catch {
        // Failed to load
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.balanceMinor]);

  const filtered = transactions.filter((tx) => {
    if (filter === 'debit') return tx.direction === 'debit';
    if (filter === 'credit') return tx.direction === 'credit';
    return true;
  });

  const grouped = groupByDate(filtered);

  return (
    <PageTransition>
      <div className="px-5 py-2">
        <PageHeader title="Transaction History" />

        {/* Filter pills */}
        <div className="mt-2 flex gap-2">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill active={filter === 'debit'} onClick={() => setFilter('debit')}>Expenses</Pill>
          <Pill active={filter === 'credit'} onClick={() => setFilter('credit')}>Income</Pill>
        </div>

        {/* Summary card */}
        {!loading && filtered.length > 0 && (
          <div className="mt-4 rounded-2xl bg-surface p-4">
            <div className="flex justify-between text-center">
              <div>
                <p className="text-xs text-ink-faint">Total Spent</p>
                <p className="numeric text-lg font-bold text-danger">
                  {formatNaira(filtered.filter(t => t.direction === 'debit').reduce((s, t) => s + t.amountMinor, 0))}
                </p>
              </div>
              <div className="h-10 w-px bg-hairline" />
              <div>
                <p className="text-xs text-ink-faint">Total Received</p>
                <p className="numeric text-lg font-bold text-success">
                  {formatNaira(filtered.filter(t => t.direction === 'credit').reduce((s, t) => s + t.amountMinor, 0))}
                </p>
              </div>
              <div className="h-10 w-px bg-hairline" />
              <div>
                <p className="text-xs text-ink-faint">Transactions</p>
                <p className="text-lg font-bold">{filtered.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction list */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="No transactions yet"
              body="Your payment history will appear here after your first transaction."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {grouped.map(({ label, items }) => (
              <div key={label}>
                <p className="mb-2 text-xs font-semibold uppercase text-ink-faint tracking-wider">{label}</p>
                <div className="space-y-1.5">
                  {items.map((tx) => (
                    <TxRow key={tx.id} tx={tx} onClick={() => setSelectedTx(tx)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTx && (
        <TransactionSheet
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onChanged={() => { void refresh(); setSelectedTx(null); }}
        />
      )}
    </PageTransition>
  );
}

function TxRow({ tx, onClick }: { tx: TransactionSummary; onClick: () => void }) {
  const isCredit = tx.direction === 'credit';
  const name = tx.merchantName ?? 'Wallet top-up';
  const initial = name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left transition-colors hover:bg-canvas"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
        isCredit ? 'bg-success-tint text-success' : 'bg-canvas text-ink-muted'
      }`}>
        {isCredit ? '↓' : initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-ink-faint">
          {formatWhen(tx.settledAt ?? tx.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`numeric text-sm font-bold ${isCredit ? 'text-success' : 'text-ink'}`}>
          {isCredit ? '+' : '−'}{formatNaira(tx.amountMinor)}
        </span>
        {tx.authorisedByPalm && <PalmIcon className="h-4 w-4 text-accent" />}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Group transactions by date
// ---------------------------------------------------------------------------

interface DateGroup {
  label: string;
  items: TransactionSummary[];
}

function groupByDate(transactions: TransactionSummary[]): DateGroup[] {
  const groups = new Map<string, TransactionSummary[]>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const tx of transactions) {
    const d = new Date(tx.settledAt ?? tx.createdAt);
    let label: string;

    if (isSameDay(d, today)) {
      label = 'Today';
    } else if (isSameDay(d, yesterday)) {
      label = 'Yesterday';
    } else if (isThisWeek(d, today)) {
      label = 'This Week';
    } else {
      label = d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
    }

    const arr = groups.get(label) ?? [];
    arr.push(tx);
    groups.set(label, arr);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isThisWeek(d: Date, today: Date) {
  const diff = today.getTime() - d.getTime();
  return diff < 7 * 24 * 60 * 60 * 1000 && diff >= 0;
}
