import { expect, test, type Page } from '@playwright/test';

async function point(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id && !h.disabled), id), { message: `Enabled canvas control ${id}` }).toBe(true);
  return page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, id);
}
async function tap(page: Page, id: string, touch = false) {
  const p = await point(page, id);
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
async function tick(page: Page, seconds: number) {
  await page.evaluate(seconds => { const t = window.__CATSLAVE_TEST__; t.game.tick(seconds); t.refresh(); }, seconds);
}
async function setup(page: Page, direct = true) {
  await page.goto(direct ? '/?minigame=pawdicure' : '/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  if (!direct) await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.startPawdicurePractice(); t.refresh(); });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus?.id)).toBe('pawdicure');
}
async function chooseAndStart(page: Page, touch = false) {
  const id = await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[1].id);
  await tap(page, `paw-cat:${id}`, touch);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.selectedCatId)).toBe(id);
  await tap(page, 'bonus-start', touch); await tick(page, 2.9);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('countdown');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.aim)).toBe(0);
  await tick(page, 0.1);
}
async function awaitWindow(page: Page) {
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, paw = t.game.bonus!.paw!;
    for (let step = 0; step < 4000 && t.game.bonus!.status === 'playing'; step++) {
      if (paw.canSnip && Math.abs(paw.aim - (paw.safeStart + paw.safeEnd) / 2) < (paw.safeEnd - paw.safeStart) * 0.12) {
        t.refresh(); return;
      }
      t.game.tick(0.02);
    }
    throw new Error('No playable snip window before timeout');
  });
}
async function trimmed(page: Page) { return page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.totalTrimmed); }

test('pawdicure: main menu has no standalone mini-game entry', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === 'pawdicure-practice'))).toBe(false);
});

test('pawdicure: tap the paw under the timing ring, show contact feedback, complete all claws and retry', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await setup(page, false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.selectedCatId)).toBeUndefined();
  await page.screenshot({ path: `artifacts/pawdicure/selection-${info.project.name}.png` });
  await chooseAndStart(page, true);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'paw-clip')?.label)).toBe('Tap paw to snip');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === 'paw-cancel' || h.id.startsWith('paw-toe:')))).toBe(false);
  const outside = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, r = document.querySelector('canvas')!.getBoundingClientRect(), v = t.world.viewport;
    return [{ x: r.left + v.x + 4, y: r.top + v.y + 4 }, { x: r.left + t.hud.width / 2, y: r.top + t.hud.height - 24 }];
  });
  for (const p of outside) await page.touchscreen.tap(p.x, p.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.lastSnip)).toBeUndefined();
  const firstZone = await page.evaluate(() => { const p = window.__CATSLAVE_TEST__.game.bonus!.paw!; return [p.safeStart, p.safeEnd]; });
  await tap(page, 'paw-clip', true); // At the left endpoint, safely outside every generated zone.
  expect(await trimmed(page)).toBe(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.recovery)).toBeGreaterThan(0);
  expect(await page.evaluate(() => { const p = window.__CATSLAVE_TEST__.game.bonus!.paw!; return [p.safeStart, p.safeEnd]; })).toEqual(firstZone);
  await tick(page, 0.1);
  await page.screenshot({ path: `artifacts/pawdicure/ring-miss-${info.project.name}.png` });
  const zones: number[][] = [];
  for (let claw = 0; claw < 18; claw++) {
    await awaitWindow(page);
    zones.push(await page.evaluate(() => { const p = window.__CATSLAVE_TEST__.game.bonus!.paw!; return [p.safeStart, p.safeEnd]; }));
    if (claw === 0) {
      await page.screenshot({ path: `artifacts/pawdicure/active-${info.project.name}.png` });
      const p = await point(page, 'paw-clip'); await page.mouse.move(p.x, p.y); await page.mouse.down();
      expect(await trimmed(page)).toBe(1); // Press, not release, is the decision.
      await tick(page, 0.1);
      await page.screenshot({ path: `artifacts/pawdicure/ring-snip-${info.project.name}.png` });
      await tick(page, 0.2);
      await page.screenshot({ path: `artifacts/pawdicure/ring-next-${info.project.name}.png` });
      await tick(page, 2.3); expect(await trimmed(page)).toBe(1);
      await page.mouse.up(); expect(await trimmed(page)).toBe(1);
    } else await tap(page, 'paw-clip', claw % 2 === 0);
    expect(await trimmed(page)).toBe(claw + 1);
  }
  expect(new Set(zones.map(zone => zone.join(','))).size).toBeGreaterThan(12);
  expect(await page.evaluate(() => {
    const g = window.__CATSLAVE_TEST__.game;
    return { won: g.bonus!.won, status: g.bonus!.status, hp: g.hp, picks: g.upgradesRemaining, paws: g.bonus!.paw!.trimmed.map(p => p.every(Boolean)) };
  })).toEqual({ won: true, status: 'result', hp: 100, picks: 0, paws: [true, true,true,true] });
  const finished = await page.evaluate(() => { const b = window.__CATSLAVE_TEST__.game.bonus!; return { elapsed: b.elapsed, clock: b.paw!.clock }; });
  await tick(page, 0.1);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.snipAge)).toBeCloseTo(0.1);
  expect(await page.evaluate(() => { const b = window.__CATSLAVE_TEST__.game.bonus!; return { elapsed: b.elapsed, clock: b.paw!.clock }; })).toEqual(finished);
  await page.screenshot({ path: `artifacts/pawdicure/complete-${info.project.name}.png` });
  await tap(page, 'pawdicure-practice');
  expect(await trimmed(page)).toBe(0); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('intro');
  expect(errors).toEqual([]);
});

