import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);

function storage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
}

function load(relativePath, globals = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    .replaceAll('import.meta.env', '{}');
  const compiled = ts.transpileModule(source, {
    fileName: relativePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, localStorage: storage(), sessionStorage: storage(),
    DOMException, Error, setTimeout, URL, URLSearchParams, ...globals,
  });
  return exports;
}

const session = { accessToken: 'access-A', refreshToken: 'refresh-A' };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function response(status, payload) {
  return { status, ok: status >= 200 && status < 300, json: async () => payload };
}

test('legacy demo sessions never authenticate', () => {
  const localStorage = storage();
  localStorage.setItem('paybypalm.session', JSON.stringify({ accessToken: 'demo', refreshToken: 'demo' }));
  const api = load('../src/lib/api.ts', { localStorage });
  assert.equal(api.loadSession(), null);
});

test('a delayed private response cannot complete after logout', async () => {
  const pending = deferred();
  const api = load('../src/lib/api.ts', { fetch: () => pending.promise });
  api.saveSession(session);
  const request = api.api.get('/me');
  api.clearSession();
  pending.resolve(response(200, { id: 'user-A' }));
  await assert.rejects(request, error => error.code === 'session_changed');
  assert.equal(api.loadSession(), null);
});

test('logout during JSON parsing also discards the private response', async () => {
  const pending = deferred();
  const parsing = deferred();
  const api = load('../src/lib/api.ts', {
    fetch: async () => ({ status: 200, ok: true, json: () => { parsing.resolve(); return pending.promise; } }),
  });
  api.saveSession(session);
  const request = api.api.get('/me');
  await parsing.promise;
  api.clearSession();
  pending.resolve({ id: 'user-A' });
  await assert.rejects(request, error => error.code === 'session_changed');
});

test('a late refresh cannot overwrite a newly signed-in session', async () => {
  const refreshStarted = deferred();
  const pending = deferred();
  const api = load('../src/lib/api.ts', {
    fetch: async url => {
      if (url.endsWith('/auth/refresh')) { refreshStarted.resolve(); return pending.promise; }
      return response(401, {});
    },
  });
  api.saveSession(session);
  const request = api.api.get('/me');
  await refreshStarted.promise;
  api.clearSession();
  api.saveSession({ accessToken: 'access-B', refreshToken: 'refresh-B' });
  pending.resolve(response(200, { session: { accessToken: 'late-A', refreshToken: 'late-A' } }));
  await assert.rejects(request, error => error.code === 'session_changed');
  assert.equal(api.loadSession().accessToken, 'access-B');
});

test('a rejected refreshed access token clears the session', async () => {
  const api = load('../src/lib/api.ts', {
    fetch: async url => url.endsWith('/auth/refresh')
      ? response(200, { session: { accessToken: 'new-A', refreshToken: 'new-refresh-A' } })
      : response(401, {}),
  });
  api.saveSession(session);
  await assert.rejects(api.api.get('/me'), error => error.status === 401);
  assert.equal(api.loadSession(), null);
});

test('card caches do not cross users or survive logout', () => {
  const localStorage = storage();
  localStorage.setItem('paybypalm.tokenized_cards', JSON.stringify([{ id: 'unowned' }]));
  localStorage.setItem('paybypalm.user_pin', '1234');
  const cards = load('../src/lib/cardStore.ts', { localStorage });
  cards.setCardOwner('user-A');
  assert.equal(cards.getCards().length, 0);
  assert.equal(localStorage.getItem('paybypalm.user_pin'), null);
  cards.cacheServerCards('user-A', [{ name: 'A', last4: '1234', isDefault: true }]);
  assert.equal(cards.getCards().length, 1);
  cards.setCardOwner('user-B');
  assert.equal(cards.getCards().length, 0);
  assert.equal(localStorage.getItem('paybypalm.tokenized_cards.v2:user-A'), null);
  cards.setCardOwner(null);
  assert.equal(cards.getCards().length, 0);
  cards.cacheServerCards('user-A', [{ last4: '5678' }]);
  assert.equal(cards.getCards().length, 0);
});

