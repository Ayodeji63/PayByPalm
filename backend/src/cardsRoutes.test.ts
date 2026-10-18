import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import express from 'express';
import { createHmac } from 'node:crypto';
import type {Server} from 'node:http';
const mocks=vi.hoisted(()=>({list:vi.fn(),initialize:vi.fn(),owned:vi.fn(),process:vi.fn(),edit:vi.fn(),wake:vi.fn(),wakePayment:vi.fn()}));
vi.mock('./services/cardLinkService.js',()=>({listCards:mocks.list,initializeCardLink:mocks.initialize,ownedAttempt:mocks.owned,processCardLink:mocks.process,publicAttempt:(a:any)=>a,editCard:mocks.edit,wakeCardLink:mocks.wake}));
vi.mock('./services/cardPaymentService.js',()=>({wakeCardPayment:mocks.wakePayment}));
vi.mock('./config.js',()=>({config:{PAYSTACK_SECRET_KEY:'sk_test_fixture'}}));
vi.mock('./middleware/abuseLimits.js',()=>({userRateLimit:()=> (_req:any,_res:any,next:any)=>next()}));
vi.mock('./middleware/userAuth.js',()=>({userAuth:(req:any,res:any,next:any)=>{
 if(!req.header('Authorization'))return res.status(401).json({error:'Authentication required'});
 req.user={id:'signed-in-user',email:'user@example.test'};next();
},requireUser:(req:any)=>req.user}));
import {cardsRouter} from './routes/cards.js';
import {paystackWebhookRouter} from './routes/paystackWebhook.js';
import {AppError} from './errors.js';
let server:Server,base:string;
beforeAll(async()=>{
 const app=express();app.use(paystackWebhookRouter);app.use(express.json());app.use(cardsRouter);
 app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.status??500).json({error:{code:err.code??'error'}}));
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
beforeEach(()=>{vi.resetAllMocks();mocks.initialize.mockResolvedValue({checkoutUrl:'https://checkout.paystack.com/abc'});mocks.owned.mockResolvedValue({status:'verified'});mocks.wake.mockResolvedValue(undefined);mocks.wakePayment.mockResolvedValue(undefined);});
const ref='pbp_card_'+'a'.repeat(32);
const post=(path:string,body:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
describe('card API boundaries',()=>{
 it('requires authentication to initialize checkout',async()=>{expect((await post('/cards/link',{requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',consent:true},false)).status).toBe(401);expect(mocks.initialize).not.toHaveBeenCalled();});
 it.each([{consent:false},{amountMinor:1},{userId:'attacker'},{email:'other@example.test'},{authorization_code:'AUTH_forged'}])('rejects missing consent and mass assignment %j',async patch=>{
  expect((await post('/cards/link',{requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',consent:true,...patch})).status).toBe(400);expect(mocks.initialize).not.toHaveBeenCalled();
 });
 it('binds checkout to the authenticated ID and email',async()=>{
  expect((await post('/cards/link',{requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',consent:true})).status).toBe(201);
  expect(mocks.initialize).toHaveBeenCalledWith('signed-in-user','user@example.test','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
 });
 it('checks ownership before verifying an arbitrary payment reference',async()=>{
  mocks.owned.mockRejectedValue(new AppError(404,'not_found','Not found'));
  expect((await post('/cards/link/verify',{reference:ref})).status).toBe(404);expect(mocks.process).not.toHaveBeenCalled();
 });
 it('binds card removal to its authenticated owner',async()=>{
  expect((await post('/cards/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',{action:'remove'})).status).toBe(200);
  expect(mocks.edit).toHaveBeenCalledWith('signed-in-user','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','remove');
 });
 it('rejects missing and forged webhook signatures before storage writes',async()=>{
  expect((await post('/webhooks/paystack',{event:'charge.success',data:{reference:ref}},false)).status).toBe(401);expect(mocks.wake).not.toHaveBeenCalled();
 });
 it('verifies original raw bytes and durably queues signed webhook replays',async()=>{
  const raw='{ "event": "charge.success", "data": { "reference": "'+ref+'" } }';
  const signature=createHmac('sha512','sk_test_fixture').update(raw).digest('hex');
  for(let i=0;i<2;i++){
   const response=await fetch(base+'/webhooks/paystack',{method:'POST',headers:{'Content-Type':'application/json','x-paystack-signature':signature},body:raw});
   expect(response.status).toBe(200);
  }
  expect(mocks.wake).toHaveBeenCalledTimes(2);expect(mocks.process).not.toHaveBeenCalled();
  expect((await fetch(base+'/webhooks/paystack',{method:'POST',headers:{'Content-Type':'application/json','x-paystack-signature':signature},body:raw+' '})).status).toBe(401);
 });
});

describe('card payment webhook routing',()=>{
 it('wakes a durable payment only after validating its raw signature',async()=>{
  const reference='pbp_pay_'+'b'.repeat(32),body=JSON.stringify({event:'charge.success',data:{reference}});
  const signature=createHmac('sha512','sk_test_fixture').update(body).digest('hex');
  const r=await fetch(base+'/webhooks/paystack',{method:'POST',headers:{'Content-Type':'application/json','x-paystack-signature':signature},body});
  expect(r.status).toBe(200);expect(mocks.wakePayment).toHaveBeenCalledWith(reference);expect(mocks.wake).not.toHaveBeenCalled();
 });
});
