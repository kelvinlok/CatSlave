import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCat, applyCatOutfit } from '../src/cat-model';
import { updateCatClothMotion } from '../src/cat-cloth-motion';
import { PALETTE } from '../src/config';
import cloth from '../src/generated/costume-geometry.json';

describe('Blender costume cloth', () => {
  it('exports textured surfaces with thickness, outward finite normals and a game-sized mesh budget', () => {
    for (const parts of [cloth.cape, cloth.scarf]) {
      expect(parts.reduce((n, p) => n + p.indices.length / 3, 0)).toBeLessThan(6000);
      for (const part of parts) {
        expect(part.normals.length).toBe(part.positions.length);
        expect(part.uvs.length).toBe(part.positions.length / 3 * 2);
        expect(part.positions.every(Number.isFinite)).toBe(true);
        expect(Math.max(...part.indices)).toBeLessThan(part.positions.length / 3);
        for (let i = 0; i < part.normals.length; i += 3) {
          expect(Math.hypot(...part.normals.slice(i, i + 3))).toBeCloseTo(1, 3);
        }
      }
    }
  });

  it('keeps the cape on the back while its neckline follows the moving neck independently per cat', () => {
    const a = createCat(PALETTE[0]), b = createCat(PALETTE[0]);
    const cape = a.root.getObjectByName('christmas-neckwear')!.children[0] as THREE.Mesh;
    const twin = b.root.getObjectByName('christmas-neckwear')!.children[0] as THREE.Mesh;
    const positions = cape.geometry.getAttribute('position');
    let neck = 0, hem = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > positions.getZ(neck)) neck = i;
      if (positions.getZ(i) < positions.getZ(hem)) hem = i;
    }
    const originalNeck = cape.getVertexPosition(neck, new THREE.Vector3());
    const originalHem = cape.getVertexPosition(hem, new THREE.Vector3());
    a.head.position.y -= .16; a.head.position.z += .12;
    updateCatClothMotion(a.root);
    const movedNeck = cape.getVertexPosition(neck, new THREE.Vector3());
    expect(movedNeck.y).toBeLessThan(originalNeck.y - .06);
    expect(movedNeck.z).toBeGreaterThan(originalNeck.z + .04);
    expect(cape.getVertexPosition(hem, new THREE.Vector3()).distanceTo(originalHem)).toBeLessThan(.000001);
    expect(twin.getVertexPosition(neck, new THREE.Vector3()).distanceTo(originalNeck)).toBeLessThan(.000001);
    expect(cape.geometry).toBe(twin.geometry);
    const frozen = cape.morphTargetInfluences!.slice();
    updateCatClothMotion(a.root);
    expect(cape.morphTargetInfluences).toEqual(frozen);
    for (let i = 0; i < positions.count; i += 5) {
      expect(cape.geometry.boundingBox!.containsPoint(cape.getVertexPosition(i, new THREE.Vector3()))).toBe(true);
    }
    applyCatOutfit(a.root, 'choco', { headwear: 'none', neckwear: 'latte', footwear: 'none' });
    const scarf = a.root.getObjectByName('christmas-neckwear')!.children[0] as THREE.Mesh;
    expect(scarf.morphTargetInfluences).toEqual(frozen);
  });

  it('fits mixed scarves around Momo without changing shared item geometry', () => {
    for (const item of ['latte', 'didi', 'dingding'] as const) {
      const outfit = { headwear: 'none', neckwear: item, footwear: 'none' } as const;
      const fluffy = createCat(PALETTE[6], outfit).root.getObjectByName('christmas-neckwear')!;
      const standard = createCat(PALETTE[0], outfit).root.getObjectByName('christmas-neckwear')!;
      expect(fluffy.scale.x).toBeGreaterThan(standard.scale.x);
      expect(fluffy.position.z).toBeGreaterThan(standard.position.z);
      expect((fluffy.children[0] as THREE.Mesh).geometry).toBe((standard.children[0] as THREE.Mesh).geometry);
    }
  });
});
