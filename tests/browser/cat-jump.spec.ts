import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('asymmetric jumps keep contact timing and recover in the live room and close-up', async ({ browser, baseURL }, info) => {
  const folder = `artifacts/jump-polish/${info.project.name}`;
  await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    recordVideo: { dir: `${folder}/video`, size: { width: 1200, height: 700 } } });
  const page = await context.newPage(), video = page.video()!, errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(); t.game.phase = 'tutorial';
      const cat = t.game.cats[0]; cat.nextNeedAt = Infinity; cat.nextStretchAt = Infinity;
      cat.position = { x: -2.8, z: -3.35 }; cat.destination = { ...cat.position }; cat.activity = 'idle';
      t.game.visitFurniture(cat.id, 'tree'); t.world.zoomView(-10); t.refresh();
    });
    await expect.poll(() => page.evaluate(() => {
      const game = window.__CATSLAVE_TEST__.game;
      // Software rendering can trigger the game's long-frame safety pause while shaders warm.
      if (game.phase === 'paused') game.resume();
      const cat = game.cats[0]; return cat.activity === 'jumping' && cat.pose > 0.2;
    }), { timeout: 30000, intervals: [30] }).toBe(true);
    const frozen = await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; g.pause(); return JSON.stringify(g.cats[0]); });
    await page.waitForTimeout(180);
    expect(await page.evaluate(() => JSON.stringify(window.__CATSLAVE_TEST__.game.cats[0]))).toBe(frozen);
    await page.evaluate(() => window.__CATSLAVE_TEST__.game.resume());
    await expect.poll(() => page.evaluate(() => {
      const game = window.__CATSLAVE_TEST__.game; if (game.phase === 'paused') game.resume();
      return game.cats[0].visit?.phase;
    }), { timeout: 30000 }).toBe('use');
    await page.screenshot({ path: `${folder}/room-landed.png` });
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
    // Real-time cycles preserve the production pose evaluator, including entry/exit blends.
    for (const variant of [0, 1]) {
      await page.evaluate(async variant => {
        const studio = window.__CAT_STUDIO__;
        studio.pose('idle', 0, variant);
        const began = performance.now();
        await new Promise<void>(resolve => {
          const frame = () => {
            const elapsed = (performance.now() - began) / 1000, t = elapsed % 1.7;
            const p = Math.min(1, Math.max(0, (t - 0.25) / 0.96));
            const flight = Math.min(1, Math.max(0, (p - 0.14) / 0.68));
            studio.model.root.position.y = Math.sin(flight * Math.PI) * 0.54;
            studio.pose(t >= 0.25 && t < 1.21 ? 'jumping' : 'idle', elapsed, variant, 0, p);
            if (elapsed < 3.4) requestAnimationFrame(frame); else resolve();
          }; requestAnimationFrame(frame);
        });
      }, variant);
    }
    // Include full hind-leg extension and deepest landing compression.
    for (const [i, p] of [0.09, 0.26, 0.50, 0.72, 0.82, 0.88, 0.94].entries()) {
      await page.evaluate(p => {
        const studio = window.__CAT_STUDIO__, flight = Math.min(1, Math.max(0, (p - 0.14) / 0.68));
        studio.pose('jumping', 10 + p, 1, 0, p);
        studio.model.root.position.y = Math.sin(flight * Math.PI) * 0.54;
        studio.pose('jumping', 11 + p, 1, 0, p);
      }, p);
      await page.screenshot({ path: `${folder}/phase-${i}.png` });
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); await video.saveAs(`${folder}/jump-motion.webm`); }
});