test('terminal bootstrap rejects URL and legacy persistent credentials', () => {
  const localStorage = storage();
  localStorage.setItem('paybypalm.terminalKey', 'legacy-key');
  let scrubbed;
  const terminal = load('../src/terminal/config.ts', {
    localStorage,
    window: {
      location: { href: 'https://wallet.example/terminal?k=url-key' },
      history: { replaceState: (_state, _title, path) => { scrubbed = path; } },
    },
  });
  assert.equal(terminal.resolveTerminalKey(), null);
  assert.equal(scrubbed, '/terminal');
  assert.equal(localStorage.getItem('paybypalm.terminalKey'), null);
});

test('terminal accepts locally provisioned credentials and clears them', () => {
  const sessionStorage = storage();
  const terminal = load('../src/terminal/config.ts', {
    sessionStorage,
    window: { location: { href: 'https://wallet.example/terminal' } },
  });
  assert.equal(terminal.resolveTerminalKey(), null);
  sessionStorage.setItem('paybypalm.terminalKey', 'unique-device-key');
  assert.equal(terminal.resolveTerminalKey(), 'unique-device-key');
  terminal.clearTerminalKey();
  assert.equal(terminal.resolveTerminalKey(), null);
});

function authProvider(apiModule) {
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useCallback: callback => callback,
    useEffect: () => {},
    useMemo: factory => factory(),
    useRef: current => ({ current }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    './api.js': apiModule,
    './cardStore.js': { setCardOwner: () => {} },
    './money.js': { formatNaira: String },
    '../components/Toast.js': { useToast: () => ({ show: () => {} }) },
  };
  const auth = load('../src/lib/auth.tsx', {
    require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  return auth.AuthProvider({ children: null }).props.value;
}

const signupInput = { fullName: 'User', phone: '+2348123456789', email: 'user@example.com', password: 'password' };
test('failed password login never creates a demo session', async () => {
  const api = load('../src/lib/api.ts', { fetch: async () => response(401, { error: { code: 'unauthorized', message: 'Incorrect credentials' } }) });
  await assert.rejects(authProvider(api).signIn(signupInput.email, 'wrong'), error => error.status === 401);
  assert.equal(api.loadSession(), null);
});
test('normal signup submits profile fields and password but creates no unverified session', async () => {
  let body;
  const api = load('../src/lib/api.ts', { fetch: async (_url, options) => { body = JSON.parse(options.body); return response(201, { email: signupInput.email, verificationRequired: true }); } });
  const auth = authProvider(api); await auth.signUp(signupInput);
  assert.deepEqual(body, signupInput); assert.equal(api.loadSession(), null);
  auth.signOut(); assert.equal(api.loadSession(), null);
});
test('signup refuses a server that skips verification', async () => {
  const api = load('../src/lib/api.ts', { fetch: async () => response(201, { email: signupInput.email, verificationRequired: true, session }) });
  await assert.rejects(authProvider(api).signUp(signupInput), /Email verification/);
  assert.equal(api.loadSession(), null);
});
test('invalid confirmation sessions cannot create a session', async () => {
  const api = load('../src/lib/api.ts', { fetch: async () => response(400, { error: { code: 'invalid_confirmation', message: 'Invalid link' } }) });
  await assert.rejects(authProvider(api).confirmEmail('invalid-refresh'), error => error.code === 'invalid_confirmation');
  assert.equal(api.loadSession(), null);
});
test('confirmed signup exchanges the link session and loads the real profile', async () => {
  let verification;
  const api = load('../src/lib/api.ts', { fetch: async (url, options) => {
    if (url.endsWith('/auth/signup')) return response(201, { email: signupInput.email, verificationRequired: true });
    if (url.endsWith('/auth/confirm')) { verification = JSON.parse(options.body); return response(200, { session }); }
    return response(200, { id: 'user-A', balanceMinor: 0 });
  } });
  const auth = authProvider(api); await auth.signUp(signupInput); await auth.confirmEmail('link-refresh');
  assert.deepEqual(verification, { refreshToken: 'link-refresh' });
  assert.equal(api.loadSession().accessToken, session.accessToken);
});
test('logout cancels a pending verification result', async () => {
  const pending = deferred();
  const api = load('../src/lib/api.ts', { fetch: async () => pending.promise });
  const auth = authProvider(api); const verifying = auth.confirmEmail('link-refresh');
  auth.signOut(); pending.resolve(response(200, { session }));
  await assert.rejects(verifying, /cancelled/); assert.equal(api.loadSession(), null);
});

test('pending sale references survive reloads and cannot silently drop corrupt state', () => {
  const sessionStorage = storage();
  const first = load('../src/terminal/paymentRecovery.ts', { sessionStorage });
  const sale = { saleId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', amountMinor: 100, confirming: true,
    transactionId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
  first.savePendingSale(sale);
  const reloaded = load('../src/terminal/paymentRecovery.ts', { sessionStorage });
  assert.equal(reloaded.loadPendingSale().saleId, sale.saleId);
  assert.equal(reloaded.loadPendingSale().transactionId, sale.transactionId);
  sessionStorage.setItem('paybypalm.pendingSale', '{bad json');
  assert.throws(() => reloaded.loadPendingSale());
});

test('card checkout rejects attacker-controlled redirect origins', () => {
  const paystack = load('../src/lib/paystack.ts');
  assert.equal(paystack.validatedCheckoutUrl('https://checkout.paystack.com/abc'), 'https://checkout.paystack.com/abc');
  for (const url of ['http://checkout.paystack.com/abc','https://checkout.paystack.com.attacker.test/abc','javascript:alert(1)','https://attacker.test/','https://user@checkout.paystack.com/abc']) {
    assert.throws(() => paystack.validatedCheckoutUrl(url));
  }
});

function renderDashboard(balanceMinor, palmEnrolled = false) {
  const React = nodeRequire('react');
  const palmStatus = load('../src/components/PalmLinkStatus.tsx', {require: name => ({react:React,'react/jsx-runtime':nodeRequire('react/jsx-runtime'),'../lib/api.js':{api:{}},'./ui.js':{PalmIcon:()=>null,Button:({children,...props})=>React.createElement('button',props,children)}})[name]});
  const dependencies = {
    react: React,
    'react/jsx-runtime': nodeRequire('react/jsx-runtime'),
    'react-dom': { createPortal: children => children },
    'react-router-dom': { useNavigate: () => () => {} },
    '../lib/auth.js': { useAuth: () => ({ me: { id: 'user', fullName: 'Test User', balanceMinor, phone: '08010001234', palmEnrolled }, refresh: async () => {}, consentGiven: false, setConsentGiven:()=>{} }) },
    '../lib/money.js': load('../src/lib/money.ts'),
    '../lib/serverCards.js': { useServerCards: () => [], editLinkedCard: async () => {} },
    '../components/ui.js': { PalmIcon: () => null, Skeleton: () => null },
    '../components/BankCard.js': { BankCard: () => null },
    '../components/sheets.js': { TransactionSheet: () => null },
    '../components/transitions.js': { PageTransition: ({ children }) => children },
    '../components/Toast.js': { useToast: () => ({ show: () => {} }) },
    '../components/PalmLinkStatus.js': palmStatus,
  };
  const module = load('../src/routes/Dashboard.tsx', { require: name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  } });
  return nodeRequire('react-dom/server').renderToStaticMarkup(React.createElement(module.default));
}

test('dashboard reports unavailable card balance instead of fabricating funds', () => {
  const html = renderDashboard(0);
  assert.equal(html.includes('125,000'), false);
  assert.match(html, /Card balance unavailable/);
  assert.equal(html.includes('Transfer Successful'), false);
});

test('dashboard never presents an old ledger balance as bank funds', () => {
  const text = renderDashboard(9876543).replace(/<[^>]*>/g, '');
  assert.equal(text.includes('98,765'), false);
  assert.match(text, /Card balance unavailable/);
  assert.match(text, /Payments debit your default linked card directly/);
  assert.equal(text.includes('125,000'), false);
});

test('dashboard always shows the actual palm enrollment status and its action', () => {
  const linked = renderDashboard(0,true), unlinked = renderDashboard(0,false);
  assert.match(linked,/Palm linked/); assert.match(linked,/Unlink palm/);
  assert.match(unlinked,/Palm not linked/); assert.match(unlinked,/>Link palm</);
  assert.equal(unlinked.includes('Terminal Status: Active'),false);
});

function palmStatusHarness(post, linked = true) {
  const states=[];let index=0, refreshed=0;
  const jsx=(type,props)=>({type,props});
  const dependencies={react:{useEffect:()=>{},useState:initial=>{const slot=index++;if(!(slot in states))states[slot]=initial;return[states[slot],v=>{states[slot]=v;}];},useRef:initial=>{const slot=index++;if(!(slot in states))states[slot]={current:initial};return states[slot];}},'react/jsx-runtime':{jsx,jsxs:jsx},'../lib/api.js':{api:{post}},'./ui.js':{Button:'Button',PalmIcon:'PalmIcon'}};
  const component=load('../src/components/PalmLinkStatus.tsx',{require:name=>dependencies[name]});
  function find(type,label) {
    index=0;const tree=component.PalmLinkStatus({linked,onEnroll:()=>{},onUnlinked:async()=>{refreshed++;}});
    function walk(n){if(Array.isArray(n)){for(const c of n){const r=walk(c);if(r)return r;}}else if(n&&typeof n==='object'){if(n.type===type&&(label===undefined||n.props.children===label))return n;return walk(n.props?.children);}return null;}
    return walk(tree);
  }
  return {find,refreshCount:()=>refreshed};
}

test('unlink waits for backend confirmation before showing unlinked or refreshing',async()=>{
  const pending=deferred(),calls=[];
  const h=palmStatusHarness((...args)=>{calls.push(args);return pending.promise;});
  h.find('Button','Unlink palm').props.onClick();
  h.find('Button','Yes, unlink palm').props.onClick();
  assert.ok(h.find('h3','Palm linked'));assert.equal(h.refreshCount(),0);
  pending.resolve({revoked:true});await flushActions();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['/palm/revoke',{}]]);assert.ok(h.find('h3','Palm not linked'));assert.equal(h.refreshCount(),1);
});

