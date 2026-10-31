import type { Express,RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { Failure } from './failure.js';
const columns='id,user_id,rating,comment,created_at,updated_at,published_at';
const unavailable=(error:unknown)=>{if(error)throw new Failure(503,'feedback_unavailable','Feedback is unavailable. Check migration 0030 and try again.');};
/** Mounted behind the existing verified administrator and request-budget guards. */
export function mountFeedback(app:Express,db:SupabaseClient,writes:RequestHandler){
 app.get('/api/feedback',async(req,res)=>{
  const {page,status}=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),status:z.enum(['all','private','published']).default('all')}).parse(req.query);
  let query=db.from('customer_feedback').select(columns,{count:'exact'});
  if(status==='private')query=query.is('published_at',null);
  if(status==='published')query=query.not('published_at','is',null);
  const result=await query.order('updated_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*10,page*10-1);
  unavailable(result.error);res.json({feedback:result.data??[],total:result.count??0,page,pageSize:10});
 });
 app.post('/api/feedback/:id',writes,async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({publish:z.boolean(),expected:z.string().datetime({offset:true})}).strict().parse(req.body);
  const result=await db.from('customer_feedback').update({published_at:input.publish?new Date().toISOString():null,reviewed_by:res.locals.admin.id})
   .eq('id',id).eq('updated_at',input.expected).select(columns).maybeSingle();
  unavailable(result.error);
  if(!result.data)throw new Failure(409,'feedback_changed','This feedback changed. Refresh and review the latest comment before publishing.');
  res.json({feedback:result.data});
 });
}
