/** Test-mode readiness checks. Issues one transient SDK token; captures no palm. */
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { db } from '../src/db/client.js';
import { createTencentProvider } from '../src/palm/tencent.js';
import { getActivePalmCandidates, SDK_LOADER_URL } from '../src/services/palmCaptureService.js';

if (config.PAYSTACK_MODE !== 'test' || config.PALM_PROVIDER !== 'tencent') {
  console.error('Use Tencent with PAYSTACK_MODE=test for this preflight. No requests made.');
  process.exit(1);
}
let blockers = 0;
const pass = (s: string) => console.log('PASS: ' + s);
const blocked = (s: string) => { blockers++; console.log('BLOCKED: ' + s); };
for (const table of ['palm_capture_sessions', 'palm_used_captures']) {
  const r = await db.from(table).select('*', {head: true, count: 'exact'}).abortSignal(AbortSignal.timeout(15000));
  if (r.error || r.count === null) blocked(`${table} is unavailable; apply migration 0021 (${r.error?.code ?? 'no count returned'}).`);
  else pass(`${table} is available.`);
}
const claim = await db.rpc('consume_palm_capture', {p_capture: randomUUID(), p_terminal: randomUUID(), p_scope: randomUUID(), p_purpose: 'payment', p_token_hash: 'a'.repeat(64), p_capture_hash: 'b'.repeat(64)});
if (claim.error?.code === 'PC001') pass('Capture validation RPC rejects a nonexistent grant without mutation.');
else blocked(`Capture validation RPC is unavailable or unexpected; check migration 0021 (${claim.error?.code ?? 'unexpected response'}).`);
const complete = await db.rpc('complete_h5_palm_enrolment', {p_session: randomUUID(), p_terminal: randomUUID(), p_user: randomUUID(), p_palm_id: 'preflight-nonexistent'});
if (complete.error?.code === 'PC002') pass('Atomic enrolment RPC rejects a nonexistent session without mutation.');
else blocked(`Atomic enrolment RPC is unavailable or unexpected; check migration 0021 (${complete.error?.code ?? 'unexpected response'}).`);
try {
  const response = await fetch(SDK_LOADER_URL, {signal: AbortSignal.timeout(15000)});
  if (response.ok && response.headers.get('content-type')?.includes('javascript')) pass('Tencent H5 loader is reachable.');
  else blocked('Tencent H5 loader returned an unexpected response.');
} catch { blocked('Tencent H5 loader could not be reached.'); }
try {
  const candidates = await getActivePalmCandidates();
  pass(`Active enrolled candidate pool: ${candidates.length} user(s); no fixed ten-user limit.`);
  if (candidates[0]) {
    await createTencentProvider().createSdkToken!('capture_' + randomUUID().replaceAll('-', ''));
    pass('Tencent issued a short-lived SDK token; its value is hidden and not saved.');
  } else blocked('Enrol a test user to check user-token issuance.');
} catch (error) {
  const failure = error as {providerCode?: number; name?: string};
  blocked(`Could not load candidates or issue an SDK token (${failure.providerCode ?? failure.name ?? 'unknown error'}). Check backend diagnostics.`);
}
console.log('No images, registrations, comparisons, deletions or payments were submitted.');
console.log('A real H5 palm capture and multi-user compatibility test are still required.');
if (blockers) process.exitCode = 1;
