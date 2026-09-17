import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { PalmIcon } from '../components/ui.js';
import { useToast } from '../components/Toast.js';
import { formatNaira } from '../lib/money.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  initials: string;
  avatarBg: string;
  amountMinor: number;
  time: string;
  date: string;
  terminalLabel: string;
  method: 'Palm' | 'Card';
  status: 'Completed' | 'Pending' | 'Refunded';
  matchScore: number;
}

type MerchantTab = 'home' | 'transactions' | 'kiosks' | 'settlement';
type SubScreen = 'none' | 'pos_kiosk' | 'simulate_sale';

// ---------------------------------------------------------------------------
// Merchant Portal Component
// ---------------------------------------------------------------------------

export default function MerchantDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  // Navigation states
  const [activeTab, setActiveTab] = useState<MerchantTab>('home');
  const [subScreen, setSubScreen] = useState<SubScreen>('none');
  const [selectedKioskId, setSelectedKioskId] = useState<string>('term_kiosk_01');
  const [selectedTx, setSelectedTx] = useState<MerchantSale | null>(null);

  // Filter & Search states
  const [txFilter, setTxFilter] = useState<'All' | 'Palm' | 'Card' | 'Refunds'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [kioskFilterTab, setKioskFilterTab] = useState<'hardware' | 'settings'>('hardware');
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [simulateAmount, setSimulateAmount] = useState<number>(2500);

  // Financial & Terminal state (defaults matching reference)
  const [revenueMinor, setRevenueMinor] = useState<number>(14250000); // ₦142,500.00
  const [sales, setSales] = useState<MerchantSale[]>([
    {
      id: 'tx_101',
      customer: 'Adewale B.',
      initials: 'A',
      avatarBg: 'bg-blue-600',
      amountMinor: 250000,
      time: '12:42 PM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #01',
      method: 'Palm',
      status: 'Completed',
      matchScore: 99,
    },
    {
      id: 'tx_102',
      customer: 'Mariam T.',
      initials: 'M',
      avatarBg: 'bg-purple-600',
      amountMinor: 180000,
      time: '12:20 PM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #01',
      method: 'Palm',
      status: 'Completed',
      matchScore: 98,
    },
    {
      id: 'tx_103',
      customer: 'Tunde O.',
      initials: 'T',
      avatarBg: 'bg-emerald-600',
      amountMinor: 320000,
      time: '11:58 AM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #02',
      method: 'Palm',
      status: 'Completed',
      matchScore: 97,
    },
    {
      id: 'tx_104',
      customer: 'Sarah L.',
      initials: 'S',
      avatarBg: 'bg-amber-600',
      amountMinor: 200000,
      time: '11:32 AM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #01',
      method: 'Palm',
      status: 'Completed',
      matchScore: 99,
    },
    {
      id: 'tx_105',
      customer: 'Kehinde A.',
      initials: 'K',
      avatarBg: 'bg-indigo-600',
      amountMinor: 110000,
      time: '10:45 AM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #02',
      method: 'Palm',
      status: 'Completed',
      matchScore: 96,
    },
    {
      id: 'tx_106',
      customer: 'Chioma A.',
      initials: 'C',
      avatarBg: 'bg-orange-600',
      amountMinor: 20000,
      time: '11:20 AM',
      date: '24 Sep 2025',
      terminalLabel: 'Kiosk #01',
      method: 'Palm',
      status: 'Completed',
      matchScore: 98,
    },
  ]);

  const [terminals, setTerminals] = useState<KioskRecord[]>([
    {
      id: 'term_kiosk_01',
      name: 'Kiosk #01',
      location: 'Main Counter POS',
      status: 'online',
      uptime: '99% uptime',
      hardware: 'Raspberry Pi 5 · Wide Cam v3',
      lastSeen: '2s ago',
      configVersion: 'v2.1-prod',
    },
    {
      id: 'term_kiosk_02',
      name: 'Kiosk #02',
      location: 'Express Lane POS',
      status: 'online',
      uptime: '99% uptime',
      hardware: 'Raspberry Pi 4B · Wide Cam v3',
      lastSeen: 'Heartbeat 2s ago',
      configVersion: 'v2.1-prod',
    },
  ]);

  const activeKiosk: KioskRecord = useMemo(
    () =>
      terminals.find((t) => t.id === selectedKioskId) ??
      terminals[0] ?? {
        id: 'term_kiosk_01',
        name: 'Kiosk #01',
        location: 'Main Counter POS',
        status: 'online',
        uptime: '99% uptime',
        hardware: 'Raspberry Pi 5 · Wide Cam v3',
        lastSeen: '2s ago',
        configVersion: 'v2.1-prod',
      },
    [terminals, selectedKioskId]
  );

  // Filtered transactions for Transactions Tab
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (txFilter === 'Palm' && s.method !== 'Palm') return false;
      if (txFilter === 'Card' && s.method !== 'Card') return false;
      if (txFilter === 'Refunds' && s.status !== 'Refunded') return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          s.customer.toLowerCase().includes(query) ||
          s.terminalLabel.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [sales, txFilter, searchQuery]);

  // Execute Simulated Payment
  function handleExecuteSimulation() {
    const randomCustomers = [
      { name: 'Adewale B.', initials: 'A', bg: 'bg-blue-600' },
      { name: 'Mariam T.', initials: 'M', bg: 'bg-purple-600' },
      { name: 'Tunde O.', initials: 'T', bg: 'bg-emerald-600' },
      { name: 'Sarah L.', initials: 'S', bg: 'bg-amber-600' },
      { name: 'Kehinde A.', initials: 'K', bg: 'bg-indigo-600' },
      { name: 'Chioma A.', initials: 'C', bg: 'bg-orange-600' },
    ];
    const pick = randomCustomers[Math.floor(Math.random() * randomCustomers.length)] ?? {
      name: 'Adewale B.',
      initials: 'A',
      bg: 'bg-blue-600',
    };
    const amountMinor = simulateAmount * 100;

    const newTx: MerchantSale = {
      id: `tx_${Date.now().toString().slice(-6)}`,
      customer: pick.name,
      initials: pick.initials,
      avatarBg: pick.bg,
      amountMinor,
      time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      date: 'Today',
      terminalLabel: activeKiosk.name,
      method: 'Palm',
      status: 'Completed',
      matchScore: 98,
    };

    setSales((prev) => [newTx, ...prev]);
    setRevenueMinor((prev) => prev + amountMinor);
    toast.show(`₦${simulateAmount.toLocaleString()} palm payment approved for ${pick.name}!`, 'success');
    setSubScreen('none');
  }

  // Handle Export CSV
  function handleExportCsv() {
    const headers = ['Transaction ID', 'Customer', 'Amount (NGN)', 'Time', 'Date', 'Terminal', 'Method', 'Status'];
    const rows = sales.map((tx) => [
      tx.id,
      `"${tx.customer}"`,
      (tx.amountMinor / 100).toFixed(2),
      tx.time,
      tx.date,
      `"${tx.terminalLabel}"`,
      tx.method,
      tx.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PayByPalm_Merchant_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.show('Sales CSV Report generated & downloaded', 'success');
  }

  // Handle Reboot Terminal
  function handleRebootKiosk(id: string) {
    setTerminals((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'rebooting' } : t))
    );
    toast.show('Reboot signal sent to kiosk…', 'info');

    setTimeout(() => {
      setTerminals((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'online', lastSeen: 'Just now' } : t))
      );
      toast.show(`${activeKiosk.name} rebooted & online`, 'success');
    }, 1600);
  }

  // Format revenue strings
  const revenueStr = formatNaira(revenueMinor).replace('₦', '');
  const [revWhole, revKobo] = revenueStr.includes('.') ? revenueStr.split('.') : [revenueStr, '00'];

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-white text-slate-900 flex flex-col antialiased relative selection:bg-blue-100 selection:text-blue-900">
      {/* ─────────────────────────────────────────────────────────────────
          SUB-SCREEN: POS KIOSK DETAIL (Screen 2)
      ───────────────────────────────────────────────────────────────── */}
      {subScreen === 'pos_kiosk' && (
        <div className="flex-1 flex flex-col bg-white pb-8 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <button
              type="button"
              onClick={() => setSubScreen('none')}
              className="flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-lg font-extrabold text-slate-900">POS Kiosk</span>
            </button>
            <button
              type="button"
              onClick={() => toast.show('Kiosk hardware configuration synced (v2.1-prod)', 'info')}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          <div className="px-5 space-y-5">
            {/* Kiosk Device Visual */}
            <div className="flex flex-col items-center">
              <div className="relative flex h-48 w-44 items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-800 rounded-3xl shadow-2xl border-4 border-slate-700 flex flex-col items-center justify-between p-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-950 ring-1 ring-slate-600" />
                  <div className="h-32 w-full rounded-2xl bg-slate-950 flex flex-col items-center justify-center p-2 border border-slate-700/60 shadow-inner relative overflow-hidden">
                    <div className="h-20 w-20 rounded-full bg-blue-500/15 flex items-center justify-center ring-2 ring-[#1d4ed8]/40 animate-pulse">
                      <PalmIcon className="h-11 w-11 text-[#2563eb]" />
                    </div>
                    <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#38bdf8]" />
                  </div>
                  <div className="flex items-center gap-1">
                    <PalmIcon className="h-2.5 w-2.5 text-blue-400" />
                    <span className="text-[8px] font-bold text-slate-400 tracking-wider">PayByPalm</span>
                  </div>
                </div>
              </div>

              <h2 className="mt-5 text-xl font-black text-slate-900 tracking-tight">{activeKiosk.name}</h2>
              <p className="text-sm text-slate-500 font-medium">{activeKiosk.location}</p>

              {/* Status Pill */}
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Online</span>
              </div>
            </div>

            {/* Metric Badges Row */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5">
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                </svg>
                <span>{activeKiosk.uptime}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-100">
                <span className="text-slate-400">Last ping</span>
                <span className="text-emerald-600 font-bold">{activeKiosk.lastSeen}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">Quick Actions</h3>

              {/* Open Terminal */}
              <button
                type="button"
                onClick={() => navigate('/terminal')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#1d4ed8] text-white hover:bg-blue-700 active:scale-[0.99] transition-all shadow-md cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold leading-tight">Open Terminal</p>
                    <p className="text-[11px] text-blue-100 mt-0.5">Start taking palm payments</p>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Restart Kiosk */}
              <button
                type="button"
                onClick={() => handleRebootKiosk(activeKiosk.id)}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white text-slate-800 hover:bg-slate-50 active:scale-[0.99] transition-all border border-slate-100 shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-900 leading-tight">Restart Kiosk</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Reboot device remotely</p>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* View Logs */}
              <button
                type="button"
                onClick={() => toast.show('Zero hardware faults detected in past 24 hours.', 'info')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white text-slate-800 hover:bg-slate-50 active:scale-[0.99] transition-all border border-slate-100 shadow-sm cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-slate-900 leading-tight">View Logs</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Check device activity</p>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Security Footnote */}
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-50/60 border border-emerald-200/50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.4">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-xs font-semibold text-emerald-800">
                  Device is secure · Last heartbeat {activeKiosk.lastSeen}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          SUB-SCREEN: SIMULATE SALE (Screen 3)
      ───────────────────────────────────────────────────────────────── */}
      {subScreen === 'simulate_sale' && (
        <div className="flex-1 flex flex-col bg-white pb-8 animate-fade-in">
          {/* Header */}
          <div className="flex items-center gap-2 px-5 pt-5 pb-4">
            <button
              type="button"
              onClick={() => setSubScreen('none')}
              className="active:scale-95 transition-all cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-lg font-extrabold text-slate-900">Simulate Sale</span>
          </div>

          <div className="px-5 pt-4 space-y-6 flex-1 flex flex-col">
            <div className="space-y-6 flex flex-col items-center text-center flex-1">
              {/* Palm Biometric Icon */}
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-blue-50 border-2 border-blue-100">
                <PalmIcon className="h-14 w-14 text-[#1d4ed8]" />
              </div>

              {/* Instructions */}
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Test a palm payment</h2>
                <p className="mt-2 text-sm text-slate-500 max-w-xs leading-relaxed">
                  This will create a ₦{simulateAmount.toLocaleString()} transaction and credit your merchant account instantly (for testing purposes).
                </p>
              </div>

              {/* Amount Box */}
              <div className="w-full rounded-2xl bg-slate-50 p-5 border border-slate-100 text-center space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Amount</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <p className="text-4xl font-black text-slate-900 tracking-tight">
                  ₦{simulateAmount.toLocaleString()}
                </p>

                {/* Quick Amount Chips */}
                <div className="flex items-center gap-2 pt-3 mt-2 border-t border-slate-200">
                  {[1000, 2500, 5000, 10000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSimulateAmount(amt)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        simulateAmount === amt
                          ? 'bg-[#1d4ed8] text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="space-y-4 pt-2">
              <button
                type="button"
                onClick={handleExecuteSimulation}
                className="w-full py-4 px-6 rounded-2xl bg-[#1d4ed8] hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              >
                <PalmIcon className="h-5 w-5" />
                <span>Simulate Payment</span>
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium pb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>Funds will reflect immediately in your merchant balance (test mode).</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MAIN PORTAL SHELL (Screens 1, 4, 5, 6 depending on activeTab)
      ───────────────────────────────────────────────────────────────── */}
      {subScreen === 'none' && (
        <div className="flex-1 flex flex-col">
          {/* ─────────────────────────────────────────────────────────────
              TAB 1: HOME (Screen 1 from Reference)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'home' && (
            <div className="flex-1 flex flex-col animate-fade-in">
              {/* ─── ROYAL BLUE UPPER DECK (Matching Client Side Theme) ─── */}
              <div
                className="relative text-white pt-5 px-5 pb-7 overflow-hidden transition-all duration-300 shadow-xl"
                style={{
                  background: 'radial-gradient(ellipse at 20% 0%, #2563eb 0%, #1d4ed8 45%, #0f2468 100%)',
                }}
              >
                {/* Subtle ambient lighting arcs matching client side */}
                <div
                  className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-40 blur-3xl"
                  style={{ background: 'radial-gradient(circle, #60a5fa 0%, #1d4ed8 70%)' }}
                />
                <div
                  className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full opacity-25 blur-2xl"
                  style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }}
                />

                {/* Top Header Row */}
                <div className="relative z-10 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 shadow-md backdrop-blur-md">
                        <PalmIcon className="h-6 w-6 text-white" />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 ring-2 ring-[#0f2468]" />
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-blue-200/90 uppercase tracking-widest leading-none">
                        MERCHANT PORTAL
                      </p>
                      <h1 className="text-base font-black text-white tracking-tight mt-0.5 leading-tight">
                        Campus Mart #01
                      </h1>
                    </div>
                  </div>

                  {/* Actions: Return to Client Wallet + Notification */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-95 text-white text-xs font-bold border border-white/25 backdrop-blur-md shadow-sm transition-all cursor-pointer"
                      title="Switch to Personal Client Wallet"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                      <span>Personal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/12 hover:bg-white/20 active:scale-95 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer"
                      title="Return to Personal Wallet"
                      aria-label="Client Wallet"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M10 4v4" />
                        <path d="M2 8h20" />
                        <circle cx="16" cy="14" r="1.5" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Frosted Glass Revenue Card */}
                <div className="relative z-10 rounded-3xl bg-white/15 border border-white/25 p-5 backdrop-blur-md shadow-xl text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-blue-100">
                        TODAY&apos;S REVENUE
                      </span>
                      <button
                        type="button"
                        onClick={() => setBalanceVisible((v) => !v)}
                        className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white transition-all active:scale-95 cursor-pointer"
                        aria-label={balanceVisible ? 'Hide revenue' : 'Show revenue'}
                      >
                        {balanceVisible ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-400/25 text-emerald-200 font-bold text-[11px] border border-emerald-300/30 backdrop-blur-sm">
                      + 12%
                      <span className="text-[9px] text-emerald-100/90 font-normal">vs. yesterday</span>
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-blue-200">₦</span>
                    <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-none">
                      {balanceVisible ? revWhole : '••••••'}
                    </h2>
                    {balanceVisible && (
                      <span className="text-xl font-bold text-blue-200/90 ml-0.5">.{revKobo}</span>
                    )}
                  </div>

                  {/* Metrics row */}
                  <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/20 text-white">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                          <line x1="3" y1="6" x2="21" y2="6" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-bold text-white">{sales.length}</span>
                        <span className="text-blue-100 ml-1">Total Sales</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        <span className="font-bold text-white">₦{(revenueMinor / 100).toLocaleString()}</span>
                        <span className="text-blue-100 ml-1">Net Revenue</span>
                      </div>
                      <svg width="40" height="16" viewBox="0 0 40 16" fill="none" className="text-emerald-300">
                        <path d="M1 12 Q 8 14 14 9 T 24 7 T 33 3 T 39 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* 4 Action Cards */}
                <div className="mt-4 grid grid-cols-4 gap-2.5 relative z-10">
                  <button
                    type="button"
                    onClick={() => setSubScreen('pos_kiosk')}
                    className="flex flex-col items-center p-2.5 rounded-2xl bg-white text-slate-900 shadow-md hover:scale-[1.02] active:scale-95 transition-all text-center cursor-pointer border border-blue-100/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-slate-900 leading-tight mt-1.5">POS Kiosk</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">Open Terminal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubScreen('simulate_sale')}
                    className="flex flex-col items-center p-2.5 rounded-2xl bg-white text-slate-900 shadow-md hover:scale-[1.02] active:scale-95 transition-all text-center cursor-pointer border border-blue-100/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                      <PalmIcon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-900 leading-tight mt-1.5">Simulate Sale</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">₦2,500 test</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('settlement')}
                    className="flex flex-col items-center p-2.5 rounded-2xl bg-white text-slate-900 shadow-md hover:scale-[1.02] active:scale-95 transition-all text-center cursor-pointer border border-blue-100/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 10 12 4 21 10" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <line x1="3" y1="21" x2="21" y2="21" />
                        <line x1="6" y1="14" x2="6" y2="18" />
                        <line x1="10" y1="14" x2="10" y2="18" />
                        <line x1="14" y1="14" x2="14" y2="18" />
                        <line x1="18" y1="14" x2="18" y2="18" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-slate-900 leading-tight mt-1.5">Settlement</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">T+1 Paystack</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="flex flex-col items-center p-2.5 rounded-2xl bg-white text-slate-900 shadow-md hover:scale-[1.02] active:scale-95 transition-all text-center cursor-pointer border border-blue-100/50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-bold text-slate-900 leading-tight mt-1.5">Export CSV</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">Sales Report</span>
                  </button>
                </div>
              </div>

              {/* ─── WHITE LOWER PANEL (Elevated Sheet Cover Transition) ─── */}
              <div className="flex-1 bg-white rounded-t-[36px] -mt-6 pt-3 px-5 pb-24 shadow-[0_-12px_40px_rgba(0,0,0,0.06)] border-t border-slate-100/80 relative z-20 space-y-4">
                {/* Decorative Sheet Cover Handle Pill */}
                <div className="flex justify-center pt-1 pb-1">
                  <div className="h-1.5 w-12 rounded-full bg-slate-300/80 shadow-inner" />
                </div>

                {/* Hardware Status Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">Hardware Status</h3>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    All Online
                  </span>
                </div>

                {/* Kiosks List */}
                <div className="space-y-3">
                  {terminals.map((term, idx) => (
                    <div
                      key={term.id}
                      onClick={() => {
                        setSelectedKioskId(term.id);
                        setSubScreen('pos_kiosk');
                      }}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-200 hover:shadow-md active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 leading-tight">{term.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{term.location}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Online
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              • {idx === 0 ? term.uptime : term.lastSeen}
                            </span>
                          </div>
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  ))}
                </div>

                {/* Palm Payments Live Banner */}
                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-100 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#1d4ed8] shrink-0">
                    <PalmIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">Palm payments are live</p>
                    <p className="text-[11px] text-slate-500">Secure. Fast. Contactless.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 2: TRANSACTIONS (Screen 4)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'transactions' && (
            <div className="px-5 pt-5 pb-28 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('home')}
                    className="active:scale-95 transition-all cursor-pointer"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">Transactions</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold border border-blue-200/60 active:scale-95 transition-all cursor-pointer"
                    title="Switch to Personal Wallet"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Wallet</span>
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
                    onClick={() => setSearchQuery(searchQuery ? '' : ' ')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-2">
                {(['All', 'Palm', 'Card', 'Refunds'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTxFilter(cat)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      txFilter === cat
                        ? 'bg-[#1d4ed8] text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Transactions List */}
              <div className="space-y-2">
                {filteredSales.map((tx) => (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tx.avatarBg} text-white font-bold text-sm`}>
                        {tx.initials}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 leading-tight">{tx.customer}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{tx.time} · {tx.date}</p>
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-blue-50 text-[10px] font-bold text-[#1d4ed8]">
                          <PalmIcon className="h-3 w-3" />
                          {tx.method}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">
                      + {formatNaira(tx.amountMinor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 3: KIOSKS (Screen 6)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'kiosks' && (
            <div className="px-5 pt-5 pb-28 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('home')}
                    className="active:scale-95 transition-all cursor-pointer"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">Kiosks</h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold border border-blue-200/60 active:scale-95 transition-all cursor-pointer"
                  title="Switch to Personal Wallet"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  <span>Wallet</span>
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setKioskFilterTab('hardware')}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    kioskFilterTab === 'hardware'
                      ? 'bg-[#1d4ed8] text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Hardware
                </button>
                <button
                  type="button"
                  onClick={() => setKioskFilterTab('settings')}
                  className={`px-5 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    kioskFilterTab === 'settings'
                      ? 'bg-[#1d4ed8] text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Settings
                </button>
              </div>

              {/* Kiosks List */}
              <div className="space-y-3">
                {terminals.map((term) => (
                  <div
                    key={term.id}
                    onClick={() => {
                      setSelectedKioskId(term.id);
                      setSubScreen('pos_kiosk');
                    }}
                    className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{term.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{term.location}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Online
                          </span>
                          <span className="text-[10px] text-slate-400">
                            • {term.uptime}
                          </span>
                        </div>
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                ))}

                {/* Add New Kiosk */}
                <div
                  onClick={() => toast.show('To register another POS Kiosk, flash Pi image v2.1', 'info')}
                  className="p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#1d4ed8] flex items-center justify-center gap-2 text-sm font-bold text-[#1d4ed8] cursor-pointer hover:bg-blue-50/50 transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <div>
                    <p>Add New Kiosk</p>
                    <p className="text-xs text-slate-400 font-normal">Connect another device</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 4: SETTLEMENT (Screen 5)
          ───────────────────────────────────────────────────────────── */}
          {activeTab === 'settlement' && (
            <div className="px-5 pt-5 pb-28 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('home')}
                    className="active:scale-95 transition-all cursor-pointer"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h2 className="text-lg font-extrabold text-slate-900">Settlement</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold border border-blue-200/60 active:scale-95 transition-all cursor-pointer"
                    title="Switch to Personal Wallet"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Wallet</span>
                  </button>
                  <span className="text-xs font-bold text-[#1d4ed8] bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    T+1
                  </span>
                </div>
              </div>

              {/* Next Payout */}
              <div className="rounded-2xl bg-white p-5 border border-slate-100 space-y-2">
                <span className="text-xs font-bold text-slate-400">Next Payout</span>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  ₦{(revenueMinor / 100).toLocaleString()}.00
                </p>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Expected: Tomorrow, 25 Sep 2025</span>
                </div>
              </div>

              {/* Bank Card */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-black text-sm">
                    W
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Wema Bank PLC</p>
                    <p className="text-xs font-mono text-slate-400">•••• 1234</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  Linked
                </span>
              </div>

              {/* Payout Breakdown */}
              <div className="rounded-2xl bg-white p-4 border border-slate-100 space-y-3 text-sm">
                <h3 className="font-extrabold text-slate-900">Payout Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Sales</span>
                    <span className="font-bold text-slate-900">₦{(revenueMinor / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Processing Fee (1.5%)</span>
                    <span className="font-bold text-rose-600">− ₦{((revenueMinor * 0.015) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100 font-extrabold">
                    <span className="text-slate-900">Net Settlement</span>
                    <span className="text-emerald-700">₦{((revenueMinor * 0.985) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* T+1 Info */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50 border border-blue-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.4" className="mt-0.5 flex-shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <p className="text-xs text-slate-700 leading-relaxed">
                  <strong>T+1 settlement</strong><br />
                  Funds are transferred to your linked bank account every business day.
                </p>
              </div>

              {/* View Full Breakdown */}
              <button
                type="button"
                onClick={() => toast.show('Full payout history coming soon', 'info')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 hover:bg-slate-50 active:scale-[0.99] transition-all cursor-pointer shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-sm font-bold text-slate-900">View Full Breakdown</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Switch to Personal Client Wallet Card */}
              <div
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-sm hover:border-blue-300 active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d4ed8] text-white shadow-md">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M10 4v4" />
                      <path d="M2 8h20" />
                      <circle cx="16" cy="14" r="1.5" fill="currentColor" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 leading-tight">Switch to Personal Wallet</p>
                    <p className="text-xs text-slate-500 mt-0.5">Return to your student cards & palm biometrics</p>
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          )}

          {/* ─── Bottom Navigation Bar (Elevated Raised Centre Action Button Matching Client Side) ─── */}
          <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] rounded-t-[26px] pb-[env(safe-area-inset-bottom)]">
            <div className="relative flex items-center justify-around px-2 pt-2.5 pb-2">
              {/* Home */}
              <button
                type="button"
                onClick={() => { setSubScreen('none'); setActiveTab('home'); }}
                className={`flex w-14 flex-col items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'home' && subScreen === 'none' ? 'text-[#1d4ed8]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={activeTab === 'home' && subScreen === 'none' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={activeTab === 'home' && subScreen === 'none' ? '0' : '1.8'}>
                    <path d="M3 10.5 12 3.5l9 7V20a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20z" />
                  </svg>
                </div>
                <span>Home</span>
              </button>

              {/* Transactions / History */}
              <button
                type="button"
                onClick={() => { setSubScreen('none'); setActiveTab('transactions'); }}
                className={`flex w-14 flex-col items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'transactions' && subScreen === 'none' ? 'text-[#1d4ed8]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="3.5" />
                    <path d="m7 14 3.2-3.2 2.6 2.6L17 9" />
                    <path d="M14 9h3v3" />
                  </svg>
                </div>
                <span>History</span>
              </button>

              {/* Raised Floating Centre Scan / Terminal Button */}
              <button
                type="button"
                onClick={() => setSubScreen('pos_kiosk')}
                aria-label="Open POS Terminal"
                title="Open POS Terminal"
                className="relative -top-5 flex h-13 w-13 items-center justify-center rounded-full bg-[#1d4ed8] text-white shadow-lg shadow-blue-900/25 ring-4 ring-white active:scale-95 transition-all cursor-pointer"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Palm scanner lines in centre */}
                  <path
                    d="M9 12h6M9 9.5h6M10 14.5h4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {/* Kiosks */}
              <button
                type="button"
                onClick={() => { setSubScreen('none'); setActiveTab('kiosks'); }}
                className={`flex w-14 flex-col items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'kiosks' && subScreen === 'none' ? 'text-[#1d4ed8]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <span>Kiosks</span>
              </button>

              {/* Settlement / More */}
              <button
                type="button"
                onClick={() => { setSubScreen('none'); setActiveTab('settlement'); }}
                className={`flex w-14 flex-col items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  activeTab === 'settlement' && subScreen === 'none' ? 'text-[#1d4ed8]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 10 12 4 21 10" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="6" y1="14" x2="6" y2="18" />
                    <line x1="10" y1="14" x2="10" y2="18" />
                    <line x1="14" y1="14" x2="14" y2="18" />
                    <line x1="18" y1="14" x2="18" y2="18" />
                  </svg>
                </div>
                <span>Settlement</span>
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          MODAL: TRANSACTION DETAILS SHEET (Screen 7)
      ───────────────────────────────────────────────────────────────── */}
      {selectedTx &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-fade-in" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedTx(null)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm cursor-default"
            />

            <div className="relative z-10 w-full max-w-md rounded-t-[28px] bg-white px-5 pt-3 pb-6 shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
              {/* Drag Pill + Close */}
              <div className="flex items-center justify-between mb-3">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="absolute right-5 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <h3 className="text-base font-extrabold text-slate-900 mb-3">Transaction Details</h3>

              <div className="overflow-y-auto space-y-4 pb-2">
                {/* Amount & Status */}
                <div className="text-center py-2">
                  <p className="text-3xl font-black text-emerald-600 tracking-tight">
                    + {formatNaira(selectedTx.amountMinor)}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{selectedTx.status}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="rounded-2xl bg-slate-50 p-4 space-y-3 border border-slate-100 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>Customer</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedTx.customer}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>Date & Time</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedTx.date} · {selectedTx.time}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <PalmIcon className="h-4 w-4 text-[#1d4ed8]" />
                      <span>Payment Method</span>
                    </div>
                    <span className="font-bold text-[#1d4ed8]">
                      {selectedTx.method}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      <span>Kiosk</span>
                    </div>
                    <span className="font-bold text-slate-900">{selectedTx.terminalLabel}</span>
                  </div>
                </div>

                {/* Settlement Breakdown */}
                <div className="rounded-2xl bg-slate-50 p-4 space-y-2 border border-slate-100 text-sm">
                  <h4 className="font-bold text-slate-800">Settlement Breakdown</h4>
                  <div className="flex justify-between text-slate-600">
                    <span>Amount</span>
                    <span className="font-bold text-slate-900">₦{(selectedTx.amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Processing Fee (1.5%)</span>
                    <span className="font-bold text-rose-600">− ₦{((selectedTx.amountMinor * 0.015) / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 font-extrabold">
                    <span className="text-slate-900">Net Amount</span>
                    <span className="text-emerald-700">
                      ₦{((selectedTx.amountMinor * 0.985) / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Download Receipt */}
                <button
                  type="button"
                  onClick={() => {
                    toast.show(`Receipt #${selectedTx.id} downloaded successfully`, 'success');
                    setSelectedTx(null);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download Receipt</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
