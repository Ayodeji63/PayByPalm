import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({profile:vi.fn(),remove:vi.fn(),binding:vi.fn(),profileWrite:vi.fn(),expire:vi.fn()}));
vi.mock('../db/client.js',()=>({db:{from:(table:string)=>{
 if(table==='palm_bindings')return {delete:()=>({eq:m.binding})};
 if(table==='profiles')return {update:()=>({eq:m.profileWrite})};
 return {update:()=>({eq:()=>({in:m.expire})})};
}}}));
vi.mock('../db/queries.js',()=>({getProfile:m.profile,maskName:(v:string)=>v}));
vi.mock('../palm/index.js',()=>({palm:{delete:m.remove}}));
import {revokePalm} from './enrolService.js';
beforeEach(()=>{vi.resetAllMocks();m.profile.mockResolvedValue({id:'user',palm_enrolled:true});m.remove.mockResolvedValue({meta:{requestId:'provider-delete'}});for(const fn of [m.binding,m.profileWrite,m.expire])fn.mockResolvedValue({error:null});});
describe('palm removal across provider and database',()=>{
 it('clears binding rows, enrollment and old claimed sessions only after verified provider deletion',async()=>{
  expect(await revokePalm('user')).toEqual({revoked:true});
  expect(m.remove).toHaveBeenCalledWith('user');expect(m.binding).toHaveBeenCalledWith('user_id','user');expect(m.profileWrite).toHaveBeenCalledWith('id','user');
  expect(m.remove.mock.invocationCallOrder[0]!).toBeLessThan(m.expire.mock.invocationCallOrder[0]!);
  expect(m.expire.mock.invocationCallOrder[0]!).toBeLessThan(m.binding.mock.invocationCallOrder[0]!);
  expect(m.binding.mock.invocationCallOrder[0]!).toBeLessThan(m.profileWrite.mock.invocationCallOrder[0]!);
 });
 it('does not report success or change local state if provider deletion or verification fails',async()=>{
  m.remove.mockRejectedValue(new Error('Provider unavailable'));
  await expect(revokePalm('user')).rejects.toThrow('Provider unavailable');
  expect(m.expire).not.toHaveBeenCalled();expect(m.binding).not.toHaveBeenCalled();expect(m.profileWrite).not.toHaveBeenCalled();
 });
 it('retries provider cleanup even when the enrollment flag is already false',async()=>{
  m.profile.mockResolvedValue({id:'user',palm_enrolled:false});
  expect(await revokePalm('user')).toEqual({revoked:true});expect(m.remove).toHaveBeenCalledTimes(1);expect(m.binding).toHaveBeenCalledTimes(1);
 });
 it.each(['expire','binding','profileWrite'] as const)('keeps %s failures retryable and never returns a success',async name=>{
  m[name].mockResolvedValueOnce({error:{message:'Database unavailable'}});
  await expect(revokePalm('user')).rejects.toMatchObject({code:'palm_unlink_incomplete'});
  expect(await revokePalm('user')).toEqual({revoked:true});expect(m.remove).toHaveBeenCalledTimes(2);
 });
});
