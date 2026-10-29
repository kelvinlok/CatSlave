import { expect, test, type Page } from '@playwright/test';
import type * as THREE from 'three';

const cats = [
  ['choco', 'Choco'], ['latte', 'Latte'], ['didi', '的的'], ['xiaosai', '小塞'],
  ['yelo', 'Yelo'], ['miller', 'Miller'], ['momo', 'Momo'], ['zhenzhenzi', '震震子'], ['dingding', '丁丁'],
];
type TracedContext = CanvasRenderingContext2D & {
  portraitDraws: Record<string, { width: number; height: number; onHudCanvas: boolean }>;
  drawnLabels: string[];
};

async function openTitle(page: Page, unlocked = ['Choco']) {
  const portraits: string[] = [], models: string[] = [], errors: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/portraits\/.*\.webp$/.test(path)) portraits.push(path);
    if (/\/models\/.*\.glb$/.test(path)) models.push(path);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(names => {
    localStorage.setItem('catslave-cat-dex', JSON.stringify(names));
    localStorage.setItem('catslave-language', 'en');
  }, unlocked);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, ctx = t.hud.ctx as TracedContext;
    t.setManualClock(true);
    ctx.portraitDraws = {}; ctx.drawnLabels = [];
    const drawImage = ctx.drawImage, fillText = ctx.fillText;
    ctx.drawImage = function (this: CanvasRenderingContext2D, source: CanvasImageSource, ...args: number[]) {
      // Observe the real Hud context, calling through to the native drawing method.
      Reflect.apply(drawImage, this, [source, ...args]);
      if (source instanceof HTMLImageElement && source.src.includes('/portraits/')) {
        ctx.portraitDraws[new URL(source.src).pathname] = {
          width: source.naturalWidth, height: source.naturalHeight, onHudCanvas: this.canvas === t.hud.canvas,
        };
      }
    } as typeof ctx.drawImage;
    ctx.fillText = function (value: string, ...args: number[]) {
      ctx.drawnLabels.push(value);
      Reflect.apply(fillText, this, [value, ...args]);
    };
    t.refresh();
  });
  await expect.poll(() => models).toEqual(['/models/choco.glb']);
  expect(portraits).toEqual([]);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
  return { portraits, models, errors };
}

async function tap(page: Page, id: string, allowDisabled = false) {
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(hit => hit.id === id), id);
  expect(hit, id).toBeTruthy();
  if (!allowDisabled) expect(hit!.disabled, id).not.toBe(true);
  const canvas = await page.locator('#game').boundingBox();
  await page.mouse.click(canvas!.x + hit!.x + hit!.w / 2, canvas!.y + hit!.y + hit!.h / 2);
}

const drawnPortraits = (page: Page) => page.evaluate(() =>
  Object.keys((window.__CATSLAVE_TEST__.hud.ctx as TracedContext).portraitDraws).sort());

test('locked dex requests only Choco and keeps other cards anonymous and disabled', async ({ page }) => {
  const requests = await openTitle(page);
  await tap(page, 'cat-dex');
  await expect.poll(() => drawnPortraits(page)).toEqual(['/portraits/choco.webp']);
  expect(requests.portraits).toEqual(['/portraits/choco.webp']);
  expect(requests.models).toEqual(['/models/choco.glb']);
  const state = await page.evaluate(() => {
    const hud = window.__CATSLAVE_TEST__.hud;
    return { cards: hud.hits.filter(hit => hit.id.startsWith('dex-cat:')),
      labels: (hud.ctx as TracedContext).drawnLabels };
  });
  expect(state.cards).toHaveLength(9);
  expect(state.cards[0].label).toContain('Choco');
  expect(state.cards.slice(1).map(hit => ({ disabled: hit.disabled, label: hit.label })))
    .toEqual(Array(8).fill({ disabled: true, label: 'Not adopted' }));
  expect(state.labels.filter(label => label === '???').length).toBeGreaterThanOrEqual(8);
  for (const [, name] of cats.slice(1)) expect(state.labels).not.toContain(name);
  await tap(page, 'dex-cat:1', true);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBeUndefined();
  await tap(page, 'dex-back');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
  expect(requests.portraits).toEqual(['/portraits/choco.webp']);
  expect(requests.errors).toEqual([]);
});

