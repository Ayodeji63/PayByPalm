import { Router } from 'express';
import { z } from 'zod';
import { requireUser,userAuth } from '../middleware/userAuth.js';
import { userRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';
import { listCards,initializeCardLink,ownedAttempt,processCardLink,publicAttempt,editCard } from '../services/cardLinkService.js';
export const cardsRouter:Router=Router();
const reference=z.string().regex(/^pbp_card_[a-f0-9]{32}$/);
cardsRouter.get('/cards',userAuth,userRateLimit('cards-read',60,60),async(req,res)=>{res.json(await listCards(requireUser(req).id));});
cardsRouter.post('/cards/link',userAuth,userRateLimit('cards-link',5,3600),
 validate({body:z.object({requestId:z.string().uuid(),consent:z.literal(true)}).strict()}),async(req,res)=>{
 const user=requireUser(req);res.status(201).json(await initializeCardLink(user.id,user.email!,req.body.requestId));
});
cardsRouter.post('/cards/link/verify',userAuth,userRateLimit('cards-verify',20,300),validate({body:z.object({reference}).strict()}),async(req,res)=>{
 const user=requireUser(req);await ownedAttempt(user.id,req.body.reference);
 await processCardLink(req.body.reference);
 res.json(publicAttempt(await ownedAttempt(user.id,req.body.reference)));
});
cardsRouter.post('/cards/:id',userAuth,userRateLimit('cards-edit',20,300),validate({params:z.object({id:z.string().uuid()}),body:z.object({action:z.enum(['default','pause','resume','remove'])}).strict()}),async(req,res)=>{
 await editCard(requireUser(req).id,req.params.id as string,req.body.action);res.json({updated:true});
});
