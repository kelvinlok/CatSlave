import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { shareModelTextures } from '../scripts/shared-model-textures';

function decode(bytes: Buffer) {
  const end = 20 + bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, end).toString()), binary: bytes.subarray(end + 8) };
}
function bytesAt(model: ReturnType<typeof decode>, index: number) {
  const view = model.json.bufferViews[index];
  return model.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}

it('preserves every accessor, material, and image while sharing the eight identical fur maps', () => {
  const inputs = new Map(readdirSync('public/models').filter(name => name.endsWith('.glb'))
    .map(name => [`models/${name}`, readFileSync(`public/models/${name}`)]));
  const { models, shared } = shareModelTextures(inputs);
  expect(shared.size).toBe(1);
  expect([...shared.values()][0].length).toBe(640705);
  let changed = 0;
  for (const [file, original] of inputs) {
    const output = models.get(file)!, before = decode(original), after = decode(output);
    if (!original.equals(output)) changed++;
    // All graph/material/skin/animation structure is untouched.
    for (const key of Object.keys(before.json).filter(key => !['buffers', 'bufferViews', 'images', 'accessors'].includes(key))) {
      expect(after.json[key]).toEqual(before.json[key]);
    }
    expect(after.json.accessors.length).toBe(before.json.accessors.length);
    before.json.accessors.forEach((accessor: { bufferView?: number; sparse?: unknown }, index: number) => {
      const next = after.json.accessors[index];
      expect({ ...next, bufferView: accessor.bufferView }).toEqual(accessor);
      if (accessor.bufferView !== undefined) expect(bytesAt(after, next.bufferView).equals(bytesAt(before, accessor.bufferView))).toBe(true);
    });
    before.json.images.forEach((image: { bufferView: number }, index: number) => {
      const next = after.json.images[index];
      if (next.uri) {
        const uri = path.posix.normalize(path.posix.join(path.posix.dirname(file), next.uri));
        expect(shared.get(uri)?.equals(bytesAt(before, image.bufferView))).toBe(true);
        const { uri: _, ...properties } = next;
        expect({ ...properties, bufferView: image.bufferView }).toEqual(image);
      } else expect(bytesAt(after, next.bufferView).equals(bytesAt(before, image.bufferView))).toBe(true);
    });
  }
  expect(changed).toBe(8);
  // Unsupported Meshopt data and non-sharing room are byte-identical.
  expect(models.get('models/momo.glb')).toBe(inputs.get('models/momo.glb'));
  expect(models.get('models/lounge.glb')).toBe(inputs.get('models/lounge.glb'));
  const oldSize = [...inputs.values()].reduce((sum, bytes) => sum + gzipSync(bytes, { level: 9 }).length, 0);
  const newSize = [...models.values()].reduce((sum, bytes) => sum + gzipSync(bytes, { level: 9 }).length, 0)
    + [...shared.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  expect(oldSize - newSize).toBeGreaterThan(4_000_000);
  console.log({ originalCompressedBytes: oldSize, sharedTextureBuildBytes: newSize, savedBytes: oldSize - newSize });
}, 30000);

it('does not externalize an image downloaded by just one model', () => {
  const bytes = readFileSync('public/models/choco.glb');
  const result = shareModelTextures(new Map([['models/choco.glb', bytes]]));
  expect(result.shared.size).toBe(0);
  expect(result.models.get('models/choco.glb')).toBe(bytes);
});

it('remaps sparse accessor views and skips unknown binary extensions', () => {
  const make = (extension?: string) => {
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' },
      buffers: [{ byteLength: 12 }],
      bufferViews: [0, 4, 8].map(byteOffset => ({ buffer: 0, byteOffset, byteLength: 4 })),
      images: [{ bufferView: 0, mimeType: 'image/png' }],
      accessors: [{ componentType: 5121, count: 1, type: 'SCALAR',
        sparse: { count: 1, indices: { bufferView: 1, componentType: 5121 }, values: { bufferView: 2 } } }],
      ...(extension ? { extensionsUsed: [extension] } : {}),
    }));
    const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20); json.copy(padded);
    const bytes = Buffer.alloc(28 + padded.length + 12);
    bytes.writeUInt32LE(0x46546c67); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
    bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
    bytes.writeUInt32LE(12, 20 + padded.length); bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
    Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12]).copy(bytes, 28 + padded.length);
    return bytes;
  };
  const safe = make(), unsupported = make('EXT_future_binary_layout');
  const result = shareModelTextures(new Map([['models/a.glb', safe], ['models/b.glb', safe], ['models/c.glb', unsupported]]));
  const model = decode(result.models.get('models/a.glb')!);
  expect(model.json.accessors[0].sparse.indices.bufferView).toBe(0);
  expect(model.json.accessors[0].sparse.values.bufferView).toBe(1);
  expect([...bytesAt(model, 0)]).toEqual([5,6,7,8]);
  expect([...bytesAt(model, 1)]).toEqual([9,10,11,12]);
  expect(result.models.get('models/c.glb')).toBe(unsupported);
});
