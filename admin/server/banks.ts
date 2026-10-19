import {Failure} from './failure.js';

export type Bank={code:string;name:string};
type BankResponse={data:unknown;meta?:{next?:unknown}|null};

/** Bank listings use next cursors, not numbered pages or page-length guesses. */
export async function loadBanks(call:(path:string)=>Promise<BankResponse>):Promise<Bank[]>{
 const banks=new Map<string,Bank>(),seen=new Set<string>();
 let cursor:string|undefined;
 for(let page=0;page<20;page++){
  const params=new URLSearchParams({country:'nigeria',currency:'NGN',use_cursor:'true',perPage:'100'});
  if(cursor)params.set('next',cursor);
  const response=await call('/bank?'+params);
  if(!Array.isArray(response.data))throw new Failure(502,'invalid_bank_response','The bank list could not be loaded. Please try again.');
  for(const bank of response.data){
   if(bank?.active===true&&bank.currency==='NGN'&&typeof bank.code==='string'&&/^\d{2,12}$/.test(bank.code)&&typeof bank.name==='string'&&bank.name.trim()&&bank.name.length<=160){
    banks.set(bank.code,{code:bank.code,name:bank.name});
   }
  }
  const next=response.meta?.next;
  if(next===null||next===undefined||next==='')return [...banks.values()].sort((a,b)=>a.name.localeCompare(b.name));
  if(typeof next!=='string'||next.length>2000||seen.has(next))throw new Failure(502,'bank_list_incomplete','The bank list could not finish loading. Please try again.');
  seen.add(next);cursor=next;
 }
 throw new Failure(502,'bank_list_incomplete','The bank list could not finish loading. Please try again.');
}
