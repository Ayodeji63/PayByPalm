import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({
 load:vi.fn(),profile:vi.fn(),register:vi.fn(),rpc:vi.fn(),consume:vi.fn(),registerCapture:vi.fn(),issue:vi.fn(),
 settings:{PALM_PROVIDER:'tencent',TENCENT_CAPTURE_MODE:'legacy'},
}));
vi.mock('../config.js',()=>({config:m.settings}));
vi.mock('../db/client.js',()=>({db:{from:()=>({select:()=>({eq:()=>({maybeSingle:m.load})})}),rpc:m.rpc}}));
vi.mock('../db/queries.js',()=>({getProfile:m.profile,maskName:(v:string)=>v}));
vi.mock('../palm/index.js',()=>({palm:{register:m.register,registerCapture:m.registerCapture}}));
vi.mock('./palmCaptureService.js',()=>({consumePalmCapture:m.consume,issuePalmCapture:m.issue}));
vi.mock('../lib/image.js',()=>({normaliseImage:(data:string)=>({data})}));
import {beginEnrolCapture,registerPalmForSession} from './enrolService.js';
const terminal={id:'terminal',merchantId:'merchant',merchantName:'Merchant',label:'Counter'};
beforeEach(()=>{
 vi.resetAllMocks(); m.settings.TENCENT_CAPTURE_MODE='legacy';
 m.load.mockResolvedValue({data:{id:'session',terminal_id:'terminal',user_id:'user',status:'claimed',expires_at:'2099-01-01'}});
 m.profile.mockResolvedValue({id:'user',full_name:'Payer',palm_enrolled:false});
 m.register.mockResolvedValue({palmId:'provider-id'}); m.registerCapture.mockResolvedValue({palmId:'provider-id'});
 m.consume.mockResolvedValue({userId:'user',capture:{encrypted:true}}); m.rpc.mockResolvedValue({error:null});
});
describe('camera modes and atomic enrolment',()=>{
 it('uses the original Tencent registration endpoint and saves all local state atomically',async()=>{
  expect(await registerPalmForSession('session',terminal,'image')).toMatchObject({status:'completed',alreadyCompleted:false});
  expect(m.register).toHaveBeenCalledWith('user','image'); expect(m.registerCapture).not.toHaveBeenCalled();
  expect(m.rpc).toHaveBeenCalledWith('complete_h5_palm_enrolment',{p_session:'session',p_terminal:'terminal',p_user:'user',p_palm_id:'provider-id'});
  expect(m.register.mock.invocationCallOrder[0]!).toBeLessThan(m.rpc.mock.invocationCallOrder[0]!);
 });
 it('does not issue H5 credentials in original-camera mode',async()=>{
  await expect(beginEnrolCapture('session',terminal)).rejects.toMatchObject({code:'palm_capture_mode_changed'});
  expect(m.issue).not.toHaveBeenCalled();
 });
 it('issues H5 credentials only after explicit opt-in and session checks',async()=>{
  m.settings.TENCENT_CAPTURE_MODE='h5';m.issue.mockResolvedValue({captureMode:'h5'});
  expect(await beginEnrolCapture('session',terminal)).toEqual({captureMode:'h5'});
  expect(m.issue).toHaveBeenCalledWith('terminal','session','enrol','user','2099-01-01');
 });
 it('saves SDK enrolment atomically after Tencent registration succeeds',async()=>{
  m.settings.TENCENT_CAPTURE_MODE='h5';
  expect(await registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).toMatchObject({status:'completed'});
  expect(m.registerCapture).toHaveBeenCalledWith('user',{encrypted:true}); expect(m.register).not.toHaveBeenCalled();
  expect(m.rpc).toHaveBeenCalledWith('complete_h5_palm_enrolment',{p_session:'session',p_terminal:'terminal',p_user:'user',p_palm_id:'provider-id'});
 });
 it('rejects a stale SDK submission after switching back to the original camera',async()=>{
  await expect(registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).rejects.toMatchObject({code:'palm_capture_mode_changed'});
  expect(m.consume).not.toHaveBeenCalled();expect(m.registerCapture).not.toHaveBeenCalled();
 });
 it('rejects an SDK grant bound to another user before registering',async()=>{
  m.settings.TENCENT_CAPTURE_MODE='h5';m.consume.mockResolvedValue({userId:'other',capture:{}});
  await expect(registerPalmForSession('session',terminal,{captureId:'capture',payload:'opaque'})).rejects.toMatchObject({code:'palm_capture_wrong_user'});
  expect(m.registerCapture).not.toHaveBeenCalled();
 });
 it('cannot bypass H5 mode by submitting a raw image',async()=>{
  m.settings.TENCENT_CAPTURE_MODE='h5';
  await expect(registerPalmForSession('session',terminal,'image')).rejects.toMatchObject({code:'palm_sdk_required'});
  expect(m.register).not.toHaveBeenCalled();
 });
 it.each(['legacy','h5'])('does not report linked when the atomic save fails (%s)',async mode=>{
  m.settings.TENCENT_CAPTURE_MODE=mode;m.rpc.mockResolvedValue({error:{code:'PC002'}});
  await expect(registerPalmForSession('session',terminal,mode==='h5'?{captureId:'capture',payload:'opaque'}:'image')).rejects.toMatchObject({code:'enrolment_completion_failed'});
 });
 it('does not save local state after provider registration fails',async()=>{
  m.register.mockRejectedValue(new Error('provider unavailable'));
  await expect(registerPalmForSession('session',terminal,'image')).rejects.toThrow('provider unavailable');expect(m.rpc).not.toHaveBeenCalled();
 });
 it('rejects another terminal before calling the provider',async()=>{
  await expect(registerPalmForSession('session',{...terminal,id:'other'},'image')).rejects.toMatchObject({status:404});
  expect(m.register).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
});
