import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('cats stretch autonomously, pause midway and recover; inspect all reference coats in motion', async ({ browser, baseURL }, info) => {
  const folder = `artifacts/stretch/${info.project.name}`; await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, baseURL,
    recordVideo: { dir: `${folder}/video`, size: { width: 1200, height: 700 } } });
  const page = await context.newPage(), video = page.video()!, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, game = t.game; game.reset();
      const cat = game.cats[0]; cat.nextNeedAt = Infinity; cat.nextStretchAt = game.clock + 0.2;
      cat.position = { x: 0, z: -0.8 }; cat.destination = { ...cat.position }; cat.yaw = Math.PI / 2;
      cat.decisionAt = Infinity; t.world.zoomView(-10); t.refresh();
    });
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity)).toBe('stretching');
    await page.waitForTimeout(1500);
    const frozen = await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; g.pause(); return g.cats[0].pose; });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].pose)).toBe(frozen);
    await page.screenshot({ path: `${folder}/in-game-hold.png` });
    await page.evaluate(() => window.__CATSLAVE_TEST__.game.resume());
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity), { timeout: 6000 }).not.toBe('stretching');
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
    for (const variant of [0, 1, 2, 3]) {
      await page.evaluate(variant => {
        const studio = window.__CAT_STUDIO__; studio.pose('stretching', 1, variant, 0, 0.5); studio.pose('stretching', 1.3, variant, 0, 0.5);
      }, variant);
      await page.screenshot({ path: `${folder}/cat-${variant}-hold.png` });
    }
    // A full, real-time close-up cycle, not just endpoints.
    await page.evaluate(async () => {
      const studio = window.__CAT_STUDIO__; studio.pose('idle', 0, 0);
      const began = performance.now();
      await new Promise<void>(resolve => {
        const frame = () => {
          const elapsed = (performance.now() - began) / 1000;
          studio.pose('stretching', elapsed, 0, 0, Math.min(1, elapsed / 4.2));
          if (elapsed < 4.2) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
    });
    await page.screenshot({ path: `${folder}/recovered.png` });
    for (const [i, progress] of [0, 0.15, 0.30, 0.5, 0.7, 0.85, 1].entries()) {
      await page.evaluate(progress => window.__CAT_STUDIO__.pose('stretching', 10 + progress * 4.2, 0, 0, progress), progress);
      await page.screenshot({ path: `${folder}/sequence-${i}.png` });
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); await video.saveAs(`${folder}/stretch-motion.webm`); }
});