test('unlink failure keeps the palm linked and exposes a retry',async()=>{
  const h=palmStatusHarness(async()=>{throw new Error('Could not confirm removal');});
  h.find('Button','Unlink palm').props.onClick();h.find('Button','Yes, unlink palm').props.onClick();await flushActions();
  assert.ok(h.find('h3','Palm linked'));assert.ok(h.find('p','Could not confirm removal'));assert.ok(h.find('Button','Yes, unlink palm'));assert.equal(h.refreshCount(),0);
});

test('an account marked unlinked can still remove a retained provider registration',async()=>{
  const calls=[];
  const h=palmStatusHarness(async(...args)=>{calls.push(args);return {revoked:true};},false);
  assert.ok(h.find('h3','Palm not linked'));assert.ok(h.find('Button','Link palm'));
  h.find('Button','Unlink palm').props.onClick();
  assert.equal(calls.length,0);
  h.find('Button','Yes, unlink palm').props.onClick();await flushActions();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['/palm/revoke',{}]]);
  assert.equal(h.refreshCount(),1);
});

class FixtureTerminalApiError extends Error {
  constructor(message,requestId){super(message);this.requestId=requestId;}
}

function terminalHarness(terminalApi, sessionStorage = storage()) {
  const states = [];
  let index = 0;
  const recovery = load('../src/terminal/paymentRecovery.ts', { sessionStorage });
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState: initial => {
        const slot = index++;
        if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
      },
      useEffect: () => {}, useCallback: callback => callback, useRef:current=>({current}),
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './leds.js': {beginLEDOperation:()=>({state:async()=>({available:false}),active:()=>true,close:()=>{}})},
    './api.js': { terminalApi, TerminalApiError: FixtureTerminalApiError },
    './paymentRecovery.js': recovery,
    './config.js': { resolveTerminalKey: () => 'device-key', TIMINGS: {} },
    './ui.js': { KioskFrame: 'Frame', Pane: 'Pane', TButton: 'Button' },
    './useCamera.js': { preloadPalmRecognition: () => {} },
  };
  for (const name of ['Idle', 'Amount', 'Capture', 'Confirm', 'StepUp', 'Result', 'Enrol']) {
    dependencies[`./screens/${name}.js`] = { [name]: name };
  }
  const module = load('../src/terminal/TerminalApp.tsx', {
    crypto: nodeRequire('node:crypto').webcrypto,
    require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; },
  });
  function render() { index = 0; return module.default(); }
  function find(type, label) {
    function walk(node) {
      if (Array.isArray(node)) {
        for (const child of node) { const found = walk(child); if (found) return found; }
      } else if (node && typeof node === 'object') {
        if (node.type === type && (label === undefined || node.props.children === label)) return node;
        return walk(node.props?.children);
      }
      return null;
    }
    return walk(render());
  }
  return { find, recovery, sessionStorage };
}
const flushActions = () => new Promise(resolve => setImmediate(resolve));
const paymentId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

