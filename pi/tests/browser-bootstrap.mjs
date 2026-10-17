// Optional integration check: run with Playwright available in NODE_PATH.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = mkdtempSync(join(tmpdir(), 'pbp-bootstrap-test-'));
const key = 'pbp_' + 'a'.repeat(64); // Test fixture only.
const server = createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<script>window.keyAtFirstScript = sessionStorage.getItem('paybypalm.terminalKey');</script>`);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = join(root, 'terminal.env');
  const extension = join(root, 'extension');
  mkdirSync(extension, { mode: 0o700 });
  writeFileSync(config, `KIOSK_URL=${origin}/terminal\nTERMINAL_KEY=${key}\n`, { mode: 0o600 });
  const output = execFileSync('python3', [resolve('pi/prepare-kiosk.py'), '--config', config, '--extension-dir', extension], { encoding: 'utf8' });
  assert.equal(output.trim(), origin + '/terminal');
  assert.equal(output.includes(key), false);
  browser = await chromium.launchPersistentContext(join(root, 'profile'), {
    channel: 'chromium', headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const page = await browser.newPage();
  await page.goto(origin + '/terminal');
  assert.equal(await page.evaluate(() => window.keyAtFirstScript), key, 'key must exist before the first application script');
  await page.reload();
  assert.equal(await page.evaluate(() => window.keyAtFirstScript), key);
  for (const path of ['/login', '/terminal-extra']) {
    const other = await browser.newPage();
    await other.goto(origin + path);
    assert.equal(await other.evaluate(() => window.keyAtFirstScript), null, 'fresh unrelated tabs must not receive the key');
    await other.close();
  }
  assert.equal(page.url(), origin + '/terminal');
  assert.equal(await page.evaluate(() => localStorage.getItem('paybypalm.terminalKey')), null);
  console.log('Chromium: key injected before first app script; reload succeeds; unrelated routes untouched; URL and localStorage contain no key.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
