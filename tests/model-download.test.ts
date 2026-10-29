import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { readModelResponse } from '../src/model-download';

describe('lossless model downloads', () => {
  it.each(readdirSync('public/models').filter(name => name.endsWith('.glb')))(
    'restores every byte of %s', async name => {
      const original = readFileSync(`public/models/${name}`);
      const compressed = gzipSync(original, { level: 9 });
      const decoded = await readModelResponse(new Response(compressed));
      expect(Buffer.from(decoded).equals(original)).toBe(true);
      expect(compressed.length).toBeLessThan(original.length);
    });

  it('accepts raw GLBs, including ones already decoded by the HTTP stack', async () => {
    const data = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    const response = new Response(data, { headers: { 'Content-Encoding': 'gzip' } });
    expect(new Uint8Array(await readModelResponse(response))).toEqual(data);
  });

  it('rejects damaged gzip instead of giving corrupt bytes to the model loader', async () => {
    await expect(readModelResponse(new Response(new Uint8Array([0x1f, 0x8b, 0, 0])))).rejects.toThrow();
  });
});
