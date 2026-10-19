import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import type {Merchant} from './types';

type Setup={status:string;mode:'test'|'live';bankName:string;accountLast4:string;accountName:string;percentageCharge:number;subaccountCode:string|null;verified:boolean|null;active:boolean|null};
type Info={mode:'test'|'live';enabled:boolean;setup:Setup|null;subaccountCode:string|null};
type Verification={mode:'test'|'live';accountName:string;bankName:string;accountLast4:string;verificationToken:string;expiresAt:string};
export function PayoutSetup({merchant,onSaved}:{merchant:Merchant;onSaved:(m:Merchant)=>void}){
 const [info,setInfo]=useState<Info|null>(null),[banks,setBanks]=useState<Array<{code:string;name:string}>>([]);
 const [bank,setBank]=useState(''),[account,setAccount]=useState(''),[fee,setFee]=useState('0');
 const [verified,setVerified]=useState<Verification|null>(null),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const revision=useRef(0),mounted=useRef(true),loading=useRef(0),busyRef=useRef(false),currentInfo=useRef<Info|null>(null);
 function markBusy(value:boolean){busyRef.current=value;setBusy(value);}
 function acceptInfo(next:Info){
  if(currentInfo.current&&currentInfo.current.mode!==next.mode){
   invalidate();setBank('');setBanks([]);
   setNotice(`Payment backend switched to ${next.mode} mode. Verify the bank account again before creating a payout account.`);
  }
  currentInfo.current=next;setInfo(next);
 }
 async function load(){
  const request=++loading.current;
  const next=await api<Info>(`/merchants/${merchant.id}/payout`);
  if(!mounted.current||request!==loading.current)return null;
  acceptInfo(next);setError('');
  if(next.enabled&&!next.subaccountCode&&!['submitting','needs_review'].includes(next.setup?.status||'')){
   const list=await api<{mode:Info['mode'];banks:Array<{code:string;name:string}>}>('/payouts/banks');
   if(mounted.current&&request===loading.current&&list.mode===next.mode)setBanks(list.banks);
  }
  return next;
 }
 function unavailable(e:unknown){
  if(!mounted.current)return;
  invalidate();currentInfo.current=null;setInfo(null);setBanks([]);setError((e as Error).message);
 }
 useEffect(()=>{
  mounted.current=true;currentInfo.current=null;setInfo(null);
  const refresh=()=>{if(!busyRef.current)void load().catch(unavailable);};
  const visible=()=>{if(document.visibilityState==='visible')refresh();};
  refresh();const timer=window.setInterval(visible,30_000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{mounted.current=false;++revision.current;++loading.current;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
 },[merchant.id]);
 function invalidate(){++revision.current;setVerified(null);setConfirmed(false);setNotice('');}
 async function verify(){
  if(busyRef.current)return;++loading.current;markBusy(true);setError('');setVerified(null);setConfirmed(false);
  const version=++revision.current;
  try{
   const next=await api<Verification>('/payouts/verify',{merchantId:merchant.id,bankCode:bank,accountNumber:account});
   if(mounted.current&&version===revision.current){
    if(next.mode!==currentInfo.current?.mode){await load();setError('Payment mode changed. Verify the bank account again.');}
    else setVerified(next);
   }
  }catch(e){if(mounted.current)setError((e as Error).message);}
  finally{if(mounted.current)markBusy(false);}
 }
 async function create(){
  if(busyRef.current||!verified||!confirmed)return;
  if(Date.parse(verified.expiresAt)<=Date.now()){invalidate();setError('The bank check expired. Verify the account again.');return;}
  ++loading.current;markBusy(true);setError('');setNotice('Creating the payout account in Paystack…');
  try{
   const latest=await load();
   if(!latest||latest.mode!==verified.mode||!latest.enabled){invalidate();setError('Payment mode or configuration changed. Verify the bank account again.');return;}
   const result=await api<{merchant:Merchant;setup:Setup}>(`/merchants/${merchant.id}/payout`,{verificationToken:verified.verificationToken,percentageCharge:Number(fee),expected:merchant.updated_at});
   if(!mounted.current)return;
   if(currentInfo.current?.mode===result.setup.mode)acceptInfo({...currentInfo.current,setup:result.setup,subaccountCode:result.setup.subaccountCode});
   setVerified(null);setConfirmed(false);setAccount('');
   setNotice(result.setup.status==='created'?'Payout account created and saved.':'The original setup is still being checked. Use Check status.');
   if(result.setup.status==='created')onSaved(result.merchant);
  }catch(e){if(mounted.current){setNotice('');setError((e as Error).message);await load().catch(unavailable);setError((e as Error).message);}}
  finally{if(mounted.current)markBusy(false);}
 }
 async function check(){
  if(busyRef.current)return;++loading.current;markBusy(true);setError('');setNotice('');
  try{
   const result=await api<{merchant:Merchant;setup:Setup}>(`/merchants/${merchant.id}/payout/check`,{});
   if(!mounted.current)return;
   if(currentInfo.current?.mode===result.setup.mode)acceptInfo({...currentInfo.current,setup:result.setup,subaccountCode:result.setup.subaccountCode});
   if(result.setup.status==='created'){setNotice('Paystack status refreshed.');onSaved(result.merchant);}
  }catch(e){if(mounted.current)setError((e as Error).message);}finally{if(mounted.current)markBusy(false);}
 }
 const setup=info?.setup,unresolved=setup&&['submitting','needs_review'].includes(setup.status);
 return <section className="panel form-panel payout-panel" aria-labelledby="payout-title">
  <div className="panel-heading"><h2 id="payout-title">Bank payouts</h2>{info&&<span className={`badge ${info.mode==='live'?'blue':'neutral'}`}>{info.mode==='live'?'Live mode':'Test mode'}</span>}</div>
  <p>Verify the merchant’s bank account and create its Paystack subaccount here. Payment mode follows the payment backend automatically.</p>
  {error&&<div className="notice danger" role="alert">{error}</div>}
  {notice&&<p className="notice" role="status">{notice}</p>}
  {!info?<button className="button secondary" onClick={()=>void load().then(()=>setError('')).catch(e=>setError(e.message))}>Reload payout setup</button>:
   !info.enabled?<p className="notice">Configure the {info.mode} Paystack secret on the admin server to enable bank verification. The merchant profile is already saved.</p>:
   info.subaccountCode?<div className="payout-result">
    <p><strong>Paystack subaccount: </strong><span className="payout-code">{info.subaccountCode}</span></p>
    {setup&&<><p>{setup.bankName} · account ending {setup.accountLast4}</p><p>{setup.accountName}</p><p>PayByPalm share: {setup.percentageCharge}%</p></>}
    <p className="notice" role="status">{setup?.active===false?'Paystack has marked this subaccount inactive. Contact Paystack before accepting payments.':setup?.verified===true?'Paystack reports this subaccount as verified.':'Created in Paystack. Payout verification is pending or has not been checked. Complete any requirements in the Paystack dashboard.'}</p>
    {setup&&<button className="button secondary" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check Paystack status'}</button>}
   </div>:unresolved?<div className="payout-result">
    <p>Creation is not confirmed. Check the original request before making any changes. This does not create another subaccount.</p>
    <p>{setup.bankName} · account ending {setup.accountLast4}</p>
    <button className="button" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check status'}</button>
   </div>:<form onSubmit={e=>{e.preventDefault();void create();}}>
    <p className="payout-mode-note">{info.mode==='live'?'This creates a live payout account in your Paystack business.':'Test mode creates a sandbox subaccount. It will not replace the merchant’s live payout account.'}</p>
    <fieldset disabled={busy}>
     <div className="form-grid">
      <label className="field"><span>Settlement bank</span><select aria-label="Settlement bank" value={bank} onChange={e=>{setBank(e.target.value);invalidate();}} required><option value="">Choose a bank</option>{banks.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}</select></label>
      <label className="field"><span>Account number</span><input value={account} onChange={e=>{setAccount(e.target.value.replace(/\D/g,'').slice(0,10));invalidate();}} inputMode="numeric" autoComplete="off" pattern="[0-9]{10}" minLength={10} maxLength={10} required placeholder="10-digit account number" /></label>
     </div>
     <button className="button secondary" type="button" disabled={!bank||!/^\d{10}$/.test(account)||busy} onClick={()=>void verify()}>{busy&&!verified?'Verifying…':'Verify bank account'}</button>
     {verified&&<div className="payout-verification" role="status"><h3>Account name confirmed</h3><p className="payout-account-name">{verified.accountName}</p><p>{verified.bankName} · account ending {verified.accountLast4}</p><small>This confirms the account name. Paystack may still require payout verification.</small></div>}
     <label className="field payout-fee"><span>PayByPalm share (%)</span><input aria-label="PayByPalm share (%)" type="number" min="0" max="100" step="0.01" value={fee} onChange={e=>{setFee(e.target.value);setConfirmed(false);}} required /><small>Paystack sends this percentage to your main business. At 0%, the merchant receives the payment less applicable processing fees.</small></label>
     {verified&&<label className="payout-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /><span>I confirm this is the merchant’s payout account and agree to the {fee||'0'}% PayByPalm share.</span></label>}
     <div className="form-actions"><button type="submit" className="button" disabled={busy||!verified||!confirmed||fee===''||Number(fee)<0||Number(fee)>100}>{busy?'Creating payout account…':'Confirm and create payout account'}</button></div>
    </fieldset>
   </form>}
 </section>;
}
