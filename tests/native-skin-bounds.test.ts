import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SkinBounds } from '../src/skin-bounds';

it('contains every vertex of all nine authored cats in extreme posed configurations', async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Geometry/skin data is unchanged; image decoding is irrelevant to bounds.
  loader.register(() => ({ name: 'TEST_TEXTURES', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  let checked = 0, eligible = 0;
  const point = new THREE.Vector3();
  for (const file of readdirSync('public/models').filter(name => name.endsWith('.glb') && name !== 'lounge.glb')) {
    const bytes = readFileSync(`public/models/${file}`);
    const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const skins: { mesh: THREE.SkinnedMesh; bounds: SkinBounds }[] = [], bones: THREE.Bone[] = [];
    scene.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) skins.push({ mesh: object, bounds: new SkinBounds(object) });
      if (object instanceof THREE.Bone) bones.push(object);
    });
    for (let pose=0;pose<4;pose++) {
      if (pose) bones.forEach((bone, i) => {
        bone.rotation.set(Math.sin(i+pose)*1.8, Math.cos(i*.7+pose)*2.4, Math.sin(i*.4-pose));
        bone.scale.set(.6+(i%3)*.4, .7+(i%4)*.3, .8+(i%2)*.5);
      });
      scene.updateMatrixWorld(true);
      for (const {mesh,bounds} of skins) {
        bounds.update();
        if (!mesh.frustumCulled) continue;
        eligible++;
        const sphere=mesh.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
        for(let vertex=0;vertex<mesh.geometry.getAttribute('position').count;vertex++) {
          mesh.getVertexPosition(vertex,point).applyMatrix4(mesh.matrixWorld); checked++;
          if(!sphere.containsPoint(point)) throw new Error(`${file}: ${mesh.name} pose ${pose} vertex ${vertex} escaped bounds`);
        }
      }
    }
  }
  expect(eligible).toBeGreaterThan(100); expect(checked).toBeGreaterThan(1_000_000);
  console.log({posedMeshes:eligible,checkedVertices:checked});
}, 60000);
