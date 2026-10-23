import { test, expect, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id), id)).toBe(true);
  const h = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!, id);
  await page.touchscreen.tap(h.x + h.w / 2, h.y + h.h / 2);
}
async function start(page: Page) {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true)); await tap(page, 'start');
}
async function camera(page: Page) { return page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray()); }
async function sample(page: Page, beta: number, gamma: number) {
  await page.evaluate(({ beta, gamma }) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma })), { beta, gamma });
}
async function sensor(page: Page, permission: string) {
  await page.addInitScript(permission => {
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: class extends Event {
      static async requestPermission() { return permission; }
    } });
  }, permission);
}

test('stage completion resets gaze and zoom while pause preserves the view', async ({ page }, info) => {
  await start(page);
  const original = await camera(page);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.world.lookView(220, 100); t.world.zoomView(0.8); t.refresh(); });
  const turned = await camera(page);
  await tap(page, 'pause'); await tap(page, 'resume'); expect(await camera(page)).toEqual(turned);
  for (let stage = 0; stage < 5; stage++) {
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.world.lookView(180, -60); t.world.zoomView(0.8);
      t.game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); t.game.tick(t.game.timeLeft);
    });
    await expect.poll(() => camera(page)).toEqual(original);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(stage < 4
      ? await page.evaluate(() => Math.min(1, window.__CATSLAVE_TEST__.world.camera.aspect / 0.65)) : 1.65);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe(stage < 4 ? 'adoption' : 'victory');
    if (stage === 0) await page.screenshot({ path: `artifacts/stage-reset-${info.project.name}.png` });
    if (stage < 4) {
      const id = await page.evaluate(() => window.__CATSLAVE_TEST__.game.candidates[0].id);
      await tap(page, `adopt:${id}`); await tap(page, `upgrade:${['sweeper', 'mop', 'brush', 'food'][stage]}`);
      expect(await camera(page)).toEqual(original);
      await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(1.65);
    }
  }
});

test('pointer swipes turn the gaze from a fixed low eye position and reset restores it', async ({ page, browserName }, info) => {
  await start(page);
  const original = await camera(page);
  const position = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray());
  const swipe = async (type: string, x: number, y: number) => page.dispatchEvent('#game', type, { pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1 });
  if (browserName === 'chromium') {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 12, y: 240, id: 0 }] });
    for (let i = 1; i <= 6; i++) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 12 + i * 20, y: 240 + i * 10, id: 0 }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await touch.detach();
  } else {
    await page.mouse.move(12, 240); await page.mouse.down(); await page.mouse.move(130, 300, { steps: 6 }); await page.mouse.up();
  }
  expect(await camera(page)).not.toEqual(original);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray())).toEqual(position);
  const panned = await camera(page); await swipe('pointermove', 200, 350); expect(await camera(page)).toEqual(panned);
  await tap(page, 'view:in'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBeCloseTo(1.85);
  await tap(page, 'view:reset'); expect(await camera(page)).toEqual(original);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(1.65);
  await page.screenshot({ path: `test-results/close-view-${info.project.name}.png` });
  for (let i = 0; i < 5; i++) await tap(page, 'view:out');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(1);
});

test('off-screen needs focus their real target before care', async ({ page }) => {
  await start(page);
  const id = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.cats[0].position = { x: -3.1, z: 4 };
    t.game.spawn(t.game.cats[0], 'poop'); t.world.lookView(10000, -10000); t.refresh();
    return t.game.events[0].id;
  });
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; return t.world.project(t.world.eventPosition(t.game.events[0])).visible;
  })).toBe(false);
  await tap(page, `focus:${id}`);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(0);
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === `event:${id}`), id)).toBe(true);
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === `event:${id}`)!, id);
  const before = await camera(page);
  await page.mouse.move(hit.x + 20, hit.y + 26); await page.mouse.down();
  await page.mouse.move(hit.x + hit.w - 20, hit.y + 26, { steps: 4 }); await page.mouse.up();
  expect(await camera(page)).toEqual(before);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBeGreaterThan(0);
});

