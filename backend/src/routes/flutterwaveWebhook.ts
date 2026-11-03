/** V3's verif-hash authenticates a wake-up only. GET verification decides outcomes. */
import express,{Router} from 'express';
import {AppError} from '../errors.js';
import {db} from '../db/client.js';
import {validFlutterwaveWebhook} from '../services/flutterwave.js';
import {wakeCardLink} from '../services/cardLinkService.js';
import {wakeCardPayment} from '../services/cardPaymentService.js';
export const flutterwaveWebhookRouter:Router=Router();
flutterwaveWebhookRouter.post('/webhooks/flutterwave',express.raw({type:'application/json',limit:'256kb',inflate:false}),async(req,res)=>{
 if(!Buffer.isBuffer(req.body)||!validFlutterwaveWebhook(req.header('verif-hash')))throw new AppError(401,'invalid_webhook_signature','Invalid webhook signature.');
 let event:any;try{event=JSON.parse(req.body.toString('utf8'));}catch{throw new AppError(400,'invalid_json','Invalid webhook payload.');}
 if(event?.event==='charge.completed'){
  const reference=event.data?.tx_ref;
  if(typeof reference==='string'&&/^pbp_card_[a-f0-9]{32}$/.test(reference))await wakeCardLink(reference,'flutterwave');
  if(typeof reference==='string'&&/^pbp_pay_[a-f0-9]{32}$/.test(reference))await wakeCardPayment(reference,'flutterwave');
 }else if(event?.event==='refund.completed'){
  const id=event.data?.tx_id??event.data?.TransactionId;
  if(Number.isSafeInteger(id)&&id>0){
   const r=await db.from('card_link_attempts').select('reference').eq('provider','flutterwave').eq('provider_transaction_id',String(id)).limit(1).maybeSingle();
   if(r.error)throw new AppError(503,'webhook_storage_unavailable','Refund status could not be queued.');
   if(r.data)await wakeCardLink(r.data.reference,'flutterwave');
  }
 }
 res.sendStatus(200);
});
