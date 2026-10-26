import { expect, test, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/sound';
import type { ToolId } from '../../src/types';
import type {} from './game.spec';

async function click(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === id), id)).toBe(true);
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!, id);
  expect(hit, id).toBeTruthy();
  await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
}
const diagnostics = (page: Page) => page.evaluate(() => (window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio }).audio.diagnostics);

declare global {
  interface Window { __AUDIO_TOUCH_GATE__: { contexts: number; resumeAttempts: number; interrupt(): Promise<void> }; }
}

test('touch release unlocks audio and the next tap recovers an interrupted context', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Exercise Safari activation rules with real Web Audio in Chromium; Windows WebKit has no Web Audio.');
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    let touchRelease = false;
    let forcedState: 'suspended' | 'interrupted' | undefined = 'suspended';
    let current: AudioContext;
    // Only the native touchend dispatch permits resume, even if pointerdown's
    // attempt was rejected. This reproduces stricter mobile activation behavior.
    document.addEventListener('touchend', () => { touchRelease = true; }, true);
    document.addEventListener('touchend', () => { touchRelease = false; });
    window.__AUDIO_TOUCH_GATE__ = { contexts: 0, resumeAttempts: 0,
      async interrupt() { await current.suspend(); forcedState = 'interrupted'; } };
    window.AudioContext = class extends NativeAudioContext {
      constructor() { super(); current = this; window.__AUDIO_TOUCH_GATE__.contexts++; }
      get state() { return forcedState ?? super.state; }
      resume() {
        window.__AUDIO_TOUCH_GATE__.resumeAttempts++;
        if (!touchRelease) return Promise.reject(new DOMException('Touch release required', 'NotAllowedError'));
        forcedState = undefined;
        return super.resume();
      }
    };
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  const tap = async (id: string) => {
    await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.some(hit => hit.id === id), id)).toBe(true);
    const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(hit => hit.id === id)!, id);
    await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
  };
  await tap('start');
  await expect.poll(async () => (await diagnostics(page)).state).toBe('running');
  await expect.poll(async () => (await diagnostics(page)).loaded).toBe(5);
  await tap('tool:food');
  expect((await diagnostics(page)).counts.select).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await window.__AUDIO_TOUCH_GATE__.interrupt();
    window.dispatchEvent(new Event('blur'));
  });
  expect((await diagnostics(page)).state).toBe('interrupted');
  await tap('resume');
  await expect.poll(async () => (await diagnostics(page)).state).toBe('running');
  const played = (await diagnostics(page)).played;
  await tap('tool:brush');
  expect((await diagnostics(page)).played).toBeGreaterThan(played);
  // Vacuum completes on pointerup, before a stricter browser permits audio at
  // touchend. The one-shot must survive that short activation boundary.
  const mess = await page.evaluate(async () => {
    const t = window.__CATSLAVE_TEST__;
    t.game.events = []; Object.assign(t.game.levels, { sweeper: 3, mop: 3, brush: 3 });
    t.game.select('vacuum'); t.game.spawn(t.game.cats[0], 'poop'); t.refresh();
    t.world.focusOn(t.world.eventPosition(t.game.events[0])); t.refresh();
    const hit = t.hud.hits.find(hit => hit.eventId === t.game.events[0].id)!;
    await window.__AUDIO_TOUCH_GATE__.interrupt();
    return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2 };
  });
  await page.touchscreen.tap(mess.x, mess.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events.length)).toBe(0);
  await expect.poll(async () => (await diagnostics(page)).counts.vacuum ?? 0).toBe(1);
  await page.evaluate(async () => {
    await window.__AUDIO_TOUCH_GATE__.interrupt();
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    audio.play('vacuum'); audio.stop();
  });
  await tap('tool:food');
  await expect.poll(async () => (await diagnostics(page)).state).toBe('running');
  expect((await diagnostics(page)).counts.vacuum).toBe(1); // Cleared sounds must never replay on resume.
  expect(await page.evaluate(() => window.__AUDIO_TOUCH_GATE__.contexts)).toBe(1);
  expect(errors).toEqual([]);
});

