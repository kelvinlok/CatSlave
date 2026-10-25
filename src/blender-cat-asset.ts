import * as THREE from 'three';
import { attachNativeBlenderRig, hasNativeBlenderRig, validateNativeBlenderRig } from './blender-cat-rig';

const slots = ['body', 'head', ...Array.from({ length: 4 }, (_, i) => [`leg${i}`, `lowerLeg${i}`, `paw${i}`]).flat(),
  'ear0', 'ear1', 'eye0', 'eye1', 'closedEye0', 'closedEye1'];
const slotNames = new Set(slots);
export type BlenderCat = 'choco' | 'latte';
const sources = new Map<BlenderCat, THREE.Group>();
const loads = new Map<BlenderCat, Promise<boolean>>();
const label = (kind: BlenderCat) => kind === 'choco' ? 'Choco' : 'Latte';

/** Each authored cat has its own shared source, just like the procedural templates. */
export function registerBlenderCatAsset(kind: BlenderCat, scene: THREE.Group) {
  if (hasNativeBlenderRig(scene)) validateNativeBlenderRig(scene);
  else for (const name of slots) {
    if (!scene.getObjectByName(name)) throw new Error(`${label(kind)} asset is missing animation part ${name}`);
  }
  scene.updateMatrixWorld(true);
  sources.set(kind, scene);
}

/** Load before creating the room, including deployments below a repository base path. */
export function preloadBlenderCatAsset(kind: BlenderCat): Promise<boolean> {
  if (sources.has(kind)) return Promise.resolve(true);
  const pending = loads.get(kind);
  if (pending) return pending;
  const loading = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const url = `${import.meta.env.BASE_URL}models/${kind}.glb`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`${label(kind)} asset HTTP ${response.status}`);
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      registerBlenderCatAsset(kind, asset.scene);
      return true;
    } catch (error) {
      // A missing/cached asset must never prevent the cat-care game from starting.
      console.warn(`${label(kind)} model could not load; using the built-in model.`, error);
      return false;
    } finally { clearTimeout(timeout); }
  })();
  loads.set(kind, loading);
  return loading;
}

export function hasBlenderCatAsset(kind: string | undefined): kind is BlenderCat {
  return (kind === 'choco' || kind === 'latte') && sources.has(kind);
}

export async function preloadBlenderCatAssets() {
  return Promise.all([preloadBlenderCatAsset('choco'), preloadBlenderCatAsset('latte')]);
}

/** The authored tail coat and fur follow the same five independently cloned bones. */
function replaceTail(root: THREE.Group, scene: THREE.Group, kind: BlenderCat) {
  const target = root.getObjectByName('tail');
  const original = root.getObjectByName('tailSkin') as THREE.SkinnedMesh | undefined;
  const part = scene.getObjectByName('tail');
  if (!target || !original?.isSkinnedMesh || !part) return;
  const meshes: THREE.Mesh[] = [];
  part.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  if (!meshes.length) return;
  const inverse = target.matrixWorld.clone().invert();
  for (const [index, mesh] of meshes.entries()) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    const positions = geometry.getAttribute('position');
    const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      const along = THREE.MathUtils.clamp(positions.getY(i) / 0.18, 0, 4), a = Math.floor(along), weight = along - a;
      indices.set([a, Math.min(4, a + 1), 0, 0], i * 4);
      weights.set([1 - weight, weight, 0, 0], i * 4);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const visual = new THREE.SkinnedMesh(geometry, mesh.material);
    visual.name = index === 0 ? 'tailSkin' : `${kind}_${mesh.name}`;
    visual.castShadow = true; visual.receiveShadow = true;
    target.add(visual); visual.bind(original.skeleton, original.bindMatrix);
    visual.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.35, 0), 1.15);
  }
  original.removeFromParent();
}

/**
 * Keep the established IK/attention/blink pivots, replacing only the visible anatomy.
 * Baking world-space rest transforms also normalizes Blender's export axis conversion
 * and the eye groups' unscaled authored dimensions to the animator's eye scales.
 */
export function applyBlenderCatAsset(kind: BlenderCat, root: THREE.Group): boolean {
  const source = sources.get(kind);
  if (!source) return false;
  if (hasNativeBlenderRig(source)) {
    attachNativeBlenderRig(root, source, kind);
    root.userData.modelSource = 'blender';
    root.userData.modelAsset = `models/${kind}.glb`;
    return true;
  }
  root.updateMatrixWorld(true);
  source.updateMatrixWorld(true);
  for (const name of slots) {
    const target = root.getObjectByName(name), part = source.getObjectByName(name);
    if (!target || !part) continue;
    const meshes: THREE.Mesh[] = [];
    const visit = (object: THREE.Object3D) => {
      if (object !== part && slotNames.has(object.name)) return;
      if (object instanceof THREE.Mesh) meshes.push(object);
      object.children.forEach(visit);
    };
    visit(part);
    if (!meshes.length) continue;
    for (const child of [...target.children]) if (!slotNames.has(child.name) && child.name !== 'anger') target.remove(child);
    // Existing eyes are meshes with normalized geometry; retain their animated nodes.
    if (target instanceof THREE.Mesh) {
      target.geometry = new THREE.BufferGeometry();
      target.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    }
    const inverse = target.matrixWorld.clone().invert();
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const visual = new THREE.Mesh(geometry, mesh.material);
      visual.name = `${kind}_${mesh.name}`;
      visual.castShadow = true; visual.receiveShadow = true;
      target.add(visual);
    }
  }
  replaceTail(root, source, kind);
  root.userData.modelSource = 'blender';
  root.userData.modelAsset = `models/${kind}.glb`;
  return true;
}
