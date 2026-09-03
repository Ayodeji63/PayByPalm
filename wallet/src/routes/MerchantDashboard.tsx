import { useState } from 'react';
import { PwaShell } from '../components/PwaShell.js';
import { Card, Button, Banner } from '../components/ui.js';
import { formatNaira } from '../lib/money.js';

interface TerminalRecord {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline';
  lastSeen: string;
  configVersion: string;
}

export default function MerchantDashboard() {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'terminals' | 'settlement'>('overview');

  const terminals: TerminalRecord[] = [
    {
      id: 'term_kiosk_01',
      name: 'Main Counter Kiosk #1',
      location: 'Yabatech Cafeteria A',
      status: 'online',
      lastSeen: 'Just now',
      configVersion: 'v2.1-prod',
    },
    {
      id: 'term_kiosk_02',
      name: 'Express Lane Kiosk #2',
      location: 'Student Union Hub',
      status: 'online',
      lastSeen: '2 mins ago',
      configVersion: 'v2.1-prod',
    },
  ];

  const recentSales = [
    { id: 'tx_981', customer: 'Babatunde O.', amount: 250000, time: '12:42 PM', status: 'settled' },
    { id: 'tx_982', customer: 'Chioma A.', amount: 120000, time: '12:35 PM', status: 'settled' },
    { id: 'tx_983', customer: 'Emeka K.', amount: 450000, time: '12:15 PM', status: 'settled' },
    { id: 'tx_984', customer: 'Fatima S.', amount: 180000, time: '11:50 AM', status: 'settled' },
  ];

  return (
    <PwaShell title="Merchant Hub">
      <div className="mx-auto max-w-md space-y-5 px-5 pb-8">
        {/* Merchant Store Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold tracking-wider text-accent uppercase">Merchant Portal</span>
            <h1 className="text-xl font-bold tracking-tight text-ink">Campus Mart #04</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Merchant
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-2xl border border-hairline bg-surface p-1">
          <button
            type="button"
            onClick={() => setSelectedTab('overview')}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
              selectedTab === 'overview' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('terminals')}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
              selectedTab === 'terminals' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            Terminals ({terminals.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('settlement')}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
              selectedTab === 'settlement' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            T+1 Settlement
          </button>
        </div>

        {/* OVERVIEW TAB */}
        {selectedTab === 'overview' && (
          <div className="space-y-4">
            {/* Today's Sales Card */}
            <Card className="bg-gradient-to-br from-surface to-accent-tint/30 space-y-3">
              <span className="text-xs font-semibold text-ink-muted">Today's Palm Revenue</span>
              <p className="text-3xl font-extrabold tracking-tight text-ink numeric">
                {formatNaira(1000000)}
              </p>
              <div className="flex items-center justify-between border-t border-hairline/80 pt-3 text-xs">
                <span className="text-ink-muted">4 transactions today</span>
                <span className="font-semibold text-emerald-600">+18% vs yesterday</span>
              </div>
            </Card>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-ink-muted">Pending Payout</span>
                <p className="text-base font-bold text-ink numeric">{formatNaira(1000000)}</p>
                <p className="text-[10px] text-accent">T+1 via Paystack</p>
              </Card>
              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-medium text-ink-muted">Active Kiosks</span>
                <p className="text-base font-bold text-ink">2 / 2 Online</p>
                <p className="text-[10px] text-emerald-600">All syncing v2.1</p>
              </Card>
            </div>

            {/* Recent Palm Transactions */}
            <Card className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink">Recent Palm Payments</h2>
                <span className="text-xs font-semibold text-accent">Live Feed</span>
              </div>
              <div className="divide-y divide-hairline">
                {recentSales.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-xs font-bold text-ink">{tx.customer}</p>
                      <p className="text-[10px] text-ink-faint">{tx.time} • Paystack Subaccount</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-ink numeric">{formatNaira(tx.amount)}</p>
                      <span className="text-[10px] font-medium text-emerald-600 capitalize">{tx.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TERMINALS TAB */}
        {selectedTab === 'terminals' && (
          <div className="space-y-4">
            <Banner tone="info">
              Merchant terminals are locked to your subaccount credentials. Client requests cannot modify routing.
            </Banner>

            <div className="space-y-3">
              {terminals.map((term) => (
                <Card key={term.id} className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-ink">{term.name}</h2>
                      <p className="text-xs text-ink-muted">{term.location}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Online
                    </span>
                  </div>

                  <div className="grid grid-cols-2 rounded-xl bg-canvas p-2.5 text-[11px]">
                    <div>
                      <span className="text-ink-faint">Config Version:</span>
                      <p className="font-mono font-semibold text-ink">{term.configVersion}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Last Heartbeat:</span>
                      <p className="font-semibold text-ink">{term.lastSeen}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" full className="h-9 text-xs">
                      Inspect Logs
                    </Button>
                    <Button variant="primary" full className="h-9 text-xs">
                      Restart Kiosk
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* SETTLEMENT TAB */}
        {selectedTab === 'settlement' && (
          <div className="space-y-4">
            <Card className="space-y-3">
              <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">Settlement Architecture</span>
              <h2 className="text-base font-bold text-ink">Automatic Paystack Split (T+1)</h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Funds collected through biometric palm authorization are settled directly into your linked bank account
                the next business day. PayByPalm never acts as a custodial wallet holding merchant funds.
              </p>
              
              <div className="rounded-2xl border border-hairline bg-canvas p-3.5 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-muted">Settlement Bank</span>
                  <span className="font-semibold text-ink">Wema Bank PLC</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-muted">Account Number</span>
                  <span className="font-mono font-semibold text-ink">0123****89</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-muted">Settlement Schedule</span>
                  <span className="font-semibold text-emerald-600">Daily T+1 (06:00 AM)</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </PwaShell>
  );
}
