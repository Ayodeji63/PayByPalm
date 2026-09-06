/**
 * Dashboard — PayByPalm Premium Wallet Home Screen.
 *
 * Design: Google Wallet-style stacked cards for Tokenized Card-on-File infrastructure,
 * strictly adhering to the PayByPalm blue & white theme.
 *
 * Enhancements:
 *   - Google Wallet paradigm: displays real tokenized Nigerian bank cards (GTBank,
 *     Zenith, Kuda, Access) linked to the palm biometrics. No stored-value deposits.
 *   - Professional fintech header: dynamic time-of-day greeting, polished avatar,
 *     frosted action buttons, banking-grade balance with kobo superscript.
 *   - No emojis — ultra-clean, modern banking aesthetic.
 *   - Apple Wallet physical stacked deck: cards layered in 1 place.
 *   - touch-action: none enabled on card container so vertical swipe-up works
 *     flawlessly without browser page-scroll interception.
 *   - Each card has its OWN account balance that dynamically drives the top balance.
 *   - Quick action buttons (Send, Receive, Add Card, Merchants) in circular white styling.
 *   - Connected with cardStore: cards added via Paystack tokenization instantly appear
 *     in the wallet deck.
 *   - Transaction History with time, date, merchant, and soft coral/emerald badges.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira } from '../lib/money.js';
import { getCards, togglePauseCard, deductCardBalance, setDefaultCard, type LinkedCard } from '../lib/cardStore.js';
import { PalmIcon, Skeleton } from '../components/ui.js';
import { BankCard } from '../components/BankCard.js';
import { TransactionSheet } from '../components/sheets.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';

// ---------------------------------------------------------------------------
// Card Model
// ---------------------------------------------------------------------------

export interface VirtualCard {
  id: string;
  name: string;
  bank: string;
  type: string;
  scheme: 'mastercard' | 'visa' | 'verve';
  cardNumber: string;
  last4: string;
  expiry: string;
  balanceMinor: number;
  isPaused: boolean;
  isDefault: boolean;
  theme: {
    gradient: string;
    chipColor: string;
    accentGlow: string;
    pattern: string;
  };
  transactions: Array<{
    id: string;
    time: string;
    date: string;
    merchant: string;
    amountMinor: number;
    direction: 'credit' | 'debit';
    type: 'payment' | 'deposit' | 'withdraw';
    authorisedByPalm?: boolean;
  }>;
}

const SAMPLE_TXS: Record<string, VirtualCard['transactions']> = {
  gtbank: [
    {
      id: 'tx-gt-1',
      time: '11:30 PM',
      date: 'Friday, November 17, 2026',
      merchant: 'CAMPUS CAFETERIA #02, UNILAG',
      amountMinor: 350000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
    {
      id: 'tx-gt-2',
      time: '04:15 PM',
      date: 'Friday, November 17, 2026',
      merchant: 'UNILAG BOOKSTORE #104, LAGOS',
      amountMinor: 820000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
    {
      id: 'tx-gt-3',
      time: '01:20 PM',
      date: 'Thursday, November 16, 2026',
      merchant: 'ATM CASH OUT (PALM RECOGNITION)',
      amountMinor: 1500000,
      direction: 'debit',
      type: 'withdraw',
      authorisedByPalm: true,
    },
    {
      id: 'tx-gt-4',
      time: '09:45 AM',
      date: 'Wednesday, November 15, 2026',
      merchant: 'INTER-BANK SALARY DIRECT DEPOSIT',
      amountMinor: 5000000,
      direction: 'credit',
      type: 'deposit',
      authorisedByPalm: false,
    },
  ],
  zenith: [
    {
      id: 'tx-zn-1',
      time: '07:40 PM',
      date: 'Friday, November 17, 2026',
      merchant: 'CENTRAL DINING HALL — DINNER',
      amountMinor: 185000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
    {
      id: 'tx-zn-2',
      time: '01:10 PM',
      date: 'Friday, November 17, 2026',
      merchant: 'STUDENT UNION SNACK BAR',
      amountMinor: 120000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
    {
      id: 'tx-zn-3',
      time: '08:25 AM',
      date: 'Thursday, November 16, 2026',
      merchant: 'CAMPUS ESPRESSO BAR',
      amountMinor: 65000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
  ],
  kuda: [
    {
      id: 'tx-kd-1',
      time: '12:00 PM',
      date: 'Wednesday, November 15, 2026',
      merchant: 'CAMPUS SHUTTLE PAY-BY-PALM',
      amountMinor: 25000,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    },
    {
      id: 'tx-kd-2',
      time: '09:00 AM',
      date: 'Wednesday, November 01, 2026',
      merchant: 'INCOMING TRANSFER FROM ACCESS',
      amountMinor: 20000000,
      direction: 'credit',
      type: 'deposit',
      authorisedByPalm: false,
    },
  ],
};

function mapCards(linked: LinkedCard[]): VirtualCard[] {
  return linked.map((c) => {
    const key = c.bank.toLowerCase().includes('gt')
      ? 'gtbank'
      : c.bank.toLowerCase().includes('zen')
      ? 'zenith'
      : 'kuda';

    return {
      id: c.id,
      name: c.name,
      bank: c.bank,
      type: `${c.bank.toUpperCase()} DEBIT`,
      scheme: c.cardType,
      cardNumber: c.cardNumber || `•••• •••• •••• ${c.last4}`,
      last4: c.last4,
      expiry: `${c.expMonth}/${c.expYear}`,
      balanceMinor: c.balanceMinor || 12500000,
      isPaused: Boolean(c.isPaused),
      isDefault: Boolean(c.isDefault),
      theme: c.theme,
      transactions: (SAMPLE_TXS[key] ?? SAMPLE_TXS.gtbank) || [],
    };
  });
}

export default function Dashboard() {
  const { me, refresh, consentGiven } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Active card state
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number }>({ top: 64, right: 20 });

  const toggleMenu = () => {
    if (!menuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    }
    setMenuOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClose = () => setMenuOpen(false);
    window.addEventListener('resize', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('resize', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [menuOpen]);

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<TransactionSummary | null>(null);

  // Stack swipe animation state
  const [isAnimatingUp, setIsAnimatingUp] = useState(false);
  const [dragY, setDragY] = useState(0);
  const isDragging = useRef(false);
  const startCoord = useRef({ x: 0, y: 0 });

  // Time-aware greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Multi-card state initialized from cardStore
  const [cards, setCards] = useState<VirtualCard[]>(() => mapCards(getCards()));

  // Reload cards on mount or window focus
  useEffect(() => {
    const stored = getCards();
    setCards(mapCards(stored));
  }, []);

  const activeCard: VirtualCard = (cards[activeCardIndex] ?? cards[0]) as VirtualCard;

  // Automatically make any card cycled to the front the default card to be debited
  useEffect(() => {
    if (!activeCard?.id) return;
    setDefaultCard(activeCard.id);
  }, [activeCard?.id]);

  // Format balance parts: integer part and kobo decimals
  const balanceParts = useMemo(() => {
    const nairaStr = formatNaira(activeCard?.balanceMinor ?? 12500000).replace('₦', '');
    const parts = nairaStr.split('.');
    return {
      whole: parts[0] ?? '0',
      fraction: parts[1] ?? '00',
    };
  }, [activeCard?.balanceMinor]);

  // Cycle to next card (swipe up / swipe left / tap)
  const cycleNext = useCallback(() => {
    if (isAnimatingUp || cards.length <= 1) return;
    setIsAnimatingUp(true);
    setDragY(0);

    setTimeout(() => {
      setActiveCardIndex((prev) => (prev + 1) % cards.length);
      setIsAnimatingUp(false);
    }, 250);
  }, [cards.length, isAnimatingUp]);

  // Cycle to previous card (swipe down / swipe right)
  const cyclePrev = useCallback(() => {
    if (isAnimatingUp || cards.length <= 1) return;
    setDragY(0);
    setActiveCardIndex((prev) => (prev - 1 + cards.length) % cards.length);
  }, [cards.length, isAnimatingUp]);

  // Touch gesture handlers — with touch-action: none to capture swipe up without page scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    startCoord.current = {
      x: e.touches[0]?.clientX ?? 0,
      y: e.touches[0]?.clientY ?? 0,
    };
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const diffY = currentY - startCoord.current.y;
    // Allow dragging upwards
    if (diffY < 0) {
      setDragY(diffY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const endX = e.changedTouches[0]?.clientX ?? 0;
    const endY = e.changedTouches[0]?.clientY ?? 0;
    const diffX = endX - startCoord.current.x;
    const diffY = endY - startCoord.current.y;

    // Responsive swipe threshold: vertical swipe-up or horizontal swipe-left
    if (diffY < -25 || diffX < -35) {
      cycleNext();
    } else if (diffY > 30 || diffX > 35) {
      cyclePrev();
    } else if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) {
      // Tap on card cycles to next
      cycleNext();
    } else {
      setDragY(0);
    }
  };

  // Mouse drag & click handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    startCoord.current = { x: e.clientX, y: e.clientY };
    isDragging.current = true;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const diffY = e.clientY - startCoord.current.y;
    if (diffY < 0) {
      setDragY(diffY);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diffX = e.clientX - startCoord.current.x;
    const diffY = e.clientY - startCoord.current.y;

    if (diffY < -25 || diffX < -35) {
      cycleNext();
    } else if (diffY > 30 || diffX > 35) {
      cyclePrev();
    } else if (Math.abs(diffX) < 6 && Math.abs(diffY) < 6) {
      cycleNext();
    } else {
      setDragY(0);
    }
  };

  // Toggle card pause status
  const handleTogglePause = () => {
    if (!activeCard) return;
    const paused = togglePauseCard(activeCard.id);
    setCards(mapCards(getCards()));
    toast.show(
      paused
        ? `"${activeCard.name}" paused. Palm payments disabled.`
        : `"${activeCard.name}" resumed. Palm payments active.`,
      paused ? 'info' : 'success'
    );
    setMenuOpen(false);
  };

  // Handle successful transfer from SendMoneyModal
  const handleTransferSuccess = (amountMinor: number, recipient: string, note?: string) => {
    if (!activeCard) return;
    deductCardBalance(activeCard.id, amountMinor);

    const newTx: VirtualCard['transactions'][0] = {
      id: `tx-transfer-${Date.now()}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: 'Today',
      merchant: note
        ? `TRANSFER: ${recipient.toUpperCase()} (${note.toUpperCase()})`
        : `TRANSFER TO ${recipient.toUpperCase()}`,
      amountMinor,
      direction: 'debit',
      type: 'payment',
      authorisedByPalm: true,
    };

    setCards((prev) =>
      prev.map((c, i) => {
        if (i === activeCardIndex) {
          return {
            ...c,
            balanceMinor: Math.max(0, c.balanceMinor - amountMinor),
            transactions: [newTx, ...c.transactions],
          };
        }
        return c;
      })
    );

    toast.show(`Sent ${formatNaira(amountMinor)} to ${recipient}`, 'success');
  };

  if (!me) {
    return (
      <div className="px-5 py-8 space-y-4 animate-fade-in">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full rounded-3xl" />
      </div>
    );
  }

  const firstName = me.fullName.split(' ')[0] || 'User';

  return (
    <PageTransition>
      <div className="min-h-dvh bg-[#f8fafc] text-slate-900 pb-12 select-none">
        {/* ─── Premium Deep Royal Header ─── */}
        <div
          className="relative px-5 pt-6 pb-26 text-white shadow-xl overflow-hidden transition-all duration-300"
          style={{
            background: 'radial-gradient(ellipse at 20% 0%, #2563eb 0%, #1d4ed8 45%, #0f2468 100%)',
          }}
        >
          {/* Subtle lighting arcs & ambient glow */}
          <div
            className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, #60a5fa 0%, #1d4ed8 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full opacity-25 blur-2xl"
            style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }}
          />

          {/* Top Row: User Avatar & Professional Greeting + Frosted Action Buttons */}
          <div className="relative z-10 flex items-center justify-between pb-4">
            {/* Left: Glassmorphic User DP & Clean Typography */}
            <div className="flex items-center gap-3.5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 border border-white/25 shadow-md active:scale-95 transition-transform overflow-hidden backdrop-blur-md"
                  aria-label="Profile"
                >
                  <DefaultAvatarSvg className="h-full w-full" />
                </button>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0f2468]" />
              </div>

              <div>
                <p className="text-[11px] font-semibold text-blue-200/90 uppercase tracking-widest leading-none">
                  {greeting}
                </p>
                <h2 className="text-lg font-black text-white tracking-tight mt-0.5">
                  {firstName}
                </h2>
              </div>
            </div>

            {/* Right: Frosted Glass Action Buttons */}
            <div className="relative flex items-center gap-2">
              {/* Add Payment Card Button */}
              <button
                type="button"
                onClick={() => navigate('/cards?action=add')}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all shadow-sm backdrop-blur-md"
                title="Add payment card"
                aria-label="Add Card"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              {/* Palm Sensor Active Status Button */}
              <button
                type="button"
                onClick={() => navigate(consentGiven ? '/scan' : '/consent')}
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all shadow-sm backdrop-blur-md"
                title="PayByPalm Terminal Status: Active"
                aria-label="Palm Status"
              >
                <PalmIcon className="h-5 w-5 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 ring-2 ring-[#0f2468]" />
                </span>
              </button>

              {/* Three Dots Menu Button */}
              <button
                ref={menuButtonRef}
                type="button"
                onClick={toggleMenu}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition-all active:scale-95 shadow-sm backdrop-blur-md ${
                  menuOpen
                    ? 'bg-white text-[#1d4ed8] border-white shadow-md ring-2 ring-white/30'
                    : 'bg-white/12 text-white border-white/20 hover:bg-white/20'
                }`}
                aria-label="More options"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>

              {/* Portaled Dropdown Menu (Mounted to document.body with z-[100] to float ABOVE balance & cards) */}
              {menuOpen &&
                createPortal(
                  <div className="fixed inset-0 z-[100] select-none">
                    {/* Soft Backdrop Overlay to dismiss on outside click */}
                    <div
                      className="fixed inset-0 bg-slate-950/20 backdrop-blur-[1px] animate-fade-in"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden="true"
                    />

                    {/* Anchored Popover Card */}
                    <div
                      style={{
                        position: 'fixed',
                        top: `${menuCoords.top}px`,
                        right: `${menuCoords.right}px`,
                      }}
                      className="relative z-[101] w-48 rounded-2xl bg-white p-2 text-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.25)] border border-slate-200/90 animate-scale-in"
                    >
                      {/* Upward-pointing notch */}
                      <div className="absolute -top-1.5 right-3.5 h-3 w-3 rotate-45 bg-white border-t border-l border-slate-200/90" />

                      {/* Active Card Pill Indicator */}
                      <div className="relative z-10 px-3 py-1.5 border-b border-slate-100 mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Card</p>
                        <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{activeCard?.name}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate('/cards');
                        }}
                        className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <span>Manage All Cards</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate(consentGiven ? '/scan' : '/consent');
                        }}
                        className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors"
                      >
                        <PalmIcon className="h-4 w-4 text-blue-600" />
                        <span>Palm Biometrics</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          navigate('/profile');
                        }}
                        className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span>Security & Profile</span>
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      <button
                        type="button"
                        onClick={handleTogglePause}
                        className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                        <span>{activeCard?.isPaused ? 'Resume Card' : 'Lock / Pause Card'}</span>
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>

          {/* Balance Presentation */}
          <div className="relative z-10 mt-3">
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-blue-200/80">
              AVAILABLE BALANCE
            </p>

            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-200">₦</span>
              <div className="flex items-baseline">
                <h1 className="text-3xl sm:text-[40px] font-black tracking-tight text-white leading-none">
                  {balanceVisible ? balanceParts.whole : '••••••'}
                </h1>
                {balanceVisible && (
                  <span className="text-xl font-bold text-blue-200/80 ml-0.5">
                    .{balanceParts.fraction}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setBalanceVisible(!balanceVisible)}
                className="ml-2 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-blue-200/80 hover:text-white transition-all active:scale-95"
                aria-label={balanceVisible ? 'Hide balance' : 'Show balance'}
              >
                {balanceVisible ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Stacked Wallet Cards (Apple / Google Wallet Deck Style) ─── */}
        <div className="relative -mt-16 px-5 flex flex-col items-center">
          {/* Stack Container with touch-action: none so swipe up is NOT hijacked by page scroll */}
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (isDragging.current) {
                isDragging.current = false;
                setDragY(0);
              }
            }}
            className="relative w-full max-w-[360px] h-[225px] cursor-grab active:cursor-grabbing select-none touch-none"
            style={{ touchAction: 'none' }}
          >
            {cards.map((card, index) => {
              // Calculate stack position: 0 = front, 1 = middle, 2 = back
              const stackOrder = (index - activeCardIndex + cards.length) % cards.length;
              const isFront = stackOrder === 0;

              // Compute position based on stack order
              let zIndex = 30 - stackOrder * 10;
              let translateY = -stackOrder * 14;
              let scale = 1 - stackOrder * 0.05;
              let opacity = 1 - stackOrder * 0.18;

              // Smooth dynamic dragging / exiting animation on front card
              if (isFront) {
                if (isAnimatingUp) {
                  translateY = -160;
                  opacity = 0;
                  scale = 0.90;
                } else if (dragY < 0) {
                  translateY = dragY;
                }
              }

              return (
                <div
                  key={card.id}
                  className="absolute inset-x-0 top-0 transition-all duration-300 ease-out cursor-pointer"
                  style={{
                    zIndex,
                    transform: `translateY(${translateY}px) scale(${scale})`,
                    opacity,
                  }}
                >
                  <BankCard
                    bankKey={card.bank}
                    bankName={card.bank}
                    cardName={card.name}
                    scheme={card.scheme}
                    cardNumber={card.cardNumber}
                    last4={card.last4}
                    holderName={me.fullName}
                    expiry={card.expiry}
                    isPaused={card.isPaused}
                    isDefault={isFront}
                    onClick={() => {
                      if (!isFront) {
                        setActiveCardIndex(index);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Dot Pagination Indicator & Gesture Hint */}
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              {cards.map((card, idx) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setActiveCardIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === activeCardIndex
                      ? 'w-6 bg-[#1d4ed8]'
                      : 'w-2 bg-slate-300 hover:bg-slate-400'
                  }`}
                  aria-label={`Switch to card ${idx + 1}`}
                />
              ))}
            </div>

            <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
              Swipe up or tap card to switch
            </p>
          </div>
        </div>

        {/* ─── Quick Action Buttons (Circular White Style) ─── */}
        <div className="mt-5 px-5">
          <div className="grid grid-cols-4 gap-3 text-center">
            {/* Send / Transfer */}
            <QuickActionButton
              label="Send"
              onClick={() => setSendModalOpen(true)}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17l10-10M17 7H7M17 7v10" />
                </svg>
              }
            />

            {/* Receive / QR */}
            <QuickActionButton
              label="Receive"
              onClick={() => setReceiveModalOpen(true)}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 7L7 17M7 17h10M7 17V7" />
                </svg>
              }
            />

            {/* Add Card (Tokenized Card-on-File) */}
            <QuickActionButton
              label="Add Card"
              onClick={() => navigate('/cards?action=add')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="3" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                  <line x1="12" y1="13" x2="12" y2="17" />
                  <line x1="10" y1="15" x2="14" y2="15" />
                </svg>
              }
            />

            {/* Merchants / Campus Kiosks */}
            <QuickActionButton
              label="Merchants"
              onClick={() => navigate('/merchant')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                  <circle cx="5" cy="12" r="1.5" />
                </svg>
              }
            />
          </div>
        </div>

        {/* ─── Biometric Palm Enrollment Banner (if not enrolled) ─── */}
        {!me.palmEnrolled && (
          <div className="mt-5 px-5">
            <button
              type="button"
              onClick={() => navigate(consentGiven ? '/scan' : '/consent')}
              className="flex w-full items-center gap-3.5 rounded-2xl bg-white p-4 text-left shadow-sm border border-blue-100 hover:shadow-md transition-all active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1d4ed8] text-white shadow-md shadow-blue-500/25">
                <PalmIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-slate-900">Enroll Palm Biometrics</p>
                <p className="text-xs text-slate-500 mt-0.5">Pay at campus terminals with just your hand</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#1d4ed8]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          </div>
        )}

        {/* ─── Transaction History (Tailored to active card) ─── */}
        <div className="mt-7 px-5">
          {/* Header Row with Clock Icon */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                Transaction History
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/activity')}
              className="text-xs font-bold text-[#1d4ed8] hover:underline"
            >
              See all
            </button>
          </div>

          {/* Transactions List */}
          <div className="space-y-2.5">
            {(activeCard?.transactions || []).map((tx) => {
              const isCredit = tx.direction === 'credit';

              return (
                <div
                  key={tx.id}
                  onClick={() =>
                    setSelectedTx({
                      id: tx.id,
                      amountMinor: tx.amountMinor,
                      direction: tx.direction,
                      status: 'settled',
                      createdAt: new Date().toISOString(),
                      settledAt: new Date().toISOString(),
                      merchantName: tx.merchant,
                      description: `Charged to ${activeCard?.name || 'Bank Card'} via PayByPalm`,
                      terminalLabel: tx.authorisedByPalm ? 'Campus Palm Scanner #01' : null,
                      authorisedByPalm: Boolean(tx.authorisedByPalm),
                      matchScore: null,
                      matchMode: null,
                      disputedAt: null,
                    })
                  }
                  className="group flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer active:scale-[0.99]"
                >
                  {/* Left Details: Time, Date, Merchant */}
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-[13px] font-bold text-slate-900 leading-tight">
                      {tx.time}
                    </p>
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {tx.date}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {tx.authorisedByPalm && (
                        <span className="flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-[#1d4ed8]">
                          <PalmIcon className="h-3 w-3" />
                          Palm
                        </span>
                      )}
                      <p className="text-xs font-semibold text-slate-600 truncate uppercase tracking-tight">
                        {tx.merchant}
                      </p>
                    </div>
                  </div>

                  {/* Right Amount Pill */}
                  <div
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[13px] font-black tracking-tight ${
                      isCredit
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {isCredit ? '+' : '-'}
                    {formatNaira(tx.amountMinor)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Receive / QR Code Bottom Sheet (Portaled to body, z-[100]) ─── */}
        <ReceiveMoneyModal
          isOpen={receiveModalOpen}
          onClose={() => setReceiveModalOpen(false)}
          activeCard={activeCard}
          userPhone={me.phone}
        />

        {/* ─── Send / Transfer Quick Modal (Portaled to body, z-[100]) ─── */}
        <SendMoneyModal
          isOpen={sendModalOpen}
          onClose={() => setSendModalOpen(false)}
          activeCard={activeCard}
          onSuccessTransfer={handleTransferSuccess}
        />

        {/* ─── Transaction Detail Sheet ─── */}
        {selectedTx && (
          <TransactionSheet
            transaction={selectedTx}
            onClose={() => setSelectedTx(null)}
            onChanged={() => {
              void refresh();
              setSelectedTx(null);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Circular Quick Action Button (Matching original reference style)
// ---------------------------------------------------------------------------

function QuickActionButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex flex-col items-center gap-2 transition-transform active:scale-95 disabled:opacity-40"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-md shadow-slate-200/70 border border-slate-100 text-slate-800 group-hover:border-blue-200 group-hover:text-[#1d4ed8] group-hover:shadow-lg transition-all">
        {icon}
      </div>
      <span className="text-xs font-bold text-slate-700 group-hover:text-[#1d4ed8] transition-colors">
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Default Profile Picture SVG (Modern, Gender-Neutral Avatar)
// ---------------------------------------------------------------------------

function DefaultAvatarSvg({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="avatarBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="avatarSkinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="100%" stopColor="#fba36f" />
        </linearGradient>
        <linearGradient id="avatarHairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="avatarClothGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      {/* Background circle with gradient */}
      <rect width="100" height="100" rx="50" fill="url(#avatarBgGrad)" />

      {/* Shoulders / Torso with clean crewneck shirt */}
      <path
        d="M20 95C20 78 33 70 50 70C67 70 80 78 80 95V100H20V95Z"
        fill="url(#avatarClothGrad)"
      />
      {/* Collar line */}
      <path d="M43 70C43 74 46 77 50 77C54 77 57 74 57 70" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />

      {/* Neck */}
      <rect x="44.5" y="52" width="11" height="18" rx="3.5" fill="url(#avatarSkinGrad)" />

      {/* Head */}
      <ellipse cx="50" cy="42" rx="15" ry="18" fill="url(#avatarSkinGrad)" />

      {/* Modern, sleek gender-neutral hair (universal for male or female) */}
      <path
        d="M34 38C34 25 41 18 50 18C59 18 66 25 66 38C66 39.5 65.5 42 64.5 44C62.5 35 57 30 50 30C41 30 36 36 35.5 44C34.5 42 34 39.5 34 38Z"
        fill="url(#avatarHairGrad)"
      />

      {/* Ears */}
      <ellipse cx="35" cy="43" rx="2" ry="3.5" fill="#fba36f" />
      <ellipse cx="65" cy="43" rx="2" ry="3.5" fill="#fba36f" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Send / Transfer Modal (Portaled to document.body, z-[100] above BottomNav)
// ---------------------------------------------------------------------------

function SendMoneyModal({
  isOpen,
  onClose,
  activeCard,
  onSuccessTransfer,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeCard: VirtualCard;
  onSuccessTransfer: (amountMinor: number, recipient: string, note?: string) => void;
}) {
  const [mode, setMode] = useState<'palm' | 'bank'>('palm');
  const [recipient, setRecipient] = useState('');
  const [bank, setBank] = useState('GTBank');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReceipt, setSuccessReceipt] = useState<{
    ref: string;
    amountMinor: number;
    recipientName: string;
    destType: string;
    date: string;
  } | null>(null);

  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;
  const amountMinor = Math.round(parsedAmount * 100);
  const isOverBalance = amountMinor > activeCard.balanceMinor;

  // Auto-resolve simulated bank account name when 10 digits entered
  useEffect(() => {
    if (mode === 'bank' && accountNumber.length === 10) {
      setAccountName('David A. Adeleke (Verified)');
    } else if (mode === 'bank') {
      setAccountName('');
    }
  }, [accountNumber, mode]);

  // Reset form when opened or closed
  useEffect(() => {
    if (!isOpen) {
      setSuccessReceipt(null);
      setAmount('');
      setRecipient('');
      setAccountNumber('');
      setAccountName('');
      setNote('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const quickContacts = [
    { name: 'Amina Bello', phone: '08023456789' },
    { name: 'Tunde Adeleke', phone: '08134567890' },
    { name: 'Chidi Okonkwo', phone: '07012345678' },
  ];

  const quickAmounts = [1000, 2000, 5000, 10000, 20000];

  const handleSend = () => {
    if (amountMinor <= 0 || isOverBalance) return;
    const destName =
      mode === 'palm'
        ? recipient || 'Palm User'
        : `${accountName || 'Account ' + accountNumber} (${bank})`;
    setIsSubmitting(true);
    setTimeout(() => {
      onSuccessTransfer(amountMinor, destName, note);
      setIsSubmitting(false);
      setSuccessReceipt({
        ref: `PBP-${Math.floor(10000000 + Math.random() * 90000000)}`,
        amountMinor,
        recipientName: destName,
        destType: mode === 'palm' ? 'PayByPalm P2P' : `${bank} Direct Transfer`,
        date: new Date().toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }, 550);
  };

  const isFormValid =
    amountMinor > 0 &&
    !isOverBalance &&
    (mode === 'palm' ? recipient.trim().length >= 3 : accountNumber.trim().length === 10);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center p-0 sm:p-4 animate-fade-in">
      {/* Tap backdrop to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md rounded-t-[32px] sm:rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-slide-up pb-7 sm:pb-6">
        {/* Handle for mobile bottom sheet */}
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              {successReceipt ? 'Transfer Receipt' : 'Send Money'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {successReceipt
                ? 'Payment completed and verified'
                : `Instant debit from ${activeCard.name}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto px-6 pt-2 pb-4 space-y-4">
          {successReceipt ? (
            /* ── Success Receipt State ── */
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Transfer Successful</p>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight mt-1">
                  {formatNaira(successReceipt.amountMinor)}
                </h2>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-left space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient</span>
                  <span className="font-bold text-slate-800 text-right truncate max-w-[200px]">{successReceipt.recipientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Transfer Type</span>
                  <span className="font-semibold text-slate-700">{successReceipt.destType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Debit Source</span>
                  <span className="font-semibold text-slate-700">{activeCard.name} (•{activeCard.last4})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Reference ID</span>
                  <span className="font-mono text-slate-600">{successReceipt.ref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp</span>
                  <span className="text-slate-600">{successReceipt.date}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-2xl bg-[#1d4ed8] py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Send Money Form ── */
            <>
              {/* Source Card Info Pill */}
              <div className="flex items-center justify-between rounded-2xl bg-blue-50/70 p-3 border border-blue-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1d4ed8] text-white shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="10" x2="22" y2="10" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-500 leading-none">From Card</p>
                    <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                      {activeCard.name} (•{activeCard.last4})
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-slate-400 leading-none">Available</p>
                  <p className="text-xs font-black text-[#1d4ed8] mt-0.5">
                    {formatNaira(activeCard.balanceMinor)}
                  </p>
                </div>
              </div>

              {/* Mode Selection Tabs */}
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('palm')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
                    mode === 'palm'
                      ? 'bg-white text-[#1d4ed8] shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <PalmIcon className="h-4 w-4" />
                  <span>Palm User (P2P)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('bank')}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all ${
                    mode === 'bank'
                      ? 'bg-white text-[#1d4ed8] shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2L2 7h20L12 2z" />
                  </svg>
                  <span>Bank Transfer</span>
                </button>
              </div>

              {/* Recipient Input */}
              {mode === 'palm' ? (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700">Recipient Phone / Palm ID</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="e.g. 08123456789 or @amina"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  {/* Quick Contacts */}
                  <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] text-slate-400 shrink-0">Recent:</span>
                    {quickContacts.map((contact) => (
                      <button
                        key={contact.phone}
                        type="button"
                        onClick={() => setRecipient(contact.phone)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all shrink-0 ${
                          recipient === contact.phone
                            ? 'bg-[#1d4ed8] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {contact.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Select Bank</label>
                    <select
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:bg-white focus:border-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="GTBank">Guaranty Trust Bank (GTBank)</option>
                      <option value="Access Bank">Access Bank</option>
                      <option value="Zenith Bank">Zenith Bank</option>
                      <option value="Kuda Bank">Kuda Microfinance Bank</option>
                      <option value="OPay">OPay Digital Services</option>
                      <option value="PalmPay">PalmPay</option>
                      <option value="First Bank">First Bank of Nigeria</option>
                      <option value="UBA">United Bank for Africa (UBA)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700">Account Number</label>
                    <input
                      type="text"
                      maxLength={10}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="10-digit NUBAN number"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-mono font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    {accountName && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-emerald-600 text-[11px] font-bold">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{accountName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Amount Input */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Amount (₦)</label>
                  {isOverBalance && (
                    <span className="text-[11px] font-semibold text-rose-500">Exceeds available balance</span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                    ₦
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={`w-full rounded-xl border pl-8 pr-3.5 py-2.5 text-base font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 ${
                      isOverBalance
                        ? 'border-rose-300 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-500/20'
                        : 'border-slate-200 bg-slate-50 focus:border-[#1d4ed8] focus:ring-blue-500/20'
                    }`}
                  />
                </div>

                {/* Quick Amount Chips */}
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAmount(String(q))}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all shrink-0"
                    >
                      +₦{q.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note / Memo */}
              <div>
                <label className="text-xs font-bold text-slate-700">Note / Reason (Optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Lunch, project supplies"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={!isFormValid || isSubmitting}
                onClick={handleSend}
                className={`w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  !isFormValid || isSubmitting
                    ? 'bg-slate-300 shadow-none cursor-not-allowed text-slate-500'
                    : 'bg-[#1d4ed8] shadow-blue-600/30 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Authorizing Transfer...</span>
                  </>
                ) : (
                  <span>
                    {parsedAmount > 0 ? `Send ${formatNaira(amountMinor)}` : 'Enter Amount'}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Receive / QR Code Modal (Portaled to document.body, z-[100] above BottomNav)
// ---------------------------------------------------------------------------

function ReceiveMoneyModal({
  isOpen,
  onClose,
  activeCard,
  userPhone,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeCard: VirtualCard;
  userPhone: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(userPhone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center p-0 sm:p-4 animate-fade-in">
      {/* Tap backdrop to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md rounded-t-[32px] sm:rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-slide-up pb-7 sm:pb-6">
        {/* Handle for mobile bottom sheet */}
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Receive Funds</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Receive instantly to your linked bank card
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto px-6 pt-2 pb-4 space-y-4 text-center">
          {/* QR Card Container */}
          <div className="relative mx-auto w-48 h-48 rounded-3xl bg-white p-3 shadow-md border-2 border-blue-100/80 flex items-center justify-center">
            {/* Scannable styled SVG QR matrix */}
            <svg viewBox="0 0 160 160" className="w-full h-full text-slate-900" fill="currentColor">
              {/* Corner Position Detection Patterns */}
              {/* Top-Left */}
              <rect x="10" y="10" width="40" height="40" rx="6" fill="#0f2468" />
              <rect x="16" y="16" width="28" height="28" rx="4" fill="white" />
              <rect x="22" y="22" width="16" height="16" rx="2" fill="#1d4ed8" />

              {/* Top-Right */}
              <rect x="110" y="10" width="40" height="40" rx="6" fill="#0f2468" />
              <rect x="116" y="16" width="28" height="28" rx="4" fill="white" />
              <rect x="122" y="22" width="16" height="16" rx="2" fill="#1d4ed8" />

              {/* Bottom-Left */}
              <rect x="10" y="110" width="40" height="40" rx="6" fill="#0f2468" />
              <rect x="16" y="116" width="28" height="28" rx="4" fill="white" />
              <rect x="22" y="122" width="16" height="16" rx="2" fill="#1d4ed8" />

              {/* QR Data Matrix Bits */}
              <rect x="60" y="15" width="8" height="8" rx="1.5" />
              <rect x="75" y="15" width="8" height="8" rx="1.5" />
              <rect x="90" y="15" width="8" height="8" rx="1.5" />
              <rect x="60" y="30" width="8" height="8" rx="1.5" />
              <rect x="85" y="30" width="12" height="8" rx="1.5" />
              <rect x="15" y="60" width="8" height="8" rx="1.5" />
              <rect x="30" y="60" width="8" height="8" rx="1.5" />
              <rect x="45" y="60" width="8" height="8" rx="1.5" />
              <rect x="110" y="60" width="8" height="8" rx="1.5" />
              <rect x="125" y="60" width="18" height="8" rx="1.5" />
              <rect x="15" y="75" width="8" height="8" rx="1.5" />
              <rect x="35" y="75" width="16" height="8" rx="1.5" />
              <rect x="110" y="75" width="14" height="8" rx="1.5" />
              <rect x="135" y="75" width="8" height="8" rx="1.5" />
              <rect x="15" y="90" width="12" height="8" rx="1.5" />
              <rect x="35" y="90" width="8" height="8" rx="1.5" />
              <rect x="110" y="90" width="8" height="8" rx="1.5" />
              <rect x="125" y="90" width="8" height="8" rx="1.5" />
              <rect x="140" y="90" width="8" height="8" rx="1.5" />
              <rect x="60" y="115" width="8" height="8" rx="1.5" />
              <rect x="75" y="115" width="18" height="8" rx="1.5" />
              <rect x="60" y="130" width="12" height="8" rx="1.5" />
              <rect x="80" y="130" width="8" height="8" rx="1.5" />
              <rect x="110" y="115" width="8" height="8" rx="1.5" />
              <rect x="125" y="115" width="8" height="8" rx="1.5" />
              <rect x="140" y="115" width="8" height="8" rx="1.5" />
              <rect x="110" y="130" width="18" height="8" rx="1.5" />
              <rect x="135" y="130" width="12" height="8" rx="1.5" />
            </svg>

            {/* Center Palm Icon Badge */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d4ed8] text-white shadow-md ring-4 ring-white">
                <PalmIcon className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* PayByPalm ID Card Box with Copy button */}
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/90 text-left">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Your PayByPalm ID</p>
                <p className="font-mono text-lg font-black text-slate-900 tracking-wide mt-0.5">
                  {userPhone}
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
                  copied
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-[#1d4ed8] text-white shadow-sm hover:bg-blue-700'
                }`}
              >
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>

            {/* Destination Settlement Card Pill */}
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>Settles directly into:</span>
              </div>
              <span className="font-bold text-slate-800 truncate max-w-[170px]">
                {activeCard.name} (•{activeCard.last4})
              </span>
            </div>
          </div>

          {/* Instructions Box */}
          <div className="grid grid-cols-2 gap-2 text-left">
            <div className="rounded-xl bg-blue-50/60 p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 text-blue-800 font-bold text-xs">
                <PalmIcon className="h-4 w-4 text-[#1d4ed8]" />
                <span>Campus Reader</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Scan your palm at any campus POS or cafeteria scanner.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1d4ed8]">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Peer-to-Peer</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Share your phone number for instant student transfers.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
