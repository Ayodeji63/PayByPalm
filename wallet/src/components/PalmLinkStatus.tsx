import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, PalmIcon } from './ui.js';

export function PalmLinkStatus({ linked, onEnroll, onUnlinked }: {
  linked: boolean;
  onEnroll: () => void;
  onUnlinked: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(false);
  const inFlight = useRef(false);
  const isLinked = linked && !removed;
  useEffect(() => { if (!linked) setRemoved(false); }, [linked]);

  async function unlink() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      const result = await api.post<{revoked:boolean}>('/palm/revoke', {});
      if (result.revoked !== true) throw new Error('Palm removal was not confirmed. Please retry.');
      setRemoved(true); setConfirming(false);
      await onUnlinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your palm. Please retry.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section aria-label="Palm link status" className="scroll-mb-28 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <PalmIcon className={`h-6 w-6 shrink-0 ${isLinked ? 'text-emerald-700' : 'text-blue-700'}`} />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900">{isLinked ? 'Palm linked' : 'Palm not linked'}</h3>
          <p className="mt-1 text-sm text-slate-600">{isLinked ? 'Your palm is enrolled for terminal payments.' : 'Link your palm at a PayByPalm terminal to enable palm payments.'}</p>
        </div>
      </div>
      {removed && <p role="status" className="mt-3 text-sm text-emerald-800">Palm removed from Tencent and PayByPalm. You can enroll again.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {isLinked ? confirming ? (
        <div className="mt-4">
          <p className="text-sm text-slate-700">Remove your registered palms from Tencent and your PayByPalm account? You’ll need to enroll again before paying with your palm.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={() => void unlink()}>{busy ? 'Removing palm…' : 'Yes, unlink palm'}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => {setConfirming(false);setError('');}}>Keep linked</Button>
          </div>
        </div>
      ) : <Button variant="secondary" className="mt-4" onClick={() => setConfirming(true)}>Unlink palm</Button>
      : <Button className="mt-4" onClick={onEnroll}>Link palm</Button>}
    </section>
  );
}
