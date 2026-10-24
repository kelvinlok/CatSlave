import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { EventKind } from '../../src/types';

async function setup(page: Page, kind: EventKind, live = false) {
  return page.evaluate(({ kind, live }) => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(!live); t.game.reset(true);
    t.game.events = []; const cat = t.game.cats[0];
    cat.position = { x: 0, z: 1.2 }; cat.yaw = 0; cat.decisionAt = Infinity;
    t.game.spawn(cat, kind); cat.decisionAt = Infinity;
    t.game.select(({ poop: 'sweeper', vomit: 'mop', fur: 'brush', hunger: 'food', boredom: 'toy' } as const)[kind]);
    t.refresh();
    const focus = t.world.eventPosition(t.game.events[0]); focus.y += 0.3;
    t.world.focusOn(focus); t.refresh();
    const h = t.hud.hits.find(h => h.id === `event:${t.game.events[0].id}`)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + (h.arch?.x ?? h.x + h.w / 2),
      y: r.top + (h.arch ? h.arch.y - (h.arch.outerY + h.arch.innerY) / 2 : h.y + h.h / 2), id: t.game.events[0].id,
      arch: h.arch ? { ...h.arch, x: h.arch.x + r.left, y: h.arch.y + r.top } : undefined };
  }, { kind, live });
}
async function progress(page: Page) { return page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0]?.progress ?? 1); }

test('waving inside the arch completes care with less held time than staying still', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const p = await setup(page, 'boredom');
  await page.evaluate(() => {
    const g = window.__CATSLAVE_TEST__.game, original = g.work.bind(g);
    const canvas = document.querySelector('canvas')!;
    let inMove = false;
    canvas.addEventListener('pointermove', () => { inMove = true; }, true);
    canvas.addEventListener('pointermove', () => { inMove = false; });
    const totals = { held: 0, waved: 0 };
    Object.assign(window, { wandWork: totals });
    g.work = (id, amount) => {
      const accepted = original(id, amount);
      if (accepted) totals[inMove ? 'waved' : 'held'] += amount;
      return accepted;
    };
  });
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 0; i < 60 && await progress(page) < 1; i++) {
    await page.waitForTimeout(25);
    await page.mouse.move(p.x + (i % 2 ? -16 : 16), p.y);
  }
  await expect.poll(() => progress(page), { timeout: 15000 }).toBe(1); await page.mouse.up();
  const totals = await page.evaluate(() => (window as unknown as { wandWork: { held: number; waved: number } }).wandWork);
  expect(totals.waved).toBeGreaterThan(0.3);
  // A stationary level-one wand requires three seconds of held work. Measure
  // active frame time so software-GPU stalls do not skew the comparison.
  expect(totals.held).toBeLessThan(2.7);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.tutorialDone)).toBe(true);
});
async function meshState(page: Page) {
  return page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, e = t.game.events[0];
    const mesh = t.world.scene.children.find(o => o.userData.eventId === e?.id);
    return { ...mesh?.userData };
  });
}

test('real strokes reveal distinct poop, mop and fur stages without losing interrupted work', async ({ page }, info) => {
  const folder = `artifacts/care-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  for (const kind of ['poop', 'vomit', 'fur'] as const) {
    const p = await setup(page, kind);
    await page.screenshot({ path: `${folder}/${kind}-start.png` });
    for (const [stage, goal] of [['middle', 0.38], ['late', 0.81]] as const) {
      await page.mouse.move(p.x - 20, p.y); await page.mouse.down();
      let i = 0;
      while (await progress(page) < goal && i < 25) {
        await page.mouse.move(p.x + (i++ % 2 ? -20 : 20), p.y, { steps: 4 });
      }
      expect(await progress(page)).toBeGreaterThanOrEqual(goal);
      await page.mouse.up();
      const before = await progress(page); await page.waitForTimeout(120);
      expect(await progress(page)).toBe(before);
      const visual = await meshState(page);
      expect(visual.progress).toBeCloseTo(before);
      if (kind === 'poop') expect(visual.remainingLayers).toBe(stage === 'middle' ? 2 : 1);
      if (kind === 'fur' && stage === 'late') expect(visual.gatherProgress).toBe(1);
      await page.screenshot({ path: `${folder}/${kind}-${stage}.png` });
    }
    await page.mouse.move(p.x - 20, p.y); await page.mouse.down();
    for (let i = 0; i < 8 && await progress(page) < 1; i++) await page.mouse.move(p.x + (i % 2 ? -20 : 20), p.y, { steps: 4 });
    await page.mouse.up(); expect(await progress(page)).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('held food fills the bowl, stops outside and on cancellation, then leaves a full bowl', async ({ page }, info) => {
  const folder = `artifacts/care-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const p = await setup(page, 'hunger');
  expect((await meshState(page)).kibbleCount).toBe(0);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await expect.poll(() => progress(page)).toBeGreaterThan(0.15);
  await page.mouse.move(8, 150);
  const stopped = await progress(page); expect(stopped).toBeLessThan(1);
  await page.waitForTimeout(250); expect(await progress(page)).toBe(stopped);
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => progress(page)).toBeGreaterThan(stopped + 0.1);
  await page.screenshot({ path: `${folder}/food-pouring.png` });
  await page.keyboard.press('Escape');
  const paused = await progress(page); await page.waitForTimeout(200);
  expect(await progress(page)).toBe(paused);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.carePointer)).toBeUndefined();
  await page.mouse.up(); await page.keyboard.press('Escape');
  await page.waitForTimeout(100); expect(await progress(page)).toBe(paused);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await expect.poll(() => progress(page), { timeout: 15_000 }).toBe(1); await page.mouse.up();
  const bowl = await page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(o => o.userData.eventId === id)?.userData.kibbleCount, p.id);
  expect(bowl).toBe(64);
  await page.screenshot({ path: `${folder}/food-complete.png` });
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; for (let i = 0; i < 22; i++) { t.game.tick(0.1); t.refresh(); } });
  expect(await page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.some(o => o.userData.eventId === id), p.id)).toBe(false);
});

