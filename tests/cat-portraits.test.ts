import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PALETTE } from '../src/config';

it('ships a current rendered portrait for every custom cat', () => {
  const manifest = JSON.parse(readFileSync('public/portraits/manifest.json', 'utf8')) as {
    kind: string; name: string; width: number; height: number; bytes: number; modelSha256: string;
  }[];
  expect(manifest.map(p => p.kind)).toEqual(PALETTE.map(cat => cat.appearance));
  for (const [i, portrait] of manifest.entries()) {
    const image = readFileSync(`public/portraits/${portrait.kind}.webp`);
    expect(portrait.name).toBe(PALETTE[i].name);
    expect(image.toString('ascii', 8, 12)).toBe('WEBP');
    expect(image.length).toBe(portrait.bytes);
    expect(portrait.width).toBe(384); expect(portrait.height).toBe(384);
    const model = readFileSync(`public/models/${portrait.kind}.glb`);
    expect(createHash('sha256').update(model).digest('hex'),
      `Re-render ${portrait.name} with node scripts/render-cat-portraits.mjs after changing its model`).toBe(portrait.modelSha256);
  }
  expect(manifest.reduce((bytes, p) => bytes + p.bytes, 0)).toBeLessThan(300_000);
});
