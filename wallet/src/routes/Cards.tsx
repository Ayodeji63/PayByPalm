import { useCallback,useEffect,useRef,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { loadLinkedCards,editLinkedCard,type CardsResponse,type CardLinkAttempt } from '../lib/serverCards.js';
import { validatedCheckoutUrl } from '../lib/paystack.js';
import { Button,PageHeader,Skeleton } from '../components/ui.js';
import { PageTransition } from '../components/transitions.js';

function refundText(attempt:CardLinkAttempt):string {
 if(attempt.status==='failed')return 'Payment was not completed. You can start a new card-link request.';
 if(attempt.status==='invalid')return 'Payment details need review. Contact support with this reference.';
 if(attempt.status==='initializing')return 'Checkout is being prepared. Check again before starting another request.';
 if(attempt.status==='init_failed')return 'Checkout could not be opened. Check your payment status before trying again.';
 if(attempt.status==='pending')return 'Waiting for payment confirmation. If you paid, check the status below.';
 const prefix=attempt.status==='unsupported'?'This card could not be saved. ':'Card verified. ';
 if(attempt.refundStatus==='processed')return prefix+'₦50 refund processed by Paystack; your bank may take time to display it.';
 if(['manual_review','failed'].includes(attempt.refundStatus))return prefix+'The ₦50 refund needs attention. Contact support with this reference.';
 return prefix+'The ₦50 refund is being processed. It has not been confirmed complete yet.';
}
export default function Cards() {
 const {me}=useAuth();
 const [searchParams,setSearchParams]=useSearchParams();
 const [data,setData]=useState<CardsResponse|null>(null);
 const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const [consent,setConsent]=useState(false);const requestId=useRef<string|null>(null);
 const checked=useRef<string|null>(null);
 const loadVersion=useRef(0);
 const reload=useCallback(async()=>{const version=++loadVersion.current;const next=await loadLinkedCards();if(version===loadVersion.current)setData(next);return next;},[]);
 const reference=searchParams.get('reference')??searchParams.get('trxref');
 useEffect(()=>{
  let active=true;
  void reload().catch(()=>{if(active)setError('Could not load your cards. Please try again.');});
  return ()=>{active=false;};
 },[me?.id,reload]);
 const check=useCallback(async(ref:string)=>{
  setBusy(true);setError('');setNotice('Checking payment and refund status…');
  try{
   await api.post('/cards/link/verify',{reference:ref});
   await reload();setNotice('Status updated. Review your linking request below.');
  }catch(failure){setNotice('');setError(failure instanceof Error?failure.message:'Could not check payment. Please try again.');}
  finally{setBusy(false);}
 },[reload]);
 useEffect(()=>{
  if(!reference||checked.current===reference)return;checked.current=reference;
  setSearchParams({}, {replace:true});
  if(!/^pbp_card_[a-f0-9]{32}$/.test(reference)){setError('Invalid card-link reference. Check your recent requests below.');return;}
  void check(reference);
 },[reference,check,setSearchParams]);
 async function link(){
  if(busy||!consent)return;setBusy(true);setError('');setNotice('Opening secure checkout…');
  requestId.current??=crypto.randomUUID();
  try{
   const result=await api.post<{checkoutUrl:string|null;reference:string}>('/cards/link',{requestId:requestId.current,consent:true});
   if(result.checkoutUrl)window.location.assign(validatedCheckoutUrl(result.checkoutUrl));
   else {requestId.current=null;await reload();setNotice('This request already has a result. Review its status below.');setBusy(false);}
  }catch(failure){setNotice('');setError(failure instanceof Error?failure.message:'Could not open checkout.');setBusy(false);await reload().catch(()=>{});}
 }
 async function edit(id:string,action:'default'|'pause'|'resume'|'remove'){
  if(busy)return;
  if(action==='remove'&&!window.confirm('Remove this saved card from PayByPalm? Any verification refund will continue.'))return;
  setBusy(true);setError('');
  try{await editLinkedCard(id,action);await reload();setNotice(action==='remove'?'Card removed.':'Card updated.');}
  catch(failure){setError(failure instanceof Error?failure.message:'Could not update your card.');}
  finally{setBusy(false);}
 }
 return <PageTransition><main className="mx-auto max-w-md px-5 pb-28 pt-6">
  <PageHeader title="Payment cards" />
  <p className="mt-3 text-sm text-gray-600">Save a card through Paystack’s secure checkout. Your card number and CVV never pass through PayByPalm.</p>
  {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="mt-4 text-sm text-blue-800">{notice}</p>}
  {!data?<div className="mt-6"><Skeleton className="h-32 w-full" /><button type="button" className="mt-4 min-h-11 font-semibold text-blue-700" onClick={()=>void reload().catch(()=>setError('Could not load your cards. Please try again.'))}>Reload cards</button></div>:<>
   {data.testMode&&data.enabled&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Test mode: use Paystack test cards. No real payment is collected.</p>}
   <section className="mt-7" aria-labelledby="saved-cards-title">
    <h2 id="saved-cards-title" className="text-lg font-bold">Your saved cards</h2>
    {!data.cards.length?<p className="mt-3 text-sm text-gray-600">You haven’t linked a card yet.</p>:<ul className="mt-3 space-y-4">{data.cards.map(card=><li key={card.id} className="rounded-2xl border border-gray-200 bg-white p-4">
     <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold">{card.bank}</h3><p className="mt-2 uppercase">{card.brand} ···· {card.last4}</p><p className="mt-1 text-sm text-gray-600">Expires {card.exp_month}/{card.exp_year}</p></div>{card.is_default&&<span className="text-sm font-semibold text-blue-700">Default</span>}</div>
     {card.is_paused&&<p className="mt-3 text-sm text-amber-800">Paused</p>}
     <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold"><button className="min-h-11 text-blue-700" disabled={busy} onClick={()=>void edit(card.id,card.is_paused?'resume':'pause')}>{card.is_paused?'Resume':'Pause'}</button>{!card.is_default&&<button className="min-h-11 text-blue-700" disabled={busy} onClick={()=>void edit(card.id,'default')}>Set default</button>}<button className="min-h-11 text-red-700" disabled={busy} onClick={()=>void edit(card.id,'remove')}>Remove</button></div>
    </li>)}</ul>}
   </section>
   <section className="mt-8 rounded-2xl bg-blue-50 p-5" aria-labelledby="link-card-title">
    <h2 id="link-card-title" className="text-lg font-bold">Link a card</h2>
    <p className="mt-2 text-sm text-gray-700">A ₦50 verification payment confirms your card. We request a full refund after verifying a successful payment, even if the card cannot be saved. Refund status appears below.</p>
    <p className="mt-3 text-sm text-gray-600">Payments debit your default linked card after palm verification and confirmation. Card balances are unavailable; check your bank app.</p>
    {data.enabled?<><label className="mt-4 flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} /><span>I agree to the ₦50 verification payment and saving this card for future payments I authorize.</span></label><div className="mt-5"><Button full disabled={busy||!consent} loading={busy} onClick={()=>void link()}>Continue to Paystack · ₦50</Button></div></>:<p className="mt-4 text-sm font-semibold text-blue-800">Payment setup is not complete. You can view existing cards; new cards cannot be linked yet.</p>}
   </section>
   {!!data.attempts.length&&<section className="mt-8" aria-labelledby="link-history-title"><h2 id="link-history-title" className="text-lg font-bold">Verification payments & refunds</h2><ul className="mt-3 divide-y divide-gray-200">{data.attempts.map(attempt=><li key={attempt.reference} className="py-4"><p className="text-sm text-gray-700">{refundText(attempt)}</p><p className="mt-2 break-all text-xs text-gray-500">Reference: {attempt.reference}</p>{attempt.refundStatus!=='processed'&&<button className="mt-2 min-h-11 text-sm font-semibold text-blue-700" disabled={busy} onClick={()=>void check(attempt.reference)}>Check status</button>}</li>)}</ul></section>}
  </>}
 </main></PageTransition>;
}
