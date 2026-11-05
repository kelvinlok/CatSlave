import { expect, it } from 'vitest';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { SkinBounds } from '../src/skin-bounds';

function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,0,0, 2,1,-.5, 0,3,1, 1,-1,2], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0],4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, .25,.75,0,0, 0,1,0,0, .5,.5,0,0],4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const parent = new THREE.Group(); parent.position.set(7,-3,4); parent.rotation.set(.3,.8,-.2); parent.scale.set(1.2,.8,1.1);
  parent.add(mesh); mesh.position.set(.4,.1,.2); mesh.rotation.set(.5,.2,0);
  const a = new THREE.Bone(), b = new THREE.Bone(); b.position.y=1; a.add(b); mesh.add(a);
  parent.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([a,b]));
  return { mesh, parent, a, b };
}

function gpuPosition(mesh: THREE.SkinnedMesh, index: number) {
  const g = mesh.geometry, p = new THREE.Vector4().fromArray([...new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), index).toArray(),1]).applyMatrix4(mesh.bindMatrix);
  const value = new THREE.Vector4(0,0,0,0), matrix = new THREE.Matrix4();
  for(let slot=0;slot<4;slot++) {
    const bone=g.getAttribute('skinIndex').getComponent(index,slot), weight=g.getAttribute('skinWeight').getComponent(index,slot);
    matrix.multiplyMatrices(mesh.skeleton.bones[bone].matrixWorld,mesh.skeleton.boneInverses[bone]);
    value.add(p.clone().applyMatrix4(matrix).multiplyScalar(weight));
  }
  value.applyMatrix4(mesh.bindMatrixInverse);
  return new THREE.Vector3(value.x,value.y,value.z);
}

it('contains exact skinned vertices through extreme bends, nonuniform scales, and inherited shear', () => {
  const {mesh,parent,a,b}=fixture(), bounds=new SkinBounds(mesh);
  for(let pose=0;pose<35;pose++) {
    a.rotation.set(pose*.37,-pose*.21,pose*.11); a.scale.set(.3+pose*.05,2.4-pose*.05,.8);
    b.rotation.set(-pose*.41,pose*.29,.2); b.position.set(Math.sin(pose)*4,Math.cos(pose)*3,pose*.08);
    b.scale.set(1.8,.4+pose*.04,1.2); parent.rotation.y=pose*.17;
    parent.updateMatrixWorld(true); bounds.update();
    expect(mesh.frustumCulled).toBe(true);
    const worldSphere=mesh.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld);
    for(let i=0;i<mesh.geometry.getAttribute('position').count;i++) {
      const gpu=gpuPosition(mesh,i), precise=mesh.getVertexPosition(i,new THREE.Vector3());
      expect(mesh.boundingBox!.containsPoint(gpu)).toBe(true);
      expect(mesh.boundingSphere!.containsPoint(precise)).toBe(true);
      expect(worldSphere.containsPoint(gpu.applyMatrix4(mesh.matrixWorld))).toBe(true);
    }
  }
});

it('accounts for quantized non-unit weight sums and gives clones independent bounds', () => {
  const {mesh,parent,a}=fixture(), weights=mesh.geometry.getAttribute('skinWeight');
  weights.setX(0,.97); weights.setY(1,.79);
  const bounds=new SkinBounds(mesh); a.rotation.z=1.7; parent.updateMatrixWorld(true); bounds.update();
  const second=clone(mesh) as THREE.SkinnedMesh, secondBounds=new SkinBounds(second);
  second.skeleton.bones[0].position.x=20; second.updateMatrixWorld(true); secondBounds.update();
  expect(second.geometry).toBe(mesh.geometry); expect(second.boundingSphere).not.toBe(mesh.boundingSphere);
  expect(second.boundingBox!.equals(mesh.boundingBox!)).toBe(false);
  for(const item of [mesh,second])for(let i=0;i<4;i++) expect(item.boundingSphere!.containsPoint(gpuPosition(item,i))).toBe(true);
});

it('keeps unsupported vertex deformation and negative weights uncullable', () => {
  const {mesh,parent}=fixture();
  mesh.geometry.getAttribute('skinWeight').setX(0,-.1); parent.updateMatrixWorld(true);
  new SkinBounds(mesh).update(); expect(mesh.frustumCulled).toBe(false);
  const other=fixture(); other.parent.updateMatrixWorld(true); const bounds=new SkinBounds(other.mesh);
  (other.mesh.material as THREE.MeshStandardMaterial).displacementMap=new THREE.Texture();
  bounds.update(); expect(other.mesh.frustumCulled).toBe(false);
  (other.mesh.material as THREE.MeshStandardMaterial).displacementMap=null;
  other.mesh.geometry.morphAttributes.position=[other.mesh.geometry.getAttribute('position')];
  bounds.update(); expect(other.mesh.frustumCulled).toBe(false);
});
