import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),single:vi.fn(),paystack:vi.fn(),open:vi.fn(),ready:vi.fn(),domain:"test"}));
vi.mock('../db/client.js',()=>({db:{rpc:m.rpc,from:()=>({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:m.single})}}));
vi.mock('./paystack.js',()=>({paystack:m.paystack,openAuthorization:m.open,cardSignature:(s:string)=>'hash:'+s,paystackDomain:()=>m.domain,requirePaystack:m.ready,cardLinkEnabled:()=>true}));
vi.mock('../logger.js',()=>({logger:{warn:vi.fn(),error:vi.fn()}}));
import {chargeCardPayment,verifyCardPayment,type CardPaymentAttempt} from './cardPaymentService.js';
const a:CardPaymentAttempt={transaction_id:'txn',user_id:'payer',card_id:'card',reference:'pbp_pay_ref',domain:'test',amount_minor:10000,currency:'NGN',signature_hash:'hash:sig',authorization_ciphertext:'cipher',status:'submitting'};
const credentials={email:'original@example.test',authorization:{authorization_code:'AUTH_fixture',reusable:true,signature:'sig'}};
const success={id:100,reference:a.reference,domain:'test',amount:10000,currency:'NGN',customer:{email:credentials.email},channel:'card',authorization:{signature:'sig'},metadata:{purpose:'palm_card_payment',transaction_id:'txn',user_id:'payer'},status:'success'};
beforeEach(()=>{vi.clearAllMocks();m.ready.mockReset();m.domain="test";m.open.mockReturnValue(credentials);m.rpc.mockImplementation(async name=>({data:name==='begin_card_payment'?[a]:null,error:null}));m.paystack.mockResolvedValue(success);});
describe('token charge integrity',()=>{
 it('verifies a live charge against the live card and merchant subaccount before recording success',async()=>{
  m.domain='live';const live={...a,domain:'live',subaccount:'ACCT_livefixture'};
  m.rpc.mockImplementation(async name=>({data:name==='begin_card_payment'?[live]:null,error:null}));
  m.paystack.mockResolvedValue({...success,domain:'live',subaccount:{subaccount_code:'ACCT_livefixture'}});
  await chargeCardPayment('txn','terminal');
  expect(m.rpc).toHaveBeenCalledWith('begin_card_payment',expect.objectContaining({p_domain:'live'}));
  expect(m.paystack).toHaveBeenCalledWith('/transaction/charge_authorization',expect.objectContaining({subaccount:'ACCT_livefixture',amount:'10000',reference:a.reference}));
  expect(m.paystack).toHaveBeenCalledWith('/transaction/verify/'+a.reference);
  expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',{p_reference:a.reference,p_status:'success',p_provider_id:'100'});
 });
 it('fails before a claim or provider request when payment setup is missing',async()=>{
  m.ready.mockImplementation(()=>{throw Object.assign(new Error('missing payment configuration'),{code:'card_payment_not_configured',status:503});});
  await expect(chargeCardPayment('txn','terminal')).rejects.toMatchObject({code:'card_payment_not_configured'});
  expect(m.ready).toHaveBeenCalledWith('payment');expect(m.rpc).not.toHaveBeenCalled();expect(m.paystack).not.toHaveBeenCalled();
 });
 it('persists the claim before HTTP and uses original token email and server amount',async()=>{await chargeCardPayment('txn','terminal');expect(m.rpc.mock.invocationCallOrder[0]!).toBeLessThan(m.paystack.mock.invocationCallOrder[0]!);expect(m.paystack).toHaveBeenCalledWith('/transaction/charge_authorization',expect.objectContaining({authorization_code:'AUTH_fixture',email:credentials.email,amount:'10000',reference:a.reference}));expect(m.paystack).toHaveBeenCalledWith('/transaction/verify/'+a.reference);expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',{p_reference:a.reference,p_status:'success',p_provider_id:'100'});});
 it('replays GET only after an existing claim',async()=>{m.rpc.mockResolvedValue({data:[],error:null});m.single.mockResolvedValue({data:a});await chargeCardPayment('txn','terminal');expect(m.paystack).toHaveBeenCalledTimes(1);expect(m.paystack.mock.calls[0]![0]).toContain('/verify/');});
 it('recovers a lost POST response by verification',async()=>{m.paystack.mockRejectedValueOnce(Error('timeout')).mockResolvedValueOnce(success);await chargeCardPayment('txn','terminal');expect(m.paystack.mock.calls.filter(x=>x[0].endsWith('charge_authorization'))).toHaveLength(1);expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',expect.objectContaining({p_status:'success'}));});
 it('retains uncertainty for reconciliation',async()=>{m.paystack.mockRejectedValue(Error('unreachable'));await expect(chargeCardPayment('txn','terminal')).rejects.toMatchObject({code:'card_payment_pending'});expect(m.rpc).not.toHaveBeenCalledWith('finish_card_payment',expect.objectContaining({p_status:'failed'}));});
 it.each([{domain:'live'},{amount:1},{currency:'USD'},{reference:'other'},{customer:{email:'other@example.test'}},{authorization:{signature:'other'}},{metadata:{}},{id:'unsafe'}])('rejects mismatched response %j',async patch=>{m.paystack.mockResolvedValue({...success,...patch});await verifyCardPayment(a);expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',expect.objectContaining({p_status:'manual_review'}));});
 it('sends neither PIN nor OTP',async()=>{await chargeCardPayment('txn','terminal');const body=m.paystack.mock.calls.find(x=>x[0].endsWith('charge_authorization'))![1];expect(body).not.toHaveProperty('pin');expect(body).not.toHaveProperty('otp');});
 it('does not settle ongoing issuer authentication',async()=>{m.paystack.mockResolvedValue({...success,status:'ongoing'});await verifyCardPayment(a);expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',expect.objectContaining({p_status:'pending'}));});
 it('binds a provider decline before marking failure',async()=>{m.paystack.mockResolvedValue({...success,status:'failed',authorization:null});await verifyCardPayment(a);expect(m.rpc).toHaveBeenCalledWith('finish_card_payment',expect.objectContaining({p_status:'failed'}));});
 it('rejects an invalid token fingerprint',async()=>{m.open.mockReturnValue({...credentials,authorization:{...credentials.authorization,signature:'other'}});await expect(chargeCardPayment('txn','terminal')).rejects.toMatchObject({code:'card_payment_pending'});expect(m.paystack).not.toHaveBeenCalled();});
 it('does not contact another payment environment',async()=>{await verifyCardPayment({...a,domain:'live'});expect(m.paystack).not.toHaveBeenCalled();});
 it('routes to the configured merchant',async()=>{m.rpc.mockImplementation(async name=>({data:name==='begin_card_payment'?[{...a,subaccount:'ACCT_fixture'}]:null,error:null}));m.paystack.mockResolvedValue({...success,subaccount:{subaccount_code:'ACCT_fixture'}});await chargeCardPayment('txn','terminal');expect(m.paystack).toHaveBeenCalledWith('/transaction/charge_authorization',expect.objectContaining({subaccount:'ACCT_fixture'}));});
});
