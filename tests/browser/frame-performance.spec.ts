import { expect, test } from '@playwright/test';

test('static HUD reuses its texture and still updates interaction, language and animated screens', async ({ page }) => {
  // This check concerns the HUD, independent of model download/compile timing.
  await page.route('**/models/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const result = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, h = t.hud, game = t.game, world = t.world;
    t.setManualClock(true); t.refresh();
    const version = h.texture.version;
    const pixels = h.canvas.toDataURL();
    for (let i = 0; i < 120; i++) h.draw(game, world, 1 / 60);
    const idleUploads = h.texture.version - version;
    const identical = pixels === h.canvas.toDataURL();
    h.hoveredId = 'start'; h.invalidate(); h.draw(game, world, 1 / 60);
    const hoverUploads = h.texture.version - version;
    const hoverChanged = pixels !== h.canvas.toDataURL();
    game.phase = 'game-over'; world.attackAge = 1.14; h.draw(game, world, 0, true);
    const damageVersion = h.texture.version;
    world.attackAge = 1.16; h.draw(game, world, 1 / 60);
    const clearedDamage = h.texture.version > damageVersion;
    game.reset(true); t.refresh();
    const animatedVersion = h.texture.version;
    for (let i = 0; i < 120; i++) h.draw(game, world, 1 / 60);
    return { idleUploads, identical, hoverUploads, hoverChanged, clearedDamage, animatedUploads: h.texture.version - animatedVersion };
  });
  expect(result).toMatchObject({ idleUploads: 0, identical: true, hoverUploads: 1, hoverChanged: true, clearedDamage: true });
  expect(result.animatedUploads).toBeGreaterThanOrEqual(59);
  // Real input must still refresh a cached title screen.
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.phase = 'title'; t.refresh(); });
  const language = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(c => c.id === 'language')!);
  const before = await page.evaluate(() => document.documentElement.lang);
  await page.touchscreen.tap(language.x + language.w / 2, language.y + language.h / 2);
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).not.toBe(before);
});
