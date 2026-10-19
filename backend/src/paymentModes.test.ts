import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
const m=vi.hoisted(()=>({
 config:{MAX_IMAGE_BYTES:1024*1024,PAYSTACK_MODE:'test',PAYSTACK_SECRET_KEY:'sk_test_fixture',CARD_TOKEN_ENCRYPTION_KEY:'fixture'},
 queries:[] as Array<{table:string;fields:string;filters:Array<[string,unknown]>}>,
}));
vi.mock('./config.js',()=>({config:m.config}));
vi.mock('./logger.js',()=>({logger:{warn:vi.fn()}}));
vi.mock('./services/paymentService.js',()=>({authenticateTransaction:vi.fn(),authenticateSdkTransaction:vi.fn(),beginPaymentCapture:vi.fn(),cancelTransaction:vi.fn(),confirmTransaction:vi.fn(),getTerminalTransaction:vi.fn(),createTransaction:vi.fn()}));
vi.mock('./middleware/userAuth.js',()=>({userAuth:(req:any,_res:any,next:any)=>{req.user={id:'owner'};next();},requireUser:(req:any)=>req.user}));
vi.mock('./middleware/terminalAuth.js',()=>({terminalAuth:(_req:any,_res:any,next:any)=>next(),requireTerminal:()=>({id:'terminal'})}));
vi.mock('./middleware/abuseLimits.js',()=>({userRateLimit:()=> (_req:any,_res:any,next:any)=>next(),terminalRateLimit:()=> (_req:any,_res:any,next:any)=>next(),rateLimit:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('./db/client.js',()=>({db:{from:(table:string)=>{
 const record={table,fields:'',filters:[] as Array<[string,unknown]>};m.queries.push(record);
 const q:any={select:(fields:string)=>{record.fields=fields;return q;},eq:(key:string,value:unknown)=>{record.filters.push([key,value]);return q;},is:()=>q,in:()=>q,order:()=>q,limit:()=>q,range:()=>q,
 then:(resolve:any,reject:any)=>Promise.resolve({data:[],error:null,count:0}).then(resolve,reject)};return q;
}}}));
import {listCards} from './services/cardLinkService.js';
import {transactionsRouter} from './routes/transactions.js';
let server:Server,base:string;
beforeAll(async()=>{
 const app=express();app.use(transactionsRouter);server=app.listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
beforeEach(()=>{m.queries=[];m.config.PAYSTACK_MODE='test';});
describe('backend-owned payment modes',()=>{
 it.each(['test','live'])('limits cards and pending checkouts to owner/current %s mode',async mode=>{
  m.config.PAYSTACK_MODE=mode;
  const result=await listCards('owner');
  expect(result).toMatchObject({paymentMode:mode,testMode:mode==='test',cards:[],attempts:[]});
  expect(m.queries.map(q=>q.table)).toEqual(['linked_cards','card_link_attempts']);
  for(const q of m.queries)expect(q.filters).toEqual([['user_id','owner'],['domain',mode]]);
  expect(m.queries[0]!.fields).not.toMatch(/authorization|signature|email|\*/);
 });
 it.each(['test','live'])('limits transaction history and totals to owner/current %s mode',async mode=>{
  m.config.PAYSTACK_MODE=mode;
  const response=await fetch(base+'/transactions?limit=50&offset=0');
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({paymentMode:mode,total:0,transactions:[]});
  expect(m.queries[0]!.filters).toEqual([['matched_user_id','owner'],['card_payment_attempts.domain',mode]]);
  expect(m.queries[0]!.fields).toContain('card_payment_attempts!inner(domain)');
 });
});
