import { Router } from 'express';
import { z } from 'zod';
import { requireUser,userAuth } from '../middleware/userAuth.js';
import { userRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';
import { listCards,initializeCardLink,ownedAttempt,processCardLink,publicAttempt,editCard } from '../services/cardLinkService.js';
import {paystackDomain} from '../services/paystack.js';
import {AppError} from '../errors.js';
export const cardsRouter:Router=Router();
const reference=z.string().regex(/^pbp_card_[a-f0-9]{32}$/);
cardsRouter.get('/cards',userAuth,userRateLimit('cards-read',60,60),async(req,res)=>{res.json(await listCards(requireUser(req).id));});
cardsRouter.post('/cards/link',userAuth,userRateLimit('cards-link',5,3600),
 validate({body:z.object({requestId:z.string().uuid(),consent:z.literal(true),paymentMode:z.enum(['test','live'])}).strict()}),async(req,res)=>{
 const user=requireUser(req);res.status(201).json(await initializeCardLink(user.id,user.email!,req.body.requestId,req.body.paymentMode));
});
cardsRouter.post('/cards/link/verify',userAuth,userRateLimit('cards-verify',20,300),validate({body:z.object({reference}).strict()}),async(req,res)=>{
 const user=requireUser(req);const attempt=await ownedAttempt(user.id,req.body.reference);
 if(attempt.domain!==paystackDomain())throw new AppError(409,'payment_mode_changed','This checkout belongs to another payment mode. Your current cards have been refreshed.');
 await processCardLink(req.body.reference);
 res.json(publicAttempt(await ownedAttempt(user.id,req.body.reference)));
});
cardsRouter.post('/cards/:id',userAuth,userRateLimit('cards-edit',20,300),validate({params:z.object({id:z.string().uuid()}),body:z.object({action:z.enum(['default','pause','resume','remove']),paymentMode:z.enum(['test','live'])}).strict()}),async(req,res)=>{
 await editCard(requireUser(req).id,req.params.id as string,req.body.action,req.body.paymentMode);res.json({updated:true});
});