test('lost initiation response reuses the original sale ID and blocks a fresh sale', async () => {
  const references = [];
  const app = terminalHarness({
    createTransaction: async (_amount, _description, saleId) => {
      references.push(saleId);
      if (references.length === 1) throw new Error('Lost response');
      return { transactionId: paymentId, amountMinor: 100, status: 'pending' };
    },
    status: async () => ({ status: 'pending', amountMinor: 100 }),
  });
  app.find('Idle').props.onNewSale();
  app.find('Amount').props.onCharge(100);
  await flushActions();
  assert.equal(app.find('Idle'), null);
  assert.ok(app.find('Button', 'Check or retry this payment'));
  app.find('Button', 'Check or retry this payment').props.onClick();
  await flushActions();
  assert.equal(references.length, 2);
  assert.equal(references[0], references[1]);
  assert.equal(app.find('Capture').props.transactionId, paymentId);
});

test('lost settlement response is recovered using the same transaction', async () => {
  const confirmed = [];
  const app = terminalHarness({
    createTransaction: async () => ({ transactionId: paymentId, amountMinor: 100, status: 'pending' }),
    status: async () => ({ status: 'settled', amountMinor: 100 }),
    confirm: async id => {
      confirmed.push(id);
      if (confirmed.length === 1) throw new Error('Lost response after commit');
      return { transactionId: id, amountMinor: 100, settledAt: new Date().toISOString(), maskedName: 'Payer', merchantName: 'Merchant' };
    },
  });
  app.find('Idle').props.onNewSale();
  app.find('Amount').props.onCharge(100);
  await flushActions();
  app.find('Capture').props.onOutcome({ decision: 'accept', pinRequired: false });
  app.find('Confirm').props.onConfirm();
  await flushActions();
  assert.equal(app.find('Result'), null);
  assert.equal(app.find('Idle'), null);
  assert.equal(app.recovery.loadPendingSale().confirming, true);
  app.find('Button', 'Check or retry this payment').props.onClick();
  await flushActions();
  assert.deepEqual(confirmed, [paymentId, paymentId]);
  assert.equal(app.find('Result').props.ok, true);
  assert.equal(app.recovery.loadPendingSale(), null);
});

