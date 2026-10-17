/**
 * Terminal credentials must be provisioned locally into this tab's sessionStorage
 * before mounting the app. Never accept credentials from navigation URLs.
 * A device-local agent is recommended to keep reusable keys outside the browser.
 */
const KEY_STORAGE = 'paybypalm.terminalKey';

export function resolveTerminalKey(): string | null {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('k')) {
      url.searchParams.delete('k');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    // Retire keys persisted by the previous URL-based bootstrap.
    localStorage.removeItem(KEY_STORAGE);
    const key = sessionStorage.getItem(KEY_STORAGE);
    return key || null;
  } catch {
    return null;
  }
}

export function clearTerminalKey(): void {
  try {
    localStorage.removeItem(KEY_STORAGE);
    sessionStorage.removeItem(KEY_STORAGE);
  } catch { /* Storage may be unavailable. */ }
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
