import * as THREE from 'three';

/** Index exact attribute tuples, retaining UV seams, normals and flex tags. */
export function indexCostumeGeometry(geometry: THREE.BufferGeometry) {
  if (geometry.index) return;
  const entries = Object.entries(geometry.attributes);
  if (!entries.length || entries.some(([, a]) => !(a instanceof THREE.BufferAttribute) || !(a.array instanceof Float32Array))) return;
  const attributes = entries.map(([name, a]) => ({ name, attribute: a as THREE.BufferAttribute,
    bits: new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length) }));
  const count = attributes[0].attribute.count;
  if (attributes.some(a => a.attribute.count !== count)) return;
  const seen = new Map<number, number>(), unique: number[] = [], indices: number[] = [];
  const next = new Int32Array(count).fill(-1);
  const equal = (left: number, right: number) => attributes.every(({ attribute, bits }) => {
    for (let component = 0; component < attribute.itemSize; component++) {
      if (bits[left * attribute.itemSize + component] !== bits[right * attribute.itemSize + component]) return false;
    }
    return true;
  });
  for (let vertex = 0; vertex < count; vertex++) {
    let key = 2166136261;
    for (const { attribute, bits } of attributes) {
      for (let component = 0; component < attribute.itemSize; component++) key = Math.imul(key ^ bits[vertex * attribute.itemSize + component], 16777619);
    }
    const head = seen.get(key) ?? -1;
    let index = head;
    // Hash collisions never merge distinct attributes: compare all original bits.
    while (index !== -1 && !equal(vertex, unique[index])) index = next[index];
    if (index === -1) { index = unique.length; next[index] = head; seen.set(key, index); unique.push(vertex); }
    indices.push(index);
  }
  if (unique.length === count) return;
  for (const { name, attribute, bits } of attributes) {
    const array = new Float32Array(unique.length * attribute.itemSize), output = new Uint32Array(array.buffer);
    unique.forEach((vertex, index) => output.set(bits.subarray(vertex * attribute.itemSize, (vertex + 1) * attribute.itemSize), index * attribute.itemSize));
    const compact = new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
    compact.name = attribute.name;
    geometry.setAttribute(name, compact);
  }
  geometry.setIndex(indices);
}
