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

describe('pasted Open API guide compatibility',()=>{
 it('sends server-side Bearer authentication, JSON and a fresh 32-hex trace ID for each call',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(0,{IsMatch:true,Score:92}));vi.stubGlobal('fetch',fetch);
  const provider=createTencentProvider();await provider.compare('user','test-image');await provider.compare('user','test-image');
  const headers=fetch.mock.calls.map(([,options])=>options.headers);
  expect(headers[0]).toMatchObject({Authorization:'Bearer test-credential','Content-Type':'application/json; charset=utf-8'});
  expect(headers[0]['X-TraceId']).toMatch(/^[a-f0-9]{32}$/);expect(headers[1]['X-TraceId']).not.toBe(headers[0]['X-TraceId']);
  expect(fetch.mock.calls[0]![0]).toBe('https://palm.example.test/palm/openai/compare_rgb_palm');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({CompareUserId:'user',RgbImage:{Data:'test-image',ImageType:1}});
 });
 it('treats documented no-match code 2080010 as no match and does not invent a SessionId',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(2080010));vi.stubGlobal('fetch',fetch);
  await expect(createTencentProvider().search('test-image')).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe('https://palm.example.test/palm/openai/search_rgb_palm');
 });
 it.each([2080023,2060200,999])('preserves real provider failure %s rather than calling it a no-match',async code=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(code)));
  await expect(createTencentProvider().search('test-image')).rejects.toMatchObject({providerCode:code});
 });
});
