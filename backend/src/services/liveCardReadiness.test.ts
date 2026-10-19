import {beforeEach, describe, expect, it, vi} from 'vitest';
const m=vi.hoisted(()=>({
 settings:{PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_privatefixture' as string|undefined,CARD_TOKEN_ENCRYPTION_KEY:'private-encryption-key' as string|undefined,PALM_PROVIDER:'tencent',TENCENT_CAPTURE_MODE:'h5',TENCENT_H5_IMAGE_ONLY_APPROVED:true},
 reads:vi.fn(),provider:vi.fn(),open:vi.fn(),profile:{data:{id:'user',palm_enrolled:true},error:null} as any,
 card:{data:{id:'card',exp_month:12,exp_year:2099,authorization_ciphertext:'private-ciphertext',signature_hash:'hash:sig'},error:null} as any,
 merchant:{data:{paystack_subaccount:'ACCT_fixture'},error:null} as any,
 binding:{count:1,error:null} as any,verified:{count:1,error:null} as any,outstanding:{count:0,error:null} as any,
}));
vi.mock('../config.js',()=>({config:m.settings}));
vi.mock('../db/client.js',()=>({db:{from:(table:string)=>{
 m.reads(table);const result=()=>table==='profiles'?m.profile:table==='linked_cards'?m.card:table==='merchants'?m.merchant:table==='palm_bindings'?m.binding:table==='card_link_attempts'?m.verified:m.outstanding;
 const chain:any={select:()=>chain,eq:()=>chain,is:()=>chain,not:()=>chain,maybeSingle:async()=>result(),then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return chain;
}}}));
vi.mock('./paystack.js',()=>({paystack:m.provider,openAuthorization:m.open,cardSignature:(s:string)=>'hash:'+s}));
import {liveCardPreflight} from '../../scripts/card-live-preflight.js';
const args=['--user-id','11111111-1111-4111-8111-111111111111','--merchant-id','22222222-2222-4222-8222-222222222222'];
beforeEach(()=>{
 vi.restoreAllMocks();vi.clearAllMocks();vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});
 Object.assign(m.settings,{PAYSTACK_MODE:'live',PAYSTACK_SECRET_KEY:'sk_live_privatefixture',CARD_TOKEN_ENCRYPTION_KEY:'private-encryption-key',TENCENT_CAPTURE_MODE:'h5',TENCENT_H5_IMAGE_ONLY_APPROVED:true});
 m.profile={data:{id:'user',palm_enrolled:true},error:null};m.card={data:{id:'card',exp_month:12,exp_year:2099,authorization_ciphertext:'private-ciphertext',signature_hash:'hash:sig'},error:null};
 m.merchant={data:{paystack_subaccount:'ACCT_fixture'},error:null};m.binding={count:1,error:null};m.verified={count:1,error:null};m.outstanding={count:0,error:null};
 m.open.mockReset().mockReturnValue({email:'private-email@example.test',authorization:{reusable:true,authorization_code:'private-authorization',signature:'sig'}});
 m.provider.mockReset().mockResolvedValue({subaccount_code:'ACCT_fixture',active:true});
});
describe('read-only live readiness',()=>{
 it.each([[],['--user-id','bad'],[...args,'--unknown','x'],[...args,'--user-id',args[1]!]].map(input=>({input})))('rejects invalid arguments before any requests: %j',async ({input})=>{
  expect(await liveCardPreflight(input)).toBe(1);expect(m.reads).not.toHaveBeenCalled();expect(m.provider).not.toHaveBeenCalled();
 });
 it.each(['mode','secret','encryption'])('makes no requests when live %s configuration is missing',async missing=>{
  if(missing==='mode')m.settings.PAYSTACK_MODE='test';else if(missing==='secret')m.settings.PAYSTACK_SECRET_KEY=undefined;else m.settings.CARD_TOKEN_ENCRYPTION_KEY=undefined;
  expect(await liveCardPreflight(args)).toBe(1);expect(m.reads).not.toHaveBeenCalled();expect(m.provider).not.toHaveBeenCalled();
 });
 it('uses only a provider GET and never prints keys, encrypted credentials, email or authorizations',async()=>{
  expect(await liveCardPreflight(args)).toBe(0);expect(m.provider.mock.calls).toEqual([['/subaccount/ACCT_fixture']]);
  const output=JSON.stringify(vi.mocked(console.log).mock.calls);
  for(const secret of ['sk_live_privatefixture','private-encryption-key','private-ciphertext','private-email@example.test','private-authorization'])expect(output).not.toContain(secret);
 });
 it('allows the original camera for the controlled live test without an H5 approval flag',async()=>{
  m.settings.TENCENT_CAPTURE_MODE='legacy';m.settings.TENCENT_H5_IMAGE_ONLY_APPROVED=false;
  expect(await liveCardPreflight(args)).toBe(0);
 });
 it('retains the separate contract check for the optional H5 implementation',async()=>{
  m.settings.TENCENT_H5_IMAGE_ONLY_APPROVED=false;expect(await liveCardPreflight(args)).toBe(1);
 });
 it('does not accept a default test card as a live authorization',async()=>{
  m.verified={count:0,error:null};expect(await liveCardPreflight(args)).toBe(1);expect(m.open).not.toHaveBeenCalled();
 });
 it('reports the wrong encryption key without logging the decryption error',async()=>{
  m.open.mockImplementation(()=>{throw Error('private decryption diagnostic');});expect(await liveCardPreflight(args)).toBe(1);
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private decryption diagnostic');
 });
 it('blocks missing merchant settlement and unresolved sandbox attempts',async()=>{
  m.merchant={data:{paystack_subaccount:null},error:null};m.outstanding={count:1,error:null};expect(await liveCardPreflight(args)).toBe(1);expect(m.provider).not.toHaveBeenCalled();
 });
 it('blocks a merchant subaccount that does not belong to this credential',async()=>{
  m.provider.mockRejectedValue(Error('private provider response'));expect(await liveCardPreflight(args)).toBe(1);
 });
});