test('terracotta care rings remain visible on the wood floor and sage rug', async ({ page }, info) => {
  await start(page);
  for (const [surface, z] of [['wood', -4.5], ['rug', 0]] as const) {
    const pixels = await page.evaluate(z => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(); t.game.cats[0].position = { x: 0, z };
      t.game.spawn(t.game.cats[0], 'poop'); t.refresh();
      t.world.focusOn(t.world.eventPosition(t.game.events[0])); t.refresh();
      const data = t.hud.ctx.getImageData(0, 0, t.hud.canvas.width, t.hud.canvas.height).data;
      let terracotta = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === 151 && data[i + 1] === 65 && data[i + 2] === 42 && data[i + 3] === 255) terracotta++;
      return terracotta;
    }, z);
    expect(pixels).toBeGreaterThan(100);
    await page.screenshot({ path: `test-results/target-${surface}-${info.project.name}.png` });
  }
});

test('edge markers leave visible care targets clear at every look direction', async ({ page }) => {
  await start(page);
  const overlaps = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
      t.game.cats.forEach(c => { c.nextNeedAt = Infinity; }); t.game.tick(t.game.timeLeft);
      t.game.adopt(t.game.candidates[0].id); t.game.upgrade(tool);
    }
    t.game.cats.forEach((cat, i) => {
      cat.position = { x: [-3, -1.6, 0, 1.6, 3][i], z: i % 2 ? 0.2 : -2.6 };
      t.game.spawn(cat, (['poop', 'vomit', 'fur', 'hunger', 'boredom'] as const)[i]);
    });
    let overlaps = 0;
    for (let dx = -350; dx <= 350; dx += 50) {
      t.world.resetView(); t.world.lookView(dx, 30); t.refresh();
      const markers = t.hud.hits.filter(h => h.id.startsWith('focus:'));
      const care = t.hud.hits.filter(h => h.eventId !== undefined);
      for (const a of markers) for (const b of care) {
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlaps++;
      }
    }
    return overlaps;
  });
  expect(overlaps).toBe(0);
});

test('gyro is opt-in, calibrates, pauses during touch and pause, and disables', async ({ page }) => {
  await sensor(page, 'granted'); await start(page);
  const before = await camera(page); await sample(page, 45, 30); expect(await camera(page)).toEqual(before);
  await tap(page, 'view:gyro'); await sample(page, 45, 0);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.gyroStatus)).toBe('on');
  await sample(page, 45, 25);
  await expect.poll(() => camera(page)).not.toEqual(before);
  await page.mouse.move(12, 240); await page.mouse.down();
  const held = await camera(page); await sample(page, 60, -30); await page.waitForTimeout(150);
  expect(await camera(page)).toEqual(held); await page.mouse.up();
  await tap(page, 'pause'); const paused = await camera(page);
  await sample(page, 10, 30); await page.waitForTimeout(150); expect(await camera(page)).toEqual(paused);
  await tap(page, 'resume'); await tap(page, 'view:gyro');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.gyroStatus)).toBe('off');
  const off = await camera(page); await sample(page, 80, -30); await page.waitForTimeout(150); expect(await camera(page)).toEqual(off);
});

test('denied gyro permission leaves swipe controls usable', async ({ page }) => {
  await sensor(page, 'denied'); await start(page); await tap(page, 'view:gyro');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.gyroStatus)).toBe('denied');
  const before = await camera(page); await sample(page, 80, 30); expect(await camera(page)).toEqual(before);
  await tap(page, 'view:in'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBeCloseTo(1.85);
});

test('missing sensor data falls back without leaving gyro enabled', async ({ page }) => {
  await sensor(page, 'granted'); await start(page); await tap(page, 'view:gyro');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.gyroStatus), { timeout: 8000 }).toBe('unavailable');
});
