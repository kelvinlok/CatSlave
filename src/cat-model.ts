import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CatDefinition } from './types';

export interface CatModel {
  root: THREE.Group; head: THREE.Group; tail: THREE.Group; anger: THREE.Group;
  eyes: THREE.Mesh[]; legs: THREE.Group[];
}
const sphere = new THREE.SphereGeometry(1, 16, 10);
const ear = new THREE.ConeGeometry(1, 1, 3);
const materials = new Map<string, THREE.MeshStandardMaterial>();
const templates = new Map<string, THREE.Group>();
function piece(parent: THREE.Object3D, color: string, p: number[], s: number[], geometry: THREE.BufferGeometry = sphere) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const mesh = new THREE.Mesh(geometry, materials.get(color));
  mesh.position.set(p[0], p[1], p[2]); mesh.scale.set(s[0], s[1], s[2]); parent.add(mesh); return mesh;
}
function batch(group: THREE.Group, excluded: THREE.Object3D[] = []) {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) if (child instanceof THREE.Mesh && !excluded.includes(child)) {
    const meshes = buckets.get(child.material) ?? []; meshes.push(child); buckets.set(child.material, meshes);
  }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    const geometry = mergeGeometries(parts); parts.forEach(p => p.dispose());
    meshes.forEach(m => m.removeFromParent()); group.add(new THREE.Mesh(geometry, mat));
  }
}

/** Forward is +Z. Each leg pivots at its shoulder/hip; paws rest at floor height. */
export function createCat(cat: Pick<CatDefinition, 'color' | 'accent'>): CatModel {
  const key = cat.color + cat.accent;
  if (!templates.has(key)) {
    const root = new THREE.Group(), head = new THREE.Group(), tail = new THREE.Group();
    const cream = '#f5e5cc', ink = '#302c2c';
    piece(root, cat.color, [0, 0.69, -0.12], [0.33, 0.34, 0.74]);
    piece(root, cat.color, [0, 0.65, 0.37], [0.32, 0.39, 0.33]);
    piece(root, cream, [0, 0.61, 0.66], [0.20, 0.25, 0.10]);
    for (let i = 0; i < 4; i++) {
      const front = i < 2, side = i % 2 ? 1 : -1;
      const leg = new THREE.Group(); leg.name = `leg${i}`;
      leg.position.set(side * 0.245, 0.57, front ? 0.4 : -0.62); root.add(leg);
      piece(leg, cat.color, [0, -0.18, front ? 0 : -0.035], [front ? 0.105 : 0.15, 0.25, 0.12]);
      piece(leg, cat.color, [0, -0.38, 0.025], [0.085, 0.17, 0.08]);
      piece(leg, cream, [0, -0.50, 0.085], [0.12, 0.07, 0.17]);
      batch(leg);
    }
    head.name = 'head'; head.position.set(0, 0.96, 0.57); root.add(head);
    piece(head, cat.color, [0, 0, 0], [0.36, 0.30, 0.30]);
    for (const side of [-1, 1]) {
      const outer = piece(head, cat.color, [side * 0.235, 0.27, -0.025], [0.18, 0.34, 0.16], ear);
      outer.rotation.z = -side * 0.18; outer.rotation.y = Math.PI;
      const inner = piece(head, '#d29388', [side * 0.235, 0.28, 0.075], [0.105, 0.22, 0.045], ear);
      inner.rotation.z = -side * 0.18; inner.rotation.y = Math.PI;
      piece(head, cream, [side * 0.1, -0.105, 0.255], [0.13, 0.10, 0.105]);
      const eye = piece(head, '#a8b77b', [side * 0.155, 0.035, 0.27], [0.073, 0.062, 0.032]);
      eye.name = `eye${side < 0 ? 0 : 1}`;
      // Pupils and glints are children so blinking scales the whole eye.
      piece(eye, ink, [0, 0, 0.8], [0.24, 0.9, 0.35]);
      piece(eye, '#ffffff', [-0.24, 0.3, 1], [0.19, 0.20, 0.2]);
      for (let i = 0; i < 3; i++) {
        const whisker = piece(head, '#eadbca', [side * 0.33, -0.09 - i * 0.04, 0.285], [0.17, 0.006, 0.006]);
        whisker.rotation.z = side * (0.13 - i * 0.14);
      }
    }
    piece(head, '#a96364', [0, -0.09, 0.357], [0.043, 0.026, 0.025]);
    piece(head, ink, [0, -0.14, 0.33], [0.012, 0.032, 0.009]);
    const anger = new THREE.Group(); anger.name = 'anger'; anger.visible = false; head.add(anger);
    for (const side of [-1, 1]) {
      const brow = piece(anger, cat.accent, [side * 0.15, 0.095, 0.30], [0.095, 0.023, 0.026]); brow.rotation.z = side * 0.35;
      const fang = piece(anger, '#fff1d8', [side * 0.045, -0.205, 0.326], [0.018, 0.052, 0.015], ear); fang.rotation.z = Math.PI;
    }
    piece(anger, '#482b2b', [0, -0.19, 0.29], [0.085, 0.065, 0.035]); batch(anger);
    for (let i = -1; i <= 1; i++) piece(head, cat.accent, [i * 0.09, 0.21, 0.20], [0.023, 0.069, 0.017]);
    tail.name = 'tail'; tail.position.set(0, 0.82, -0.76); root.add(tail);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, -0.20),
      new THREE.Vector3(0.06, 0.64, -0.30), new THREE.Vector3(0.22, 0.87, -0.25), new THREE.Vector3(0.35, 0.79, -0.18),
    ]);
    piece(tail, cat.color, [0, 0, 0], [1, 1, 1], new THREE.TubeGeometry(curve, 16, 0.065, 6, false));
    piece(tail, cat.accent, [0.35, 0.79, -0.18], [0.068, 0.07, 0.068]);
    batch(root); batch(head, head.children.filter(c => c.name.startsWith('eye'))); batch(tail);
    templates.set(key, root);
  }
  const root = templates.get(key)!.clone(true);
  return { root, head: root.getObjectByName('head') as THREE.Group, tail: root.getObjectByName('tail') as THREE.Group, anger: root.getObjectByName('anger') as THREE.Group,
    eyes: [0, 1].map(i => root.getObjectByName(`eye${i}`) as THREE.Mesh),
    legs: [0, 1, 2, 3].map(i => root.getObjectByName(`leg${i}`) as THREE.Group) };
}
