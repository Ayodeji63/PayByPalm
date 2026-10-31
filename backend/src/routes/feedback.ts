import { Router } from 'express';
import { z } from 'zod/v3';
import { db } from '../db/client.js';
import { AppError } from '../errors.js';
import { requireUser, userAuth } from '../middleware/userAuth.js';
import { userRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';

export const feedbackRouter:Router=Router();
const privateFields='id,rating,comment,updated_at,published_at';
function check(error:unknown){if(error)throw new AppError(503,'feedback_unavailable','Feedback is unavailable. Please try again later.');}
const body=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().min(1,'Add a comment.').max(2000).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'Remove control characters.')}).strict();
feedbackRouter.get('/feedback/public',async(_req,res)=>{
 const result=await db.from('customer_feedback').select('id,rating,comment,published_at').not('published_at','is',null).order('published_at',{ascending:false}).order('id',{ascending:false}).limit(6);
 check(result.error);res.json({reviews:result.data??[]});
});
feedbackRouter.get('/feedback/mine',userAuth,userRateLimit('feedback-read',30,60),async(req,res)=>{
 const result=await db.from('customer_feedback').select(privateFields).eq('user_id',requireUser(req).id).maybeSingle();
 check(result.error);res.json({feedback:result.data});
});
feedbackRouter.post('/feedback',userAuth,userRateLimit('feedback-write',5,3600),validate({body}),async(req,res)=>{
 const result=await db.from('customer_feedback').upsert({user_id:requireUser(req).id,rating:req.body.rating,comment:req.body.comment,published_at:null,reviewed_by:null},{onConflict:'user_id'}).select(privateFields).single();
 check(result.error);res.json({feedback:result.data});
});
