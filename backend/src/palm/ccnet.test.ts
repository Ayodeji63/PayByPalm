import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../config.js', () => ({ config: { CCNET_BASE_URL:'https://reader.example.test', CCNET_API_KEY:'inert-secret', CCNET_MATCH_TIMEOUT_MS:20, CCNET_ENROLL_TIMEOUT_MS:50, MAX_IMAGE_BYTES:2097152 } }));
import { createCcnetProvider, ccnetScore } from './ccnet.js';
const bindings = [{id:'binding-1',userId:'payer',subjectId:'opaque-session-1',palmSide:'right' as const}, {id:'binding-2',userId:'other',subjectId:'opaque-session-2',palmSide:'left' as const}];
const candidate = (cosine:number, index=0) => ({ user_id:bindings[index]!.subjectId,palm_side:bindings[index]!.palmSide,cosine_similarity:cosine,angular_distance:0.1 });
const answer = (scores:number[]) => ({candidates:scores.map((s,i)=>candidate(s,i)), matched:!!scores.length && scores[0]!>=0.5,threshold:0.5,identified_user_id:scores.length && scores[0]!>=0.5 ? bindings[0]!.subjectId:null,identified_palm_side:scores.length && scores[0]!>=0.5 ? 'right':null});
const response = (data:unknown,status=200) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json','server-timing':'extract;dur=5, embed;dur=90, search;dur=0.4'}});
const image=Buffer.from('test-image').toString('base64');
afterEach(()=>vi.unstubAllGlobals());
describe('CCNet adapter',()=>{
 it.each([[0.84999,84],[0.85,85],[0.85999,85],[0.86,86],[-0.3,0],[1,100]])('floors similarity %s to %s', (input,output)=>expect(ccnetScore(input!)).toBe(output));
 it.each([NaN,Infinity,1.01,-1.1])('rejects invalid score %s',value=>expect(()=>ccnetScore(value)).toThrow());
 it('authenticates server-side and searches the eligible gallery in exactly one request',async()=>{
  const fetch=vi.fn().mockResolvedValue(response(answer([0.85,0.4])));vi.stubGlobal('fetch',fetch);
  const result=await createCcnetProvider().identify!(image,bindings);
  expect(fetch).toHaveBeenCalledOnce();const [url,options]=fetch.mock.calls[0]!;
  expect(url).toBe('https://reader.example.test/v1/identify');expect(options.headers.Authorization).toBe('Bearer inert-secret');expect(options.redirect).toBe('error');
  expect(options.body.get('top_k')).toBe('2');expect(JSON.parse(options.body.get('eligible_palms'))).toEqual(bindings.map(b=>({user_id:b.subjectId,palm_side:b.palmSide})));
  expect(result.candidates[0]).toMatchObject({id:'binding-1',userId:'payer',score:85});expect(result.meta).toMatchObject({providerIsMatch:true,timings:{extract_ms:5,embed_ms:90,search_ms:0.4}});
 });
 it.each([401,403,429,500,503])('returns a retryable operational error for HTTP %s',async status=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({},status)));await expect(createCcnetProvider().identify!(image,bindings)).rejects.toMatchObject({status:503});
 });
 it.each([{}, {...answer([0.9]),matched:false}, {...answer([0.9]),identified_user_id:'outsider'}, {...answer([0.9]),candidates:[{...candidate(0.9),user_id:'outsider'}]},answer([0.85,0.9]),{...answer([0.9]),candidates:[candidate(0.9),candidate(0.9)]}])('rejects malformed, contradictory or ineligible responses',async payload=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(payload)));await expect(createCcnetProvider().identify!(image,bindings)).rejects.toMatchObject({code:'palm_response_invalid'});
 });
 it('times out rather than leaving matching queued indefinitely',async()=>{
  vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
  await expect(createCcnetProvider().identify!(image,bindings)).rejects.toMatchObject({code:'palm_reader_timeout',status:503});
 });
 it('returns a clear offline error without propagating transport secrets',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('inert-secret')));await expect(createCcnetProvider().identify!(image,bindings)).rejects.toMatchObject({code:'palm_reader_offline',message:expect.not.stringContaining('inert-secret')});
 });
 it('submits three samples with their isolated subject and validates the response',async()=>{
  const fetch=vi.fn().mockResolvedValue(response({user_id:'session',palm_side:'left',sample_count:3,status:'created'}));vi.stubGlobal('fetch',fetch);
  await expect(createCcnetProvider().registerSamples!('payer',{subjectId:'session',palmSide:'left',imagesB64:[image,image,image]})).resolves.toMatchObject({palmId:'session'});
  expect(fetch.mock.calls[0]![1].body.getAll('images')).toHaveLength(3);
 });
 it('verifies only the referenced binding',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({...candidate(0.9),matched:true,threshold:0.5})));
  await expect(createCcnetProvider().compare('payer',image,bindings[0])).resolves.toMatchObject({isMatch:true,score:90});
 });
 it('deletes both subject palms and treats already absent templates as idempotent',async()=>{
  const fetch=vi.fn().mockResolvedValue(response({},404));vi.stubGlobal('fetch',fetch);
  await createCcnetProvider().delete('payer',bindings[0]);expect(fetch.mock.calls.map(call=>call[0])).toEqual(['https://reader.example.test/v1/users/opaque-session-1/palms/left','https://reader.example.test/v1/users/opaque-session-1/palms/right']);
 });
});
