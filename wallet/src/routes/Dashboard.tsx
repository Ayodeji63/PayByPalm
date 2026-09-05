/**
 * Dashboard — Premium Google Wallet-inspired home screen.
 *
 * Design inspired by modern fintech apps: blue gradient card, circular quick
 * actions, recent transactions list with merchant avatars.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type TransactionPage, type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira, formatWhen } from '../lib/money.js';
import { PalmIcon, Skeleton } from '../components/ui.js';
import { TransactionSheet } from '../components/sheets.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function Dashboard() {
  const { me, refresh, consentGiven } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [selectedTx, setSelectedTx] = useState<TransactionSummary | null>(null);
  const [loadingTx, setLoadingTx] = useState(true);
  const [balanceVisible, setBalanceVisible] = useState(true);

  // Fetch recent transactions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<TransactionPage>('/transactions?limit=5&offset=0');
        if (!cancelled) setTransactions(data.transactions);
      } catch {
        // Swallow — the dashboard still works without history
      } finally {
        if (!cancelled) setLoadingTx(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.balanceMinor]);

  if (!me) {
    return (
      <div className="px-5 py-8 space-y-4 animate-fade-in">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="flex gap-4 mt-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-20 rounded-full" />)}
        </div>
      </div>
    );
  }

  const firstName = me.fullName.split(' ')[0];

  return (
    <PageTransition>
      <div className="pb-6">
        {/* ─── Blue header background ─── */}
        <div
          className="relative px-5 pb-28 pt-6"
          style={{ background: 'linear-gradient(135deg, #2851c5 0%, #1a3a9e 100%)' }}
        >
          {/* Greeting row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white font-bold text-lg">
                {firstName?.charAt(0) ?? 'U'}
              </div>
              <div>
                <p className="text-xs text-white/60 font-medium">Welcome Back</p>
                <h1 className="text-base font-bold text-white tracking-tight">{me.fullName}</h1>
              </div>
            </div>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                1
              </span>
            </button>
          </div>
        </div>

        {/* ─── Wallet Card — floating over the blue/white boundary ─── */}
        <div className="relative -mt-[88px] px-5">
          <div
            className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl"
            style={{
              background: 'linear-gradient(145deg, #1e3faa 0%, #0f2266 50%, #0a1a4d 100%)',
            }}
          >
            {/* Decorative circles */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.04]" />
            <div className="pointer-events-none absolute -right-4 top-12 h-20 w-20 rounded-full bg-white/[0.03]" />

            {/* Top row: logo + card last 4 */}
            <div className="flex items-start justify-between">
              <img
                src="/images/logo-white.jpg"
                alt="PayByPalm"
                className="h-9 w-9 rounded-lg"
              />
              <div className="flex items-center gap-2">
                {me.palmEnrolled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-green-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    Palm Linked
                  </span>
                )}
                <span className="text-sm font-medium text-white/50">•••• {me.phone.replace(/\D/g, '').slice(-4)}</span>
              </div>
            </div>

            {/* Balance */}
            <div className="mt-5">
              <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Total Balance</p>
              <div className="mt-1 flex items-center gap-3">
                <p className="text-3xl font-extrabold tracking-tight">
                  {balanceVisible ? formatNaira(me.balanceMinor) : '₦ •••••••'}
                </p>
                <button
                  type="button"
                  onClick={() => setBalanceVisible(!balanceVisible)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                  aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
                >
                  {balanceVisible ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Bottom: Name */}
            <p className="mt-3 text-sm font-medium text-white/60">{me.fullName}</p>
          </div>
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="mt-6 px-5">
          <div className="flex justify-around">
            <QuickActionBtn
              label="Top-Up"
              color="#2851c5"
              onClick={() => navigate('/topup')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              }
            />
            <QuickActionBtn
              label="Link Palm"
              color="#16a34a"
              onClick={() => navigate(consentGiven ? '/scan' : '/consent')}
              icon={<PalmIcon className="h-[22px] w-[22px]" />}
            />
            <QuickActionBtn
              label="Transfer"
              color="#9333ea"
              disabled
              onClick={() => toast.show('Transfers coming soon!', 'info')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17l-4-4 4-4M17 7l4 4-4 4M3 13h18M21 11H3" />
                </svg>
              }
            />
            <QuickActionBtn
              label="Kiosks"
              color="#ea580c"
              onClick={() => navigate('/merchant')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="15" rx="2" />
                  <path d="M17 2l-5 5-5-5" />
                </svg>
              }
            />
          </div>
        </div>

        {/* ─── Palm status banner — only when not enrolled ─── */}
        {!me.palmEnrolled && (
          <div className="mt-5 px-5">
            <button
              type="button"
              onClick={() => navigate(consentGiven ? '/scan' : '/consent')}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-[#2851c5]/10 bg-[#2851c5]/[0.04] p-4 text-left transition-all hover:bg-[#2851c5]/[0.08] active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2851c5] text-white shadow-md">
                <PalmIcon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">Link your palm</p>
                <p className="text-xs text-gray-500 mt-0.5">Set up contactless payments at any terminal</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2851c5]/10">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2851c5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          </div>
        )}

        {/* ─── Recent Transactions ─── */}
        <div className="mt-7 px-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Recent Payments</h2>
            {transactions.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/activity')}
                className="text-sm font-semibold text-[#2851c5]"
              >
                See all
              </button>
            )}
          </div>

          {loadingTx ? (
            <div className="mt-4 space-y-3">
              {[1,2,3].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="mt-6 flex flex-col items-center py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" />
                  <path d="M1 10h22" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-gray-500">No payments yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Your palm payment history will appear here
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2 stagger">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  onClick={() => setSelectedTx(tx)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaction detail sheet */}
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

// ---------------------------------------------------------------------------
// Quick Action Button — circular icon with label
// ---------------------------------------------------------------------------

function QuickActionBtn({
  label,
  icon,
  color,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 transition-transform active:scale-95 disabled:opacity-40"
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md"
        style={{ background: disabled ? '#cbd5e1' : color }}
      >
        {icon}
      </div>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

function TransactionRow({
  transaction,
  onClick,
}: {
  transaction: TransactionSummary;
  onClick: () => void;
}) {
  const isCredit = transaction.direction === 'credit';
  const merchantName = transaction.merchantName ?? 'Wallet top-up';
  const initial = merchantName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 p-4 text-left transition-all hover:bg-gray-100 active:scale-[0.99]"
    >
      {/* Merchant initial avatar */}
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold ${
        isCredit ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600'
      }`}>
        {isCredit ? '↓' : initial}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{merchantName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatWhen(transaction.settledAt ?? transaction.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-bold ${isCredit ? 'text-green-600' : 'text-gray-900'}`}>
          {isCredit ? '+' : '−'}{formatNaira(transaction.amountMinor)}
        </span>
        {transaction.authorisedByPalm && (
          <PalmIcon className="h-4 w-4 text-[#2851c5]" />
        )}
      </div>
    </button>
  );
}
