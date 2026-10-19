import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function harness(start) {
  const exports = {};
  const calls = [], timers = new Map();
  const nodes = new Set();
  const document = {
    createElement: () => ({style: {}, setAttribute() {}, remove() { nodes.delete(this); }}),
    head: {appendChild: node => nodes.add(node)},
    body: {appendChild: node => nodes.add(node)},
  };
  let next = 0;
  const sdk = {start: async params => {calls.push(params); return start(params);}, back: () => {calls.push('back');}};
  const window = {PalmMobileManager: {PalmMobileManager: sdk}, setTimeout: cb => {const id = ++next; timers.set(id, cb); return id;}, clearTimeout: id => timers.delete(id)};
  const source = readFileSync(new URL('../src/terminal/palmSdk.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(compiled, {exports, window, document, Date, Error, Promise, Number});
  const grant = {captureId: 'capture', userId: 'user', token: 'sut_transient', expiresAt: new Date(Date.now() + 60000).toISOString(), loaderUrl: exports.PALM_SDK_LOADER};
  return {module: exports, grant, calls, timers, nodes};
}

test('SDK captures encrypted data using a user token and never native recognition', async () => {
  const h = harness(() => ({code: 0, data: {payload: 'encrypted-payload'}}));
  assert.equal(await h.module.capturePalmSdk(h.grant, new AbortController().signal), 'encrypted-payload');
  assert.equal(h.calls[0].token, 'sut_transient');
  assert.equal(h.calls[0].userId, 'user');
  assert.equal(h.calls[0].enableImageOnly, true);
  assert.equal(h.calls[0].enableManager, false);
  assert.equal(h.calls[0].mode, 'registration');
  assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.size, 0, 'successful capture must remove its temporary viewport and backdrop');
});

test('SDK callback isMatch alone cannot authorize a payment', async () => {
  const h = harness(() => ({code: 0, data: {isMatch: true, score: 99}}));
  await assert.rejects(h.module.capturePalmSdk(h.grant, new AbortController().signal), /incomplete capture/);
});

test('SDK errors use the SDK namespace and omit arbitrary vendor diagnostics', async () => {
  const h = harness(() => ({code: 10012, message: 'private-diagnostic-or-token', traceId: 'trace-reference'}));
  await assert.rejects(h.module.capturePalmSdk(h.grant, new AbortController().signal), error => /SDK 10012/.test(error.message) && /expired/.test(error.message) && !/private-diagnostic/.test(error.message));
  assert.equal(h.nodes.size, 0, 'failed capture must remove its temporary viewport and backdrop');
});

test('unapproved SDK script URLs cannot execute', async () => {
  const h = harness(() => ({}));
  await assert.rejects(h.module.loadPalmSdk('https://attacker.example/reader.js'), /not approved/);
});

test('navigation cancels the capture iframe and clears the deadline timer', async () => {
  const h = harness(() => new Promise(() => {}));
  const abort = new AbortController();
  const pending = h.module.capturePalmSdk(h.grant, abort.signal);
  await new Promise(resolve => setImmediate(resolve));
  abort.abort();
  await assert.rejects(pending, /cancelled/);
  assert.ok(h.calls.includes('back'));
  assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.size, 0, 'navigation must remove its temporary viewport and backdrop');
});

test('a second capture is rejected while another SDK session is open', async () => {
  const h = harness(() => new Promise(() => {}));
  const abort = new AbortController();
  const first = h.module.capturePalmSdk(h.grant, abort.signal);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(h.module.capturePalmSdk(h.grant, new AbortController().signal), /10007/);
  abort.abort(); await assert.rejects(first);
});