test('cancel recovers a lost initiation response using the same sale reference', async () => {
  const references = [], cancelled = [];
  const app = terminalHarness({
    createTransaction: async (_amount, _description, saleId) => {
      references.push(saleId);
      if (references.length === 1) throw new Error('Creation unavailable');
      return { transactionId: paymentId, amountMinor: 100, status: 'pending' };
    },
    status: async () => ({ status: 'pending', amountMinor: 100 }),
    cancel: async id => { cancelled.push(id); return { status: 'cancelled' }; },
  });
  app.find('Idle').props.onNewSale(); app.find('Amount').props.onCharge(100);
  await flushActions();
  assert.equal(app.find('p', 'Creation unavailable').props.role, 'alert');
  app.find('Button', 'Cancel pending sale').props.onClick(); await flushActions();
  assert.equal(references.length, 2); assert.equal(references[0], references[1]);
  assert.deepEqual(cancelled, [paymentId]); assert.equal(app.recovery.loadPendingSale(), null);
  assert.ok(app.find('Idle'));
});

test('failed cancellation preserves the sale and shows the actual error', async () => {
  const sessionStorage = storage();
  const recovery = load('../src/terminal/paymentRecovery.ts', { sessionStorage });
  recovery.savePendingSale({saleId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',amountMinor:100,confirming:true,transactionId:paymentId});
  const app = terminalHarness({status:async()=>({status:'processing'}),cancel:async()=>{throw new Error('Card charge is still processing');}},sessionStorage);
  app.find('Button','Cancel pending sale').props.onClick(); await flushActions();
  assert.ok(app.recovery.loadPendingSale()); assert.equal(app.find('Idle'),null);
  assert.ok(app.find('p','Card charge is still processing'));
});

test('corrupt recovery storage cannot silently enable a fresh sale', async () => {
  const sessionStorage = storage();
  sessionStorage.setItem('paybypalm.pendingSale', '{broken');
  const app = terminalHarness({}, sessionStorage);
  assert.equal(app.find('Idle'), null);
  app.find('Button', 'Check or retry this payment').props.onClick();
  await flushActions();
  assert.equal(app.find('Idle'), null);
  assert.equal(sessionStorage.getItem('paybypalm.pendingSale'), '{broken');
});

// Exercise the real form handlers across renders, without a browser or live email.
function onboardingHarness(route, auth, apiModule = {}) {
  const states = [];
  let index = 0;
  const navigations = [];
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState: initial => {
        const slot = index++;
        if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
      }, useEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': { useNavigate: () => (...args) => navigations.push(args), useLocation: () => ({ state: { email: 'user@example.com' } }), Navigate: 'Navigate', Link: 'Link' },
    '../lib/auth.js': { useAuth: () => auth },
    '../lib/api.js': apiModule,
    '../components/ui.js': { Button: 'Button', PinInput: 'PinInput', OtpInput: 'OtpInput', PayByPalmLogo: 'Logo', Field: 'Field' },
  };
  const module = load(`../src/routes/${route}.tsx`, { Error, require: name => dependencies[name] });
  function render() { index = 0; return module.default(); }
  function find(type) {
    const results = [];
    function walk(node) {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        if (node.type === type) results.push(node);
        walk(node.props?.children);
      }
    }
    walk(render());
    return results;
  }
  return { find, navigations };
}

