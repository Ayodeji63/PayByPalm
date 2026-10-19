/** Read-only preflight. Never initializes checkout, saves a card or requests a refund. */
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { db } from '../src/db/client.js';
import { paystack } from '../src/services/paystack.js';
const blockers:string[]=[];
const ok=(message:string)=>console.log('PASS: '+message);
const blocked=(message:string)=>{blockers.push(message);console.log('BLOCKED: '+message);};
console.log('Card sandbox preflight — '+new URL(config.SUPABASE_URL).hostname);
if(config.PAYSTACK_MODE!=='test'){
 console.error('Refusing to run: PAYSTACK_MODE must be test. No provider requests made.');process.exit(1);
}
ok('Payment mode is test; no live keys accepted');
if(!config.PAYSTACK_SECRET_KEY)blocked('Add a Paystack sk_test_ secret key to backend/.env; never paste it in chat.');
if(!config.CARD_TOKEN_ENCRYPTION_KEY)blocked('Configure the backend-only card encryption key.');
else ok('Card encryption key is configured (value hidden)');
for(const table of ['linked_cards','card_link_attempts','card_payment_attempts']){
 const result=await db.from(table).select('id',{count:'exact',head:true});
 if(result.error||result.count===null)blocked(`${table} could not be read; apply migrations 0017 and 0018 in the test project and check backend grants.`);
 else ok(`${table} is accessible (${result.count} rows)`);
}
const modeSchema=await db.from('linked_cards').select('domain').limit(0);
if(modeSchema.error)blocked('Apply migration 0022_payment_modes.sql for separate test/live cards and defaults.');
else ok('Payment mode schema is available');
const domains=await db.from('card_link_attempts').select('id',{count:'exact',head:true}).neq('domain','test');
if(!domains.error&&domains.count!==null){
 if(domains.count)blocked('Non-test card attempts exist. Use a separate test database.');
 else ok('No live card attempts in this database');
}
// The app only generates pbp_card_ references; this prefix cannot match an app checkout.
const claim=await db.rpc('claim_card_link',{p_reference:'preflight_'+randomUUID(),p_owner:randomUUID()});
if(claim.error)blocked('Verification lock RPC is missing or unavailable; check migration 0017.');
else if(claim.data?.length)blocked('Unexpected preflight reference collision; stop and inspect the test database.');
else ok('Verification lock RPC is available (no matching rows or mutations)');
// Missing random transaction is expected and causes no mutation.
const paymentClaim=await db.rpc('begin_card_payment',{p_transaction:randomUUID(),p_terminal:randomUUID(),p_domain:'test',p_validity:60,p_accept_score:85});
if(paymentClaim.error?.code==='PB001')ok('Direct card payment RPC is available (no matching transaction or mutations)');
else blocked('Direct card payment RPC is unavailable; apply migration 0018.');
if(config.PAYSTACK_SECRET_KEY && config.CARD_TOKEN_ENCRYPTION_KEY){
 try{await paystack('/bank?currency=NGN&perPage=1');ok('Paystack accepted the test secret on a read-only API request');}
 catch{blocked('Paystack test credential/connectivity check failed. Check the test key and network locally.');}
}
console.log('Checkout returns to '+new URL('/cards',config.WALLET_BASE_URL).href);
console.log('No card transactions or refunds were initiated.');
if(blockers.length){console.log(`Preflight incomplete: ${blockers.length} blocker(s). Hosted test checkout has not been validated.`);process.exitCode=1;}
else console.log('Preflight passed. Complete the hosted test-card matrix in CARD_TESTING.md.');
