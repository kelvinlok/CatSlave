import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

export const blenderRigControls = ['body', 'head',
  ...Array.from({ length: 4 }, (_, i) => [`leg${i}`, `lowerLeg${i}`, `paw${i}`]).flat(),
  'ear0', 'ear1', 'eye0', 'eye1', 'closedEye0', 'closedEye1', 'tail',
  ...Array.from({ length: 5 }, (_, i) => `tailJoint${i}`)];
const controlNames = new Set(blenderRigControls);
const nativeRootName = '__blenderSkinnedVisual';

interface Driver {
  controller: THREE.Object3D; bone: THREE.Bone; offset: THREE.Matrix4;
  blend?: { controller: THREE.Object3D; offset: THREE.Matrix4; weight: number };
}
interface RigBinding {
  visual: THREE.Object3D;
  drivers: Map<THREE.Object3D, Driver>;
  visibility: { visual: THREE.Object3D; controller: THREE.Object3D }[];
  desired: THREE.Matrix4;
  inverse: THREE.Matrix4;
  candidate: THREE.Matrix4;
  positionA: THREE.Vector3; positionB: THREE.Vector3;
  rotationA: THREE.Quaternion; rotationB: THREE.Quaternion;
  scaleA: THREE.Vector3; scaleB: THREE.Vector3;
}
const bindings = new WeakMap<THREE.Object3D, RigBinding>();

export function hasNativeBlenderRig(scene: THREE.Object3D) {
  return scene.getObjectByName('DEF_body') instanceof THREE.Bone;
}

/** Reject an incomplete native rig rather than silently treating it as loose meshes. */
export function validateNativeBlenderRig(scene: THREE.Object3D) {
  for (const name of blenderRigControls) {
    if (!(scene.getObjectByName(`DEF_${name}`) instanceof THREE.Bone)) {
      throw new Error(`Blender armature is missing bone DEF_${name}`);
    }
  }
  let skins = 0;
  scene.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const positions = object.geometry.getAttribute('position');
    const indices = object.geometry.getAttribute('skinIndex');
    const weights = object.geometry.getAttribute('skinWeight');
    if (!positions || indices?.count !== positions.count || weights?.count !== positions.count || !object.skeleton.bones.length) {
      throw new Error(`Blender mesh ${object.name} has incomplete skin data`);
    }
    skins++;
  });
  if (!skins) throw new Error('Blender armature has no skinned meshes');
}

/**
 * Import the complete authored armature with its skin weights and inverse binds.
 * Existing game controls become an invisible pose driver, never a second visible rig.
 */
export function attachNativeBlenderRig(root: THREE.Group, source: THREE.Group, kind: string) {
  // The procedural tail's initial decorative pose is not the skeleton's bind pose.
  for (let i = 0; i < 5; i++) root.getObjectByName(`tailJoint${i}`)!.rotation.set(0, 0, 0);
  const strip = (object: THREE.Object3D) => {
    if (object.name === 'anger') return;
    if (object instanceof THREE.Mesh) {
      if (!controlNames.has(object.name)) { object.removeFromParent(); return; }
      // Eye controls are Mesh instances because the procedural animator scales them.
      object.geometry = new THREE.BufferGeometry();
      object.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    }
    [...object.children].forEach(strip);
  };
  [...root.children].forEach(strip);
  const visual = cloneRig(source) as THREE.Group;
  visual.traverse(object => {
    if (!object.name.startsWith('DEF_')) object.name = `${kind}_${object.name}`;
    if (object instanceof THREE.Mesh) {
      object.castShadow = true; object.receiveShadow = true;
      // GPU-deformed fur and skin can exceed their rest bounds in reaches/jumps.
      object.frustumCulled = false;
    }
  });
  visual.name = nativeRootName;
  root.add(visual); root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  for (const name of blenderRigControls) {
    const controller = root.getObjectByName(name)!;
    const bone = visual.getObjectByName(`DEF_${name}`) as THREE.Bone;
    const controlRest = new THREE.Matrix4().multiplyMatrices(rootInverse, controller.matrixWorld);
    const boneRest = new THREE.Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld);
    // Only clone-safe values are stored; instance references are resolved lazily.
    bone.userData.gameController = name;
    bone.userData.gameRestOffset = controlRest.invert().multiply(boneRest).toArray();
    bone.matrixAutoUpdate = false;
  }
  // Optional intermediate neck bones distribute large head turns without
  // directly blending opposite body/head transforms across the entire neck.
  for (const [name, weight] of [['neckBase', 1 / 3], ['neckTop', 2 / 3]] as const) {
    const bone = visual.getObjectByName(`DEF_${name}`);
    if (!(bone instanceof THREE.Bone)) continue;
    const boneRest = new THREE.Matrix4().multiplyMatrices(rootInverse, bone.matrixWorld);
    const bodyRest = new THREE.Matrix4().multiplyMatrices(rootInverse, root.getObjectByName('body')!.matrixWorld);
    const headRest = new THREE.Matrix4().multiplyMatrices(rootInverse, root.getObjectByName('head')!.matrixWorld);
    bone.userData.gameController = 'body';
    bone.userData.gameRestOffset = bodyRest.invert().multiply(boneRest).toArray();
    bone.userData.gameBlendController = 'head';
    bone.userData.gameBlendRestOffset = headRest.invert().multiply(boneRest).toArray();
    bone.userData.gameBlendWeight = weight;
    bone.matrixAutoUpdate = false;
  }
  root.userData.modelRig = 'blender-armature';
  updateBlenderCatRig(root);
}

