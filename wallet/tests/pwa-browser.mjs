// Integration check against `npm run preview -- --host 127.0.0.1 --port 4178`.
// Requires Playwright available to Node. All account/API responses are fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const origin = process.env.PBP_PREVIEW_ORIGIN || 'http://127.0.0.1:4178';
const profile = mkdtempSync(join(tmpdir(), 'pbp-wallet-pwa-'));
const context = await chromium.launchPersistentContext(profile, { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, viewport: { width: 390, height: 844 } });
const artifacts = process.env.PBP_BROWSER_ARTIFACTS || '/tmp/pbp-email-pwa-check';
mkdirSync(artifacts, { recursive: true });
try {
  let hasPin = false;
  const requests = [];
  const session = { accessToken: 'fixture-token', refreshToken: 'fixture-refresh' };
  await context.route('http://localhost:8080/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    requests.push({ path, body });
    let status = 200;
    let data;
    if (path === '/auth/signup') data = { email: body.email, verificationRequired: true };
    else if (path === '/auth/confirm') {
      if (body.refreshToken !== 'fixture-refresh') { status = 400; data = { error: { code: 'invalid_confirmation', message: 'Invalid confirmation link' } }; }
      else data = { session };
    } else if (path === '/me/pin') { hasPin = true; data = { updated: true }; }
    else if (path === '/me') data = { id: 'fixture-user', fullName: 'Test User', email: 'user@example.com', phone: '08010001234', hasPin, palmEnrolled: false, balanceMinor: 0, currency: 'NGN', createdAt: '2026-10-17T00:00:00Z' };
    else data = { transactions: [] };
    await route.fulfill({ status, json: data, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/offline.html');
  await page.evaluate(async () => {
    await (await caches.open('paybypalm-v1')).put('/me', new Response('OLD PRIVATE DATA'));
    await (await caches.open('unrelated-app-cache')).put('/other', new Response('keep'));
  });
  await page.goto(origin + '/login');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.getByLabel('Full Name').fill('Test User');
  await page.getByLabel('Email address').fill('user@example.com');
  await page.getByPlaceholder('812 345 6789').fill('08010001234');
  await page.getByLabel('Password', { exact: true }).fill('password-strong');
  await page.getByRole('checkbox').check();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: artifacts + '/signup-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL('**/verify');
  assert.deepEqual(requests.find(request => request.path === '/auth/signup').body, { fullName: 'Test User', phone: '+2348010001234', email: 'user@example.com', password: 'password-strong' });
  assert.equal(await page.evaluate(() => localStorage.getItem('paybypalm.session')), null);
  await page.getByRole('heading', { name: 'Check your email' }).waitFor();
  assert.equal(await page.locator('input').count(), 0);
  await page.screenshot({ path: artifacts + '/verify-mobile.png', fullPage: true });
  await page.goto(origin + '/auth/confirm#type=signup&refresh_token=invalid');
  await page.getByRole('alert').filter({ hasText: 'Invalid confirmation link' }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.evaluate(() => localStorage.getItem('paybypalm.session')), null);
  await page.goto(origin + '/auth/confirm#type=signup&refresh_token=fixture-refresh&access_token=untrusted');
  await page.waitForURL('**/setup-pin');
  await page.goto(origin + '/dashboard');
  await page.waitForURL('**/setup-pin'); // Reload cannot bypass unfinished PIN setup.
  for (const [group, digits] of [[0, '2468'], [1, '2468']]) {
    const inputs = page.getByRole('group').nth(group).locator('input');
    for (let i = 0; i < 4; i++) await inputs.nth(i).fill(digits[i]);
  }
  await page.getByRole('button', { name: 'Save wallet PIN' }).click();
  await page.waitForURL('**/dashboard');
  // A confirmation opened on a fresh load needs no signup password in memory.
  await page.evaluate(() => localStorage.removeItem('paybypalm.session'));
  await page.goto(origin + '/auth/confirm#type=signup&refresh_token=fixture-refresh');
  await page.waitForURL('**/dashboard'); // Existing PIN is preserved; no setup loop.
  assert.equal(new URL(page.url()).hash, '');
  await page.goto(origin + '/profile');
  await page.getByRole('heading', { name: 'Keep PayByPalm on your home screen' }).waitFor();
  const help = page.getByRole('button', { name: 'How to install' });
  if (await help.count()) {
    await help.click();
    await page.getByText(/On iPhone or iPad/).waitFor();
  } else {
    await page.getByRole('button', { name: 'Install PayByPalm', exact: true }).waitFor();
  }
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.fixtureInstallPromptOpened = true; };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    dispatchEvent(event);
  });
  await page.getByRole('button', { name: 'Install PayByPalm', exact: true }).click();
  assert.equal(await page.evaluate(() => window.fixtureInstallPromptOpened), true);
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  await page.getByRole('heading', { name: 'Keep PayByPalm on your home screen' }).waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + '/login');
  await page.screenshot({ path: artifacts + '/login-desktop.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  assert.equal(manifest.errors.length, 0);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  for (const size of [192, 512]) {
    assert.equal(await page.evaluate(async size => {
      const image = new Image(); image.src = `/icons/icon-${size}.png`; await image.decode(); return image.naturalWidth;
    }, size), size);
  }
  // Private API fetches never enter the worker's cache.
  await page.evaluate(() => fetch('http://localhost:8080/me', { headers: { Authorization: 'Bearer fixture-token' } }));
  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.filter(name => name.startsWith('paybypalm-')).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat();
    return { names, urls };
  });
  assert.equal(cacheState.names.includes('paybypalm-v1'), false);
  assert.equal(cacheState.names.includes('unrelated-app-cache'), true);
  assert.equal(cacheState.urls.some(url => url.includes('localhost:8080') || /\/(me|auth|transactions|dashboard|profile)(\/|$)/.test(new URL(url).pathname)), false);
  await context.setOffline(true);
  const offline = await page.goto(origin + '/dashboard');
  assert.equal(offline.status(), 503);
  await page.getByRole('heading', { name: 'Connect to use your wallet' }).waitFor();
  await page.screenshot({ path: artifacts + '/offline-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: full signup/invalid link rejection/confirmation link/PIN flow; mobile+desktop layout; install UI; valid manifest/icons/Chromium installability; private-cache isolation; offline fallback.');
} finally { await context.close(); rmSync(profile, { recursive: true, force: true }); }
