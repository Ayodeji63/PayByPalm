import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../config.js',()=>({config:{TENCENT_BASE_URL:'https://palm.example.test',TENCENT_PALM_API_KEY:'test-credential'}}));
vi.mock('../logger.js',()=>({logger:{warn:vi.fn()}}));
import {createTencentProvider} from './tencent.js';
const response=(code:number,data:unknown={})=>({ok:true,json:async()=>({code,data,message:'test',requestId:'provider-reference'})});
afterEach(()=>vi.unstubAllGlobals());
describe('verified Tencent deletion',()=>{
 it.each([response(2080009),response(0,{LeftPalm:{PalmState:0,RegisterTime:0},RightPalm:{PalmState:0,RegisterTime:0}})])('deletes both hands and confirms absence before success',async check=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce(check);vi.stubGlobal('fetch',fetch);
  await expect(createTencentProvider().delete('user')).resolves.toMatchObject({meta:{requestId:'provider-reference'}});
  expect(fetch.mock.calls[0]![0]).toBe('https://palm.example.test/palm/openai/delete_palm');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({UserId:'user',PalmDirectionList:[1,2]});
  expect(fetch.mock.calls[1]![0]).toBe('https://palm.example.test/palm/openai/get_palm');
 });
 it.each([1,2])('does not confirm deletion while palm state %s remains',async PalmState=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce(response(0,{RightPalm:{PalmState}})));
  await expect(createTencentProvider().delete('user')).rejects.toThrow('could not be verified');
 });
 it('does not swallow authentication errors in the verification request',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce(response(2060200)));
  await expect(createTencentProvider().delete('user')).rejects.toMatchObject({providerCode:2060200});
 });
 it.each([null,[],{RightPalm:false},{RightPalm:{PalmState:0,RegisterTime:123}}])('does not treat malformed or retained palm data as verified deletion: %j',async data=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce(response(0,data)));
  await expect(createTencentProvider().delete('user')).rejects.toThrow('could not be verified');
 });
});
