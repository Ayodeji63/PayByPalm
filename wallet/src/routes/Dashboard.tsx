/**
 * Dashboard — page 3 of 4.
 *
 * Balance card, quick actions, statistics, and history on one scrolling page.
 * Top-up, profile, and transaction detail open as sheets rather than routes,
 * which is what keeps the app to four pages without losing anything.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type TransactionPage, type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira, formatWhen } from '../lib/money.js';
import { Chart, type ChartPoint } from '../components/Chart.js';
import { ProfileSheet, TopUpSheet, TransactionSheet } from '../components/sheets.js';
import {
  BottomNav,
  Button,
  EmptyState,
  ErrorState,
  PalmIcon,
  Pill,
  Screen,
  Skeleton,
} from '../components/ui.js';

type Sheet = 'none' | 'topup' | 'profile';
type Flow = 'expenses' | 'income';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Dashboard() {
  const { me } = useAuth();

  const [page, setPage] = useState<TransactionPage | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const [sheet, setSheet] = useState<Sheet>('none');
  const [selected, setSelected] = useState<TransactionSummary | null>(null);
  const [flow, setFlow] = useState<Flow>('expenses');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await api.get<TransactionPage>('/transactions?limit=60&offset=0'));
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The balance is polled by AuthProvider; when it moves, a payment landed at a
  // terminal and the list below is stale too.
  useEffect(() => {
    if (me) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.balanceMinor]);

  const settled = useMemo(
    () => (page?.transactions ?? []).filter((t) => t.status === 'settled'),
    [page],
  );

  /** Last six months of totals for the selected flow. */
  const points: ChartPoint[] = useMemo(() => {
    const now = new Date();
    const buckets: ChartPoint[] = [];
    const index = new Map<string, number>();

    for (let back = 5; back >= 0; back -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      index.set(key, buckets.length);
      buckets.push({ label: MONTHS[date.getMonth()]!, valueMinor: 0 });
    }

    for (const txn of settled) {
      if ((flow === 'expenses') !== (txn.direction === 'debit')) continue;
      const date = new Date(txn.createdAt);
      const slot = index.get(`${date.getFullYear()}-${date.getMonth()}`);
      if (slot !== undefined) buckets[slot]!.valueMinor += txn.amountMinor;
    }

    return buckets;
  }, [settled, flow]);

  const [highlight, setHighlight] = useState(5);
  const hasChartData = points.some((p) => p.valueMinor > 0);

  const visible = showAll ? (page?.transactions ?? []) : (page?.transactions ?? []).slice(0, 5);

  return (
    <>
      <Screen className="pb-nav">
        <span id="top" />

        {/* --- Header --------------------------------------------------- */}
        <header className="flex items-center justify-between pt-6 pb-5">
          <div className="min-w-0">
            <p className="text-sm text-ink-muted">Welcome back</p>
            <p className="truncate text-lg font-bold tracking-tight">{me?.fullName ?? '—'}</p>
          </div>
          <button
            type="button"
            onClick={() => setSheet('profile')}
            aria-label="Profile and settings"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-surface"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* --- Balance card --------------------------------------------- */}
        <section aria-label="Balance" className="rounded-3xl bg-accent p-6 text-white">
          <div className="flex items-start justify-between">
            <PalmIcon className="h-7 w-7 text-white/90" />
            <span className="numeric text-sm text-white/70">
              •••• {(me?.phone ?? '••••').slice(-4)}
            </span>
          </div>

          {me ? (
            <p className="numeric mt-7 text-[38px] leading-none font-bold tracking-tight">
              {formatNaira(me.balanceMinor)}
            </p>
          ) : (
            <div className="mt-7 h-9 w-44 animate-pulse rounded bg-white/25" />
          )}

          <div className="mt-6 flex items-end justify-between">
            <p className="truncate text-sm font-medium text-white/90">{me?.fullName ?? ''}</p>
            <p className="text-xs text-white/70">
              {me?.palmEnrolled ? 'Palm linked' : 'Palm not linked'}
            </p>
          </div>
        </section>

        {/* --- Quick actions -------------------------------------------- */}
        <div className="mt-6 grid grid-cols-4 gap-2">
          <Action label="Send" disabled title="Coming soon">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </Action>
          <Action label="Top-Up" onClick={() => setSheet('topup')}>
            <path d="M12 5v14M5 12h14" />
          </Action>
          <Action label="Scan" to="/scan">
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16" />
          </Action>
          <Action label="More" onClick={() => setSheet('profile')}>
            <path d="M5 12h.01M12 12h.01M19 12h.01" />
          </Action>
        </div>

        {/* --- Palm prompt ---------------------------------------------- */}
        {/* Shown only while unenrolled. Once linked it disappears entirely —
            an enrolled user is never nagged to enrol again. */}
        {me && !me.palmEnrolled && (
          <Link
            to="/scan"
            className="mt-6 flex items-center gap-4 rounded-3xl bg-accent-tint p-5"
          >
            <PalmIcon className="h-8 w-8 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-accent-strong">Link your palm</p>
              <p className="mt-0.5 text-sm text-ink-muted">
                One visit to a terminal and you can pay with your hand alone.
              </p>
            </div>
            <span aria-hidden="true" className="text-accent">
              ›
            </span>
          </Link>
        )}

        {/* --- Statistics ----------------------------------------------- */}
        <section id="stats" className="mt-8 rounded-3xl border border-hairline bg-surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold tracking-tight">Statistics</h2>
              <p className="text-xs text-ink-muted">All your transaction history</p>
            </div>
          </div>

          <div className="mt-4 flex gap-1 rounded-full bg-canvas p-1">
            <Pill active={flow === 'expenses'} onClick={() => setFlow('expenses')}>
              Expenses
            </Pill>
            <Pill active={flow === 'income'} onClick={() => setFlow('income')}>
              Income
            </Pill>
          </div>

          {loading ? (
            <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
          ) : hasChartData ? (
            <Chart points={points} highlightIndex={highlight} onSelect={setHighlight} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">
              No {flow} yet. Once you start paying, six months of history appears here.
            </p>
          )}
        </section>

        {/* --- History -------------------------------------------------- */}
        <section id="history" className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-bold tracking-tight">
              {flow === 'income' ? 'Income' : 'Expenses'} history
            </h2>
            {(page?.transactions.length ?? 0) > 5 && (
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                className="text-sm font-semibold text-accent"
              >
                {showAll ? 'Show less' : 'See all'}
              </button>
            )}
          </div>

          <div className="mt-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            ) : error ? (
              <ErrorState
                message={error.message}
                onRetry={load}
                requestId={error.requestId}
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="Nothing here yet"
                body="Payments you make at a terminal show up here within seconds."
                action={<Button onClick={() => setSheet('topup')}>Add some funds</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {visible.map((txn) => (
                  <TransactionRow key={txn.id} txn={txn} onOpen={() => setSelected(txn)} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </Screen>

      <BottomNav onProfile={() => setSheet('profile')} />

      {sheet === 'topup' && <TopUpSheet onClose={() => setSheet('none')} />}
      {sheet === 'profile' && <ProfileSheet onClose={() => setSheet('none')} />}
      {selected && (
        <TransactionSheet
          transaction={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function Action({
  label,
  children,
  to,
  onClick,
  disabled,
  title,
}: {
  label: string;
  children: React.ReactNode;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const inner = (
    <>
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
          disabled ? 'bg-canvas text-ink-faint' : 'bg-accent-tint text-accent'
        }`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {children}
        </svg>
      </span>
      <span className={`text-xs font-medium ${disabled ? 'text-ink-faint' : 'text-ink-muted'}`}>
        {label}
      </span>
    </>
  );

  const shell = 'flex flex-col items-center gap-2';

  if (to) {
    return (
      <Link to={to} className={shell}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={shell}>
      {inner}
    </button>
  );
}

function TransactionRow({ txn, onOpen }: { txn: TransactionSummary; onOpen: () => void }) {
  const isCredit = txn.direction === 'credit';
  const dead = txn.status === 'failed' || txn.status === 'cancelled';
  const name = txn.merchantName ?? (isCredit ? 'Top up' : 'Payment');

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-surface p-3.5 text-left"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-bold text-ink-muted">
          {name.charAt(0).toUpperCase()}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
            {txn.authorisedByPalm && <PalmIcon className="h-3.5 w-3.5 shrink-0 text-accent" />}
            <span>{formatWhen(txn.createdAt)}</span>
            {dead && <span className="text-danger">· {txn.status}</span>}
            {txn.disputedAt && <span className="text-warning">· disputed</span>}
          </span>
        </span>

        <span
          className={`numeric shrink-0 text-sm font-bold ${
            dead ? 'text-ink-faint line-through' : isCredit ? 'text-success' : 'text-ink'
          }`}
        >
          {isCredit ? '+' : '−'}
          {formatNaira(txn.amountMinor)}
        </span>
      </button>
    </li>
  );
}
