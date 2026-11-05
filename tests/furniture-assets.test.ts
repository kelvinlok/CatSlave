import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/lounge/furniture-manifest.json';

interface Node {
  name?: string;
  children?: number[];
  mesh?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  extras?: { furnitureId?: string; contactShadow?: boolean; editorHide?: boolean; catWheelRotor?: boolean };
}
const bytes = readFileSync(new URL('../public/models/lounge.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { nodes: Node[] };
const nodes = gltf.nodes;
const childrenOf = (node: Node): Node[] => (node.children ?? []).flatMap(index => [nodes[index], ...childrenOf(nodes[index])]);

describe('exported movable lounge asset contract', () => {
  it('exports exactly one floor pivot for each of the 18 manifest items without changing its authored pose', () => {
    expect(Number.isSafeInteger(manifest.revision) && manifest.revision > 0).toBe(true);
    expect(manifest.items).toHaveLength(18);
    expect(nodes.filter(node => node.extras?.furnitureId)).toHaveLength(18);
    for (const item of manifest.items) {
      const matches = nodes.filter(node => node.extras?.furnitureId === item.id);
      expect(matches, item.id).toHaveLength(1);
      const pivot = matches[0];
      expect(pivot.translation?.[0] ?? 0, item.id).toBeCloseTo(item.x, 5);
      expect(pivot.translation?.[1] ?? 0, item.id).toBeCloseTo(0, 5);
      expect(pivot.translation?.[2] ?? 0, item.id).toBeCloseTo(item.z, 5);
      expect(pivot.rotation ?? [0, 0, 0, 1], item.id).toEqual([0, 0, 0, 1]);
      expect(pivot.scale ?? [1, 1, 1], item.id).toEqual([1, 1, 1]);
      expect(childrenOf(pivot).some(node => node.mesh !== undefined), item.id).toBe(true);
    }
  });

  it('keeps contact shadows with their furniture and separates editor occluders', () => {
    const shadowOwners = new Set<string>();
    for (const pivot of nodes.filter(node => node.extras?.furnitureId)) {
      const children = childrenOf(pivot);
      expect(children.some(node => node.extras?.editorHide), pivot.name).toBe(false);
      if (children.some(node => node.extras?.contactShadow)) shadowOwners.add(pivot.extras!.furnitureId!);
    }
    for (const id of ['sofa', 'loveseat', 'chair-1', 'chair-2', 'chair-3', 'chair-4', 'table-1', 'table-2', 'table-3', 'bed-1', 'bed-2', 'bed-3', 'recliner-1', 'recliner-2', 'wheel']) {
      expect(shadowOwners.has(id), id).toBe(true);
    }
    expect(nodes.filter(node => node.extras?.editorHide).length).toBeGreaterThan(0);
    const allOwnedShadows = nodes.filter(node => node.extras?.furnitureId).flatMap(childrenOf).filter(node => node.extras?.contactShadow);
    expect(allOwnedShadows.length).toBe(nodes.filter(node => node.extras?.contactShadow).length);
  });

  it('parents the independently spinning rotor inside the movable wheel at its center height', () => {
    const wheel = nodes.find(node => node.extras?.furnitureId === 'wheel')!;
    const rotors = childrenOf(wheel).filter(node => node.extras?.catWheelRotor);
    expect(rotors).toHaveLength(1);
    expect(rotors[0].translation?.[1]).toBeCloseTo(1.5, 5);
    expect(rotors[0].translation?.[0] ?? 0).toBeCloseTo(0, 5);
    expect(rotors[0].translation?.[2] ?? 0).toBeCloseTo(0, 5);
  });
});
