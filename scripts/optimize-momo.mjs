/**
 * Reproduce Momo's offline, high-precision Meshopt export. No app dependencies change.
 * Run once from the repository root:
 * npm install --prefix artifacts/momo-soft-groom/tooling --save-exact --no-audit --no-fund @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer@1.2.0
 *
 * Then, after the Blender export (use separate input/output paths):
 * node scripts/optimize-momo.mjs artifacts/momo-soft-groom/source.glb artifacts/momo-soft-groom/momo-optimized.glb
 *
 * Requires GLTFLoader.setMeshoptDecoder(MeshoptDecoder) in the game.
 * Positions/normals/UVs/colors use 16-bit quantization; skin weights remain Float32.
 * No simplification, texture changes, material merging, or scene flattening.
 * Docs: https://gltf-transform.dev/modules/functions/functions/quantize
 * https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = path.join(root, 'artifacts/momo-soft-groom/tooling/node_modules');
const [inputArg, outputArg, ...extra] = process.argv.slice(2);
if (!inputArg || !outputArg || extra.length) {
  throw new Error('Usage: node scripts/optimize-momo.mjs <raw Blender input.glb> <separate output.glb>');
}
const input = path.resolve(inputArg), output = path.resolve(outputArg);
if (input.toLowerCase() === output.toLowerCase()) throw new Error('Input and output must be separate files.');

async function dependency(name, version, entry) {
  const folder = path.join(modules, name);
  const pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`${name}: expected ${version}, found ${pkg.version}. Run the pinned install command above.`);
  return import(pathToFileURL(path.join(folder, entry)).href);
}
const [{ NodeIO, PropertyType }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { dedup, weld, quantize }, { MeshoptEncoder, MeshoptDecoder }] = await Promise.all([
  dependency('@gltf-transform/core', '4.5.1', 'dist/index.js'),
  dependency('@gltf-transform/extensions', '4.5.1', 'dist/index.js'),
  dependency('@gltf-transform/functions', '4.5.1', 'dist/index.js'),
  dependency('meshoptimizer', '1.2.0', 'index.js'),
]);
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const source = await fs.readFile(input);
const doc = await io.readBinary(source);
const sourceRoot = doc.getRoot();
if (sourceRoot.listExtensionsUsed().some(ext => ['KHR_mesh_quantization', 'EXT_meshopt_compression'].includes(ext.extensionName))) {
  throw new Error('Input must be the original Blender export, not an already optimized asset.');
}
if (!sourceRoot.listNodes().some(node => node.getName() === 'Momo_ContinuousSkin') ||
    sourceRoot.listSkins().length !== 1 || sourceRoot.listSkins()[0].listJoints().length !== 28) {
  throw new Error('Expected the native Momo export with one 28-bone skin.');
}
const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort()) : v);
const metadata = root => ['Nodes', 'Meshes', 'Materials', 'Textures', 'Skins'].map(kind =>
  root[`list${kind}`]().map(item => ({ name: item.getName(), extras: item.getExtras() })));
const beforeMetadata = stable(metadata(sourceRoot));
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR], keepUniqueNames: true }), weld());
await doc.transform(quantize({
  quantizationVolume: 'scene',
  pattern: /^(POSITION|NORMAL|TANGENT|TEXCOORD_.*|COLOR_.*|JOINTS_.*)$/,
  quantizePosition: 16, quantizeNormal: 16, quantizeTexcoord: 16, quantizeColor: 16,
  normalizeWeights: false,
}));
// Retain the audited quantize/write/read/compress sequence and accessor ordering.
const quantizedBytes = await io.writeBinary(doc);
const quantized = await io.readBinary(quantizedBytes);
quantized.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const result = await io.writeBinary(quantized);
const decoded = await io.readBinary(result);
if (stable(metadata(decoded.getRoot())) !== beforeMetadata) throw new Error('Object names or extras changed.');
const attributes = quantized.getRoot().listAccessors(), decodedAttributes = decoded.getRoot().listAccessors();
if (attributes.length !== decodedAttributes.length) throw new Error('Accessor count changed during compression.');
for (let i = 0; i < attributes.length; i++) {
  const a = attributes[i], b = decodedAttributes[i], av = a.getArray(), bv = b.getArray();
  if (a.getType() !== b.getType() || a.getComponentType() !== b.getComponentType() || av.length !== bv.length) {
    throw new Error(`Accessor ${i} shape changed during compression.`);
  }
  if (a.getType() === 'SCALAR') {
    // Meshopt may cyclically rotate a triangle's indices; winding/order stay intact.
    for (let k = 0; k < av.length; k += 3) {
      if (![0, 1, 2].some(rotation => [0, 1, 2].every(c => av[k + c] === bv[k + (c + rotation) % 3]))) {
        throw new Error(`Triangle order or winding changed in accessor ${i}.`);
      }
    }
  } else if (!av.every((value, index) => value === bv[index])) {
    throw new Error(`Vertex attributes or inverse binds changed in accessor ${i}.`);
  }
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, result);
console.log(JSON.stringify({ input, output, sourceBytes: source.byteLength, quantizedBytes: quantizedBytes.byteLength,
  outputBytes: result.byteLength, savedPercent: +(100 * (1 - result.byteLength / source.byteLength)).toFixed(2),
  sha256: createHash('sha256').update(result).digest('hex'), bones: 28, skinPalettes: 1,
  metadataPreserved: true, compressionRoundTrip: 'Exact attributes/inverse binds; triangle winding/order preserved',
}, null, 2));
