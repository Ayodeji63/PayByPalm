/**
 * Cards — Unified Google Wallet Card Management & Linking.
 *
 * Consolidates card management and card tokenization into one single page (/cards).
 * Supports ALL licensed Nigerian commercial banks, digital neobanks, MFBs, and custom banks (60+ institutions):
 *   - Clean, organized Selected Bank display with 1-tap Popular quick-picks
 *   - Searchable Bank Picker bottom-sheet / modal with categories and instant search
 *   - Custom / Other Bank manual entry support
 *   - Card Scheme selector (Mastercard, Visa, Verve)
 *   - Real-time interactive BankCard preview
 *   - Paystack ₦50 refundable authorization tokenization
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { openPaystackPopup } from '../lib/paystack.js';
import {
  getCards,
  addCard,
  removeCard,
  setDefaultCard,
  togglePauseCard,
  BANK_THEMES,
  type LinkedCard,
  type CardTheme,
} from '../lib/cardStore.js';
import { ALL_NIGERIAN_BANKS, type BankMeta } from '../lib/banks.js';
import { formatNaira } from '../lib/money.js';
import { PalmIcon, StatusChip, PageHeader, Button } from '../components/ui.js';
import { BankCard } from '../components/BankCard.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

export default function Cards() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab: 'list' | 'add'
  const initialTab = searchParams.get('action') === 'add' ? 'add' : 'list';
  const [activeTab, setActiveTab] = useState<'list' | 'add'>(initialTab);

  // Cards state
  const [cards, setCards] = useState<LinkedCard[]>(getCards);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Link card state
  const [selectedBank, setSelectedBank] = useState<BankMeta>(ALL_NIGERIAN_BANKS[0]!);
  const [selectedScheme, setSelectedScheme] = useState<'mastercard' | 'visa' | 'verve'>(
    ALL_NIGERIAN_BANKS[0]!.defaultScheme
  );
  const [customBankName, setCustomBankName] = useState('');
  const [isBankPickerOpen, setIsBankPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'commercial' | 'digital' | 'microfinance'
  >('all');
  const [isDefault, setIsDefault] = useState(true);
  const [busy, setBusy] = useState(false);

  // Top popular banks for quick 1-tap chips
  const popularBanks = useMemo(() => {
    return ALL_NIGERIAN_BANKS.filter((b) => b.isPopular).slice(0, 6);
  }, []);

  // Sync tab with URL search parameter
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      setActiveTab('add');
    }
  }, [searchParams]);

  const switchTab = (tab: 'list' | 'add') => {
    setActiveTab(tab);
    if (tab === 'add') {
      setSearchParams({ action: 'add' });
    } else {
      setSearchParams({});
    }
  };

  // Filter banks by search query and category
  const filteredBanks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ALL_NIGERIAN_BANKS.filter((b) => {
      const matchesCat = activeCategory === 'all' || b.category === activeCategory;
      const matchesQ =
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.short.toLowerCase().includes(q) ||
        b.key.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [searchQuery, activeCategory]);

  const handleSelectBank = (b: BankMeta) => {
    setSelectedBank(b);
    setSelectedScheme(b.defaultScheme);
    setIsBankPickerOpen(false);
  };

  // Card list actions
  const handleRemove = (id: string) => {
    removeCard(id);
    setCards(getCards());
    setConfirmDelete(null);
    toast.show('Card unlinked from your palm.', 'info');
  };

  const handleSetDefault = (id: string) => {
    setDefaultCard(id);
    setCards(getCards());
    toast.show('Default palm payment method updated.', 'success');
  };

  const handleTogglePause = (card: LinkedCard) => {
    const isPaused = togglePauseCard(card.id);
    setCards(getCards());
    toast.show(
      isPaused
        ? `"${card.name}" paused. Palm payments disabled.`
        : `"${card.name}" resumed. Palm payments active.`,
      isPaused ? 'info' : 'success'
    );
  };

  // Resolved active bank name (supports custom manual entry)
  const resolvedBankName =
    selectedBank.key === 'other' && customBankName.trim()
      ? customBankName.trim()
      : selectedBank.short;

  // Authorize & tokenize card action
  const handleAuthorize = () => {
    if (!me) return;
    setBusy(true);

    const email = `${me.phone.replace(/\D/g, '') || 'user'}@paybypalm.app`;

    openPaystackPopup({
      email,
      amountKobo: 50_00, // ₦50 refundable authorization charge
      metadata: {
        userId: me.id,
        bank: resolvedBankName,
        bankKey: selectedBank.key,
        scheme: selectedScheme,
        type: 'card_tokenization',
      },
      onSuccess: (response) => {
        const last4 = response.reference.slice(-4) || '9241';
        const cardName = `${resolvedBankName} ${
          selectedScheme === 'mastercard'
            ? 'Debit Mastercard'
            : selectedScheme === 'visa'
            ? 'Classic Visa'
            : 'Verve Card'
        }`;

        const theme: CardTheme =
          BANK_THEMES[selectedBank.key] ?? {
            gradient: selectedBank.gradient,
            chipColor: 'bg-amber-300',
            accentGlow: `${selectedBank.primaryColor}55`,
            pattern: 'none',
          };

        const newCard: Omit<LinkedCard, 'id' | 'createdAt'> = {
          name: cardName,
          bank: resolvedBankName,
          cardType: selectedScheme,
          cardNumber: `•••• •••• •••• ${last4}`,
          last4,
          expMonth: '12',
          expYear: '29',
          isDefault,
          balanceMinor: 25000000, // Simulated linked bank account balance ₦250,000.00
          theme,
        };

        addCard(newCard);
        setCards(getCards());
        toast.show(`${resolvedBankName} card linked to your Palm!`, 'success');
        setBusy(false);
        switchTab('list');
      },
      onClose: () => {
        setBusy(false);
      },
    });
  };

  return (
    <PageTransition>
      <div className="mx-auto min-h-dvh w-full max-w-md bg-[#f8fafc] text-slate-900 px-5 py-4 pb-24 select-none">
        {/* Top Header */}
        <PageHeader
          title={activeTab === 'add' ? 'Link Payment Card' : 'Payment Cards'}
          onBack={() => {
            if (activeTab === 'add') {
              switchTab('list');
            } else {
              navigate('/dashboard');
            }
          }}
          right={
            activeTab === 'list' ? (
              <button
                type="button"
                onClick={() => switchTab('add')}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1d4ed8] font-bold hover:bg-blue-100 active:scale-95 transition-all"
                title="Add card"
                aria-label="Add Card"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            ) : undefined
          }
        />

        {/* Unified Segmented Controller / Tabs */}
        <div className="mt-1 flex rounded-2xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => switchTab('list')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === 'list'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>My Cards</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === 'list'
                  ? 'bg-blue-100 text-[#1d4ed8]'
                  : 'bg-slate-300/60 text-slate-700'
              }`}
            >
              {cards.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('add')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-extrabold rounded-xl transition-all ${
              activeTab === 'add'
                ? 'bg-white text-[#1d4ed8] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Link New Card</span>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* TAB 1: MY CARDS (Realistic Nigerian Bank Cards List)        */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'list' && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {/* Palm Biometric Status Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] p-5 text-white shadow-lg shadow-blue-500/20">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                  <PalmIcon className="h-6 w-6" />
                </div>
                <StatusChip tone={me?.palmEnrolled ? 'success' : 'warning'}>
                  {me?.palmEnrolled ? 'Palm Active' : 'Not Enrolled'}
                </StatusChip>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  Biometric Infrastructure
                </p>
                <h2 className="text-base font-extrabold mt-0.5">PayByPalm Token Vault</h2>
                <p className="text-xs text-blue-100/90 mt-1">
                  {me?.palmEnrolled
                    ? 'Your palm print is linked to your default card. Payments debit directly from your bank.'
                    : 'Enroll your palm to start paying at campus terminals with just your hand.'}
                </p>
              </div>
            </div>

            {/* Linked Bank Cards List */}
            <div className="space-y-4 pt-1">
              {cards.map((card) => (
                <div key={card.id} className="space-y-2">
                  <BankCard
                    bankKey={card.bank}
                    bankName={card.bank}
                    cardName={card.name}
                    scheme={card.cardType}
                    cardNumber={card.cardNumber}
                    last4={card.last4}
                    holderName={me?.fullName || 'CARD HOLDER'}
                    expiry={`${card.expMonth}/${card.expYear}`}
                    isPaused={card.isPaused}
                    isDefault={card.isDefault}
                  />

                  {/* Card Quick Management Toolbar */}
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-sm border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Available: </span>
                      <span className="font-extrabold text-slate-800">{formatNaira(card.balanceMinor)}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {!card.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(card.id)}
                          className="font-bold text-[#1d4ed8] hover:underline"
                        >
                          Make Default
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTogglePause(card)}
                        className="font-semibold text-slate-600 hover:text-slate-900"
                      >
                        {card.isPaused ? 'Resume' : 'Pause'}
                      </button>

                      {confirmDelete === card.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(null)}
                            className="rounded bg-slate-100 px-2 py-0.5 text-slate-600"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(card.id)}
                            className="rounded bg-rose-500 px-2 py-0.5 font-bold text-white hover:bg-rose-600"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(card.id)}
                          className="font-semibold text-rose-500 hover:text-rose-600"
                        >
                          Unlink
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Card Prompt Button */}
            <button
              type="button"
              onClick={() => switchTab('add')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 bg-white p-5 text-slate-600 hover:border-[#1d4ed8] hover:text-[#1d4ed8] transition-all shadow-sm active:scale-[0.99]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-sm font-bold">Link Another Bank Card</span>
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* TAB 2: LINK NEW CARD (Clean, Organized Bank Selection)       */}
        {/* ─────────────────────────────────────────────────────────── */}
        {activeTab === 'add' && (
          <div className="mt-4 animate-fade-in space-y-4">
            {/* Authentic Live Interactive Card Preview */}
            <div className="flex justify-center">
              <BankCard
                bankKey={selectedBank.key}
                bankName={resolvedBankName}
                scheme={selectedScheme}
                cardNumber="•••• •••• •••• 9241"
                last4="9241"
                holderName={me?.fullName || 'CARD HOLDER'}
                expiry="12/29"
                isDefault={isDefault}
              />
            </div>

            {/* 1. Card Network Selector (Mastercard / Visa / Verve) */}
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 border border-slate-200 shadow-sm">
              <div>
                <span className="text-xs font-bold text-slate-800">Card Network</span>
                <p className="text-[10px] text-slate-400">Card brand on your physical card</p>
              </div>
              <div className="flex gap-1.5">
                {(['mastercard', 'visa', 'verve'] as const).map((sch) => (
                  <button
                    key={sch}
                    type="button"
                    onClick={() => setSelectedScheme(sch)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold capitalize transition-all ${
                      selectedScheme === sch
                        ? 'bg-[#1d4ed8] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sch}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Organized Bank Issuer Selection Card */}
            <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Bank Card Issuer
                  </span>
                  <p className="text-xs font-bold text-slate-800">
                    Works with any Nigerian bank or FinTech
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  CBN Licensed
                </span>
              </div>

              {/* Main Interactive Bank Trigger Button */}
              <button
                type="button"
                onClick={() => setIsBankPickerOpen(true)}
                className="flex w-full items-center justify-between rounded-2xl border-2 border-slate-100 bg-slate-50/60 p-3 hover:border-[#1d4ed8] hover:bg-blue-50/30 transition-all text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-extrabold text-sm shadow-sm"
                    style={{ background: selectedBank.primaryColor }}
                  >
                    {selectedBank.short.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {resolvedBankName}
                    </p>
                    <p className="text-[11px] text-slate-500 capitalize">
                      {selectedBank.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-bold text-[#1d4ed8] shrink-0 pl-2 group-hover:translate-x-0.5 transition-transform">
                  <span>Change</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Custom Bank Input (when 'Other Bank' is selected) */}
              {selectedBank.key === 'other' && (
                <div className="pt-1 animate-fade-in">
                  <label className="text-[11px] font-bold text-slate-700">
                    Enter your bank or institution name:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. YabaTech MFB, Unilag MFB, Student Union MFB..."
                    value={customBankName}
                    onChange={(e) => setCustomBankName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/20 shadow-xs"
                  />
                </div>
              )}

              {/* Quick-Pick Popular Bank Chips (Clean, Horizontal) */}
              <div className="pt-1 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Popular Banks
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {popularBanks.map((b) => {
                    const isSelected = b.key === selectedBank.key;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => handleSelectBank(b)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-[#1d4ed8] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {b.short}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setIsBankPickerOpen(true)}
                    className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#1d4ed8] bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    + More
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Infrastructure Explainer (Google Wallet Tokenized Architecture) */}
            <div className="rounded-2xl bg-blue-50/70 p-4 border border-blue-100">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1d4ed8] text-white shadow-xs">
                  <PalmIcon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#1d4ed8] uppercase tracking-wide">
                    Tokenized Card-on-File Infrastructure
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    PayByPalm is an infrastructure layer — like Google Wallet. We never hold your deposits.
                    When you scan your palm at a terminal, payment is routed directly to this bank card.
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Security Notice */}
            <div className="rounded-2xl bg-slate-100/90 p-3 flex items-center gap-2.5 text-xs text-slate-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-600">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>
                256-bit PCI-DSS tokenization via Paystack. A refundable ₦50 charge securely tokenizes your card.
              </span>
            </div>

            {/* 5. Set as Primary Palm Card Switch */}
            <label className="flex items-center justify-between rounded-2xl bg-white p-3.5 border border-slate-200 shadow-sm cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-900">Set as Primary Palm Card</p>
                <p className="text-xs text-slate-500">Terminal palm scans will debit this card first</p>
              </div>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-[#1d4ed8] focus:ring-[#1d4ed8]"
              />
            </label>

            {/* 6. Authorize Action CTA */}
            <div className="pt-2 space-y-2">
              <Button
                full
                loading={busy}
                onClick={handleAuthorize}
                className="!bg-[#1d4ed8] hover:!bg-blue-700 !text-white !py-4 shadow-lg shadow-blue-500/25 !rounded-2xl text-base font-bold"
              >
                Authorize & Bind {resolvedBankName} Card
              </Button>

              <button
                type="button"
                onClick={() => switchTab('list')}
                className="w-full text-center py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel and return to My Cards
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* BANK PICKER MODAL / BOTTOM SHEET (Organized & Searchable)   */}
        {/* ─────────────────────────────────────────────────────────── */}
        {isBankPickerOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs animate-fade-in p-0 sm:p-4">
            <div
              className="w-full max-w-md max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Select Your Bank
                  </h3>
                  <p className="text-xs text-slate-400">
                    {ALL_NIGERIAN_BANKS.length} licensed Nigerian institutions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBankPickerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-sm font-bold transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Search Bar */}
              <div className="px-5 pt-3">
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search bank name or code (e.g. OPay, Stanbic, FCMB)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-9 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#1d4ed8] focus:bg-white focus:ring-2 focus:ring-[#1d4ed8]/15 transition-all"
                  />
                  <svg
                    className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-300"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { key: 'all', label: `All (${ALL_NIGERIAN_BANKS.length})` },
                    { key: 'commercial', label: 'Commercial' },
                    { key: 'digital', label: 'Digital FinTech' },
                    { key: 'microfinance', label: 'Microfinance' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveCategory(tab.key as typeof activeCategory)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${
                        activeCategory === tab.key
                          ? 'bg-[#1d4ed8] text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clean Single-Column Bank List */}
              <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-slate-100">
                {filteredBanks.map((b) => {
                  const isSelected = b.key === selectedBank.key;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => handleSelectBank(b)}
                      className={`flex w-full items-center justify-between py-3 text-left transition-colors ${
                        isSelected ? 'text-[#1d4ed8]' : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white font-bold text-xs shadow-xs"
                          style={{ background: b.primaryColor }}
                        >
                          {b.short.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">
                            {b.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-400 capitalize">
                              {b.category}
                            </span>
                            <span className="text-[10px] text-slate-300">•</span>
                            <span className="text-[10px] text-slate-400 capitalize font-medium">
                              Default {b.defaultScheme}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1d4ed8] text-white">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}

                {filteredBanks.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-xs font-bold text-slate-600">No bank found matching &ldquo;{searchQuery}&rdquo;</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      You can select &ldquo;Other Bank&rdquo; to enter your custom bank name.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const other = ALL_NIGERIAN_BANKS.find((b) => b.key === 'other')!;
                        handleSelectBank(other);
                      }}
                      className="mt-3 rounded-xl bg-[#1d4ed8] px-4 py-2 text-xs font-bold text-white shadow-sm"
                    >
                      Select Custom / Other Bank
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Quick Dismiss */}
              <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
                <button
                  type="button"
                  onClick={() => setIsBankPickerOpen(false)}
                  className="w-full py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
