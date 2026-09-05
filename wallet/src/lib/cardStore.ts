/**
 * Linked card store — localStorage-backed.
 *
 * Stores card details returned by Paystack authorization. When the backend adds
 * GET /cards and POST /cards, swap these four functions to API calls.
 */

const STORAGE_KEY = 'paybypalm.linked_cards';

export interface LinkedCard {
  id: string;
  cardType: string;   // 'visa', 'mastercard', etc.
  last4: string;
  expMonth: string;
  expYear: string;
  bank: string;
  isDefault: boolean;
  createdAt: string;
}

export function getCards(): LinkedCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LinkedCard[]) : [];
  } catch {
    return [];
  }
}

export function addCard(card: Omit<LinkedCard, 'id' | 'createdAt'>): LinkedCard {
  const cards = getCards();
  const newCard: LinkedCard = {
    ...card,
    id: `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };

  // If this is the first card or marked as default, unset others
  if (card.isDefault || cards.length === 0) {
    cards.forEach((c) => { c.isDefault = false; });
    newCard.isDefault = true;
  }

  cards.push(newCard);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  return newCard;
}

export function removeCard(id: string): void {
  const cards = getCards().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function getDefaultCard(): LinkedCard | null {
  return getCards().find((c) => c.isDefault) ?? getCards()[0] ?? null;
}

export function setDefaultCard(id: string): void {
  const cards = getCards();
  cards.forEach((c) => { c.isDefault = c.id === id; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}
