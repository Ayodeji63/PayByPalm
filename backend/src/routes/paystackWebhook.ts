import { wakeCardPayment } from '../services/cardPaymentService.js';
import express,{ Router } from 'express';
import { AppError } from '../errors.js';
import { validPaystackSignature } from '../services/paystack.js';
import { wakeCardLink } from '../services/cardLinkService.js';
export const paystackWebhookRouter:Router=Router();
paystackWebhookRouter.post('/webhooks/paystack',express.raw({type:'application/json',limit:'256kb',inflate:false}),async(req,res)=>{
 if(!Buffer.isBuffer(req.body)||!validPaystackSignature(req.body,req.header('x-paystack-signature')))throw new AppError(401,'invalid_webhook_signature','Invalid webhook signature.');
 let event:any;try{event=JSON.parse(req.body.toString('utf8'));}catch{throw new AppError(400,'invalid_json','Invalid webhook payload.');}
 // Persist a wakeup before acknowledging. The worker obtains its own verified
 // provider response; a signed payload is never the source of card credentials.
 const reference=event?.event==='charge.success'?event.data?.reference:
  typeof event?.event==='string'&&event.event.startsWith('refund.')?(event.data?.transaction?.reference??event.data?.transaction_reference):null;
 if(typeof reference==='string'&&/^pbp_card_[a-f0-9]{32}$/.test(reference))await wakeCardLink(reference);
 if(event?.event==='charge.success'&&typeof reference==='string'&&/^pbp_pay_[a-f0-9]{32}$/.test(reference))await wakeCardPayment(reference);
 res.sendStatus(200);
});
