import { test, expect } from '@playwright/test';

test('free play unlock, controls, interaction and saved roster', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
    for (let stage = 0; stage < 5; stage++) {
      t.game.cats.forEach(c => { c.nextNeedAt = Infinity; }); t.game.tick(t.game.timeLeft);
      if (t.game.phase === 'victory') break;
      t.finishBonus(); t.game.adopt(t.game.candidates[0].id);
      while (t.game.phase === 'upgrade') {
        const tool = (['sweeper','mop','brush','food','toy'] as const).find(id => t.game.levels[id] < 3)!;
        t.game.upgrade(tool);
      }
    }
    t.refresh();
  });
  async function tap(id: string) {
    await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id), id)).toBe(true);
    const h = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
    await page.mouse.click(h.x + h.w / 2, h.y + h.h / 2);
  }
  await tap('free-play');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  const ids = await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.map(c => c.id));
  for (const id of ids) { await tap(`free-cat:${id}`); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selectedFreeCatId)).toBe(id); }
  await tap(`free-cat:${ids[0]}`); await tap('free-mode:pet');
  const rump = await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.refresh(); return t.world.bonusPatTarget(t.game.selectedFreeCatId!)!; });
  await page.mouse.click(rump.x, rump.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.freePatUntil)).toBeGreaterThan(0);
  const patTurns: number[] = [];
  for (let frame = 0; frame < 3; frame++) {
    patTurns.push(await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.game.tick(0.15); t.refresh();
      const root = t.world.scene.children.find(c => c.userData.catId === t.game.selectedFreeCatId)!;
      return root.getObjectByName('head')!.rotation.y;
    }));
    await page.screenshot({ path: `test-results/free-pat-${info.project.name}-${frame}.png` });
  }
  expect(patTurns.every(turn => Math.abs(turn) < 0.2)).toBe(true);
  await tap('free-mode:wand');
  const v = await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewport);
  const lure = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.game.cats.forEach((c, i) => {
      c.visit = undefined; c.elevation = 0; c.activity = 'idle'; c.decisionAt = Infinity;
      c.position = { x: i === 1 ? 0 : 3, z: i === 1 ? 1 : -5 }; c.destination = { ...c.position }; c.yaw = 0;
    });
    t.world.resetView(); t.refresh();
    const target = t.game.cats[1], pos = t.world.catPosition(target.id)!; pos.y += 0.65;
    return { ...t.world.project(pos), id: target.id };
  });
  await page.mouse.move(lure.x + 20, lure.y); await page.mouse.down();
  await page.mouse.move(lure.x - 20, lure.y - 15);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.feedback)).toContain('wand');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selectedFreeCatId)).toBe(ids[0]);
  expect(await page.evaluate(id => window.__CATSLAVE_TEST__.game.cats.find(c => c.id === id)!.activity, lure.id)).toBe('playing');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity)).toBe('idle');
  const reaches: number[] = [];
  for (let frame = 0; frame < 12; frame++) {
    reaches.push(await page.evaluate(id => {
      const t = window.__CATSLAVE_TEST__; t.game.tick(0.1); t.refresh();
      const root = t.world.scene.children.find(c => c.userData.catId === id)!;
      root.updateMatrixWorld(true);
      return Math.min(root.getObjectByName('paw0')!.matrixWorld.elements[13], root.getObjectByName('paw1')!.matrixWorld.elements[13]);
    }, lure.id));
    if ([2, 5, 8].includes(frame)) await page.screenshot({ path: `test-results/wand-rear-${info.project.name}-${frame}.png` });
  }
  expect(Math.max(...reaches)).toBeGreaterThan(0.3);
  await page.mouse.up();
  await tap('free-mode:camera');
  const before = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray());
  await page.mouse.move(v.x + v.w / 2, v.y + v.h / 2); await page.mouse.down();
  await page.mouse.move(v.x + v.w / 2 + 80, v.y + v.h / 2 + 40); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray())).not.toEqual(before);
  await tap('free-move:forward'); await tap('view:in'); await tap('view:reset');
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.tick(90); t.refresh(); });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events.length)).toBe(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.scene.children.filter(c => c.name.startsWith('free-food-')).length)).toBe(5);
  await page.screenshot({ path: `test-results/free-play-${info.project.name}.png` });
  await tap('pause'); await tap('resume');
  await tap('pause'); await tap('restart'); await tap('confirm-restart');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.z)).toBeLessThan(5.8);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.z)).toBeLessThan(5.8);
  const zoom = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.zoom);
  if (info.project.name === 'mobile-webkit') await tap('view:in');
  else await page.mouse.wheel(0, -120);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.zoom)).toBeGreaterThan(zoom);
  await page.reload(); await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await tap('free-play'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(5);
  expect(errors).toEqual([]);
});

test('relaxed room meals, social play and camera floor boundary', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    t.game.restoreFreePlay(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo']); t.game.startFreePlay(); t.refresh();
  });
  async function tap(id: string) {
    const h = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
    await page.mouse.click(h.x + h.w / 2, h.y + h.h / 2);
  }
  await tap('free-mode:camera');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.keyboard.down('q');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.y)).toBeLessThan(.6);
  await page.keyboard.up('q');
  const y = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.y);
  expect(y).toBeGreaterThan(.28);
  await tap('free-move:down');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.y)).toBeGreaterThan(.28);
  await tap('view:reset');
  const meal = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (let i = 0; i < 2400; i++) {
      t.game.tick(.25);
      const cat = t.game.cats.find(c => c.activity === 'eating');
      if (cat) { t.refresh(); const p = t.world.catPosition(cat.id)!; p.y += .4; t.world.focusOn(p); t.refresh(); return { position: cat.position, clock: t.game.clock }; }
    }
    return null;
  });
  expect(meal).not.toBeNull(); expect(meal!.position.z).toBeCloseTo(-5.25, 1);
  await page.screenshot({ path: `test-results/free-meal-${info.project.name}.png` });
  const pair = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (let i = 0; i < 2400; i++) {
      t.game.tick(.25);
      const cat = t.game.cats.find(c => t.game.freeRoam.playmate(c.id) !== undefined);
      if (cat) {
        t.refresh(); const p = t.world.catPosition(cat.id)!; p.y += .5; t.world.focusOn(p); t.refresh();
        return { id: cat.id, friend: t.game.freeRoam.playmate(cat.id) };
      }
    }
    return null;
  });
  expect(pair).not.toBeNull();
  await page.screenshot({ path: `test-results/free-social-${info.project.name}.png` });
  await page.evaluate(() => { window.__CATSLAVE_TEST__.game.tick(.3); window.__CATSLAVE_TEST__.refresh(); });
  await page.screenshot({ path: `test-results/free-social-reach-${info.project.name}.png` });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events.length)).toBe(0);
});
