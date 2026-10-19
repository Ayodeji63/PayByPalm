import {describe,expect,it,vi} from 'vitest';
import {loadBanks} from '../server/banks';

const bank=(code:string,name='Bank '+code)=>({code,name,active:true,currency:'NGN'});
describe('Paystack bank list pagination',()=>{
 it('uses next cursors even when a page has fewer than 100 banks',async()=>{
  const next='YmFuazo4MjY=+/&',call=vi.fn()
   .mockResolvedValueOnce({data:[bank('058','Zulu Bank')],meta:{next}})
   .mockResolvedValueOnce({data:[bank('044','Alpha Bank')],meta:{next:null}});
  expect(await loadBanks(call)).toEqual([{code:'044',name:'Alpha Bank'},{code:'058',name:'Zulu Bank'}]);
  expect(call).toHaveBeenCalledTimes(2);
  const first=new URL(call.mock.calls[0][0],'https://api.paystack.co'),second=new URL(call.mock.calls[1][0],'https://api.paystack.co');
  expect(first.pathname).toBe('/bank');expect(first.searchParams.get('use_cursor')).toBe('true');
  expect(first.searchParams.has('page')).toBe(false);expect(first.searchParams.has('next')).toBe(false);
  expect(second.searchParams.get('next')).toBe(next);expect(second.searchParams.get('country')).toBe('nigeria');expect(second.searchParams.get('currency')).toBe('NGN');
 });
 it('loads all 289 entries across cursor pages',async()=>{
  const entries=Array.from({length:289},(_,i)=>bank(String(i+1000)));
  const call=vi.fn().mockResolvedValueOnce({data:entries.slice(0,100),meta:{next:'second'}})
   .mockResolvedValueOnce({data:entries.slice(100,200),meta:{next:'third'}})
   .mockResolvedValueOnce({data:entries.slice(200),meta:{next:null}});
  expect(await loadBanks(call)).toHaveLength(289);expect(call).toHaveBeenCalledTimes(3);
 });
 it('stops on a terminal cursor even if the last page contains 100 entries',async()=>{
  const call=vi.fn().mockResolvedValue({data:Array.from({length:100},(_,i)=>bank(String(i+1000))),meta:{next:null}});
  expect(await loadBanks(call)).toHaveLength(100);expect(call).toHaveBeenCalledTimes(1);
 });
 it('accepts an unpaginated response without repeatedly fetching the same full list',async()=>{
  const call=vi.fn().mockResolvedValue({data:Array.from({length:289},(_,i)=>bank(String(i+1000)))});
  expect(await loadBanks(call)).toHaveLength(289);expect(call).toHaveBeenCalledTimes(1);
 });
 it('filters unsupported entries and deduplicates bank codes across pages',async()=>{
  const call=vi.fn().mockResolvedValueOnce({data:[bank('058'),{...bank('044'),active:false},null,{...bank('001'),currency:'USD'},{...bank('002'),code:'invalid'},{...bank('003'),name:''}],meta:{next:'second'}})
   .mockResolvedValueOnce({data:[bank('058'),bank('011')],meta:{next:null}});
  expect((await loadBanks(call)).map(b=>b.code)).toEqual(['011','058']);
 });
 it('does not return a partial list after a subsequent page fails',async()=>{
  const call=vi.fn().mockResolvedValueOnce({data:[bank('058')],meta:{next:'second'}}).mockRejectedValueOnce(new Error('provider offline'));
  await expect(loadBanks(call)).rejects.toThrow('provider offline');
 });
 it('rejects a repeated cursor instead of issuing the same request twenty times',async()=>{
  const call=vi.fn().mockResolvedValue({data:[bank('058')],meta:{next:'same'}});
  await expect(loadBanks(call)).rejects.toMatchObject({code:'bank_list_incomplete'});expect(call).toHaveBeenCalledTimes(2);
 });
 it('bounds an endlessly advancing provider cursor',async()=>{
  let i=0;const call=vi.fn(async()=>({data:[bank('058')],meta:{next:String(++i)}}));
  await expect(loadBanks(call)).rejects.toMatchObject({code:'bank_list_incomplete'});expect(call).toHaveBeenCalledTimes(20);
 });
 it.each([{},null,'invalid'])('rejects an invalid bank array %j',async data=>{
  await expect(loadBanks(vi.fn().mockResolvedValue({data}))).rejects.toMatchObject({code:'invalid_bank_response'});
 });
 it.each([123,{},'x'.repeat(2001)])('rejects malformed or excessive next cursors',async next=>{
  await expect(loadBanks(vi.fn().mockResolvedValue({data:[bank('058')],meta:{next}}))).rejects.toMatchObject({code:'bank_list_incomplete'});
 });
});
