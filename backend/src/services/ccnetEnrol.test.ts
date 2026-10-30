import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),rpc:vi.fn(),register:vi.fn(),remove:vi.fn(),profile:vi.fn(),list:vi.fn(),updates:vi.fn(),active:vi.fn()}));
vi.mock('./ccnetBindings.js',()=>({activeProviderBinding:m.active}));
vi.mock('../config.js',()=>({config:{PALM_PROVIDER:'ccnet',MAX_IMAGE_BYTES:2097152}}));
vi.mock('../db/client.js',()=>({db:{from:()=>({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),not:vi.fn().mockReturnThis(),is:m.list,update:m.updates.mockReturnThis(),maybeSingle:m.load}),rpc:m.rpc}}));
vi.mock('../palm/index.js',()=>({palm:{registerSamples:m.register,delete:m.remove}}));
vi.mock('../db/queries.js',()=>({getProfile:m.profile,maskName:(value:string)=>value}));
import {registerPalmForSession,revokePalm,claimSession,getSessionView} from './enrolService.js';
const terminal={id:'terminal',merchantId:'merchant',merchantName:'Merchant',label:'Counter'};
const session={id:'session-opaque',terminal_id:'terminal',user_id:'payer',provider:'ccnet',status:'claimed',expires_at:'2099-01-01'};
const images=['frame one','frame two','frame three'].map(value=>Buffer.from(value).toString('base64')) as [string,string,string];
beforeEach(()=>{
 vi.clearAllMocks();m.active.mockResolvedValue(false);m.load.mockResolvedValue({data:session});m.profile.mockResolvedValue({id:'payer',full_name:'Payer',palm_enrolled:true}); // Tencent flag intentionally true.
 m.rpc.mockImplementation(async(name:string)=>({data:name==='reserve_ccnet_enrolment'?'reserved':null,error:null}));m.register.mockResolvedValue({palmId:'session-opaque'});m.remove.mockResolvedValue({});m.list.mockResolvedValue({data:[]});
});
it('allows an existing Tencent account to enroll CCNet under its own session subject',async()=>{
 expect(await registerPalmForSession('session-opaque',terminal,{imagesB64:images,palmSide:'right'})).toMatchObject({status:'completed'});
 expect(m.register).toHaveBeenCalledWith('payer',expect.objectContaining({subjectId:'session-opaque',palmSide:'right'}));
 expect(m.rpc).toHaveBeenCalledWith('complete_ccnet_enrolment',expect.objectContaining({p_session:'session-opaque',p_user:'payer',p_fingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)}));
});
it('does not call upstream again for a completed, fingerprint-validated retry',async()=>{
 m.load.mockResolvedValue({data:{...session,status:'completed'}});m.rpc.mockResolvedValue({data:'completed',error:null});
 expect(await registerPalmForSession('session-opaque',terminal,{imagesB64:images,palmSide:'right'})).toMatchObject({alreadyCompleted:true});expect(m.register).not.toHaveBeenCalled();
});
it.each(['PC003','PC004','PC002'])('rejects changed captures, an active lease or expiry before upstream: %s',async code=>{
 m.rpc.mockResolvedValue({error:{code}});await expect(registerPalmForSession('session-opaque',terminal,{imagesB64:images,palmSide:'right'})).rejects.toMatchObject({status:409});expect(m.register).not.toHaveBeenCalled();
});
it('rejects duplicate captured frames before reserving',async()=>{
 await expect(registerPalmForSession('session-opaque',terminal,{imagesB64:[images[0],images[0],images[2]],palmSide:'right'})).rejects.toMatchObject({code:'distinct_frames_required'});expect(m.rpc).not.toHaveBeenCalled();
});
it('rejects oversized images and another terminal',async()=>{
 await expect(registerPalmForSession('session-opaque',terminal,{imagesB64:[Buffer.alloc(512*1024+1).toString('base64'),images[1],images[2]],palmSide:'right'})).rejects.toMatchObject({code:'image_too_large'});
 await expect(registerPalmForSession('session-opaque',{...terminal,id:'other'}, {imagesB64:images,palmSide:'right'})).rejects.toMatchObject({status:404});expect(m.register).not.toHaveBeenCalled();
});
it('leaves the same subject and fingerprint recoverable after partial completion failure',async()=>{
 m.rpc.mockImplementation(async(name:string)=>({data:'reserved',error:name==='complete_ccnet_enrolment'?{code:'unavailable'}:null}));
 await expect(registerPalmForSession('session-opaque',terminal,{imagesB64:images,palmSide:'right'})).rejects.toMatchObject({code:'enrolment_completion_pending'});
 expect(m.remove).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalledWith('release_ccnet_enrolment',expect.anything());
});
it('revokes CCNet before attempting upstream cleanup and never deletes Tencent history',async()=>{
 await expect(revokePalm('payer')).resolves.toEqual({revoked:true});expect(m.rpc).toHaveBeenCalledWith('revoke_ccnet_palms',{p_user:'payer'});expect(m.remove).not.toHaveBeenCalled();expect(m.updates).not.toHaveBeenCalled();
});
it('does not claim upstream deletion while an enrollment write could be running',async()=>{
 m.list.mockResolvedValue({data:[{id:'session-opaque',palm_side:'right',registration_until:'2099-01-01'}]});
 await expect(revokePalm('payer')).rejects.toMatchObject({code:'palm_unlink_incomplete'});expect(m.remove).not.toHaveBeenCalled();
});

vi.mock('../logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));

it('lets a Tencent-enrolled account claim a fresh CCNet session',async()=>{
 m.load.mockResolvedValueOnce({data:{...session,status:'pending',user_id:null}}).mockResolvedValueOnce({data:{id:session.id}});
 expect(await claimSession(session.id,'payer')).toMatchObject({status:'claimed'});expect(m.active).toHaveBeenCalledWith('payer');
});
it('blocks another CCNet enrollment when the active provider already has a binding',async()=>{
 m.load.mockResolvedValue({data:{...session,status:'pending',user_id:null}});m.active.mockResolvedValue(true);
 await expect(claimSession(session.id,'payer')).rejects.toMatchObject({code:'already_enrolled'});
});
it('does not reveal another terminal enrollment session',async()=>{
 await expect(getSessionView(session.id,undefined,'other-terminal')).rejects.toMatchObject({status:404});
});
