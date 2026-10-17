interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let promptEvent: InstallPromptEvent | null = null;
const SERVER_STATE = { installed: false, canPrompt: false };
let state = SERVER_STATE;
const listeners = new Set<() => void>();
function publish(next: typeof state) { state = next; listeners.forEach(listener => listener()); }
export const subscribeInstall = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getInstallState = () => state;
export const getServerInstallState = () => SERVER_STATE;

export function startPwa() {
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  publish({ installed: standalone(), canPrompt: false });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    promptEvent = event as InstallPromptEvent;
    publish({ installed: standalone(), canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = null;
    publish({ installed: true, canPrompt: false });
  });
  // Register once for production builds. No cached Vite development modules.
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    const register = () => { void navigator.serviceWorker.register('/sw.js').catch(() => {
      console.warn('Wallet offline support is unavailable. Online access is unchanged.');
    }); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

export async function installWallet(): Promise<void> {
  const event = promptEvent;
  if (!event) throw new Error('Use your browser menu to install PayByPalm.');
  promptEvent = null;
  publish({ ...state, canPrompt: false });
  await event.prompt();
  await event.userChoice;
}
