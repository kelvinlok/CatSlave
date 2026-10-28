import { expect, test } from '@playwright/test';

test('wordless needs stay readable while cats roam and leave messes behind', async ({ page }, info) => {
  // This test asserts English copy; the game's default language is Cantonese.
  await page.addInitScript(() => localStorage.setItem('catslave-language', 'en'));
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  for (const kind of ['vomit', 'fur', 'hunger', 'boredom'] as const) {
    const result = await page.evaluate(kind => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(); t.game.spawn(t.game.cats[0], kind);
      const event = t.game.events[0], origin = { ...event.position };
      t.game.tick(5); t.refresh();
      const labels: string[] = [], original = t.hud.ctx.fillText;
      t.hud.ctx.fillText = function (value, ...args) { labels.push(value); return original.call(this, value, ...args); };
      t.refresh(); t.hud.ctx.fillText = original;
      return { labels, origin, location: event.position, cat: t.game.cats[0].position, target: t.hud.hits.find(h => h.id === `event:${event.id}`) };
    }, kind);
    expect(result.location).toEqual(result.origin);
    if (kind === 'vomit' || kind === 'fur') expect(result.cat).not.toEqual(result.origin);
    expect(result.labels.join(' ')).not.toMatch(/patience|clean|vomit|fur|select|rub|drag|pounce|approves/i);
    expect(result.target).toBeDefined();
    for (const name of ['Sweeper', 'Mop', 'Brush', 'Food', 'Wand']) expect(result.labels).toContain(name);
    await page.screenshot({ path: `test-results/need-${kind}-${info.project.name}.png` });
  }
});

test('an attack fills the screen without moving the fixed camera, and clears after restart', async ({ page }, info) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const camera = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray());
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
    t.game.spawn(t.game.cats[0], 'poop'); t.game.tick(23); t.refresh(0.4);
  });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray())).toEqual(camera);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.damageFlash)).toBeGreaterThan(0);
  await page.screenshot({ path: `test-results/scratch-${info.project.name}.png` });
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.pause(); t.refresh(5); });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.attackAge)).toBeCloseTo(0.4);
  const restart = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'restart')!);
  await page.touchscreen.tap(restart.x + restart.w / 2, restart.y + restart.h / 2);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.modal)).toBe('restart');
  const confirm = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === 'confirm-restart')!);
  await page.touchscreen.tap(confirm.x + confirm.w / 2, confirm.y + confirm.h / 2);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('playing');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.damageFlash)).toBe(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.hp)).toBe(100);
});
