// Optional test against Tencent's deployed reader. Synthetic camera, invalid
// token, all external writes blocked. No palm data, registrations or payments.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, mkdirSync} from 'node:fs';
import ts from 'typescript';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const compiled = ts.transpileModule(readFileSync(new URL('../src/terminal/palmSdk.ts', import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
const artifacts = '/tmp/paybypalm-sdk-camera'; mkdirSync(artifacts, {recursive: true});
try {
  for (const scenario of [
    {name: 'pi-touch', viewport: {width: 800, height: 480}, hasTouch: true, expectedWidth: 360},
    {name: 'desktop', viewport: {width: 1280, height: 720}, hasTouch: false, expectedWidth: 1280},
    {name: 'phone', viewport: {width: 390, height: 844}, hasTouch: true, expectedWidth: 390},
  ]) {
    const context = await browser.newContext({viewport: scenario.viewport, hasTouch: scenario.hasTouch, permissions: ['camera']});
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url() === 'https://terminal.example.test/') return route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Reader camera smoke test</title>'});
      if (!['GET', 'HEAD'].includes(request.method())) return route.fulfill({status: 200, json: {code: 1000001, message: 'External writes disabled in camera smoke test', data: {}}});
      return route.continue();
    });
    const page = await context.newPage();
    let opened = 0;
    await page.exposeFunction('recordCameraOpened', () => { opened++; });
    await page.addInitScript(() => {
      const original = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
      if (original) navigator.mediaDevices.getUserMedia = async constraints => {
        const stream = await original(constraints);
        window.recordCameraOpened();
        return stream;
      };
    });
    await page.goto('https://terminal.example.test/');
    await page.addScriptTag({content: 'window.exports = {};\n' + compiled});
    await page.evaluate(() => {
      window.captureAbort = new AbortController();
      window.captureFinished = window.exports.capturePalmSdk({
        captureMode: 'h5', captureId: 'camera-smoke', userId: 'capture_camera_smoke',
        token: 'sut_invalid_camera_smoke', expiresAt: new Date(Date.now() + 60000).toISOString(),
        loaderUrl: window.exports.PALM_SDK_LOADER,
      }, window.captureAbort.signal).catch(() => {});
    });
    const reader = page.frameLocator('iframe[src="https://open.palmoa.youtu.qq.com/palm/x/jssdk/embed/"]');
    await reader.locator('video').waitFor({timeout: 30000});
    await reader.locator('video').evaluate(video => new Promise((resolve, reject) => {
      if (video.readyState >= 2) return resolve();
      const timer = setTimeout(() => reject(new Error('Camera preview did not start')), 15000);
      video.addEventListener('loadeddata', () => {clearTimeout(timer); resolve();}, {once: true});
    }));
    const viewport = await reader.locator('body').evaluate(() => ({width: innerWidth, height: innerHeight}));
    assert.equal(viewport.width, scenario.expectedWidth);
    assert.equal(viewport.height, scenario.viewport.height);
    assert.ok(opened > 0, 'real SDK must open the synthetic camera');
    const foreign = await page.evaluate(() => {
      const frame = document.createElement('iframe'); frame.src = 'about:blank'; frame.style.width = '123px';
      document.body.appendChild(frame); return getComputedStyle(frame).width;
    });
    assert.equal(foreign, '123px', 'viewport adapter must not change unrelated frames');
    await page.screenshot({path: `${artifacts}/${scenario.name}.png`});
    await page.evaluate(async () => {window.captureAbort.abort(); await window.captureFinished;});
    assert.equal(await page.locator('[data-palm-reader-backdrop]').count(), 0);
    console.log(`PASS: ${scenario.name}: real Tencent SDK opened a synthetic camera; reader viewport ${viewport.width}x${viewport.height}; cleanup complete.`);
    await context.close();
  }
  console.log('Camera/viewport test only. CSI hardware, valid-token WASM initialization, liveness, matching and Pi performance remain unverified.');
} finally { await browser.close(); }
