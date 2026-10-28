import { expect, test } from '@playwright/test';
import type { Mesh, MeshStandardMaterial, Texture } from 'three';

declare global {
  interface Window {
    __TEXTURE_RECOVERY__: { uploads: number; colors: number[]; images: boolean; state: string };
  }
}

test('restores colored cat textures after backgrounding and WebGL context loss', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset(); t.refresh();
  });
  await expect.poll(() => page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return t.world.scene.children.find(root => root.userData.catId === t.game.cats[0].id)?.userData.modelSource;
  })).toBe('blender');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.game.pause(); t.refresh();
    const root = t.world.scene.children.find(root => root.userData.catId === t.game.cats[0].id)!;
    const maps = new Set<Texture>();
    root.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const map = (material as MeshStandardMaterial).map;
        if (map) maps.add(map);
      }
    });
    const state = () => JSON.stringify({ cats: t.game.cats, hp: t.game.hp, clock: t.game.clock });
    const probe = window.__TEXTURE_RECOVERY__ = { uploads: 0, colors: [] as number[],
      images: maps.size > 0 && [...maps].every(map => map.image instanceof HTMLImageElement && map.image.complete), state: state() };
    // Sample the actual GPU textures on upload, not just their source images.
    for (const map of maps) {
      map.onUpdate = () => {
        const image = map.image as HTMLImageElement;
        const gl = (document.querySelector('#game') as HTMLCanvasElement).getContext('webgl2')!;
        const texture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture;
        const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        let color = 0;
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          const pixel = new Uint8Array(4);
          for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) {
            gl.readPixels(Math.floor(image.width * x / 8), Math.floor(image.height * y / 8),
              1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            color += pixel[0] + pixel[1] + pixel[2];
          }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous); gl.deleteFramebuffer(framebuffer);
        probe.uploads++; probe.colors.push(color);
      };
      map.needsUpdate = true;
    }
  });
  await expect.poll(() => page.evaluate(() => window.__TEXTURE_RECOVERY__.uploads)).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__TEXTURE_RECOVERY__);
  expect(before.images).toBe(true);
  expect(before.colors.every(color => color > 0)).toBe(true);
  for (const event of ['visibilitychange', 'pageshow'] as const) {
    const uploads = await page.evaluate(() => window.__TEXTURE_RECOVERY__.uploads);
    await page.evaluate(event => {
      if (event === 'visibilitychange') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event(event));
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event(event));
      } else window.dispatchEvent(new PageTransitionEvent(event, { persisted: true }));
    }, event);
    await expect.poll(() => page.evaluate(() => window.__TEXTURE_RECOVERY__.uploads)).toBeGreaterThan(uploads);
  }
  const uploads = await page.evaluate(() => window.__TEXTURE_RECOVERY__.uploads);
  const supported = await page.evaluate(() => {
    const canvas = document.querySelector('#game') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    canvas.addEventListener('webglcontextlost', () => setTimeout(() => extension.restoreContext(), 100), { once: true });
    extension.loseContext(); return true;
  });
  expect(supported, 'Context-loss regression requires WEBGL_lose_context').toBe(true);
  await expect.poll(() => page.evaluate(() => window.__TEXTURE_RECOVERY__.uploads)).toBeGreaterThan(uploads);
  const after = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { colors: window.__TEXTURE_RECOVERY__.colors,
      state: JSON.stringify({ cats: t.game.cats, hp: t.game.hp, clock: t.game.clock }), phase: t.game.phase };
  });
  expect(after.colors.every(color => color > 0)).toBe(true);
  expect(after.state).toBe(before.state); expect(after.phase).toBe('paused');
  const resume = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(hit => hit.id === 'resume')!);
  await page.touchscreen.tap(resume.x + resume.w / 2, resume.y + resume.h / 2);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('playing');
  await page.screenshot({ path: `test-results/recovered-cats-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