function bindingFor(root: THREE.Object3D): RigBinding {
  const cached = bindings.get(root);
  if (cached) return cached;
  const visual = root.getObjectByName(nativeRootName)!;
  const binding: RigBinding = { visual, drivers: new Map(), visibility: [], desired: new THREE.Matrix4(), inverse: new THREE.Matrix4(),
    candidate: new THREE.Matrix4(), positionA: new THREE.Vector3(), positionB: new THREE.Vector3(),
    rotationA: new THREE.Quaternion(), rotationB: new THREE.Quaternion(), scaleA: new THREE.Vector3(), scaleB: new THREE.Vector3() };
  const skeletons = new Map<string, THREE.Skeleton>();
  visual.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) {
      // SkeletonUtils clones one Skeleton per mesh. Skin/fur/details can share
      // a single palette within this cat when their exported binds agree exactly.
      // Bone UUIDs make it impossible for this cache to cross instance boundaries.
      const skeleton = object.skeleton;
      const key = skeleton.bones.map((bone, i) => `${bone.uuid}:${skeleton.boneInverses[i].elements.join(',')}`).join('|');
      const shared = skeletons.get(key);
      if (shared && shared !== skeleton) {
        object.skeleton = shared;
        skeleton.dispose();
      } else skeletons.set(key, skeleton);
    }
    if (object instanceof THREE.Bone && typeof object.userData.gameController === 'string') {
      const driver: Driver = { bone: object, controller: root.getObjectByName(object.userData.gameController)!,
        offset: new THREE.Matrix4().fromArray(object.userData.gameRestOffset) };
      if (typeof object.userData.gameBlendController === 'string') {
        driver.blend = { controller: root.getObjectByName(object.userData.gameBlendController)!,
          offset: new THREE.Matrix4().fromArray(object.userData.gameBlendRestOffset), weight: object.userData.gameBlendWeight };
      }
      binding.drivers.set(object, driver);
    }
    if (typeof object.userData.visibilitySlot === 'string') {
      const controller = root.getObjectByName(object.userData.visibilitySlot);
      if (controller) binding.visibility.push({ visual: object, controller });
    }
  });
  bindings.set(root, binding);
  return binding;
}

/** Drive Blender bones after IK/attention/rearing has finalized the gameplay pose. */
export function updateBlenderCatRig(root: THREE.Group) {
  if (root.userData.modelRig !== 'blender-armature') return;
  const binding = bindingFor(root);
  root.updateWorldMatrix(true, true);
  const visit = (object: THREE.Object3D) => {
    const driver = binding.drivers.get(object);
    if (driver) {
      binding.desired.multiplyMatrices(driver.controller.matrixWorld, driver.offset);
      if (driver.blend) {
        binding.candidate.multiplyMatrices(driver.blend.controller.matrixWorld, driver.blend.offset);
        binding.desired.decompose(binding.positionA, binding.rotationA, binding.scaleA);
        binding.candidate.decompose(binding.positionB, binding.rotationB, binding.scaleB);
        // Slerp preserves the neck frame's rotation/volume even at a 146° turn.
        // Linear matrix interpolation would shrink its cross-section instead.
        binding.positionA.lerp(binding.positionB, driver.blend.weight);
        binding.rotationA.slerp(binding.rotationB, driver.blend.weight);
        binding.scaleA.lerp(binding.scaleB, driver.blend.weight);
        binding.desired.compose(binding.positionA, binding.rotationA, binding.scaleA);
      }
      binding.inverse.copy(object.parent!.matrixWorld).invert();
      // Exact matrices preserve nonuniform breathing scale across different bone axes.
      object.matrix.multiplyMatrices(binding.inverse, binding.desired);
      object.matrixWorldNeedsUpdate = true;
    }
    object.updateWorldMatrix(false, false);
    object.children.forEach(visit);
  };
  visit(binding.visual);
  for (const item of binding.visibility) item.visual.visible = item.controller.visible;
  // Also refresh SkinnedMesh.bindMatrixInverse when the resident root has moved.
  root.updateMatrixWorld(true);
}
