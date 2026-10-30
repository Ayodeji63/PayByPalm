import { Router } from 'express';
import { z } from 'zod/v3';
import { db } from '../db/client.js';
import { AppError, notFound } from '../errors.js';
import { terminalAuth, requireTerminal } from '../middleware/terminalAuth.js';
import { terminalRateLimit } from '../middleware/abuseLimits.js';
import { validate } from '../middleware/validate.js';
import { operations, operationContext } from '../services/operationEvents.js';

const event=z.object({scope:z.enum(['enrollment','payment']),scopeId:z.string().uuid(),stage:z.enum(['scan_started','capture_started','frame_captured','capture_retake','capture_cancelled','guidance']),frameCount:z.number().int().min(0).max(3).optional(),guidance:z.enum(['loading','place','position','open','moving','ready','error']).optional()}).strict();
export const terminalEventsRouter=Router();
terminalEventsRouter.post('/terminal/events',terminalAuth,terminalRateLimit('capture-events',120,60),validate({body:z.object({events:z.array(event).min(1).max(16)}).strict()}),async(req,res)=>{
 const terminal=requireTerminal(req), events=z.array(event).parse(req.body.events);
 for(const scope of ['enrollment','payment'] as const) {
  const ids=[...new Set(events.filter(e=>e.scope===scope).map(e=>e.scopeId))];if(!ids.length)continue;
  const {data,error}=await db.from(scope==='enrollment'?'enrol_sessions':'transactions').select('id').eq('terminal_id',terminal.id).in('id',ids);
  if(error)throw new AppError(503,'operation_unavailable','Could not record capture progress.');
  if(data?.length!==ids.length)throw notFound('The capture does not belong to this terminal.');
 }
 for(const item of events) operations.emit('capture',item.stage,'observed',{scope:item.scope,frameCount:item.frameCount,guidance:item.guidance},{...operationContext.getStore(),scopeId:item.scopeId});
 res.status(204).end();
});
