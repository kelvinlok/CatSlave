import { expect, it } from 'vitest';
import * as THREE from 'three';
import { indexCostumeGeometry } from '../src/index-costume-geometry';
import { buildFootwearFlex } from '../src/cat-costume-motion';

it('preserves every triangle attribute and corrective while retaining seams', () => {
  const geometry = new THREE.BoxGeometry().toNonIndexed();
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('ankleFlex', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
  const original = geometry.clone();
  indexCostumeGeometry(geometry);
  expect(geometry.index!.count).toBe(count);
  expect(geometry.getAttribute('position').count).toBeLessThan(count);
  buildFootwearFlex(original); buildFootwearFlex(geometry);
  const expanded = geometry.toNonIndexed();
  for (const [name, attribute] of Object.entries(original.attributes)) {
    expect(expanded.getAttribute(name).array).toEqual(attribute.array);
  }
  for (const name of ['position', 'normal'] as const) {
    original.morphAttributes[name]!.forEach((attribute, index) => {
      expect(expanded.morphAttributes[name]![index].array).toEqual(attribute.array);
    });
  }
});
