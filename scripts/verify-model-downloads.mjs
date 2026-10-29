// Build first: npm run build && node scripts/verify-model-downloads.mjs
// Uses the production transport with test-only state inspection in a separate build.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { chromium, webkit, devices } from '@playwright/test';

const output = 'artifacts/download-optimization';
await build({ mode: 'test', build: { outDir: `${output}/test-build` } });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const prefix = url.pathname.startsWith('/production/') ? '/production/' : '/catslave/';
  const root = path.resolve(prefix === '/production/' ? 'dist' : `${output}/test-build`);
  const file = path.resolve(root, url.pathname.slice(prefix.length) || 'index.html');
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    // Deliberately no Content-Encoding: the deployed file must work on a plain static host.
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const names = ['Choco', 'Latte', '的的', '小塞', 'Yelo', 'Miller', 'Momo', '震震子', '丁丁'];
const models = (await readdir('public/models')).filter(name => name.endsWith('.glb'));
const reports = [];
try {
  for (const [name, engine, options] of [
    ['desktop-chromium', chromium, { viewport: { width: 800, height: 1000 }, hasTouch: true }],
    ['mobile-webkit', webkit, devices['iPhone 13']],
  ]) {
    const browser = await engine.launch(name.includes('chromium') ? {
      args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    } : {});
    try {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (/could not load|error/i.test(message.text())) errors.push(message.text());
      });
      page.on('request', request => { if (/\.glb(?:\.gz)?$/.test(request.url())) requests.push(request.url()); });
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.addInitScript(names => localStorage.setItem('catslave-free-play', JSON.stringify(names.slice(0, 5))), names);
      await page.goto(`${origin}/catslave/`);
      await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
      // Expand the normal five-cat save to exercise every asset in one fixture.
      await page.evaluate(names => {
        const t = window.__CATSLAVE_TEST__;
        t.setManualClock(true); t.game.freePlayRoster = names; t.refresh();
      }, names);
      await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.controls.some(c => c.id === 'free-play'));
      const control = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(c => c.id === 'free-play'));
      assert.ok(control, 'Saved roster unlocks free play');
      await page.touchscreen.tap(control.x + control.w / 2, control.y + control.h / 2);
      await page.waitForFunction(() => {
        const t = window.__CATSLAVE_TEST__;
        return t.game.cats.length === 9 && t.game.cats.every(cat =>
          t.world.scene.children.find(root => root.userData.catId === cat.id)?.userData.modelRig === 'blender-armature');
      }, undefined, { timeout: 120000 });
      const report = await page.evaluate(() => {
        const t = window.__CATSLAVE_TEST__;
        return { phase: t.game.phase, cats: t.game.cats.length, ...t.stats() };
      });
      assert.equal(report.phase, 'free-play');
      assert.ok(report.triangles > 0);
      assert.equal(requests.length, 9, 'Exactly one download per model');
      assert.ok(requests.every(url => url.endsWith('.glb.gz')));
      const wand = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(c => c.id === 'free-mode:wand'));
      await page.touchscreen.tap(wand.x + wand.w / 2, wand.y + wand.h / 2);
      assert.equal(await page.evaluate(() => window.__CATSLAVE_TEST__.game.freeInteraction), 'wand');
      await page.screenshot({ path: `${output}/${name}.png` });
      // Verify the browser's native decoder too, against every original GLB's SHA-256.
      for (const model of models) {
        const expected = createHash('sha256').update(await readFile(`public/models/${model}`)).digest('hex');
        const actual = await page.evaluate(async model => {
          const response = await fetch(`models/${model}.gz`);
          const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
          const hash = await crypto.subtle.digest('SHA-256', buffer);
          return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
        }, model);
        assert.equal(actual, expected, `${name}: ${model} decoded byte-for-byte`);
      }
      // Also open the actual release bundle, which must contain no test hooks.
      await page.goto(`${origin}/production/`);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => typeof window.__CATSLAVE_TEST__), 'undefined');
      assert.equal(await page.locator('#game').count(), 1);
      await page.screenshot({ path: `${output}/${name}-production.png` });
      assert.deepEqual(errors, []);
      reports.push({ browser: name, ...report, byteExactModels: models.length, errors });
      console.log(JSON.stringify(reports.at(-1)));
    } finally { await browser.close(); }
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/browser-report.json`, JSON.stringify(reports, null, 2) + '\n');
} finally { await new Promise(resolve => server.close(resolve)); }
