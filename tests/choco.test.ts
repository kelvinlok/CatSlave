import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCat, disposeCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { Game } from '../src/simulation';
import { World } from '../src/world';

describe('Choco', () => {
  it('is the first cat on the title, in the tutorial, and after restarting', () => {
    const game = new Game(1);
    const check = () => expect(game.cats[0]).toMatchObject({ name: 'Choco', appearance: 'choco', color: '#604239' });
    check(); game.reset(true); check(); game.reset(); check();
  });

  it('keeps the asymmetric forelegs and white toes attached to the animated rig', () => {
    const model = createCat(PALETTE[0]);
    const colors = (object: THREE.Object3D) => {
      const values = new Set<string>();
      object.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const colors = child.geometry.getAttribute('color');
          for (let i = 0; i < colors.count; i++) values.add(new THREE.Color().fromBufferAttribute(colors, i).getHexString());
        }
      });
      return values;
    };
    expect(colors(model.legs[0])).toContain('604239'); expect(colors(model.legs[0])).toContain('faf6ef');
    expect(colors(model.legs[1])).toContain('faf6ef'); expect(colors(model.legs[1])).not.toContain('604239');
    model.legs.forEach(leg => expect(new THREE.Box3().setFromObject(leg).min.y).toBeCloseTo(0, 3));
    expect(colors(model.head)).toContain('cbb45e');
    expect(colors(model.head)).toContain('d99b9f');
  });

  it('caches appearance separately from coat color and keeps each pose independent', () => {
    const a = createCat(PALETTE[0]), b = createCat(PALETTE[0]);
    const generic = createCat({ ...PALETTE[0], appearance: 'primitive' });
    expect(a.eyeHeight).toBe(0.080); expect(generic.eyeHeight).toBe(0.062);
    a.head.rotation.z = 0.4; a.legs[0].rotation.x = 0.8; a.eyes[0].scale.y = 0.01;
    expect(b.head.rotation.z).toBeCloseTo(0); expect(b.legs[0].rotation.x).toBeCloseTo(0);
    expect(b.eyes[0].scale.y).toBe(0.080);
  });

  it('shows the white blaze and bib on the outside of the coat', () => {
    const model = createCat(PALETTE[0]); model.root.updateMatrixWorld(true);
    for (const y of [1.08, 0.58]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 2), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(model.root, true)[0];
      const object = hit.object as THREE.Mesh, geometry = object.geometry;
      const local = object.worldToLocal(hit.point.clone()), points = geometry.getAttribute('position');
      const face = hit.face!, weights = THREE.Triangle.getBarycoord(local,
        new THREE.Vector3().fromBufferAttribute(points, face.a), new THREE.Vector3().fromBufferAttribute(points, face.b),
        new THREE.Vector3().fromBufferAttribute(points, face.c), new THREE.Vector3())!;
      const colors = geometry.getAttribute('color');
      const actual = new THREE.Vector3().fromBufferAttribute(colors, face.a).multiplyScalar(weights.x)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(colors, face.b), weights.y)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(colors, face.c), weights.z);
      const map = (object.material as THREE.MeshStandardMaterial).map;
      if (map instanceof THREE.DataTexture && hit.uv) {
        const { data, width, height } = map.image;
        if (!data) throw new Error('Expected coat texture pixels for the marking check.');
        const index = (Math.min(height - 1, Math.floor(hit.uv.y * height)) * width + Math.min(width - 1, Math.floor(hit.uv.x * width))) * 4;
        const sampled = new THREE.Color().setRGB(Number(data[index]) / 255, Number(data[index + 1]) / 255, Number(data[index + 2]) / 255, THREE.SRGBColorSpace);
        actual.multiply(new THREE.Vector3(sampled.r, sampled.g, sampled.b));
      }
      expect(actual.distanceTo(new THREE.Vector3(...new THREE.Color('#faf6ef').toArray()))).toBeLessThan(0.03);
    }
  });

  it('clones tail skeletons and releases their instance textures without disposing shared assets', () => {
    const a = createCat(PALETTE[0]), b = createCat(PALETTE[0]);
    const tailA = a.root.getObjectByName('tailSkin') as THREE.SkinnedMesh;
    const tailB = b.root.getObjectByName('tailSkin') as THREE.SkinnedMesh;
    expect(tailA.skeleton).not.toBe(tailB.skeleton); expect(tailA.geometry).toBe(tailB.geometry);
    expect(tailA.skeleton.bones[0]).toBe(a.tailJoints[0]);
    expect(tailB.skeleton.bones[0]).toBe(b.tailJoints[0]);
    tailA.skeleton.computeBoneTexture(); tailB.skeleton.computeBoneTexture();
    let released = false, sharedDisposed = false;
    tailA.skeleton.boneTexture!.addEventListener('dispose', () => { released = true; });
    tailA.geometry.addEventListener('dispose', () => { sharedDisposed = true; });
    disposeCat(a);
    expect(released).toBe(true); expect(sharedDisposed).toBe(false); expect(tailB.skeleton.boneTexture).not.toBeNull();
    disposeCat(b);
  });

  it('keeps the torso smooth across its duplicated texture seam', () => {
    const model = createCat(PALETTE[0]), torso = model.body.children[0] as THREE.Mesh;
    const points = torso.geometry.getAttribute('position'), normals = torso.geometry.getAttribute('normal');
    let pairs = 0;
    for (let i = 0; i < points.count; i += 29) {
      const a = new THREE.Vector3().fromBufferAttribute(points, i), b = new THREE.Vector3().fromBufferAttribute(points, i + 28);
      expect(a.distanceTo(b)).toBeLessThan(0.00001);
      const na = new THREE.Vector3().fromBufferAttribute(normals, i), nb = new THREE.Vector3().fromBufferAttribute(normals, i + 28);
      expect(na.distanceTo(nb)).toBeLessThan(0.00001); pairs++;
    }
    expect(pairs).toBeGreaterThan(20);
  });

  it('restores Choco’s round eyes after a blink in the live world', () => {
    const game = new Game(1), world = new World(); game.reset();
    world.update(game, 0, 0);
    const root = world.scene.children.find(child => child.userData.catId === game.cats[0].id)!;
    const eye = root.getObjectByName('eye0') as THREE.Mesh;
    expect(eye.scale.y).toBeCloseTo(0.080);
    game.cats[0].happyUntil = 1; world.update(game, 0, 0);
    game.clock = 0.25; world.update(game, 0, 0.25);
    expect(eye.scale.y).toBeLessThan(0.020);
    game.cats[0].happyUntil = 0; world.update(game, 0, 0.25);
    game.clock = 0.5; world.update(game, 0, 0.5);
    expect(eye.scale.y).toBeCloseTo(0.080);
  });
});
