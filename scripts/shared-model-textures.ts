import { createHash } from 'node:crypto';
import path from 'node:path';

// These extensions only describe materials. Buffer-layout extensions (notably
// Meshopt) must keep their original binary layout and are deliberately skipped.
const materialExtensions = new Set(['KHR_materials_clearcoat', 'KHR_materials_transmission',
  'KHR_materials_emissive_strength', 'KHR_materials_ior', 'KHR_materials_sheen']);
interface BufferView { buffer: number; byteOffset?: number; byteLength: number; [key: string]: unknown; }
interface Image { bufferView?: number; uri?: string; mimeType?: string; [key: string]: unknown; }
interface Accessor {
  bufferView?: number;
  sparse?: { indices: { bufferView: number }; values: { bufferView: number } };
}
interface Document {
  buffers: { byteLength: number; uri?: string }[];
  bufferViews: BufferView[];
  images?: Image[];
  accessors?: Accessor[];
  extensionsUsed?: string[];
}
interface Model { json: Document; binary: Buffer; }
function parse(bytes: Buffer): Model | undefined {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) return;
  const end = 20 + bytes.readUInt32LE(12);
  if (end + 8 > bytes.length || bytes.readUInt32LE(end + 4) !== 0x004e4942
    || end + 8 + bytes.readUInt32LE(end) !== bytes.length) return;
  const json = JSON.parse(bytes.subarray(20, end).toString()) as Document;
  if (json.buffers?.length !== 1 || json.buffers[0].uri || !json.bufferViews
    || json.extensionsUsed?.some(name => !materialExtensions.has(name))) return;
  const binary = bytes.subarray(end + 8);
  for (const view of json.bufferViews) {
    if (view.buffer !== 0 || view.extensions || (view.byteOffset ?? 0) + view.byteLength > binary.length) return;
  }
  return { json, binary };
}
function viewBytes(model: Model, index: number) {
  const view = model.json.bufferViews[index];
  return model.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
}
function pack(json: Document, binary: Buffer) {
  const raw = Buffer.from(JSON.stringify(json));
  const text = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(text);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + text.length + binary.length, 8);
  header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, text, binHeader, binary]);
}

/** Externalize only byte-identical embedded images shared by distinct GLBs. */
export function shareModelTextures(inputs: Map<string, Buffer>) {
  const models = new Map<string, Model>();
  const images = new Map<string, { bytes: Buffer; files: Set<string> }>();
  const imageKeys = new Map<Image, string>();
  for (const [file, bytes] of inputs) {
    const model = parse(bytes); if (!model) continue;
    models.set(file, model);
    for (const image of model.json.images ?? []) {
      if (image.bufferView === undefined || image.uri || !['image/png', 'image/jpeg'].includes(image.mimeType ?? '')) continue;
      const bytes = viewBytes(model, image.bufferView);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const key = `${hash}.${image.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      const group = images.get(key) ?? { bytes, files: new Set<string>() };
      if (!group.bytes.equals(bytes)) throw new Error('Shared texture hash collision');
      group.files.add(file); images.set(key, group); imageKeys.set(image, key);
    }
  }
  const shared = new Map<string, Buffer>(), outputs = new Map(inputs);
  for (const [file, model] of models) {
    const extracted = new Map<number, string>();
    for (const [index, image] of (model.json.images ?? []).entries()) {
      const key = imageKeys.get(image);
      if (key && images.get(key)!.files.size > 1) extracted.set(index, `textures/shared/${key}`);
    }
    if (!extracted.size) continue;
    const json = structuredClone(model.json);
    const removed = new Set([...extracted.keys()].map(index => model.json.images![index].bufferView!));
    // A view used by geometry, sparse data, or a non-extracted image remains intact.
    for (const accessor of model.json.accessors ?? []) {
      if (accessor.bufferView !== undefined) removed.delete(accessor.bufferView);
      if (accessor.sparse) { removed.delete(accessor.sparse.indices.bufferView); removed.delete(accessor.sparse.values.bufferView); }
    }
    model.json.images?.forEach((image, index) => { if (!extracted.has(index) && image.bufferView !== undefined) removed.delete(image.bufferView); });
    const mapping = new Map<number, number>(), parts: Buffer[] = [];
    let offset = 0;
    json.bufferViews = [];
    model.json.bufferViews.forEach((view, index) => {
      if (removed.has(index)) return;
      mapping.set(index, json.bufferViews.length);
      json.bufferViews.push({ ...view, byteOffset: offset });
      const bytes = viewBytes(model, index), padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4);
      bytes.copy(padded); parts.push(padded); offset += padded.length;
    });
    const remap = (index: number) => {
      const result = mapping.get(index); if (result === undefined) throw new Error(`Removed referenced buffer view in ${file}`);
      return result;
    };
    for (const accessor of json.accessors ?? []) {
      if (accessor.bufferView !== undefined) accessor.bufferView = remap(accessor.bufferView);
      if (accessor.sparse) { accessor.sparse.indices.bufferView = remap(accessor.sparse.indices.bufferView); accessor.sparse.values.bufferView = remap(accessor.sparse.values.bufferView); }
    }
    json.images?.forEach((image, index) => {
      const target = extracted.get(index);
      if (target) {
        const bytes = viewBytes(model, model.json.images![index].bufferView!);
        shared.set(target, bytes); delete image.bufferView;
        image.uri = path.posix.relative(path.posix.dirname(file), target);
      } else if (image.bufferView !== undefined) image.bufferView = remap(image.bufferView);
    });
    json.buffers[0].byteLength = offset;
    const output = pack(json, Buffer.concat(parts)), decoded = parse(output)!;
    // Verify every retained binary view and every extracted image byte-for-byte.
    for (const [oldIndex, newIndex] of mapping) {
      if (!viewBytes(model, oldIndex).equals(viewBytes(decoded, newIndex))) throw new Error(`Changed binary data in ${file}`);
    }
    for (const [index, target] of extracted) {
      if (!shared.get(target)!.equals(viewBytes(model, model.json.images![index].bufferView!))) throw new Error(`Changed image in ${file}`);
    }
    outputs.set(file, output);
  }
  return { models: outputs, shared };
}
