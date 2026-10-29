// npm run build && node scripts/measure-startup.mjs dist [baseline-dist]
// Optional CHROMIUM_EXECUTABLE_PATH supports a locally installed Chromium.
import { chromium, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const builds = process.argv.slice(2);
if (!builds.length) throw new Error('Pass a production build directory, optionally followed by a baseline build.');
const files = new Map();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' };
// Prepare responses before timing; serve compressed text and unchanged GLBs.
for (const [index, directory] of builds.entries()) {
  const root = resolve(directory);
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = resolve(entry.parentPath, entry.name), extension = extname(file);
    const compressed = ['.html', '.css', '.js'].includes(extension);
    const body = readFileSync(file);
    files.set(`/${index}/${relative(root, file).split(sep).join('/')}`, { body: compressed ? gzipSync(body) : body,
      headers: { 'Content-Type': types[extension] ?? 'application/octet-stream',
        'Cache-Control': 'no-store', ...(compressed ? { 'Content-Encoding': 'gzip' } : {}) } });
  }
}
const server = createServer((request, response) => {
  let url = new URL(request.url, 'http://localhost').pathname;
  if (url.endsWith('/')) url += 'index.html';
  const file = files.get(url);
  if (!file) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { ...file.headers, 'Content-Length': file.body.length }); response.end(file.body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  for (const mbps of [1.6, 10]) for (const [index, directory] of builds.entries()) {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    const requests = new Map(), warnings = [], errors = [];
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text().split('\n')[0]); });
    page.on('pageerror', error => errors.push(error.message));
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
      downloadThroughput: mbps * 1_000_000 / 8, uploadThroughput: 750_000 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    cdp.on('Network.requestWillBeSent', event => {
      if (/\.glb(?:\.gz)?$/.test(event.request.url)) requests.set(event.requestId, { model: event.request.url.split('/').pop(), status: 'pending' });
    });
    cdp.on('Network.loadingFinished', event => { const request = requests.get(event.requestId); if (request) request.status = 'finished'; });
    cdp.on('Network.loadingFailed', event => { const request = requests.get(event.requestId); if (request) request.status = event.errorText; });
    await page.addInitScript(() => {
      let scheduled = false;
      for (const method of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[method];
        WebGL2RenderingContext.prototype[method] = function (...args) {
          const result = original.apply(this, args);
          if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(() => { window.__firstGameFrame = performance.now(); });
          }
          return result;
        };
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/${index}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__firstGameFrame !== undefined, undefined, { timeout: 60000 });
    const firstFrameMs = await page.evaluate(() => window.__firstGameFrame);
    // Observe the requested assets through success or the existing 15s timeout.
    const deadline = Date.now() + 20000;
    while ((!requests.size || [...requests.values()].some(request => request.status === 'pending')) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const result = { build: directory, mbps, latencyMs: 150, cpuSlowdown: 4, firstFrameMs,
      models: [...requests.values()], warnings, errors };
    results.push(result); console.log(JSON.stringify(result)); await context.close();
  }
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/startup-measurements.json', JSON.stringify({ browser: browser.version(), results }, null, 2) + '\n');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