test('pawdicure: autonomous sweep freezes on interruption, keyboard snips once, timeout returns home', async ({ page }, info) => {
  await setup(page); await chooseAndStart(page);
  const first = await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.aim);
  await tick(page, 0.5);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.aim)).not.toBe(first);
  expect(await trimmed(page)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const frozen = await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return [g.bonus!.elapsed, g.bonus!.paw!.aim]; });
  await tick(page, 10);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  expect(await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return [g.bonus!.elapsed, g.bonus!.paw!.aim]; })).toEqual(frozen);
  await tap(page, 'resume'); await awaitWindow(page);
  await page.keyboard.down('Space'); expect(await trimmed(page)).toBe(1);
  await page.keyboard.up('Space');
  await tick(page, 0.1); await tap(page, 'pause');
  const effectAge = await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.snipAge);
  await tick(page, 5);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.paw!.snipAge)).toBe(effectAge);
  await tap(page, 'resume');
  await page.keyboard.down('Space'); // Recovery blocks a second press.
  await tick(page, 2.6); await page.keyboard.down('Space'); expect(await trimmed(page)).toBe(1);
  await page.keyboard.up('Space'); expect(await trimmed(page)).toBe(1);
  await tick(page, 60);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.won)).toBe(false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('result');
  await page.screenshot({ path: `artifacts/pawdicure/timeout-${info.project.name}.png` });
  await tap(page, 'bonus-continue'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
});

test('pawdicure: paw tap area and every toe timing ring fit short phones, safe areas and desktop', async ({ browser, baseURL }, info) => {
  for (const [name, width, height, touch, safeTop, safeBottom] of [
    ['short',320,568,true,0,0], ['safe',390,844,true,47,34], ['desktop',1280,800,false,0,0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width,height },hasTouch:touch,isMobile:touch,baseURL });
    const page = await context.newPage(); await setup(page);
    await page.evaluate(({safeTop,safeBottom}) => { const t=window.__CATSLAVE_TEST__; t.hud.resize(t.hud.width,t.hud.height,safeTop,safeBottom); t.refresh(); }, {safeTop,safeBottom});
    await chooseAndStart(page);
    const layout = await page.evaluate(() => {
      const t=window.__CATSLAVE_TEST__;
      return { width:t.hud.width,height:t.hud.height,room:t.world.viewport,hits:t.hud.hits.filter(h=>h.id==='paw-clip'||h.id==='pause'), toes:[0,1,2,3,4].map(i=>t.world.pawClawTarget(i)) };
    });
    expect(layout.hits).toHaveLength(2);
    for (const h of layout.hits) {
      expect(h.w).toBeGreaterThanOrEqual(44); expect(h.h).toBeGreaterThanOrEqual(44);
      expect(h.x).toBeGreaterThanOrEqual(0); expect(h.x+h.w).toBeLessThanOrEqual(layout.width);
      expect(h.y).toBeGreaterThanOrEqual(safeTop); expect(h.y+h.h).toBeLessThanOrEqual(layout.height-safeBottom);
    }
    for (const toe of layout.toes) {
      expect(toe).toBeDefined(); expect(toe!.x).toBeGreaterThan(0); expect(toe!.x).toBeLessThan(layout.width);
      expect(toe!.y).toBeGreaterThan(safeTop); expect(toe!.y).toBeLessThan(layout.height-safeBottom);
    }
    const area = layout.hits.find(h => h.id === 'paw-clip')!;
    expect(area.y).toBeGreaterThanOrEqual(layout.room.y); expect(area.y + area.h).toBeLessThanOrEqual(layout.room.y + layout.room.h);
    const rings = await page.evaluate(() => {
      const t=window.__CATSLAVE_TEST__, paw=t.game.bonus!.paw!;
      return [0,1,2,3,4].map(index => { paw.reveal(index); t.refresh(); return t.world.pawTimingTarget(paw); });
    });
    for (const ring of rings) {
      expect(ring).toBeDefined();
      expect(ring!.x - ring!.radius).toBeGreaterThanOrEqual(layout.room.x);
      expect(ring!.x + ring!.radius).toBeLessThanOrEqual(layout.room.x + layout.room.w);
      expect(ring!.y - ring!.radius).toBeGreaterThanOrEqual(layout.room.y);
      expect(ring!.y + ring!.radius).toBeLessThanOrEqual(layout.room.y + layout.room.h);
    }
    await page.evaluate(() => { const t=window.__CATSLAVE_TEST__; t.game.bonus!.paw!.reveal(0); t.refresh(); });
    await awaitWindow(page);
    if (name === 'short') await page.screenshot({ path: `artifacts/pawdicure/ring-short-ready-${info.project.name}.png` });
    await tap(page,'paw-clip',touch); expect(await trimmed(page)).toBe(1);
    if (name === 'short') {
      await tick(page, 0.07);
      await page.screenshot({ path: `artifacts/pawdicure/ring-short-contact-${info.project.name}.png` });
    }
    await page.screenshot({path:`artifacts/pawdicure/${name}-${info.project.name}.png`}); await context.close();
  }
});
