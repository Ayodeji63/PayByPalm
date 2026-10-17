import { useState, useSyncExternalStore } from 'react';
import { getInstallState, getServerInstallState, installWallet, subscribeInstall } from '../lib/pwa.js';

export function InstallWallet() {
  const { installed, canPrompt } = useSyncExternalStore(subscribeInstall, getInstallState, getServerInstallState);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (installed) return null;
  async function install() {
    setBusy(true); setError('');
    try { await installWallet(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Open your browser menu to install the wallet.'); }
    finally { setBusy(false); }
  }
  return (
    <section aria-labelledby="install-wallet-title" className="rounded-2xl bg-white p-5">
      <h2 id="install-wallet-title" className="text-sm font-bold text-slate-900">Keep PayByPalm on your home screen</h2>
      <p className="mt-2 text-sm text-slate-600">Open your wallet like an app. Payments and account access still need an internet connection.</p>
      {canPrompt ? <button type="button" disabled={busy} onClick={() => void install()} className="mt-3 min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Opening install prompt…' : 'Install PayByPalm'}</button> :
        <button type="button" aria-expanded={showHelp} onClick={() => setShowHelp(value => !value)} className="mt-3 min-h-11 text-sm font-semibold text-blue-700">How to install</button>}
      {showHelp && <div className="mt-2 space-y-2 text-sm text-slate-600">
        <p>On iPhone or iPad, open this site in Safari, open Share, then choose Add to Home Screen.</p>
        <p>On Android or desktop, open your browser menu and choose Install app or Add to Home Screen when available.</p>
      </div>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
