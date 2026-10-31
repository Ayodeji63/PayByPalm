import {useSyncExternalStore} from 'react';
import {terminalAudio} from './audio.js';
export function AudioControl(){
 const {enabled,blocked}=useSyncExternalStore(terminalAudio.subscribe,terminalAudio.getSnapshot,terminalAudio.getSnapshot);
 return <button type="button" className="min-h-12 rounded-xl border border-hairline bg-surface px-3 text-base text-ink" aria-pressed={enabled&&!blocked} onClick={()=>{if(enabled&&blocked)terminalAudio.unlock();else terminalAudio.setEnabled(!enabled);}}>{blocked?'Enable sound':enabled?'Sound on':'Sound off'}</button>;
}
