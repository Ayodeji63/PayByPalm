import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),complete:vi.fn(),profile:vi.fn(),register:vi.fn(),binding:vi.fn(),profileWrite:vi.fn(),rpc:vi.fn(),consume:vi.fn(),registerCapture:vi.fn()}));
vi.mock('../db/client.js',()=>({db:{from:(table:string)=>{
 if(table==='palm_bindings')return {insert:m.binding};
 if(table==='profiles')return {update:()=>({eq:m.profileWrite})};
 return {select:()=>({eq:()=>({maybeSingle:m.load})}),update:()=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:m.complete})})})})};
},rpc:m.rpc}}));
vi.mock('../db/queries.js',()=>({getProfile:m.profile,maskName:(v:string)=>v}));
vi.mock('../palm/index.js',()=>({palm:{register:m.register,registerCapture:m.registerCapture}}));
vi.mock('./palmCaptureService.js',()=>({consumePalmCapture:m.consume,issuePalmCapture:vi.fn()}));
vi.mock('../lib/image.js',()=>({normaliseImage:(data:string)=>({data})}));
import {registerPalmForSession} from './enrolService.js';
const terminal={id:'terminal',merchantId:'merchant',merchantName:'Merchant',label:'Counter'};
beforeEach(()=>{vi.resetAllMocks();m.load.mockResolvedValue({data:{id:'session',terminal_id:'terminal',user_id:'user',status:'claimed',expires_at:'2099-01-01'}});m.profile.mockResolvedValue({id:'user',full_name:'Payer',palm_enrolled:false});m.register.mockResolvedValue({palmId:'provider-id'});m.binding.mockResolvedValue({error:null});m.profileWrite.mockResolvedValue({error:null});m.complete.mockResolvedValue({data:{id:'session'},error:null});});
describe('enrolment success signal',()=>{
 it('saves SDK enrollment atomically after Tencent registration succeeds',async()=>{m.consume.mockResolvedValue({userId:'user',capture:{encrypted:true}});m.registerCapture.mockResolvedValue({palmId:'provider-id'});m.rpc.mockResolvedValue({error:null});expect(await registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).toMatchObject({status:'completed'});expect(m.rpc).toHaveBeenCalledWith('complete_h5_palm_enrolment',{p_session:'session',p_terminal:'terminal',p_user:'user',p_palm_id:'provider-id'});expect(m.binding).not.toHaveBeenCalled();});
 it('rejects an SDK grant bound to another user before registering',async()=>{m.consume.mockResolvedValue({userId:'other',capture:{}});await expect(registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).rejects.toMatchObject({code:'palm_capture_wrong_user'});expect(m.registerCapture).not.toHaveBeenCalled();});
 it('does not report linked when the atomic SDK save fails',async()=>{m.consume.mockResolvedValue({userId:'user',capture:{}});m.registerCapture.mockResolvedValue({palmId:'provider-id'});m.rpc.mockResolvedValue({error:{code:'PC002'}});await expect(registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).rejects.toMatchObject({code:'enrolment_completion_failed'});});
 it('returns completed only after binding, profile and session writes succeed',async()=>{expect(await registerPalmForSession('session',terminal,'image')).toMatchObject({status:'completed'});expect(m.complete).toHaveBeenCalledOnce();expect(m.binding.mock.invocationCallOrder[0]!).toBeLessThan(m.complete.mock.invocationCallOrder[0]!);});
 it.each([{data:null,error:{code:'db_error'}},{data:null,error:null}])('never reports success after a failed final session write %j',async result=>{m.complete.mockResolvedValue(result);await expect(registerPalmForSession('session',terminal,'image')).rejects.toMatchObject({code:'enrolment_completion_failed'});});
 it('does not complete the session if the binding failed',async()=>{m.binding.mockResolvedValue({error:{message:'not saved'}});await expect(registerPalmForSession('session',terminal,'image')).rejects.toMatchObject({code:'binding_failed'});expect(m.complete).not.toHaveBeenCalled();});
});
