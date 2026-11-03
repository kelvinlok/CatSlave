// Minified production code with inspection hooks; hardware/driver reported with results.
// node scripts/profile-frames.mjs baseline|optimized
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const label = process.argv[2] ?? 'current';
const output = `artifacts/frame-performance/${label}`;
await mkdir(output, { recursive: true });
if (!process.argv.includes('--reuse')) await build({ mode: 'test', build: { outDir: `${output}/build` }, logLevel: 'warn' });
const server = await preview({ build: { outDir: `${output}/build` }, preview: { host: '127.0.0.1', port: 5189, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
  console.log('Browser ready; loading all five resident models and the lounge.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/could not load/.test(message.text())) errors.push(message.text()); });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => raf.call(window, time => {
      if (!window.__suspendFrames) cb(window.__frozenFrameTime ?? time);
    });
    localStorage.setItem('catslave-free-play', JSON.stringify(['Choco', 'Latte', '的的', 'Miller', 'Momo']));
  });
  await page.goto('http://127.0.0.1:5189/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    t.game.startFreePlay(); t.refresh();
  });
  await page.waitForFunction(() => {
    const t = window.__CATSLAVE_TEST__;
    return t.world.scene.getObjectByName('video-lounge')?.userData.loaded && t.game.cats.every(cat =>
      t.world.scene.children.find(root => root.userData.catId === cat.id)?.userData.modelRig === 'blender-armature');
  }, undefined, { timeout: 120000 });
  console.log('Assets ready; sampling frames.');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.world.lighting.update(new Date(2026, 10, 4, 12).getTime());
    t.world.lighting.update = () => {};
    window.__profile = { world: [], hud: [], frames: [], uploads: 0 };
    for (const [name, object, method] of [['world', t.world, 'update'], ['hud', t.hud, 'draw']]) {
      const original = object[method];
      object[method] = function (...args) {
        const before = performance.now(), version = t.hud.texture.version;
        const result = original.apply(this, args);
        window.__profile[name].push(performance.now() - before);
        if (name === 'hud' && version !== t.hud.texture.version) window.__profile.uploads++;
        return result;
      };
    }
    let last;
    function frame(now) {
      if (last !== undefined) window.__profile.frames.push(now - last);
      last = now; requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  // Isolate CPU update cost from GPU/compositor scheduling and other desktop apps.
  await page.evaluate(() => { window.__suspendFrames = true; });
  await page.waitForTimeout(300);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  await page.evaluate(() => { const p = window.__profile; p.world = []; p.hud = []; p.frames = []; p.uploads = 0; });
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (let i = 0; i < 240; i++) {
      t.world.update(t.game, 1 / 60, 10, 0); t.hud.draw(t.game, t.world, 1 / 60);
    }
  });
  const { profile } = await cdp.send('Profiler.stop');
  const result = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, gl = document.querySelector('#game').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const summarize = values => {
      values.sort((a,b) => a-b);
      return { count: values.length, median: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) };
    };
    const p = window.__profile;
    const picks = [], hits = [], v = t.world.viewport;
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      hits.push(t.world.wheelHit({ x: v.x + (i % 10 + .5) / 10 * v.w, y: v.y + (Math.floor(i / 10) + .5) / 10 * v.h }));
      picks.push(performance.now() - start);
    }
    return { measurement: '240 synchronous CPU updates, no GPU frame-rate claim', gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), stats: t.stats(), uploads: p.uploads,
      world: summarize(p.world), hud: summarize(p.hud), wheelPicking: summarize(picks), wheelHits: hits };
  });
  const counts = new Map(); for (const id of profile.samples) counts.set(id, (counts.get(id) ?? 0) + 1);
  result.cpu = profile.nodes.map(n => ({ function: n.callFrame.functionName, samples: counts.get(n.id) ?? 0 }))
    .sort((a,b) => b.samples-a.samples).slice(0, 25);
  result.errors = errors;
  await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2));
  await writeFile(`${output}/cpu.json`, JSON.stringify(profile));
  console.log(JSON.stringify(result, null, 2));
  await page.evaluate(() => { window.__frozenFrameTime = 10000; window.__CATSLAVE_TEST__.refresh(); });
  await page.waitForTimeout(300);
  const png = await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame());
  await writeFile(`${output}/free-play.png`, Buffer.from(png.split(',')[1], 'base64'));
  const titleUploads = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.phase = 'title'; t.refresh();
    const version = t.hud.texture.version;
    for (let i = 0; i < 120; i++) t.hud.draw(t.game, t.world, 1 / 60);
    return t.hud.texture.version - version;
  });
  result.titleUploadsOver120Frames = titleUploads;
  await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2));
  console.log({ titleUploadsOver120Frames: titleUploads });
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
