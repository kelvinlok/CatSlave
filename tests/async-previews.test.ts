import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as previews from '../src/furniture-previews';
import { RoomLayoutPreviews } from '../src/room-layout-previews';
import type { RoomLayout } from '../src/room-layout';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('restores renderer state before awaiting pixels and retains the target until completion', async () => {
  let finish!: () => void, target: THREE.WebGLRenderTarget | null = null;
  const previous = new THREE.WebGLRenderTarget(1, 1);
  let active: THREE.WebGLRenderTarget | null = previous;
  const renderer = {
    compileAsync: async () => {},
    getRenderTarget: () => active, setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { active = value; },
    getViewport: (v: THREE.Vector4) => v, getScissor: (v: THREE.Vector4) => v,
    getScissorTest: () => true, getClearColor: (c: THREE.Color) => c, getClearAlpha: () => 1,
    setViewport: vi.fn(), setScissor: vi.fn(), setScissorTest: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
    readRenderTargetPixelsAsync: (value: THREE.WebGLRenderTarget) => { target = value; return new Promise<void>(resolve => { finish = resolve; }); },
  };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn(),
  }) }) });
  const result = previews.renderPreview(renderer as unknown as THREE.WebGLRenderer, new THREE.Scene(), new THREE.Camera(), 2, 2);
  await Promise.resolve();
  const dispose = vi.spyOn(target!, 'dispose');
  expect(active).toBe(previous); expect(dispose).not.toHaveBeenCalled();
  finish(); await result;
  expect(active).toBe(previous); expect(dispose).toHaveBeenCalledOnce();
});

it('discards a completed layout image if the draft changed while readback was pending', async () => {
  let finish!: (image: HTMLCanvasElement) => void;
  const render = vi.spyOn(previews, 'renderPreview').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const cache = new RoomLayoutPreviews(), root = new THREE.Group(); root.userData.loaded = true;
  const layout: RoomLayout = { roomRevision: 1, placed: {}, unplaced: [] };
  cache.renderNext({} as THREE.WebGLRenderer, root, [{ id: 'draft', layout }]);
  cache.prepare([{ id: 'draft', layout: { ...layout, unplaced: [{ id: 'sofa', reason: 'stored' }] } }]);
  finish({} as HTMLCanvasElement);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  await Promise.resolve(); await Promise.resolve();
  expect(cache.images.has('draft')).toBe(false);
});
