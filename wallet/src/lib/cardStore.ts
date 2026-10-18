/** Masked server-card display cache only. No payment credentials or local balances. */
let cardOwner: string | null = null;
let cards: LinkedCard[] = [];
const listeners = new Set<() => void>();
function publish() { listeners.forEach(listener => listener()); }
export function setCardOwner(userId: string | null): void {
  const previous = cardOwner;
  if (previous !== userId) { cardOwner = userId; cards = []; publish(); }
  try {
    localStorage.removeItem('paybypalm.tokenized_cards');
    localStorage.removeItem('paybypalm.user_pin');
    localStorage.removeItem('paybypalm.biometric_unlock');
    if (previous) localStorage.removeItem(`paybypalm.tokenized_cards.v2:${previous}`);
    if (userId) localStorage.removeItem(`paybypalm.tokenized_cards.v2:${userId}`);
  } catch { /* Display cache does not depend on browser storage. */ }
}
export const getCardOwner = () => cardOwner;
export const subscribeCards = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function cacheServerCards(owner: string, next: LinkedCard[]): void {
  if (owner !== cardOwner) return;
  cards = next.filter(card => /^\d{4}$/.test(card.last4)); publish();
}
export interface CardTheme {
  gradient: string;
  chipColor: string;
  accentGlow: string;
  pattern: string;
}

export interface LinkedCard {
  id: string;
  name: string;
  bank: string;
  cardType: 'mastercard' | 'visa' | 'verve';
  cardNumber: string;
  last4: string;
  expMonth: string;
  expYear: string;
  isDefault: boolean;
  isPaused?: boolean;
  theme: CardTheme;
  createdAt: string;
}

export const DEFAULT_CARD_THEME: CardTheme = {
  gradient: 'linear-gradient(140deg, #0a1738 0%, #132454 45%, #1e3a8a 100%)',
  chipColor: 'bg-amber-300/80',
  accentGlow: 'rgba(37, 99, 235, 0.3)',
  pattern: 'radial-gradient(circle at 85% 15%, rgba(59,130,246,0.25) 0%, transparent 60%)',
};

export const BANK_THEMES: Record<string, CardTheme> = {
  gtbank: {
    gradient: 'linear-gradient(140deg, #0a1738 0%, #132454 45%, #1e3a8a 100%)',
    chipColor: 'bg-amber-300/80',
    accentGlow: 'rgba(37, 99, 235, 0.3)',
    pattern: 'radial-gradient(circle at 85% 15%, rgba(59,130,246,0.25) 0%, transparent 60%)',
  },
  zenith: {
    gradient: 'linear-gradient(140deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)',
    chipColor: 'bg-slate-200/90',
    accentGlow: 'rgba(96, 165, 250, 0.4)',
    pattern: 'radial-gradient(circle at 15% 85%, rgba(255,255,255,0.18) 0%, transparent 55%)',
  },
  kuda: {
    gradient: 'linear-gradient(140deg, #2a0845 0%, #40196d 50%, #642b73 100%)',
    chipColor: 'bg-amber-400',
    accentGlow: 'rgba(147, 51, 234, 0.35)',
    pattern: 'radial-gradient(circle at 90% 80%, rgba(192,132,252,0.25) 0%, transparent 60%)',
  },
  access: {
    gradient: 'linear-gradient(140deg, #0f172a 0%, #1e293b 50%, #c2410c 100%)',
    chipColor: 'bg-amber-300',
    accentGlow: 'rgba(234, 88, 12, 0.35)',
    pattern: 'radial-gradient(circle at 80% 20%, rgba(251,146,60,0.25) 0%, transparent 60%)',
  },
  firstbank: {
    gradient: 'linear-gradient(140deg, #091e3a 0%, #0f3260 50%, #d97706 100%)',
    chipColor: 'bg-amber-300',
    accentGlow: 'rgba(217, 119, 6, 0.35)',
    pattern: 'radial-gradient(circle at 20% 80%, rgba(251,191,36,0.25) 0%, transparent 60%)',
  },
  uba: {
    gradient: 'linear-gradient(140deg, #18181b 0%, #27272a 50%, #b91c1c 100%)',
    chipColor: 'bg-slate-200',
    accentGlow: 'rgba(185, 28, 28, 0.35)',
    pattern: 'radial-gradient(circle at 85% 15%, rgba(239,68,68,0.25) 0%, transparent 60%)',
  },
};

export function getCards(): LinkedCard[] { return cards; }
export function getDefaultCard(): LinkedCard | null { return cards.find(card => card.isDefault) ?? cards[0] ?? null; }