test('PIN setup checks confirmation and waits for the authenticated save', async () => {
  let saved;
  let refreshed = false;
  const pending = deferred();
  const app = onboardingHarness('SetupPin', { me: { hasPin: false }, refresh: async () => { refreshed = true; } }, {
    api: { post: async (...args) => { saved = args; await pending.promise; } }, loadSession: () => session,
  });
  app.find('PinInput')[0].props.onChange('2468');
  app.find('PinInput')[1].props.onChange('2469');
  await app.find('form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(saved, undefined);
  app.find('PinInput')[1].props.onChange('2468');
  const submitting = app.find('form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(saved[0], '/me/pin');
  assert.equal(saved[1].newPin, '2468');
  assert.equal(app.navigations.length, 0);
  pending.resolve();
  await submitting;
  assert.equal(refreshed, true);
  assert.equal(app.navigations[0][0], '/dashboard');
});

const confirmation = () => load('../src/lib/emailConfirmation.ts');
test('confirmation parser accepts signup links and rejects recovery, passwordless and malformed links', () => {
  assert.equal(confirmation().readEmailConfirmation('#type=signup&refresh_token=valid'), 'valid');
  for (const hash of ['', '#type=signup', '#type=recovery&refresh_token=x', '#type=magiclink&refresh_token=x', '#type=signup&refresh_token=x&error_code=otp_expired']) {
    assert.throws(() => confirmation().readEmailConfirmation(hash));
  }
});

test('processing card payments recover the same sale without a PIN',async()=>{
 const sessionStorage=storage(),recovery=load('../src/terminal/paymentRecovery.ts',{sessionStorage});
 recovery.savePendingSale({saleId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',amountMinor:100,confirming:true,transactionId:paymentId});
 const calls=[];
 const app=terminalHarness({status:async()=>({status:'processing',amountMinor:100}),confirm:async(...args)=>{calls.push(args);return {transactionId:paymentId,amountMinor:100,settledAt:new Date().toISOString(),maskedName:'Payer',merchantName:'Merchant'};}},sessionStorage);
 app.find('Button','Check or retry this payment').props.onClick();await flushActions();
 assert.deepEqual(calls,[[paymentId]]);assert.equal(app.find('Result').props.ok,true);
});


test('failed confirmation keeps its sale and shows the API support reference',async()=>{
 const app=terminalHarness({
  createTransaction:async()=>({transactionId:paymentId,amountMinor:2000,status:'pending'}),
  confirm:async()=>{throw new FixtureTerminalApiError('This merchant’s payout setup is incomplete.','fixture-support-id');},
 });
 app.find('Idle').props.onNewSale();app.find('Amount').props.onCharge(2000);await flushActions();
 app.find('Capture').props.onOutcome({decision:'accept',pinRequired:false});
 app.find('Confirm').props.onConfirm();await flushActions();
 assert.ok(app.find('p','This merchant’s payout setup is incomplete. Support reference: fixture-support-id.'));
 assert.ok(app.find('Button','Check or retry this payment'));
 assert.equal(app.recovery.loadPendingSale().transactionId,paymentId);
 assert.equal(app.recovery.loadPendingSale().confirming,true);
 assert.equal(app.find('Result'),null);
});
