import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import {authenticationStatus,operationStatus,operationTrace} from './operationPresentation';
import type { Merchant, Terminal } from './types';

type Details = { upstreamRequestId?:string; score?:number; cosineSimilarity?:number; minimumPairSimilarity?:number; sampleCount?:number; frameCount?:number; durationMs?:number; errorCode?:string; decision?:string; result?:string; guidance?:string; palmSide?:string; provider?:string; providerMatched?:boolean; timings?:Record<string,number> };
type BackendEvent = { id:string; operation_id:string; request_id:string; terminal_id:string|null; merchant_id:string|null; user_id:string|null; scope_id:string|null; operation:string; stage:string; state:string; occurred_at:string; details:Details };
type ReaderEvent = { id:string; operation_id:string; request_id:string; operation:string; user_id:string|null; palm_side:string|null; client_id:string|null; occurred_at:string; state:string; status?:number; duration_ms?:number; details?: {sample_count?:number; minimum_pair_similarity?:number; cosine_similarity?:number; matched?:boolean; error_code?:string; result?:string; threshold?:number; timings?:Record<string,number>; candidates?:{user_id:string;palm_side:string;cosine_similarity:number}[]} };
type Feed = {backend:{status:string;events:BackendEvent[];cursor:string;hasMore:boolean};reader:{status:string;events:ReaderEvent[];cursor:string;gap:boolean;galleryCount:number|null};updatedAt:string};
type Event = BackendEvent & { key:string; source:'backend'|'ccnet'; clientId?:string; candidates?:{user_id:string;palm_side:string;cosine_similarity:number}[]; threshold?:number };
const kinds=['all','enrollment','verification','identification','capture','payment','terminal'];
const words=(value:string)=>value.replaceAll('_',' ');
const time=(value:string)=>new Date(value).toLocaleTimeString('en-GB',{timeZone:'Africa/Lagos',hour12:false});
function normalize(feed:Feed):Event[] {
 return [...feed.backend.events.map(event=>({...event,key:`backend:${event.id}`,source:'backend' as const})),...feed.reader.events.map(event=>({
  id:event.id,key:`ccnet:${event.id}`,source:'ccnet' as const,clientId:event.client_id??undefined,operation_id:event.operation_id,request_id:event.request_id,terminal_id:null,merchant_id:null,user_id:event.user_id,scope_id:null,
  operation:event.operation==='deletion'?'enrollment':event.operation,stage:event.operation==='deletion'?'delete_template':'reader',state:event.state,occurred_at:event.occurred_at,
  details:{sampleCount:event.details?.sample_count,minimumPairSimilarity:event.details?.minimum_pair_similarity,cosineSimilarity:event.details?.cosine_similarity,durationMs:event.duration_ms,errorCode:event.details?.error_code,result:event.details?.result,palmSide:event.palm_side??undefined,provider:'ccnet',providerMatched:event.details?.matched,timings:event.details?.timings},candidates:event.details?.candidates,threshold:event.details?.threshold,
 }))];
}
function summary(event:Event) {
 const d=event.details;
 return [d.frameCount!==undefined?`${d.frameCount}/3 frames`:d.sampleCount?`${d.sampleCount} samples`:null,d.score!==undefined?`${d.score}/100`:d.cosineSimilarity!==undefined?`cosine ${d.cosineSimilarity.toFixed(4)}`:null,d.decision?words(d.decision):d.errorCode?words(d.errorCode):d.guidance?words(d.guidance):d.result?words(d.result):null,d.durationMs!==undefined?`${Math.round(d.durationMs)} ms`:null].filter(Boolean).join(' · ')||'—';
}
export function LiveOperations({terminals,merchants}:{terminals:Terminal[];merchants:Merchant[]}) {
 const [events,setEvents]=useState<Event[]>([]),[feed,setFeed]=useState<Feed|null>(null),[error,setError]=useState(''),[paused,setPaused]=useState(false),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[kind,setKind]=useState('all'),[terminal,setTerminal]=useState('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null),[historyBusy,setHistoryBusy]=useState(false),[historyEnd,setHistoryEnd]=useState(false),[gap,setGap]=useState(false);
 const cursors=useRef<{backend?:string;reader?:string}>({}),busy=useRef(false);
 const merge=(incoming:Event[])=>setEvents(previous=>{const merged=new Map(previous.map(event=>[event.key,event]));incoming.forEach(event=>merged.set(event.key,event));return [...merged.values()].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.key.localeCompare(a.key,undefined,{numeric:true})).slice(0,1000);});
 useEffect(()=>{
  if(paused)return;
  let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
  async function poll(){
   if(stopped)return;
   if(busy.current){timer=setTimeout(poll,200);return;}busy.current=true;
   try{
    const params=new URLSearchParams();if(cursors.current.backend)params.set('after',cursors.current.backend);if(cursors.current.reader)params.set('readerAfter',cursors.current.reader);
    const data=await api<Feed>(`/operations?${params}`,undefined,controller.signal);if(stopped)return;
    merge(normalize(data));cursors.current={backend:data.backend.cursor,reader:data.reader.cursor};setFeed(data);setError('');if(data.reader.gap)setGap(true);
   }catch(err){if(!stopped)setError(err instanceof Error?err.message:'Cannot refresh operations.');}
   finally{busy.current=false;if(!stopped){setLoading(false);timer=setTimeout(poll,2000);}}
  }
  void poll();return()=>{stopped=true;controller.abort();clearTimeout(timer);};
 },[paused,refresh]);
 const correlated=useMemo(()=>events.map(event=>{const parent=event.source==='ccnet'?events.find(e=>e.source==='backend'&&e.details.upstreamRequestId===event.request_id):!event.terminal_id&&event.scope_id?events.find(e=>e.terminal_id&&e.scope_id===event.scope_id):undefined;return parent?{...event,terminal_id:parent.terminal_id,merchant_id:parent.merchant_id,scope_id:parent.scope_id}:event;}),[events]);
 const visible=useMemo(()=>correlated.filter(event=>(kind==='all'||event.operation===kind)&&(terminal==='all'||event.terminal_id===terminal)&&(!query||`${event.operation} ${event.stage} ${event.scope_id??''} ${event.request_id} ${event.user_id??''} ${event.details.errorCode??''}`.toLowerCase().includes(query.toLowerCase()))),[correlated,kind,terminal,query]);
 const chosen=correlated.find(event=>event.key===selected);
 const trace=chosen?operationTrace(chosen,correlated):[];
 const authentication=chosen&&['identification','verification'].includes(chosen.operation)?authenticationStatus(chosen,correlated):null;
 const latest=new Map<string,Event>();for(const event of events)if(!latest.has(`${event.source}:${event.operation_id}`))latest.set(`${event.source}:${event.operation_id}`,event);
 const active=[...latest.values()].filter(event=>event.state==='started').length;
 const terminalName=(id:string|null)=>id?terminals.find(t=>t.id===id)?.label??'Unknown terminal':'Reader API';
 async function older(){
  const ids=events.filter(event=>event.source==='backend').map(event=>BigInt(event.id));if(!ids.length)return;
  setHistoryBusy(true);try{const before=ids.reduce((a,b)=>a<b?a:b);const data=await api<Feed>(`/operations?before=${before}&readerAfter=${cursors.current.reader??'0'}`);merge(normalize(data));setHistoryEnd(!data.backend.hasMore);}catch(err){setError(err instanceof Error?err.message:'Cannot load history.');}finally{setHistoryBusy(false);}
 }
 return <section className="operations" aria-label="Live operations">
  <div className="ops-heading"><div><h2>Operations monitor</h2><p className="muted">From palm capture to confirmed payment.</p></div><div className="ops-actions"><button className="button secondary" onClick={()=>setPaused(p=>!p)}>{paused?'Resume updates':'Pause'}</button><button className="button secondary" disabled={paused} onClick={()=>setRefresh(r=>r+1)}>Refresh</button></div></div>
  <div className="ops-health" role="status"><span className={`ops-live ${!paused&&!error&&feed?'is-live':''}`}><i/>{paused?'Paused':error?'Disconnected':loading?'Connecting…':'Updates every 2s'}</span><span>Backend <strong>{words(feed?.backend.status??'connecting')}</strong></span><span>CCNet <strong>{words(feed?.reader.status??'connecting')}</strong></span><span>Gallery <strong>{feed?.reader.galleryCount??'—'} palms</strong></span><span><strong>{active}</strong> in progress</span>{feed&&<small>Last checked {time(feed.updatedAt)} WAT</small>}</div>
  {error&&<div className="ops-notice" role="alert">{error} Showing the last received events. <button onClick={()=>setRefresh(r=>r+1)}>Retry</button></div>}
  {feed?.backend.status==='offline'&&<p className="ops-notice" role="alert">The backend feed is unavailable. Showing any previously received events; new terminal activity may be missing.</p>}
  {feed?.backend.status==='setup_required'&&<p className="ops-notice">Backend tracking needs database migration 0028 and the matching backend release.</p>}
  {feed?.reader.status==='unconfigured'&&<p className="ops-notice">Connect the reader feed using CCNET_BASE_URL and a monitor-only CCNET_MONITOR_API_KEY on the admin server.</p>}
  {feed&&['offline','credential_error'].includes(feed.reader.status)&&<p className="ops-notice" role="alert">{feed.reader.status==='credential_error'?'The reader rejected the monitoring credential. Check its monitor scope.':'The reader is unavailable. Check that the PC, Docker and HTTPS tunnel are running.'}</p>}
  {feed?.backend.status==='ready'&&!events.some(event=>event.source==='backend'&&event.stage==='authenticate')&&events.some(event=>event.source==='ccnet'&&event.clientId==='paybypalm-backend'&&event.operation==='identification'&&event.state!=='started')&&<p className="ops-notice">Reader results are arriving, but no terminal authentication decisions have been received. Check the backend release and operation logging; a completed search does not confirm checkout.</p>}
  {gap&&<p className="ops-notice">Some reader events expired from its bounded history while this monitor was disconnected.</p>}
  <div className="panel ops-register"><div className="ops-filters"><label>Operation<select aria-label="Operation" value={kind} onChange={e=>setKind(e.target.value)}>{kinds.map(k=><option key={k} value={k}>{k==='all'?'All operations':words(k)}</option>)}</select></label><label>Terminal<select aria-label="Terminal" value={terminal} onChange={e=>setTerminal(e.target.value)}><option value="all">All terminals + reader API</option>{terminals.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label className="ops-search">Find an event<input aria-label="Find an event" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Request, session, user or error" type="search"/></label></div>
  <div className="ops-count"><strong>{visible.length} events</strong><span className="muted">Newest first · timestamps in WAT</span></div>
  {loading&&!events.length?<div className="empty" role="status">Connecting to the operation feeds…</div>:!visible.length?<div className="empty"><h3>{events.length?'No matching events':'Waiting for the first operation'}</h3><p className="muted">{events.length?'Change the filters to see more activity.':'Start an enrollment or payment on the terminal. Capture progress and reader results will appear here.'}</p></div>:<div className="table-scroll"><table className="ops-table"><thead><tr><th>Time</th><th>Operation</th><th>Terminal / source</th><th>State</th><th>Measurement</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{visible.map(event=><tr key={event.key} className={selected===event.key?'ops-selected':''}><td className="ops-time">{time(event.occurred_at)}<small>{new Date(event.occurred_at).toLocaleDateString('en-GB',{timeZone:'Africa/Lagos',day:'2-digit',month:'short'})}</small></td><td><strong className="ops-kind">{words(event.operation)}</strong><small>{words(event.stage)}</small></td><td>{event.terminal_id?terminalName(event.terminal_id):event.source==='ccnet'?'Reader API':'Backend service'}<small>{event.source==='ccnet'?'CCNet service':merchants.find(m=>m.id===event.merchant_id)?.name??'PayByPalm backend'}</small></td><td><span className={`ops-state ops-${operationStatus(event).tone}`}>{operationStatus(event).label}</span></td><td className="ops-measure">{summary(event)}</td><td><button className="ops-detail-button" aria-label={`Details for ${event.operation} at ${time(event.occurred_at)}`} aria-expanded={selected===event.key} onClick={()=>setSelected(selected===event.key?null:event.key)}>Details</button></td></tr>)}</tbody></table></div>}
  <div className="ops-footer"><small className="muted">Metadata only. No palm images, API keys or card details. Up to 1,000 events in this view.</small><button className="button secondary" disabled={historyBusy||historyEnd||events.length>=1000||!events.some(e=>e.source==='backend')} onClick={()=>void older()}>{historyBusy?'Loading…':historyEnd?'Beginning of history':'Load earlier backend events'}</button></div></div>
  {chosen&&<section className="panel ops-inspector" aria-label="Operation details"><div className="ops-heading"><div><h2>{words(chosen.operation)} details</h2><p className="muted">{chosen.terminal_id?terminalName(chosen.terminal_id):chosen.source==='ccnet'?'Reader API':'Backend service'} · {chosen.source==='ccnet'?'CCNet service':'PayByPalm backend'}</p></div><button className="button secondary" onClick={()=>setSelected(null)}>Close details</button></div><dl className="ops-references">{[['Request',chosen.request_id],['Session / transaction',chosen.scope_id],['User / reader subject',chosen.user_id],['Palm side',chosen.details.palmSide]].filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd className="identifier">{v}</dd></div>)}</dl>
   {authentication&&<div className="ops-auth-outcome" role="status"><p><strong>Terminal authentication: <span className={`ops-state ops-${authentication.tone}`}>{authentication.label}</span></strong>{authentication.score!==undefined&&<span> · {authentication.score}/100</span>}</p><p>{authentication.explanation}</p></div>}
   {chosen.source==='ccnet'&&['identification','verification'].includes(chosen.operation)&&<p>Reader processing: <strong>{operationStatus(chosen).label}</strong>. This describes the reader request; the terminal authentication decision is shown above.</p>}
   {chosen.details.minimumPairSimilarity!==undefined&&<p>Lowest similarity between the three enrollment frames: <strong>{chosen.details.minimumPairSimilarity.toFixed(4)}</strong>. CCNet averages their embeddings into one normalized template.</p>}
   {chosen.threshold!==undefined&&<p>Reader threshold: <strong>{chosen.threshold.toFixed(2)}</strong>. Checkout selects the highest similarity reaching 50/100. Equal top similarities require a retake.</p>}
   {chosen.candidates?.length?<div className="ops-candidates"><h3>Nearest reader candidates</h3>{chosen.candidates.map(candidate=><p key={`${candidate.user_id}:${candidate.palm_side}`}><span className="identifier">{candidate.user_id}</span> · {candidate.palm_side} · cosine <strong>{candidate.cosine_similarity.toFixed(4)}</strong></p>)}</div>:null}
   <ol className="ops-trace">{trace.map(event=><li key={event.key}><time>{time(event.occurred_at)}</time><div><strong>{words(event.stage)} · {operationStatus(event).label}</strong><p className="muted">{summary(event)}</p>{event.details.timings&&<small>{Object.entries(event.details.timings).map(([key,value])=>`${words(key.replace('_ms',''))} ${value.toFixed(1)} ms`).join(' · ')}</small>}</div></li>)}</ol>
  </section>}
 </section>;
}
