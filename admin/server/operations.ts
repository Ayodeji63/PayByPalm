/** Administrator-only live feed. Service credentials never cross the response boundary. */
import type { Express } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Config } from './config.js';
import { Failure } from './failure.js';

const cursor=z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const details=z.object({upstreamRequestId:z.string().uuid().optional(),score:z.number().finite().optional(),cosineSimilarity:z.number().finite().optional(),minimumPairSimilarity:z.number().finite().optional(),sampleCount:z.number().optional(),frameCount:z.number().optional(),candidateCount:z.number().optional(),amountMinor:z.number().optional(),durationMs:z.number().finite().optional(),provider:z.enum(['ccnet','tencent','mock']).optional(),palmSide:z.enum(['left','right']).optional(),decision:z.enum(['accept','step_up','reject']).optional(),providerMatched:z.boolean().optional(),guidance:z.enum(['loading','place','position','open','moving','ready','error']).optional(),scope:z.enum(['enrollment','payment']).optional(),result:z.string().max(32).optional(),errorCode:z.string().regex(/^[a-z_]{1,64}$/).optional(),timings:z.object({extract_ms:z.number().finite().optional(),embed_ms:z.number().finite().optional(),search_ms:z.number().finite().optional(),transport_ms:z.number().finite().optional()}).optional()});
const backendEvent=z.object({id:z.union([cursor,z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String)]),operation_id:z.string().uuid(),request_id:z.string().uuid(),terminal_id:z.string().uuid().nullable(),merchant_id:z.string().uuid().nullable(),user_id:z.string().uuid().nullable(),scope_id:z.string().uuid().nullable(),operation:z.enum(['terminal','enrollment','verification','identification','payment','capture']),stage:z.string().regex(/^[a-z_]{1,64}$/),state:z.enum(['started','succeeded','rejected','failed','observed']),occurred_at:z.string().datetime({offset:true}),details});
const readerDetails=z.object({sample_count:z.number().optional(),minimum_pair_similarity:z.number().finite().optional(),cosine_similarity:z.number().finite().optional(),angular_distance:z.number().finite().optional(),threshold:z.number().finite().optional(),matched:z.boolean().optional(),result:z.enum(['created','replaced']).optional(),identified_user_id:z.string().max(128).optional(),identified_palm_side:z.enum(['left','right']).optional(),error_code:z.string().regex(/^[a-z_]{1,64}$/).optional(),timings:details.shape.timings,candidates:z.array(z.object({user_id:z.string().max(128),palm_side:z.enum(['left','right']),cosine_similarity:z.number().finite()})).max(2).optional()});
const readerEvent=z.object({id:cursor,source:z.literal('ccnet'),operation_id:z.string().uuid(),request_id:z.string().max(128),operation:z.enum(['enrollment','verification','identification','deletion']),user_id:z.string().max(128).nullable(),palm_side:z.enum(['left','right']).nullable(),client_id:z.string().max(128).nullable(),occurred_at:z.string().datetime({offset:true}),state:z.enum(['started','succeeded','rejected','failed']),status:z.number().int().optional(),duration_ms:z.number().finite().optional(),details:readerDetails.optional()});
const readerResponse=z.object({events:z.array(readerEvent).max(100),cursor,gap:z.boolean(),gallery_count:z.number().int().nonnegative(),status:z.literal('ready')});
async function readReader(config: Config, after?:string) {
 if(!config.CCNET_BASE_URL || !config.CCNET_MONITOR_API_KEY)return {status:'unconfigured' as const,events:[],cursor:after??'0',gap:false,galleryCount:null};
 try{
  const url=new URL('/v1/operations',config.CCNET_BASE_URL);if(after!==undefined)url.searchParams.set('after',after);
  const response=await fetch(url,{headers:{Authorization:`Bearer ${config.CCNET_MONITOR_API_KEY}`,'ngrok-skip-browser-warning':'1'},redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok){await response.body?.cancel();return {status:response.status===401||response.status===403?'credential_error' as const:'offline' as const,events:[],cursor:after??'0',gap:false,galleryCount:null};}
  const reader=response.body?.getReader();if(!reader)throw new Error('empty');let bytes=0;const chunks:Uint8Array[]=[];
  for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>1024*1024){await reader.cancel();throw new Error('large');}chunks.push(chunk.value);}
  const data=readerResponse.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  return {status:'ready' as const,events:data.events,cursor:data.cursor,gap:data.gap,galleryCount:data.gallery_count};
 }catch{return {status:'offline' as const,events:[],cursor:after??'0',gap:false,galleryCount:null};}
}
export function mountOperations(app:Express,{config,db}:{config:Config;db:SupabaseClient}) {
 app.get('/api/operations',async(req,res)=>{
  const parsed=z.object({after:cursor.optional(),readerAfter:cursor.optional(),before:cursor.optional()}).strict().safeParse(req.query);
  if(!parsed.success)throw new Failure(400,'invalid_cursor','Refresh the operations feed to reset its cursor.');
  const {after,readerAfter,before}=parsed.data;
  let query=db.from('operation_events').select('id,operation_id,request_id,terminal_id,merchant_id,user_id,scope_id,operation,stage,state,occurred_at,details');
  if(before)query=query.lt('id',before);else if(after)query=query.gt('id',after);
  const newest=!after||!!before;
  query=query.order('id',{ascending:!newest}).limit(100).abortSignal(AbortSignal.timeout(5000));
  const [result,reader]=await Promise.all([query,readReader(config,readerAfter)]);
  if(result.error) {
   const setup=['42P01','42703','PGRST205'].includes(result.error.code);
   res.json({backend:{status:setup?'setup_required':'offline',events:[],cursor:after??'0',hasMore:false},reader,updatedAt:new Date().toISOString()});return;
  }
  const validated=z.array(backendEvent).safeParse(result.data??[]);
  if(!validated.success)throw new Failure(503,'operations_unavailable','The operation records could not be read safely.');
  const events=newest?validated.data.reverse():validated.data;
  res.json({backend:{status:'ready',events,cursor:events.at(-1)?.id??after??'0',hasMore:events.length===100},reader,updatedAt:new Date().toISOString()});
 });
}
