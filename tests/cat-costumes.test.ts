import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCat, refreshCatModel } from '../src/cat-model';
import { christmasCostumeFor } from '../src/cat-costumes';
import { PALETTE } from '../src/config';
import { registerBlenderCatAsset } from '../src/blender-cat-asset';
import { blenderRigControls, updateBlenderCatRig } from '../src/blender-cat-rig';

describe('Christmas cat outfits', () => {
  it('dresses every resident with a named outfit while keeping geometry shared across instances', () => {
    const styles = new Set<string>();
    for (const cat of PALETTE) {
      const model = createCat(cat), twin = createCat(cat);
      styles.add(model.root.userData.christmasCostume);
      expect(model.root.userData.christmasCostumeName).toBe(christmasCostumeFor(cat.appearance).name);
      const headwear = model.root.getObjectByName('christmas-headwear')!;
      const neckwear = model.root.getObjectByName('christmas-neckwear')!;
      expect(headwear.parent).toBe(model.head); expect(neckwear.parent).toBe(model.body);
      expect(headwear.children.length + neckwear.children.length).toBeLessThanOrEqual(6);
      expect(new THREE.Box3().setFromObject(headwear).max.y).toBeLessThan(1.9);
      for (const mesh of [...headwear.children, ...neckwear.children] as THREE.Mesh[]) {
        const other = twin.root.getObjectByName(mesh.name) as THREE.Mesh;
        expect(other).not.toBe(mesh); expect(other.geometry).toBe(mesh.geometry); expect(other.material).toBe(mesh.material);
        const bounds = mesh.geometry.boundingBox!;
        expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      }
      for (let i = 0; i < 4; i++) {
        const shoe = model.root.getObjectByName(`christmas-shoe${i}`)!;
        expect(shoe.parent).toBe(model.paws[i]); expect(shoe.userData.isCatCostume).toBe(true);
        expect(shoe.children).toHaveLength(1);
        const mesh = shoe.children[0] as THREE.Mesh;
        const other = twin.root.getObjectByName(`christmas-shoe${i}`)!.children[0] as THREE.Mesh;
        expect(mesh.geometry).toBe(other.geometry); expect(mesh.material).toBe(other.material);
        expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(-.069, 4);
        expect(mesh.geometry.boundingBox!.max.x).toBeLessThan(.145);
        expect(mesh.geometry.boundingBox!.max.z).toBeLessThan(.28);
      }
    }
    expect(styles.size).toBe(6);
  }, 15000);

  it('follows head and torso pose independently without changing a cloned outfit', () => {
    const model = createCat(PALETTE[0]), twin = createCat(PALETTE[0]);
    const hat = model.root.getObjectByName('christmas-headwear')!;
    const cape = model.root.getObjectByName('christmas-neckwear')!;
    model.root.updateMatrixWorld(true); twin.root.updateMatrixWorld(true);
    const initialHat = hat.matrixWorld.clone(), initialCape = cape.matrixWorld.clone();
    model.head.rotation.y = 1.2; model.head.position.x += .15; model.root.updateMatrixWorld(true);
    expect(hat.matrixWorld.equals(initialHat)).toBe(false);
    expect(cape.matrixWorld.equals(initialCape)).toBe(true);
    expect(twin.root.getObjectByName('christmas-headwear')!.matrixWorld.equals(initialHat)).toBe(true);
    model.body.scale.y = .8; model.root.updateMatrixWorld(true);
    expect(cape.matrixWorld.equals(initialCape)).toBe(false);
  });

  it('keeps each shoe attached to its own animated paw without moving its siblings or clone', () => {
    const model = createCat(PALETTE[1]), twin = createCat(PALETTE[1]);
    model.root.updateMatrixWorld(true); twin.root.updateMatrixWorld(true);
    const shoes = [0, 1, 2, 3].map(i => model.root.getObjectByName(`christmas-shoe${i}`)!);
    const before = shoes.map(shoe => shoe.matrixWorld.clone());
    model.legs[0].rotation.x = .6; model.paws[0].rotation.x = -.6; model.root.updateMatrixWorld(true);
    expect(shoes[0].matrixWorld.equals(before[0])).toBe(false);
    for (let i = 1; i < 4; i++) expect(shoes[i].matrixWorld.equals(before[i])).toBe(true);
    expect(twin.root.getObjectByName('christmas-shoe0')!.matrixWorld.equals(before[0])).toBe(true);
    for (let i = 0; i < 4; i++) expect(shoes[i].matrixWorld.equals(model.paws[i].matrixWorld)).toBe(true);
  });

  it('retains the outfit and its pose when a resident upgrades to a native Blender rig', () => {
    const model = createCat(PALETTE[2]); model.root.updateMatrixWorld(true);
    const source = new THREE.Group(), bones: THREE.Bone[] = [];
    for (const name of blenderRigControls) {
      const bone = new THREE.Bone(); bone.name = `DEF_${name}`; source.add(bone);
      model.root.getObjectByName(name)!.matrixWorld.decompose(bone.position, bone.quaternion, bone.scale); bones.push(bone);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, .7, 0, .1, .7, 0, 0, .8, 0], 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); source.add(skin);
    source.updateMatrixWorld(true); skin.bind(new THREE.Skeleton(bones));
    model.head.rotation.y = -.7; model.root.updateMatrixWorld(true);
    const hatBefore = model.root.getObjectByName('christmas-headwear')!.matrixWorld.clone();
    model.paws[0].position.z += .12; model.root.updateMatrixWorld(true);
    const shoeBefore = model.root.getObjectByName('christmas-shoe0')!.matrixWorld.clone();
    registerBlenderCatAsset('didi', source); refreshCatModel(model, PALETTE[2]);
    expect(model.root.userData.modelRig).toBe('blender-armature');
    expect(model.root.userData.christmasCostume).toBe('reindeer');
    const hats: THREE.Object3D[] = []; model.root.traverse(item => { if (item.name === 'christmas-headwear') hats.push(item); });
    expect(hats).toHaveLength(1); expect(hats[0].matrixWorld.elements).toEqual(hatBefore.elements);
    for (let i = 0; i < 4; i++) expect(model.root.getObjectByName(`christmas-shoe${i}`)!.parent).toBe(model.paws[i]);
    expect(model.root.getObjectByName('christmas-shoe0')!.matrixWorld.elements).toEqual(shoeBefore.elements);
    model.head.position.y += .2; updateBlenderCatRig(model.root);
    expect(new THREE.Vector3().setFromMatrixPosition(hats[0].matrixWorld).y).toBeCloseTo(1.19);
    expect(hats[0].children.every(item => item.visible)).toBe(true);
    model.paws[0].position.y += .16; updateBlenderCatRig(model.root);
    const shoe = model.root.getObjectByName('christmas-shoe0')!;
    expect(shoe.matrixWorld.equals(model.paws[0].matrixWorld)).toBe(true);
    expect(shoe.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  });
});
