import { expect, test, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/sound';
import type {} from './game.spec';

declare global { interface Window { __WHEEL_SOURCES__: AudioBufferSourceNode[]; } }
const audioState = (page: Page) => page.evaluate(() =>
  (window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio }).audio.diagnostics);

test('wheel audio follows a cat visit without stacking and respects pause, mute and reset', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Windows WebKit has no Web Audio.');
  // Keep this audio lifecycle check independent of the large scene/model downloads.
  await page.route('**/models/**', route => route.abort());
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__WHEEL_SOURCES__ = [];
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this); window.__WHEEL_SOURCES__.push(source); return source;
    };
  });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  const start = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'start')!);
  await page.touchscreen.tap(start.x + start.w / 2, start.y + start.h / 2);
  await expect.poll(async () => (await audioState(page)).state).toBe('running');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.phase = 'free-play'; t.game.events = [];
    const cat = t.game.cats[0]; cat.nextNeedAt = cat.decisionAt = Infinity;
    t.game.visitFurniture(cat.id, 'wheel'); t.refresh();
  });
  expect((await audioState(page)).wheel.active).toBe(false);
  await page.evaluate(() => {
    const { game } = window.__CATSLAVE_TEST__;
    for (let i = 0; i < 1000 && game.wheelSpeed < .3; i++) game.tick(.05);
  });
  await expect.poll(async () => (await audioState(page)).wheel.active).toBe(true);
  await page.waitForTimeout(200);
  const starting = await audioState(page);
  await page.evaluate(() => window.__CATSLAVE_TEST__.game.tick(1));
  await expect.poll(async () => (await audioState(page)).wheel.speed).toBe(1.25);
  await expect.poll(async () => (await audioState(page)).wheel.rate).toBeGreaterThan(.95);
  await expect.poll(async () => (await audioState(page)).wheel.gain).toBeGreaterThan(.29);
  const running = await audioState(page);
  expect(running.wheel.rate).toBeGreaterThan(starting.wheel.rate);
  expect(running.wheel.gain).toBeGreaterThan(starting.wheel.gain);
  expect(running.counts.wheel).toBe(1);
  // Check actual generated samples, not just a trigger counter.
  const texture = await page.evaluate(() => {
    const loops = window.__WHEEL_SOURCES__.filter(s => s.loop), samples = loops[0].buffer!.getChannelData(0);
    return { loops: loops.length, rms: Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length),
      seam: Math.abs(samples[0] - samples[samples.length - 1]) };
  });
  expect(texture.loops).toBe(1); expect(texture.rms).toBeGreaterThan(.05); expect(texture.seam).toBeLessThan(.1);

  await page.evaluate(() => window.__CATSLAVE_TEST__.game.pause());
  await expect.poll(async () => (await audioState(page)).voices).toBe(0);
  await page.evaluate(() => window.__CATSLAVE_TEST__.game.resume());
  await expect.poll(async () => (await audioState(page)).counts.wheel).toBe(2);
  await page.evaluate(() => {
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    audio.cycleVolume(); audio.cycleVolume();
  });
  await expect.poll(async () => (await audioState(page)).wheel.active).toBe(false);
  await page.waitForTimeout(150); expect((await audioState(page)).counts.wheel).toBe(2);
  await page.evaluate(() => (window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio }).audio.cycleVolume());
  await expect.poll(async () => (await audioState(page)).counts.wheel).toBe(3);

  await page.evaluate(() => {
    const { game } = window.__CATSLAVE_TEST__; game.interactFreeCat('wand', game.cats[0].id); game.tick(.2);
  });
  await expect.poll(async () => (await audioState(page)).wheel.speed).toBeLessThan(1.25);
  await expect.poll(async () => (await audioState(page)).wheel.rate).toBeLessThan(.9);
  await expect.poll(async () => (await audioState(page)).wheel.gain).toBeLessThan(.28);
  const braking = await audioState(page);
  expect(braking.wheel.active).toBe(true); expect(braking.wheel.rate).toBeLessThan(running.wheel.rate);
  expect(braking.wheel.gain).toBeLessThan(running.wheel.gain);
  await page.evaluate(() => window.__CATSLAVE_TEST__.game.tick(.6));
  await expect.poll(async () => (await audioState(page)).wheel.active).toBe(false);
  expect((await audioState(page)).counts.wheel).toBe(3);
  await page.evaluate(() => {
    const { game } = window.__CATSLAVE_TEST__, cat = game.cats[0];
    for (let i = 0; i < 1000 && cat.visit; i++) game.tick(.05);
    game.visitFurniture(cat.id, 'wheel');
    for (let i = 0; i < 1000 && game.wheelSpeed < 1; i++) game.tick(.05);
  });
  await expect.poll(async () => (await audioState(page)).counts.wheel).toBe(4);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.refresh(); });
  await expect.poll(async () => (await audioState(page)).voices).toBe(0);
  expect(errors).toEqual([]);
});
