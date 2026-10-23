import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function tap(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id), id)).toBe(true);
  const p = await page.evaluate(id => {
    const t = window.__CATSLAVE_TEST__, hit = t.hud.hits.find(h => h.id === id)!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.left + hit.x + hit.w / 2, y: rect.top + hit.y + hit.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}

test('records live locomotion, pause, interaction transitions and attacks with stable resources', async ({ browser, baseURL }, info) => {
  const folder = `artifacts/cat-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, baseURL,
    recordVideo: { dir: `${folder}/video`, size: { width: 390, height: 844 } } });
  const page = await context.newPage(), video = page.video()!, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await tap(page, 'start');
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('playing');
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, cat = t.game.cats[0];
      cat.nextNeedAt = Infinity; cat.position = { x: -1.2, z: -0.8 }; cat.destination = { x: 1.2, z: -0.8 };
      cat.yaw = Math.PI / 2; cat.activity = 'walking'; t.world.zoomView(-10); t.refresh();
    });
    const positions = [];
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      positions.push(await page.evaluate(() => ({ ...window.__CATSLAVE_TEST__.game.cats[0].position })));
      await page.screenshot({ path: `${folder}/walk-${i}.png` });
    }
    expect(positions.at(-1)!.x).toBeGreaterThan(positions[0].x + 0.2);
    await tap(page, 'pause');
    const clock = await page.evaluate(() => window.__CATSLAVE_TEST__.game.clock);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.clock)).toBe(clock);
    await tap(page, 'resume');
    for (const activity of ['idle', 'sleeping', 'grooming', 'eating', 'playing'] as const) {
      await page.evaluate(activity => {
        const t = window.__CATSLAVE_TEST__, cat = t.game.cats[0]; cat.activity = activity;
        cat.destination = { ...cat.position }; cat.decisionAt = Infinity; cat.yaw = 0.3;
      }, activity);
      await page.waitForTimeout(650);
      await page.screenshot({ path: `${folder}/live-${activity}.png` });
    }
    // Exercise a real furniture jump and let the simulation advance on its normal clock.
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, cat = t.game.cats[0];
      cat.position = { x: 0, z: -5.2 }; cat.destination = { ...cat.position }; cat.activity = 'idle';
      t.game.visitFurniture(cat.id, 'tree');
    });
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity), { timeout: 15000, intervals: [50] }).toBe('jumping');
    await page.waitForTimeout(200); await page.screenshot({ path: `${folder}/live-jump.png` });
    await page.waitForTimeout(600);
    // Keep damage timing in the simulation; only shorten the test's wait for the deadline.
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(); const cat = t.game.cats[0];
      cat.nextNeedAt = Infinity; t.game.spawn(cat, 'poop');
      const event = t.game.events[0]; event.deadline = t.game.clock + 0.1; event.nextAttackAt = event.deadline + 1;
    });
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.damageSerial), { intervals: [50] }).toBe(1);
    await page.waitForTimeout(180); await page.screenshot({ path: `${folder}/live-attack.png` });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.attackAge)).toBeGreaterThan(0.76);
    const stable = await page.evaluate(async () => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
      const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const samples: object[] = [];
      for (let i = 0; i < 6; i++) { t.game.reset(); t.refresh(); await frame(); samples.push(t.stats()); }
      return samples;
    });
    const textures = stable.map(s => (s as { textures: number }).textures);
    expect(Math.max(...textures.slice(1)) - Math.min(...textures.slice(1))).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await writeFile(`${folder}/motion-results.json`, JSON.stringify({ positions, stable, errors, states: ['walk', 'pause/resume', 'idle', 'sleep', 'groom', 'eat', 'play', 'jump', 'attack/recovery'] }, null, 2));
  } finally { await context.close(); await video.saveAs(`${folder}/live-motion.webm`); }
});
