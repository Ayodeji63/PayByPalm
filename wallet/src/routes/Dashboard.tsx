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
 *   - Card balances are unavailable; payments debit the linked card.
 *   - Quick action buttons (Send, Receive, Add Card, Merchants) in circular white styling.
 *   - Cards are verified and managed by the backend; transfers remain unavailable.
 *   - Transaction History with time, date, merchant, and soft coral/emerald badges.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { type TransactionSummary } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { formatNaira } from '../lib/money.js';
import { type LinkedCard } from '../lib/cardStore.js';
import { useServerCards, editLinkedCard } from '../lib/serverCards.js';
import { PalmIcon, PalmScanIcon, Skeleton } from '../components/ui.js';
import { BankCard } from '../components/BankCard.js';
import { TransactionSheet } from '../components/sheets.js';
import { PageTransition } from '../components/transitions.js';
import { useToast } from '../components/Toast.js';
import { PalmLinkStatus } from '../components/PalmLinkStatus.js';

// ---------------------------------------------------------------------------
// Card Model
// ---------------------------------------------------------------------------

export interface VirtualCard {
  paymentMode: 'test' | 'live';
  id: string;
  name: string;
  bank: string;
  type: string;
  scheme: 'mastercard' | 'visa' | 'verve';
  cardNumber: string;
  last4: string;
  expiry: string;
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

function mapCards(linked: LinkedCard[]): VirtualCard[] {
  return linked.map((c) => {
    return {
      id: c.id,
      paymentMode: c.paymentMode,
      name: c.name,
      bank: c.bank,
      type: `${c.bank.toUpperCase()} DEBIT`,
      scheme: c.cardType,
      cardNumber: c.cardNumber || `•••• •••• •••• ${c.last4}`,
      last4: c.last4,
      expiry: `${c.expMonth}/${c.expYear}`,
      isPaused: Boolean(c.isPaused),
      isDefault: Boolean(c.isDefault),
      theme: c.theme,
      transactions: [],
    };
  });
}

export default function Dashboard() {
  const { me, refresh, consentGiven, setConsentGiven } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Active card state
  const [activeCardIndex, setActiveCardIndex] = useState(0);
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

  const linkedCards = useServerCards();
  const cards = useMemo(() => mapCards(linkedCards), [linkedCards]);
  const activeCard: VirtualCard | undefined = cards[activeCardIndex] ?? cards[0];

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

  const handleTogglePause = async () => {
    if (!activeCard) return;
    try {
      await editLinkedCard(activeCard.id, activeCard.isPaused ? 'resume' : 'pause', activeCard.paymentMode);
      toast.show(activeCard.isPaused ? 'Card resumed.' : 'Card paused.', 'success');
    } catch (error) { toast.show(error instanceof Error ? error.message : 'Could not update your card.', 'error'); }
    setMenuOpen(false);
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
                <p className="mt-1 text-xs text-blue-100">{me.palmEnrolled ? 'Palm linked' : 'Palm not linked'}</p>
                {(linkedCards[0]?.paymentMode??me.paymentMode)&&<p role="status" className="mt-1 text-xs text-blue-100">{(linkedCards[0]?.paymentMode??me.paymentMode)==='test'?'Test mode · simulated payments':'Live mode · real payments'}</p>}
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
                onClick={() => navigate('/profile')}
                className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 border border-white/20 text-white hover:bg-white/20 active:scale-95 transition-all shadow-sm backdrop-blur-md"
                title={me.palmEnrolled ? 'Palm linked' : 'Palm not linked'}
                aria-label={me.palmEnrolled ? 'Palm linked — manage palm' : 'Palm not linked — link palm'}
              >
                <PalmScanIcon className="h-7 w-7 text-white" />
                {me.palmEnrolled && <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 ring-2 ring-[#0f2468]" />
                </span>}
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
                          navigate('/profile');
                        }}
                        className="relative z-10 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors"
                      >
                        <PalmIcon className="h-4 w-4 text-blue-600" />
                        <span>Manage palm</span>
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
                        <span>{activeCard?.isPaused ? 'Resume Card' : 'Pause saved card'}</span>
                      </button>
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>

          <div className="relative z-10 mt-3">
            <h1 className="text-2xl font-bold text-white">{activeCard ? `Pay with your card •••• ${activeCard.last4}` : 'Link a card to pay'}</h1>
            <p className="mt-2 text-sm text-blue-100">Card balance unavailable. Check your bank app for available funds.</p>
            <p className="mt-1 text-sm text-blue-100">Payments debit your default linked card directly.</p>
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
                    isDefault={card.isDefault}
                    showPalmBadge={false}
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
              onClick={() => toast.show('Transfers are currently unavailable.', 'info')}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17l10-10M17 7H7M17 7v10" />
                </svg>
              }
            />

            {/* Receive / QR */}
            <QuickActionButton
              label="Receive"
              onClick={() => toast.show('Transfers are currently unavailable.', 'info')}
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

        {/* Enrollment status and real unlink/re-enroll actions. */}
        <div id="dashboard-palm-status" className="mt-5 px-5">
          <PalmLinkStatus linked={me.palmEnrolled} onEnroll={() => navigate(consentGiven ? '/scan' : '/consent')}
            onUnlinked={async () => { setConsentGiven(false); await refresh(); }} />
        </div>
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
                    {isCredit ? '+' : '−'}&nbsp;{formatNaira(Math.abs(tx.amountMinor))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