test('all unlocked portraits draw to Hud without extra model downloads and still open profiles', async ({ page }) => {
  let releaseModel!: () => void;
  const modelGate = new Promise<void>(resolve => { releaseModel = resolve; });
  await page.route('**/models/latte.glb', async route => { await modelGate; await route.continue(); });
  const requests = await openTitle(page, cats.map(([, name]) => name));
  const expected = cats.map(([asset]) => `/portraits/${asset}.webp`).sort();
  await tap(page, 'cat-dex');
  await expect.poll(() => drawnPortraits(page)).toEqual(expected);
  expect(await page.evaluate(() => (window.__CATSLAVE_TEST__.hud.ctx as TracedContext).drawnLabels)).not.toContain('Coming soon');
  expect(requests.portraits.slice().sort()).toEqual(expected);
  expect(requests.models).toEqual(['/models/choco.glb']);
  const draws = await page.evaluate(() => Object.values((window.__CATSLAVE_TEST__.hud.ctx as TracedContext).portraitDraws));
  for (const draw of draws) {
    expect(draw.onHudCanvas).toBe(true);
    expect(draw.width).toBeGreaterThan(0); expect(draw.height).toBeGreaterThan(0);
  }
  await tap(page, 'dex-back'); await tap(page, 'cat-dex');
  expect(requests.portraits.slice().sort()).toEqual(expected); // Cached on reopening.
  expect(requests.models).toEqual(['/models/choco.glb']);
  await tap(page, 'dex-cat:1');
  await expect.poll(() => requests.models.slice().sort()).toEqual(['/models/choco.glb', '/models/latte.glb']);
  const preview = await page.evaluate(() => {
    const world = window.__CATSLAVE_TEST__.world, model = world.dexScene.getObjectByName('dex-cat-model')!;
    return { source: model.userData.modelSource ?? 'builtin', rotation: model.parent!.quaternion.toArray(), viewport: world.viewport };
  });
  expect(preview.source).toBe('builtin');
  const canvas = await page.locator('#game').boundingBox(), v = preview.viewport;
  const cx = canvas!.x + v.x + v.w / 2, cy = canvas!.y + v.y + v.h / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 38, cy + 18, { steps: 6 }); await page.mouse.up();
  const rotated = await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene
    .getObjectByName('dex-cat-model')!.parent!.quaternion.toArray());
  expect(rotated).not.toEqual(preview.rotation);
  releaseModel();
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene
    .getObjectByName('dex-cat-model')?.userData.modelAsset)).toBe('models/latte.glb');
  const upgraded = await page.evaluate(() => {
    const world = window.__CATSLAVE_TEST__.world, model = world.dexScene.getObjectByName('dex-cat-model')!;
    model.updateWorldMatrix(true, true); world.dexCamera.updateMatrixWorld();
    const point = model.position.clone();
    let vertices = 0, finite = true, maxX = 0, maxY = 0;
    model.traverseVisible(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.getAttribute('position');
      if (!positions) return;
      // Project the deformed surface itself: a rotated world AABB contains empty
      // corners outside the model and is too conservative for a framing check.
      for (let i = 0; i < positions.count; i++) {
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(world.dexCamera);
        vertices++; finite &&= [point.x, point.y, point.z].every(Number.isFinite);
        maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, Math.abs(point.y));
      }
    });
    return { rotation: model.parent!.quaternion.toArray(), vertices, finite, maxX, maxY };
  });
  upgraded.rotation.forEach((value, index) => expect(value).toBeCloseTo(rotated[index], 7));
  expect(upgraded.vertices).toBeGreaterThan(1000); expect(upgraded.finite).toBe(true);
  expect(upgraded.maxX).toBeLessThan(1); expect(upgraded.maxY).toBeLessThan(1);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBe(1);
  expect(requests.models.slice().sort()).toEqual(['/models/choco.glb', '/models/latte.glb']);
  await tap(page, 'dex-back');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBeUndefined();
  expect(requests.errors).toEqual([]);
});

test('a failed portrait leaves a named selectable card and working navigation', async ({ page }) => {
  let failures = 0;
  await page.route('**/portraits/choco.webp', route => {
    failures++;
    return route.fulfill({ status: 503, body: 'Portrait unavailable' });
  });
  const requests = await openTitle(page);
  const failedResponse = page.waitForResponse(response => response.url().endsWith('/portraits/choco.webp') && response.status() === 503);
  await tap(page, 'cat-dex'); await failedResponse;
  await page.evaluate(() => window.__CATSLAVE_TEST__.refresh());
  const card = await page.evaluate(() => {
    const hud = window.__CATSLAVE_TEST__.hud;
    return { hit: hud.controls.find(hit => hit.id === 'dex-cat:0'), labels: (hud.ctx as TracedContext).drawnLabels };
  });
  expect(card.hit?.label).toContain('Choco'); expect(card.labels).toContain('Choco');
  expect(await drawnPortraits(page)).toEqual([]);
  await tap(page, 'dex-cat:0');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene
    .getObjectByName('dex-cat-model')?.userData.modelAsset)).toBe('models/choco.glb');
  await tap(page, 'dex-back'); await tap(page, 'dex-back');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
  await tap(page, 'cat-dex');
  expect(failures).toBe(1);
  expect(requests.portraits).toEqual(['/portraits/choco.webp']);
  expect(requests.models).toEqual(['/models/choco.glb']);
  expect(requests.errors).toEqual([]);
});
