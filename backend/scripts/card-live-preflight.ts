/** Read-only live readiness. Never creates a checkout, charge, refund or DB row. */
import {pathToFileURL} from 'node:url';
import {config} from '../src/config.js';
import {db} from '../src/db/client.js';
import {cardSignature, openAuthorization, paystack} from '../src/services/paystack.js';

export async function liveCardPreflight(args: string[]): Promise<number> {
  const options = new Map<string, string>();
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!, value = args[i + 1];
    if (!['--user-id', '--merchant-id'].includes(name) || options.has(name) || !value || !uuid.test(value)) {
      console.error('Use --user-id USER_UUID --merchant-id MERCHANT_UUID. No requests made.'); return 1;
    }
    options.set(name, value);
  }
  if (options.size !== 2) {
    console.error('Use --user-id USER_UUID --merchant-id MERCHANT_UUID. No requests made.'); return 1;
  }
  if (config.PAYSTACK_MODE !== 'live' || !config.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') || !config.CARD_TOKEN_ENCRYPTION_KEY) {
    console.error('BLOCKED: This process must already have live Paystack mode/key and the existing card encryption key. No requests made.'); return 1;
  }
  const userId = options.get('--user-id')!, merchantId = options.get('--merchant-id')!;
  let blockers = 0;
  const pass = (message: string) => console.log('PASS: ' + message);
  const blocked = (message: string) => {blockers++; console.log('BLOCKED: ' + message);};
  console.log('Live card readiness — read-only; secret values and card tokens are hidden.');
  if (config.PALM_PROVIDER !== 'tencent') blocked('Live palm payments require the real provider.');
  if (config.TENCENT_CAPTURE_MODE === 'h5' && !config.TENCENT_H5_IMAGE_ONLY_APPROVED) {
    blocked('The optional H5 capture contract requires approval before live use. Use the original camera for the controlled live test.');
  }
  const profile = await db.from('profiles').select('id,palm_enrolled').eq('id', userId).maybeSingle();
  const binding = await db.from('palm_bindings').select('id', {head: true, count: 'exact'}).eq('user_id', userId).is('revoked_at', null);
  if (profile.error || !profile.data?.palm_enrolled || binding.error || binding.count !== 1) blocked('The selected account needs exactly one active palm registration.');
  else pass('Selected account has an active local palm binding; provider matching still needs a real scan.');

  const card = await db.from('linked_cards').select('id,exp_month,exp_year,authorization_ciphertext,signature_hash')
    .eq('user_id', userId).eq('domain', 'live').eq('is_default', true).eq('is_paused', false).is('removed_at', null).maybeSingle();
  if (card.error || !card.data) blocked('Link a real card using live hosted checkout and select it as the active default.');
  else {
    const verified = await db.from('card_link_attempts').select('id', {head: true, count: 'exact'})
      .eq('card_id', card.data.id).eq('user_id', userId).eq('status', 'verified').eq('domain', 'live');
    if (verified.error || !verified.count) blocked('The default card has no verified LIVE authorization. Test cards cannot authorize live payments.');
    else {
      try {
        const value = openAuthorization(userId, card.data.authorization_ciphertext) as {email?: string; authorization?: {reusable?: boolean; authorization_code?: string; signature?: string}};
        const a = value.authorization;
        if (typeof value.email !== 'string' || !value.email || a?.reusable !== true || typeof a.authorization_code !== 'string' || !a.authorization_code || typeof a.signature !== 'string' || !a.signature || cardSignature(a.signature) !== card.data.signature_hash) throw Error('Invalid credential');
        if (Date.UTC(Number(card.data.exp_year), Number(card.data.exp_month), 1) <= Date.now()) throw Error('Expired card');
        pass('Live default-card credential decrypts with the configured key and is reusable/unexpired.');
      } catch {blocked('The saved live card credential is unreadable, invalid or expired. Preserve the original encryption key; relink if necessary.');}
    }
  }
  const merchant = await db.from('merchants').select('id,paystack_subaccount').eq('id', merchantId).maybeSingle();
  const subaccount: unknown = merchant.data?.paystack_subaccount;
  if (merchant.error || typeof subaccount !== 'string' || !/^ACCT_[A-Za-z0-9]+$/.test(subaccount)) blocked('The selected merchant needs its live Paystack settlement subaccount.');
  else {
    try {
      const result = await paystack('/subaccount/' + encodeURIComponent(subaccount));
      if (result?.subaccount_code !== subaccount || result.active === false) throw Error('Wrong subaccount');
      pass('Configured merchant subaccount is accessible under this live credential. Confirm its bank destination manually.');
    } catch {blocked('The live Paystack credential could not retrieve the configured merchant subaccount.');}
  }
  const outstanding = await db.from('card_payment_attempts').select('transaction_id', {head: true, count: 'exact'})
    .eq('domain', 'test').not('status', 'in', '(success,failed)');
  if (outstanding.error || outstanding.count === null) blocked('Could not check outstanding sandbox charges.');
  else if (outstanding.count) blocked('Reconcile outstanding sandbox charges with a test-mode backend before switching this deployment.');
  else pass('No unresolved sandbox card-charge attempts.');
  console.log('No checkout, charge, refund, palm comparison or database mutation was requested.');
  console.log('Business activation, webhook delivery, refund processing and bank settlement still require operator verification.');
  return blockers ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  liveCardPreflight(process.argv.slice(2)).then(code => {process.exitCode = code;}).catch(() => {
    console.error('BLOCKED: Read-only readiness check failed. No payment was requested.'); process.exitCode = 1;
  });
}
