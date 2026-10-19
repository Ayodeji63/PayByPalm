import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../config.js',()=>({config:{TENCENT_BASE_URL:'https://palm.example.test',TENCENT_PALM_API_KEY:'test-credential'}}));
vi.mock('../logger.js',()=>({logger:{warn:vi.fn()}}));
import {createTencentProvider} from './tencent.js';
import {logger} from '../logger.js';
const response=(code:number,data:unknown={})=>({ok:true,json:async()=>({code,data,message:'test',requestId:'provider-reference'})});
afterEach(()=>vi.unstubAllGlobals());
describe('verified Tencent deletion',()=>{
 it.each([response(2080009),response(1001012),response(0,{LeftPalm:{PalmState:0,RegisterTime:0},RightPalm:{PalmState:0,RegisterTime:0}})])('deletes both hands and confirms absence before success',async check=>{
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
 it.each([1001013,1001023,1001032])('does not mistake error %s for verified absence during deletion',async code=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce(response(code)));
  await expect(createTencentProvider().delete('user')).rejects.toMatchObject({providerCode:code});
 });
 it.each([400,401,403,500])('does not verify deletion from an HTTP %s error even if the body claims data absence',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(response(0)).mockResolvedValueOnce({...response(1001012),ok:false,status}));
  await expect(createTencentProvider().delete('user')).rejects.toMatchObject({providerCode:1001012,providerHttpStatus:status});
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
 it.each([2080010,1001013])('treats documented no-match code %s as no match and does not invent a SessionId',async code=>{
  const fetch=vi.fn().mockResolvedValue(response(code));vi.stubGlobal('fetch',fetch);
  await expect(createTencentProvider().search('test-image')).resolves.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]![0]).toBe('https://palm.example.test/palm/openai/search_rgb_palm');
 });
 it.each([1001012,1001023,1001032,2080023,2060200,999])('preserves real provider failure %s rather than calling it a no-match',async code=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(code)));
  await expect(createTencentProvider().search('test-image')).rejects.toMatchObject({providerCode:code});
 });
});

describe('HTTP status and Tencent business errors',()=>{
 it('preserves a business code and request ID returned with HTTP 400',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({...response(1001005),ok:false,status:400}));
  await expect(createTencentProvider().compare('user','image')).rejects.toMatchObject({providerCode:1001005,requestId:'provider-reference',providerHttpStatus:400});
 });
 it('does not interpret a non-2xx response as success even if its envelope says code zero',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({...response(0,{IsMatch:true,Score:99}),ok:false,status:500}));
  await expect(createTencentProvider().compare('user','image')).rejects.toMatchObject({providerCode:undefined,providerHttpStatus:500});
 });
 it('keeps HTTP status distinct from a business code and does not log a raw gateway response',async()=>{
  vi.mocked(logger.warn).mockClear();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>{throw new Error('private-gateway-secret');}}));
  await expect(createTencentProvider().compare('user','image')).rejects.toMatchObject({providerCode:undefined,providerHttpStatus:401});
  expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('private-gateway-secret');
 });
 it.each([null,[],{code:'0',data:{IsMatch:true,Score:99}},{code:0}])('rejects malformed envelopes rather than accepting a match: %j',async raw=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>raw}));
  await expect(createTencentProvider().compare('user','image')).rejects.toThrow('malformed response');
 });
});

describe('PalmX H5 server-mediated acquisition',()=>{
 const image={Data:'encrypted-capture',DataDigest:'a'.repeat(32),ImageType:'RGB' as const};
 const capture={RgbImage:image,LivenessRgbImage:image,UserToken:'sut_transient',SdkVersion:'1.3.0',SdkTimestamps:'{}',VideoPath:'NO_VIDEO_UPLOAD' as const};
 it('issues a short-lived user token with the server-only credential',async()=>{
  const ExpiresAt=Math.floor(Date.now()/1000)+180;
  const fetch=vi.fn().mockResolvedValue(response(0,{Token:'sut_transient',ExpiresAt}));vi.stubGlobal('fetch',fetch);
  expect(await createTencentProvider().createSdkToken!('user')).toMatchObject({token:'sut_transient',expiresAt:ExpiresAt});
  expect(fetch.mock.calls[0]![0]).toBe('https://palm.example.test/palm/openai/x/oauth/sdk/usertoken/create');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({UserId:'user',TtlSeconds:180});
 });
 it.each(['seconds','iso'])('accepts the gateway string expiry format (%s)',async format=>{
  const seconds=Math.floor(Date.now()/1000)+180;
  const ExpiresAt=format==='seconds'?String(seconds):new Date(seconds*1000).toISOString();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(0,{Token:'sut_transient',ExpiresAt})));
  expect(await createTencentProvider().createSdkToken!('capture-user')).toMatchObject({expiresAt:seconds});
 });
 it.each(['bad-expiry',0,Date.now()+999999999])('rejects invalid or unbounded SDK token expiry %s',async ExpiresAt=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(0,{Token:'sut_transient',ExpiresAt})));
  await expect(createTencentProvider().createSdkToken!('capture-user')).rejects.toThrow('invalid SDK credential');
 });
 it('redacts a provider diagnostic that echoes a token, key or encrypted image',async()=>{
  vi.mocked(logger.warn).mockClear();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({...response(1001005),json:async()=>({code:1001005,message:'bad sut_transient test-credential encrypted-capture',data:{}})}));
  await expect(createTencentProvider().compareCapture!('user',capture)).rejects.toThrow('[redacted]');
  const logged=JSON.stringify(vi.mocked(logger.warn).mock.calls);
  expect(logged).not.toContain('sut_transient');expect(logged).not.toContain('test-credential');expect(logged).not.toContain('encrypted-capture');
 });
 it('sends the encrypted capture, explicit target and mandatory application quality check',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(0,{IsMatch:true,Score:93}));vi.stubGlobal('fetch',fetch);
  expect(await createTencentProvider().compareCapture!('candidate',capture)).toMatchObject({isMatch:true,score:93});
  const body=JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body).toEqual({CompareUserId:'candidate',RgbImage:image,LivenessRgbImage:image,UserToken:'sut_transient',CheckAppQuality:true});
  expect(body.ActionLiveness).toBeUndefined(); // Never invent successful video liveness.
  expect(fetch.mock.calls[0]![1].headers.Authorization).toBe('Bearer test-credential');
 });
 it('registers without force-rebinding and resolves the authoritative PalmId',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response(0,{UserId:'user'})).mockResolvedValueOnce(response(0,{RightPalm:{PalmState:1,PalmId:'palm-id'}}));vi.stubGlobal('fetch',fetch);
  expect(await createTencentProvider().registerCapture!('user',capture)).toMatchObject({palmId:'palm-id'});
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({UserId:'user',IsForce:false,CheckAppQuality:true});
  expect(fetch.mock.calls[1]![0]).toBe('https://palm.example.test/palm/openai/get_palm');
 });
 it('does not bind a different returned user',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(0,{UserId:'other',PalmId:'palm-id'})));
  await expect(createTencentProvider().registerCapture!('user',capture)).rejects.toThrow('different user');
 });
 it.each([{IsMatch:'true',Score:99},{IsMatch:true,Score:101},{IsMatch:true,Score:null},{}])('rejects malformed comparison success %j',async data=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(0,data)));
  await expect(createTencentProvider().compareCapture!('user',capture)).rejects.toThrow('invalid comparison');
 });
});
