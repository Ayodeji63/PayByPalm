import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.js';
import { PalmIcon } from '../components/ui.js';
import { TransactionSheet } from '../components/sheets.js';
import { useToast } from '../components/Toast.js';
import { formatNaira } from '../lib/money.js';
import type { TransactionSummary } from '../lib/api.js';

interface KioskRecord {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'rebooting' | 'offline';
  uptime: string;
  hardware: string;
  lastSeen: string;
  configVersion: string;
}

interface MerchantSale {
  id: string;
  customer: string;
  amountMinor: number;
  time: string;
  date: string;
  terminalLabel: string;
  status: 'settled' | 'pending';
  authorisedByPalm: boolean;
  matchScore: number;
}

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedTab, setSelectedTab] = useState<'overview' | 'terminals' | 'settlement'>('overview');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [selectedTx, setSelectedTx] = useState<TransactionSummary | null>(null);

  // Live state for revenue and sales (allowing interactive simulation)
  const [revenueMinor, setRevenueMinor] = useState<number>(14250000); // ₦142,500.00
  const [sales, setSales] = useState<MerchantSale[]>([
    {
      id: 'tx_981',
      customer: 'Adaobi K.',
      amountMinor: 4250000,
      time: '12:42 PM',
      date: 'Today',
      terminalLabel: 'Main Counter Kiosk #1',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 99,
    },
    {
      id: 'tx_982',
      customer: 'Michael S.',
      amountMinor: 130000,
      time: '12:35 PM',
      date: 'Today',
      terminalLabel: 'Main Counter Kiosk #1',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 97,
    },
    {
      id: 'tx_983',
      customer: 'Fatima I.',
      amountMinor: 100000,
      time: '12:15 PM',
      date: 'Today',
      terminalLabel: 'Express Lane Kiosk #2',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 98,
    },
    {
      id: 'tx_984',
      customer: 'Babatunde O.',
      amountMinor: 350000,
      time: '11:50 AM',
      date: 'Today',
      terminalLabel: 'Main Counter Kiosk #1',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 96,
    },
    {
      id: 'tx_985',
      customer: 'Chioma A.',
      amountMinor: 20000,
      time: '11:20 AM',
      date: 'Today',
      terminalLabel: 'Express Lane Kiosk #2',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 98,
    },
    {
      id: 'tx_986',
      customer: 'Emeka K.',
      amountMinor: 110000,
      time: '10:45 AM',
      date: 'Today',
      terminalLabel: 'Main Counter Kiosk #1',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 99,
    },
  ]);

  // Terminals State
  const [terminals, setTerminals] = useState<KioskRecord[]>([
    {
      id: 'term_kiosk_01',
      name: 'Main Counter Kiosk #1',
      location: 'Yabatech Cafeteria A',
      status: 'online',
      uptime: '99.8%',
      hardware: 'Raspberry Pi 5 · Wide Cam v3',
      lastSeen: 'Just now',
      configVersion: 'v2.1-prod',
    },
    {
      id: 'term_kiosk_02',
      name: 'Express Lane Kiosk #2',
      location: 'Student Union Hub',
      status: 'online',
      uptime: '99.4%',
      hardware: 'Raspberry Pi 4B · Wide Cam v3',
      lastSeen: '2s ago',
      configVersion: 'v2.1-prod',
    },
  ]);

  // Simulate an instant customer payment via palm scan
  function handleSimulateSale() {
    const randomCustomers = [
      'Adaobi K.',
      'Michael S.',
      'Fatima I.',
      'Babatunde O.',
      'Chioma A.',
      'Emeka K.',
      'Tunde A.',
      'Amina B.',
    ];
    const customer = randomCustomers[Math.floor(Math.random() * randomCustomers.length)] ?? 'Adaobi K.';
    const amounts = [150000, 250000, 320000, 180000, 500000]; // in kobo minor
    const amountMinor = amounts[Math.floor(Math.random() * amounts.length)] ?? 250000;
    const newTx: MerchantSale = {
      id: `tx_${Date.now().toString().slice(-6)}`,
      customer,
      amountMinor,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      date: 'Today',
      terminalLabel: 'Main Counter Kiosk #1',
      status: 'settled',
      authorisedByPalm: true,
      matchScore: 98,
    };

    setSales((prev) => [newTx, ...prev]);
    setRevenueMinor((prev) => prev + amountMinor);
    toast.show(
      `₦${(amountMinor / 100).toLocaleString()} palm payment received from ${customer}!`,
      'success'
    );
  }

  // Handle Export CSV
  function handleExportCsv() {
    const headers = [
      'Transaction ID',
      'Customer',
      'Amount (NGN)',
      'Time',
      'Date',
      'Terminal',
      'Status',
      'Authorised By',
      'Biometric Score',
    ];
    const rows = sales.map((tx) => [
      tx.id,
      `"${tx.customer}"`,
      (tx.amountMinor / 100).toFixed(2),
      tx.time,
      tx.date,
      `"${tx.terminalLabel}"`,
      tx.status,
      tx.authorisedByPalm ? 'Palm Biometrics' : 'Card',
      tx.matchScore,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `PayByPalm_Merchant_Sales_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.show('Sales CSV statement exported successfully', 'success');
  }

  // Handle Ping Terminal
  function handlePing(id: string) {
    const term = terminals.find((t) => t.id === id);
    toast.show(`${term?.name ?? 'Terminal'} responded: latency 18ms · healthy`, 'info');
  }

  // Handle Restart Terminal
  function handleRestart(id: string) {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'rebooting' } : t))
    );
    toast.show('Restart signal dispatched to kiosk…', 'info');

    setTimeout(() => {
      setTerminals((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'online', lastSeen: 'Just now' } : t))
      );
      toast.show('Terminal rebooted & reconnected to payment mesh', 'success');
    }, 1800);
  }

  // Format revenue balance nicely
  const revenueStr = formatNaira(revenueMinor).replace('₦', '');
  const [revWhole, revKobo] = revenueStr.includes('.')
    ? revenueStr.split('.')
    : [revenueStr, '00'];

  return (
    <AppShell>
      <div className="flex flex-col min-h-dvh">
        {/* ─── Top Header: Royal Blue Aesthetic (Matching Client Dashboard) ─── */}
        <div className="bg-gradient-to-b from-[#1d4ed8] via-[#1e40af] to-[#1e3a8a] text-white pt-6 pb-6 px-5 rounded-b-[32px] shadow-lg relative">
          {/* Top Row: Store Identity & Return to Wallet Button */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 border border-white/20 text-white shadow-inner backdrop-blur-sm">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-extrabold tracking-tight text-white">Campus Mart #01</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-[11px] font-medium text-blue-200">Merchant Terminal Hub</p>
              </div>
            </div>

            {/* Quick Switch back to User Wallet */}
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              title="Return to Student Wallet"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-xs font-bold text-white transition-all backdrop-blur-sm border border-white/20 shadow-sm cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Wallet</span>
            </button>
          </div>

          {/* Revenue Balance Presentation */}
          <div className="pt-1 pb-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-200">
                Today&apos;s Palm Revenue
              </p>
              <button
                type="button"
                onClick={() => setBalanceVisible((prev) => !prev)}
                aria-label={balanceVisible ? 'Hide revenue' : 'Show revenue'}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-blue-100 transition-all border border-white/10 cursor-pointer"
              >
                {balanceVisible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>

            {/* Currency Value */}
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black text-blue-200">₦</span>
              <span className="text-4xl font-extrabold tracking-tight text-white numeric">
                {balanceVisible ? revWhole : '••••••'}
              </span>
              {balanceVisible && (
                <span className="text-xl font-bold text-blue-200">.{revKobo}</span>
              )}
            </div>

            {/* Live Status Subtitle */}
            <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5 text-[11px] text-blue-100">
              <span className="font-semibold">{sales.length} palm sales today</span>
              <span className="flex items-center gap-1 font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                T+1 Paystack Settlement
              </span>
            </div>
          </div>
        </div>

        {/* ─── Circular Quick Action Buttons (Matching Client Dashboard) ─── */}
        <div className="mt-5 px-5">
          <div className="grid grid-cols-4 gap-3 text-center">
            {/* Launch POS Kiosk */}
            <QuickActionButton
              label="POS Kiosk"
              onClick={() => navigate('/terminal')}
              badge
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              }
            />

            {/* Simulate Customer Palm Sale */}
            <QuickActionButton
              label="Test Sale"
              onClick={handleSimulateSale}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              }
            />

            {/* Settlement Details */}
            <QuickActionButton
              label="Settlement"
              onClick={() => setSelectedTab('settlement')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />

            {/* Export Statement / CSV */}
            <QuickActionButton
              label="Statement"
              onClick={handleExportCsv}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              }
            />
          </div>
        </div>

        {/* ─── Segmented Tab Switcher ─── */}
        <div className="mt-6 px-5">
          <div className="flex rounded-2xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setSelectedTab('overview')}
              className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                selectedTab === 'overview'
                  ? 'bg-white text-[#1d4ed8] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('terminals')}
              className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                selectedTab === 'terminals'
                  ? 'bg-white text-[#1d4ed8] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Kiosks ({terminals.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTab('settlement')}
              className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition-all cursor-pointer ${
                selectedTab === 'settlement'
                  ? 'bg-white text-[#1d4ed8] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              T+1 Settlement
            </button>
          </div>
        </div>

        {/* ─── TAB 1: OVERVIEW ─── */}
        {selectedTab === 'overview' && (
          <div className="mt-5 px-5 space-y-5 pb-6">
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Pending Payout
                </span>
                <p className="text-base font-black text-slate-900 mt-1 numeric">
                  {formatNaira(revenueMinor)}
                </p>
                <p className="text-[10px] font-bold text-[#1d4ed8] mt-0.5">T+1 to Wema Bank</p>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  Active Kiosks
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-base font-black text-slate-900">2 / 2 Online</p>
                </div>
                <p className="text-[10px] font-bold text-emerald-600 mt-0.5">99.8% Uptime today</p>
              </div>
            </div>

            {/* Active Kiosks Quick Card */}
            <div className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <h2 className="text-sm font-extrabold text-slate-900">Registered POS Kiosks</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTab('terminals')}
                  className="text-xs font-bold text-[#1d4ed8] hover:underline cursor-pointer"
                >
                  Manage
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {terminals.map((term) => (
                  <div key={term.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{term.name}</p>
                      <p className="text-[11px] font-medium text-slate-400">{term.location}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {term.uptime}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => navigate('/terminal')}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#1d4ed8] bg-blue-50 hover:bg-blue-100 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 border border-blue-100 cursor-pointer"
              >
                <span>Launch Kiosk Terminal App</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Recent Store Palm Payments (Matching Client Transaction Style) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Recent Store Payments
                  </h2>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {sales.length} Total
                </span>
              </div>

              {/* Transactions List */}
              <div className="space-y-2.5">
                {sales.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() =>
                      setSelectedTx({
                        id: tx.id,
                        amountMinor: tx.amountMinor,
                        direction: 'credit',
                        status: tx.status,
                        createdAt: new Date().toISOString(),
                        settledAt: new Date().toISOString(),
                        merchantName: 'Campus Mart #01',
                        description: `Customer payment by ${tx.customer} via Palm Biometrics`,
                        terminalLabel: tx.terminalLabel,
                        authorisedByPalm: tx.authorisedByPalm,
                        matchScore: tx.matchScore,
                        matchMode: 'search',
                        disputedAt: null,
                      })
                    }
                    className="flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">
                        {tx.customer}
                      </p>
                      <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                        {tx.time} · {tx.terminalLabel}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {tx.authorisedByPalm && (
                          <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#1d4ed8]">
                            <PalmIcon className="h-3 w-3" />
                            Palm
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md capitalize">
                          ● {tx.status}
                        </span>
                      </div>
                    </div>

                    {/* Right Amount Pill (Emerald Credit Pill) */}
                    <div className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[13px] font-black tracking-tight bg-emerald-100 text-emerald-800">
                      +&nbsp;{formatNaira(tx.amountMinor)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: TERMINALS / KIOSKS ─── */}
        {selectedTab === 'terminals' && (
          <div className="mt-5 px-5 space-y-4 pb-6">
            <div className="rounded-2xl bg-blue-50/80 border border-blue-200/70 p-3.5">
              <div className="flex items-center gap-2">
                <PalmIcon className="h-4 w-4 text-[#1d4ed8]" />
                <h3 className="text-xs font-bold text-slate-800">Campus POS Terminal Mesh</h3>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                Kiosks authenticate with PayByPalm hardware keys and sync palm match templates locally
                for instant &lt;300ms verification.
              </p>
            </div>

            <div className="space-y-3">
              {terminals.map((term) => (
                <div
                  key={term.id}
                  className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">{term.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{term.location}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        term.status === 'online'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800 animate-pulse'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          term.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      {term.status === 'online' ? 'Online' : 'Rebooting…'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-[11px] border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-medium">Hardware:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{term.hardware}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Firmware Config:</span>
                      <p className="font-mono font-semibold text-slate-800 mt-0.5">{term.configVersion}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Uptime:</span>
                      <p className="font-semibold text-emerald-600 mt-0.5">{term.uptime}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Last Heartbeat:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">{term.lastSeen}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePing(term.id)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all text-center cursor-pointer"
                    >
                      Ping Terminal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestart(term.id)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 active:scale-95 transition-all text-center cursor-pointer"
                    >
                      Restart
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/terminal')}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-[#1d4ed8] hover:bg-blue-700 active:scale-95 transition-all text-center shadow-sm cursor-pointer"
                    >
                      Launch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 3: T+1 SETTLEMENT ─── */}
        {selectedTab === 'settlement' && (
          <div className="mt-5 px-5 space-y-4 pb-6">
            <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 space-y-4">
              <div>
                <span className="text-[11px] font-extrabold text-[#1d4ed8] uppercase tracking-wider">
                  Settlement Architecture
                </span>
                <h2 className="text-base font-extrabold text-slate-900 mt-1">
                  Automatic Paystack Split (T+1)
                </h2>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Funds collected through biometric palm authorization settle directly into your verified bank account
                  every business day at 06:00 AM. PayByPalm never acts as a custodial wallet.
                </p>
              </div>

              {/* Bank Destination Card */}
              <div className="rounded-2xl bg-slate-50 p-4 space-y-2.5 border border-slate-100 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Settlement Bank</span>
                  <span className="font-bold text-slate-900">Wema Bank PLC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Account Name</span>
                  <span className="font-bold text-slate-900">Campus Mart #01 Operations</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Account Number</span>
                  <span className="font-mono font-bold text-slate-900">0123****89</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Payout Schedule</span>
                  <span className="font-bold text-emerald-600">Daily T+1 (06:00 AM)</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200/70">
                  <span className="text-slate-400 font-medium">Paystack Subaccount</span>
                  <span className="font-mono text-[11px] font-bold text-slate-600">ACCT_palm_mart01_sub</span>
                </div>
              </div>

              {/* Fee Split Card */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/50 p-3">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Net Store Payout</span>
                  <p className="text-sm font-black text-emerald-900 mt-0.5">
                    {formatNaira(Math.round(revenueMinor * 0.985))}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-semibold">98.5% Split</span>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Network Processing</span>
                  <p className="text-sm font-black text-slate-700 mt-0.5">
                    {formatNaira(Math.round(revenueMinor * 0.015))}
                  </p>
                  <span className="text-[10px] text-slate-500 font-semibold">1.5% Cap</span>
                </div>
              </div>
            </div>

            {/* Historical Payouts */}
            <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Settled Payout Batches</h3>
                <span className="text-xs font-bold text-slate-400">Last 3 Days</span>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-bold text-slate-800">₦121,400.00</p>
                    <p className="text-[11px] text-slate-400">Sep 10, 2026 · 06:00 AM</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    ● Paid to Bank
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-bold text-slate-800">₦98,250.00</p>
                    <p className="text-[11px] text-slate-400">Sep 9, 2026 · 06:00 AM</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    ● Paid to Bank
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-bold text-slate-800">₦154,800.00</p>
                    <p className="text-[11px] text-slate-400">Sep 8, 2026 · 06:00 AM</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    ● Paid to Bank
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Transaction Detail Sheet (Portaled to body, z-[100]) ─── */}
        {selectedTx && (
          <TransactionSheet
            transaction={selectedTx}
            onClose={() => setSelectedTx(null)}
            onChanged={() => setSelectedTx(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Circular Quick Action Button (Matching User Dashboard)
// ---------------------------------------------------------------------------

function QuickActionButton({
  label,
  icon,
  onClick,
  badge = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#1d4ed8] shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-slate-100 hover:shadow-md hover:border-blue-100 active:scale-95 transition-all cursor-pointer"
      >
        {icon}
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
        )}
      </button>
      <span className="mt-2 text-xs font-bold text-slate-700 tracking-tight">{label}</span>
    </div>
  );
}
