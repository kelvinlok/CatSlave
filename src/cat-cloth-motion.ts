import * as THREE from 'three';

const STEP = .1;
const attachment = new THREE.Vector3();
const restAttachment = new THREE.Vector3(0, .81, .45);
const displacement = new THREE.Vector3();

/** Shared corrective shapes: neck follows the cat while the back stays draped. */
export function buildClothDrape(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const gradient = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const t = THREE.MathUtils.clamp((positions.getZ(i) + .02) / .49, 0, 1);
    gradient[i] = .58 * 6 * t * (1 - t) / .49;
  }
  geometry.setAttribute('clothGradient', new THREE.Float32BufferAttribute(gradient, 1));
  const targets = [0, 1, 2].map(axis => {
    const values = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      // The neckline bridges the torso and the moving base of the head.
      // Cape hems at the rump stay on the torso; scarf tails follow the knot.
      const weight = THREE.MathUtils.smoothstep(positions.getZ(i), -.02, .47) * .58;
      values[i * 3 + axis] = STEP * weight;
    }
    const attribute = new THREE.Float32BufferAttribute(values, 3);
    attribute.name = `neck-${'xyz'[axis]}`;
    return attribute;
  });
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = targets;
  geometry.userData.clothDrape = true;
}

/** Exact inverse-transpose of the neck correction, before lighting/normal maps. */
export function clothDrapeMaterial(source: THREE.MeshStandardMaterial) {
  const material = source.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute float clothGradient;');
    shader.vertexShader = shader.vertexShader.replace('#include <morphnormal_vertex>', `
      #include <morphnormal_vertex>
      #ifdef USE_MORPHTARGETS
        vec3 clothShift = vec3(morphTargetInfluences[0], morphTargetInfluences[1], morphTargetInfluences[2]) * 0.1;
        objectNormal.z -= clothGradient * dot(clothShift, objectNormal)
          / max(0.2, 1.0 + clothGradient * clothShift.z);
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'cat-cloth-normal-v1';
  return material;
}

/** Deterministic pose correction also works while paused and after re-equipping. */
export function updateCatClothMotion(root: THREE.Group, _time = 0) {
  const body = root.getObjectByName('body'), head = root.getObjectByName('head');
  const garment = body?.children.find(child => child.userData.costumeSlot === 'neckwear');
  if (!body || !head || !garment) return;
  head.updateWorldMatrix(true, false);
  body.updateWorldMatrix(true, false);
  attachment.set(0, -.18, -.12).applyMatrix4(head.matrixWorld);
  body.worldToLocal(attachment);
  displacement.copy(attachment).sub(restAttachment);
  // Keep the neckline on the neck envelope for extreme look-back poses.
  displacement.clampLength(0, .42).divide(garment.scale).divideScalar(STEP);
  for (const child of garment.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry?.userData.clothDrape || !mesh.morphTargetInfluences) continue;
    mesh.morphTargetInfluences[0] = displacement.x;
    mesh.morphTargetInfluences[1] = displacement.y;
    mesh.morphTargetInfluences[2] = displacement.z;
  }
}
