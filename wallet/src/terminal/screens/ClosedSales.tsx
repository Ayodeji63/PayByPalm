import {useState} from 'react';
import {terminalApi} from '../api.js';
import {loadClosedSales} from '../paymentRecovery.js';
import {Pane,TButton} from '../ui.js';
import {formatNaira} from '../../lib/money.js';

/** Read-only recovery: reviewing a closed sale can never initiate a charge. */
export function ClosedSales({onBack}:{onBack:()=>void}) {
 const [index,setIndex]=useState(0);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 let rows;
 try { rows=loadClosedSales(); }
 catch { return <Pane className="justify-center items-center"><p className="t-sm">Closed payment records need administrator review.</p><TButton className="mt-4" onClick={onBack}>Back to home</TButton></Pane>; }
 const sale=rows[index];
 async function check() {
  if(busy||!sale)return;
  if(!sale.transactionId){setMessage('No transaction reference was returned. Contact support with the sale reference below.');return;}
  setBusy(true);setMessage('Checking payment status…');
  try {
   const state=await terminalApi.status(sale.transactionId);
   if(state.transactionId!==sale.transactionId||state.amountMinor!==sale.amountMinor)throw Error('Payment details could not be verified.');
   setMessage(state.status==='settled'?'Payment completed despite closing the sale. Review it with the customer; do not charge this purchase again.':
    state.status==='failed'?'Payment failed.':state.status==='cancelled'?'Sale cancellation confirmed.':
    'Payment outcome is still unconfirmed. Do not charge the same purchase again.');
  } catch {setMessage('Could not check this payment. Its reference is saved; try again when connected.');}
  finally {setBusy(false);}
 }
 return <Pane className="justify-between">
  <header className="flex items-center justify-between gap-4"><h1 className="t-lg">Closed sales</h1><TButton size="sm" tone="secondary" onClick={onBack}>Back to home</TButton></header>
  {sale?<>
   <div className="text-center"><p className="t-lg">{formatNaira(sale.amountMinor)}</p>
    <p className="t-sm mt-3">The sale was closed on this terminal. A submitted bank charge may still complete.</p>
    <p className="t-sm mt-3 break-all">Reference: {sale.transactionId??sale.saleId}</p>
    {message&&<p role="status" className="t-sm mt-3">{message}</p>}
   </div>
   <div className="flex items-center justify-between gap-4">
    <TButton size="sm" tone="secondary" disabled={busy||index===0} onClick={()=>{setIndex(index-1);setMessage('');}}>Previous</TButton>
    <TButton size="sm" disabled={busy} onClick={()=>void check()}>{busy?'Checking…':'Check status'}</TButton>
    <span className="t-sm">{index+1} / {rows.length}</span>
    <TButton size="sm" tone="secondary" disabled={busy||index===rows.length-1} onClick={()=>{setIndex(index+1);setMessage('');}}>Next</TButton>
   </div>
  </>:<p className="t-sm">No closed sales to review.</p>}
 </Pane>;
}
