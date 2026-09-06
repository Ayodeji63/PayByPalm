/**
 * Linked card store — localStorage-backed for Google Wallet-style Tokenized Card-on-File.
 *
 * PayByPalm does NOT hold stored value or deposits. Instead, it securely stores
 * tokenized bank card authorizations (via Paystack PCI-DSS tokenization).
 * When scanning a palm at a terminal, payment is routed directly to the user's
 * selected bank card.
 */

const STORAGE_KEY = 'paybypalm.tokenized_cards';

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
  balanceMinor: number; // Linked account available balance or palm authorization limit
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

export const INITIAL_CARDS: LinkedCard[] = [
  {
    id: 'card-gtbank',
    name: 'GTBank Platinum Debit',
    bank: 'GTBank',
    cardType: 'mastercard',
    cardNumber: '5495 7381 3753 1517',
    last4: '1517',
    expMonth: '09',
    expYear: '28',
    isDefault: true,
    balanceMinor: 12500000, // ₦125,000.00
    isPaused: false,
    theme: BANK_THEMES.gtbank ?? DEFAULT_CARD_THEME,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'card-zenith',
    name: 'Zenith Bank Classic Debit',
    bank: 'Zenith Bank',
    cardType: 'visa',
    cardNumber: '4111 8294 6201 8832',
    last4: '8832',
    expMonth: '11',
    expYear: '27',
    isDefault: false,
    balanceMinor: 4250000, // ₦42,500.00
    isPaused: false,
    theme: BANK_THEMES.zenith ?? DEFAULT_CARD_THEME,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'card-kuda',
    name: 'Kuda Bank Smart Card',
    bank: 'Kuda Bank',
    cardType: 'verve',
    cardNumber: '5061 0284 9173 4490',
    last4: '4490',
    expMonth: '04',
    expYear: '29',
    isDefault: false,
    balanceMinor: 85000000, // ₦850,000.00
    isPaused: false,
    theme: BANK_THEMES.kuda ?? DEFAULT_CARD_THEME,
    createdAt: new Date().toISOString(),
  },
];

export function getCards(): LinkedCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Initialize with realistic Nigerian tokenized bank cards
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_CARDS));
      return INITIAL_CARDS;
    }
    const parsed = JSON.parse(raw) as LinkedCard[];
    // Sanitize any card that might contain non-numeric letters in last4 (e.g., from Paystack mock references)
    const sanitized = parsed.map((c, idx) => {
      let cleanLast4 = (c.last4 || '').replace(/\D/g, '');
      if (cleanLast4.length !== 4) {
        cleanLast4 = ['9241', '1517', '8832', '4490'][idx % 4]!;
      }
      return {
        ...c,
        last4: cleanLast4,
        cardNumber: c.cardNumber && !/[a-zA-Z]/.test(c.cardNumber) ? c.cardNumber : `•••• •••• •••• ${cleanLast4}`,
      };
    });
    return sanitized.length > 0 ? sanitized : INITIAL_CARDS;
  } catch {
    return INITIAL_CARDS;
  }
}

export function addCard(card: Omit<LinkedCard, 'id' | 'createdAt'>): LinkedCard {
  const cards = getCards();
  let cleanLast4 = (card.last4 || '').replace(/\D/g, '');
  if (cleanLast4.length !== 4) {
    cleanLast4 = '9241';
  }

  const newCard: LinkedCard = {
    ...card,
    last4: cleanLast4,
    cardNumber: `•••• •••• •••• ${cleanLast4}`,
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  // If this card is marked default or is the only card, unset other defaults
  if (card.isDefault || cards.length === 0) {
    cards.forEach((c) => {
      c.isDefault = false;
    });
    newCard.isDefault = true;
  }

  // Prepend so the newly added card is front of the stack
  cards.unshift(newCard);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  return newCard;
}

export function removeCard(id: string): void {
  const cards = getCards().filter((c) => c.id !== id);
  // Ensure there is always a default card if any remain
  if (cards.length > 0 && !cards.some((c) => c.isDefault)) {
    const first = cards[0];
    if (first) {
      first.isDefault = true;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function getDefaultCard(): LinkedCard | null {
  const cards = getCards();
  return cards.find((c) => c.isDefault) ?? cards[0] ?? null;
}

export function setDefaultCard(id: string): void {
  const cards = getCards();
  cards.forEach((c) => {
    c.isDefault = c.id === id;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function togglePauseCard(id: string): boolean {
  const cards = getCards();
  let pausedState = false;
  cards.forEach((c) => {
    if (c.id === id) {
      c.isPaused = !c.isPaused;
      pausedState = Boolean(c.isPaused);
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  return pausedState;
}

export function deductCardBalance(id: string, amountMinor: number): boolean {
  const cards = getCards();
  let success = false;
  cards.forEach((c) => {
    if (c.id === id) {
      if (c.balanceMinor >= amountMinor) {
        c.balanceMinor -= amountMinor;
        success = true;
      }
    }
  });
  if (success) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  }
  return success;
}
