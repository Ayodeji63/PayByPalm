/** Persist a sale before sending it so retries keep the same financial intent. */
const STORAGE_KEY = 'paybypalm.pendingSale';
export interface PendingSale {
  saleId: string;
  amountMinor: number;
  description?: string;
  transactionId?: string;
  confirming: boolean;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function loadPendingSale(): PendingSale | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const sale = JSON.parse(raw) as PendingSale;
  if (!sale || !UUID.test(sale.saleId) || !Number.isSafeInteger(sale.amountMinor) ||
      sale.amountMinor <= 0 || sale.amountMinor > 100_000_000 ||
      typeof sale.confirming !== 'boolean' ||
      (sale.transactionId !== undefined && !UUID.test(sale.transactionId))) {
    throw new Error('Stored payment requires administrator review.');
  }
  return sale;
}
export function savePendingSale(sale: PendingSale): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sale));
}
export function clearPendingSale(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