test('audio unlocks, decodes all free assets, plays tools, and cleans up on pause and mute', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  test.skip(!await page.evaluate(() => typeof AudioContext !== 'undefined'), 'This browser build has no Web Audio (Windows Playwright WebKit).');
  expect((await diagnostics(page)).state).toBe('locked');
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await click(page, 'start');
  await expect.poll(async () => (await diagnostics(page)).loaded).toBe(5);
  expect((await diagnostics(page)).failed).toBe(0);
  expect((await diagnostics(page)).state).toBe('running');
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  for (const tool of ['sweeper', 'mop', 'brush', 'food', 'toy', 'vacuum'] as ToolId[]) {
    await page.evaluate(tool => {
      const { game, world, refresh } = window.__CATSLAVE_TEST__;
      game.reset(); const cat = game.cats[0]; cat.decisionAt = cat.nextNeedAt = Infinity;
      if (tool === 'vacuum') game.levels.sweeper = game.levels.mop = game.levels.brush = 3;
      game.spawn(cat, game.availableTools.find(t => t.id === tool)!.need);
      world.resetView(); refresh();
    }, tool);
    await click(page, `tool:${tool}`);
    const hit = await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.refresh(); return t.hud.hits.find(h => h.eventId !== undefined)!; });
    expect(hit).toBeTruthy();
    const x = hit.arch?.x ?? hit.x + hit.w / 2;
    const y = hit.arch ? hit.arch.y - (hit.arch.outerY + hit.arch.innerY) / 2 : hit.y + hit.h * .6;
    await page.mouse.move(x, y); await page.mouse.down();
    if (['sweeper', 'mop', 'brush'].includes(tool)) {
      for (let n = 0; n < 4; n++) await page.mouse.move(x + (n % 2 ? -15 : 15), y, { steps: 3 });
    } else if (tool !== 'vacuum') {
      await expect.poll(async () => (await diagnostics(page)).counts[tool] ?? 0).toBeGreaterThan(0);
    }
    await page.mouse.up();
    await expect.poll(async () => (await diagnostics(page)).counts[tool] ?? 0).toBeGreaterThan(0);
  }
  await click(page, 'pause');
  await expect.poll(async () => (await diagnostics(page)).voices).toBe(0);
  await click(page, 'resume');
  await page.evaluate(() => { (window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio }).audio.play('vacuum'); });
  await expect.poll(async () => (await diagnostics(page)).voices).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await diagnostics(page)).voices).toBe(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  await click(page, 'sound'); // soft
  await expect.poll(async () => (await diagnostics(page)).volume).toBe(.3);
  await click(page, 'sound'); // off
  expect((await diagnostics(page)).volume).toBe(0);
  await click(page, 'resume');
  const count = (await diagnostics(page)).played;
  await page.keyboard.press('1');
  expect((await diagnostics(page)).played).toBe(count);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  expect((await diagnostics(page)).volume).toBe(0);
  expect(errors).toEqual([]);
});

test('purr ends within a second, shares a cooldown across cats and pats, and survives cleanup', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  test.skip(!await page.evaluate(() => typeof AudioContext !== 'undefined'), 'This browser build has no Web Audio.');
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await click(page, 'start');
  await expect.poll(async () => (await diagnostics(page)).loaded).toBe(5);
  const counts = await page.evaluate(() => {
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    audio.play('purr', undefined, 'purr:cat-one');
    const first = audio.diagnostics.counts.purr;
    audio.play('purr', undefined, 'purr:cat-two'); audio.play('purr');
    return { first, after: audio.diagnostics.counts.purr };
  });
  expect(counts).toEqual({ first: 1, after: 1 });
  await expect.poll(async () => (await diagnostics(page)).voices, { timeout: 1000, intervals: [50] }).toBe(0);
  await page.evaluate(() => {
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    audio.stop(); audio.play('purr', undefined, 'purr:cat-three');
  });
  expect((await diagnostics(page)).counts.purr).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    audio.play('purr'); return audio.diagnostics.counts.purr;
  }), { timeout: 12_000, intervals: [500] }).toBe(2);
});

test('missing recordings fall back without blocking gameplay', async ({ page }) => {
  await page.route('**/audio/*.wav', route => route.abort());
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  test.skip(!await page.evaluate(() => typeof AudioContext !== 'undefined'), 'This browser build has no Web Audio (Windows Playwright WebKit).');
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await click(page, 'start');
  await expect.poll(async () => (await diagnostics(page)).failed).toBe(5);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.setManualClock(true); t.game.events = []; t.game.spawn(t.game.cats[0], 'hunger'); t.refresh();
  });
  await expect.poll(async () => (await diagnostics(page)).counts.meow ?? 0).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.active)).toBe(true);
});

test('browsers without Web Audio can still play and change the saved sound preference', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await click(page, 'sound');
  await click(page, 'start');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.active)).toBe(true);
  await click(page, 'pause'); await click(page, 'sound');
  expect((await diagnostics(page)).volume).toBe(0);
  expect(errors).toEqual([]);
});
