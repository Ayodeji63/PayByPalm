/**
 * Money formatting.
 *
 * Amounts cross the wire as bigint minor units (kobo). They are formatted for
 * display here and nowhere else, so a stray `amount / 100` cannot drift into a
 * component and start rendering ₦12.999999.
 */

const NAIRA = '₦';

/**
 * 1240000 -> "₦12,400"
 *
 * Kobo are dropped when the amount is a whole naira, which is nearly always on a
 * campus wallet, and shown to two places when it is not. Never rounds up — an
 * overstated balance is the one error that makes someone think they can pay.
 */
export function formatNaira(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const naira = Math.floor(abs / 100);
  const kobo = abs % 100;

  const body =
    kobo === 0
      ? naira.toLocaleString('en-NG')
      : `${naira.toLocaleString('en-NG')}.${String(kobo).padStart(2, '0')}`;

  return `${negative ? '-' : ''}${NAIRA}${body}`;
}

/** "12,400" — for a big balance where the symbol is rendered separately. */
export function formatNairaParts(minor: number): { symbol: string; amount: string } {
  return { symbol: NAIRA, amount: formatNaira(minor).replace(NAIRA, '').replace('-', '') };
}

/** "1250.50" typed by a human -> 125050 kobo. Returns null if unparseable. */
export function parseNairaToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s₦]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole = '0', fraction = ''] = cleaned.split('.');
  const kobo = Number(fraction.padEnd(2, '0'));
  return Number(whole) * 100 + kobo;
}

/** "2 Aug, 14:05" — short enough for a dense transaction list. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatWhenLong(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
