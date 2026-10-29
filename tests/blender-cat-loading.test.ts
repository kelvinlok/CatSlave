import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const { parse, decoder } = vi.hoisted(() => ({ parse: vi.fn(), decoder: vi.fn() }));
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class { parseAsync = parse; setMeshoptDecoder = decoder; register() { return this; } },
}));

function asset() {
  const scene = new THREE.Group();
  for (const name of ['body', 'head', 'ear0', 'ear1', 'eye0', 'eye1', 'closedEye0', 'closedEye1',
    ...Array.from({ length: 4 }, (_, i) => [`leg${i}`, `lowerLeg${i}`, `paw${i}`]).flat()]) {
    const part = new THREE.Group(); part.name = name; scene.add(part);
  }
  return { scene };
}

beforeEach(() => {
  vi.resetModules(); parse.mockReset().mockResolvedValue(asset()); decoder.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('on-demand Blender downloads', () => {
  it('does nothing on import, deduplicates requests, and serializes download and decode', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(new ArrayBuffer(8))));
    vi.stubGlobal('fetch', fetcher);
    const { preloadBlenderCatAsset: load, hasBlenderCatAsset: has } = await import('../src/blender-cat-asset');
    expect(fetcher).not.toHaveBeenCalled();
    let finish!: (value: ReturnType<typeof asset>) => void;
    parse.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const choco = load('choco'), latte = load('latte');
    expect(load('choco')).toBe(choco);
    expect(load('latte')).toBe(latte);
    await vi.waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([`${import.meta.env.BASE_URL}models/choco.glb`]);
    expect(has('choco')).toBe(false);
    finish(asset());
    expect(await choco).toBe(true);
    expect(await latte).toBe(true);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['choco', 'latte'].map(cat => `${import.meta.env.BASE_URL}models/${cat}.glb`));
    expect(has('choco')).toBe(true); expect(has('latte')).toBe(true);
    expect(has('momo')).toBe(false); expect(has('primitive')).toBe(false);
    expect(await load('latte')).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['http', 'network', 'parse', 'invalid rig'] as const)('keeps %s failures sticky and lets the next cat load', async failure => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(new ArrayBuffer(8))));
    if (failure === 'http') fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
    if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('Offline'));
    if (failure === 'parse') parse.mockRejectedValueOnce(new Error('Invalid GLB'));
    if (failure === 'invalid rig') parse.mockResolvedValueOnce({ scene: new THREE.Group() });
    vi.stubGlobal('fetch', fetcher);
    const { preloadBlenderCatAsset: load, hasBlenderCatAsset: has } = await import('../src/blender-cat-asset');
    const failed = load('choco'), next = load('latte');
    expect(await failed).toBe(false); expect(has('choco')).toBe(false);
    expect(await next).toBe(true); expect(has('latte')).toBe(true);
    for (let frame = 0; frame < 60; frame++) expect(load('choco')).toBe(failed);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('built-in model'), expect.any(Error));
  });

  it.each(['headers', 'body'] as const)('aborts stalled %s after 15 seconds and gives the next request its own timeout', async stalled => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      const pending = () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
      });
      return stalled === 'headers' ? pending() : Promise.resolve({ ok: true, arrayBuffer: pending });
    }));
    const { preloadBlenderCatAsset: load } = await import('../src/blender-cat-asset');
    const first = load('choco'), second = load('latte');
    await vi.advanceTimersByTimeAsync(14999);
    expect(signals).toHaveLength(1); expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(false);
    expect(signals).toHaveLength(2); expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(await second).toBe(false); expect(signals[1].aborted).toBe(true);
    expect(parse).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('configures Meshopt only when Momo is requested', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(new ArrayBuffer(8)))));
    const { preloadBlenderCatAsset: load } = await import('../src/blender-cat-asset');
    await load('choco'); expect(decoder).not.toHaveBeenCalled();
    expect(await load('zhenzhenzi')).toBe(true); expect(decoder).not.toHaveBeenCalled();
    expect(await load('dingding')).toBe(true); expect(decoder).not.toHaveBeenCalled();
    expect(await load('momo')).toBe(true); expect(decoder).toHaveBeenCalledTimes(1);
  });
});