test('held standalone wand draws the cat into repeated reaches inside the arch and stops outside', async ({ browser, baseURL }, info) => {
  const folder = `artifacts/care-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, baseURL, hasTouch: false, isMobile: false,
    recordVideo: { dir: `${folder}/video`, size: { width: 1280, height: 800 } } });
  const page = await context.newPage(), video = page.video()!, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    let p = await setup(page, 'boredom', true);
    const camera = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray());
    const samples = [];
    expect(await page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.some(o => o.userData.eventId === id), p.id)).toBe(false);
    for (const side of [-1, 1]) {
      await page.mouse.move(p.arch!.x + side * p.arch!.outerX * 0.72, p.arch!.y - p.arch!.outerY * 0.45); await page.mouse.down();
      await page.waitForTimeout(350);
      samples.push(await page.evaluate(() => {
        const t = window.__CATSLAVE_TEST__, cat = t.world.scene.children.find(o => o.userData.catId === t.game.cats[0].id)!;
        return { yaw: cat.getObjectByName('head')!.rotation.y, focus: t.world.carePointer!.focus.toArray(), progress: t.game.events[0].progress };
      }));
      await page.screenshot({ path: `${folder}/wand-${samples.length}.png` });
      await page.mouse.up();
    }
    expect(samples[0].yaw).toBeLessThan(-0.1); expect(samples[1].yaw).toBeGreaterThan(0.1);
    // Capturing a software-rendered frame can consume the entire short play
    // session. Use a fresh need for the separate interruption assertions.
    p = await setup(page, 'boredom', true);
    const released = await progress(page); await page.waitForTimeout(150); expect(await progress(page)).toBe(released);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await expect.poll(() => progress(page), { intervals: [50] }).toBeGreaterThan(released + 0.03);
    await page.mouse.move(p.arch!.x, p.arch!.y + 40); const outside = await progress(page);
    await page.waitForTimeout(200); expect(await progress(page)).toBe(outside);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray())).toEqual(camera);
    await page.keyboard.press('Escape');
    const clock = await page.evaluate(() => window.__CATSLAVE_TEST__.game.clock);
    await page.waitForTimeout(250); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.clock)).toBe(clock);
    await page.mouse.up(); expect(errors).toEqual([]);
    await writeFile(`${folder}/wand-results.json`, JSON.stringify({ samples, errors }, null, 2));
  } finally { await context.close(); await video.saveAs(`${folder}/wand-motion.webm`); }
});

test('mobile play arch accepts a stationary hold and leaves the face and floor clear', async ({ page }, info) => {
  const folder = `artifacts/care-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  // Holding still uses real pointer/frame time even with the simulation clock frozen.
  // Keep screenshot stalls on software GPUs from triggering the interruption pause.
  const p = await setup(page, 'boredom');
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, event = t.game.events[0], arch = t.world.playArea(event);
    return t.hud.careHit(event.id, { x: arch.x, y: arch.y }) || t.hud.careHit(event.id, { x: arch.x, y: arch.y + 70 });
  })).toBe(false);
  await page.screenshot({ path: `${folder}/wand-arch-ready.png` });
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await expect.poll(() => progress(page), { intervals: [50] }).toBeGreaterThan(0.12);
  await page.screenshot({ path: `${folder}/wand-arch-held.png` });
  await expect.poll(() => progress(page), { timeout: 15000 }).toBe(1); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.tutorialDone)).toBe(true);
});
