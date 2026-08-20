/**
 * Terminal identity and credential handling.
 *
 * HOW THE DEVICE KEY GETS HERE, AND WHY NOT THE OBVIOUS WAY
 *
 * The obvious approach — a `VITE_TERMINAL_KEY` build variable — is wrong and
 * would be a genuine security hole. The wallet and the terminal are one Vite
 * bundle deployed to one public origin, so anything inlined at build time is
 * readable by every wallet user who opens devtools. A terminal key is a
 * credential that can create charges.
 *
 * Instead the key lives in a file on the Pi (`/etc/paybypalm/terminal.env`),
 * the kiosk launcher passes it in the URL once at boot, and this module moves
 * it into localStorage and scrubs the query string immediately.
 *
 * The tradeoff, stated plainly: the key transits as a query parameter once per
 * boot, so it can appear in edge access logs. It is revocable at any time by
 * clearing `terminals.api_key_hash` in the database. The alternative — shipping
 * it in the bundle — is not a tradeoff, it is a leak.
 */

const KEY_STORAGE = 'paybypalm.terminalKey';

/**
 * Read the key from the URL if the launcher just supplied one, otherwise from
 * storage. Scrubs the query string so the credential is not left sitting in the
 * address bar or in `document.referrer`.
 */
export function resolveTerminalKey(): string | null {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('k');

    if (fromUrl) {
      localStorage.setItem(KEY_STORAGE, fromUrl);
      url.searchParams.delete('k');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      return fromUrl;
    }

    return localStorage.getItem(KEY_STORAGE);
  } catch {
    // Storage unavailable. The terminal will show its configuration screen.
    return null;
  }
}

export function clearTerminalKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* nothing to do */
  }
}

/** Timings, in one place so they can be tuned without hunting through screens. */
export const TIMINGS = {
  /** Confirm screen auto-cancels — a customer who walked away must not stay chargeable. */
  confirmTimeoutMs: 30_000,
  /** Result screen returns to idle so the next customer finds a clean terminal. */
  resultTimeoutMs: 5_000,
  /** Gap between the frames of a capture burst. */
  burstIntervalMs: 200,
  /** Frames per capture; the sharpest is sent. */
  burstFrames: 3,
  /** How often the enrolment screen polls its session. */
  enrolPollMs: 1_000,
  /** Backend reachability check. */
  healthPollMs: 10_000,
  /** Hold duration for the hidden demo reset. */
  longPressMs: 800,
} as const;
