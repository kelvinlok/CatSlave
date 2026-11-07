import * as THREE from 'three';
import { readModelResponse } from './model-download';
import { prepareAssetShaders } from './asset-shader-preparation';
import { FURNITURE_DEFINITIONS } from './room-layout';

const lights = new WeakMap<THREE.Object3D, THREE.MeshStandardMaterial[]>();

/** Stable furniture owner exists before either asynchronous room asset arrives. */
export function createChristmasTree() {
  const root = new THREE.Group(); root.name = 'Christmas tree';
  root.userData.furnitureId = 'christmas-tree';
  const pose = FURNITURE_DEFINITIONS.find(item => item.id === 'christmas-tree')?.defaultPose;
  if (pose) root.position.set(pose.x, 0, pose.z);
  // A small loading silhouette also keeps the collision volume legible offline.
  const placeholder = new THREE.Group(); root.add(placeholder);
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(.62 - i * .13, 1, 12),
      new THREE.MeshStandardMaterial({ color: i % 2 ? '#245a3e' : '#173d2c' }));
    mesh.position.y = .7 + i * .46; placeholder.add(mesh);
  }
  if (typeof window !== 'undefined') void (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}models/christmas-tree.glb${import.meta.env.PROD ? '.gz' : ''}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Tree asset HTTP ${response.status}`);
      const buffer = await readModelResponse(response);
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const asset = (await new GLTFLoader().parseAsync(buffer, `${import.meta.env.BASE_URL}models/`)).scene;
      const bulbs = new Set<THREE.MeshStandardMaterial>();
      asset.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true; object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial && material.name.startsWith('TreeLights_')) bulbs.add(material);
        }
      });
      await prepareAssetShaders(asset, 'room');
      root.add(asset); lights.set(root, [...bulbs]); root.userData.loaded = true;
      placeholder.removeFromParent();
      placeholder.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); object.material.dispose(); } });
    } catch (error) { console.warn('Christmas tree asset unavailable; keeping the loading silhouette.', error); }
    finally { clearTimeout(timeout); }
  })();
  return root;
}

/** Slow alternating glow, with steady lights when reduced motion is requested. */
export function updateChristmasTree(root: THREE.Object3D, time: number, reducedMotion = false) {
  for (const material of lights.get(root) ?? []) {
    const phase = Number(material.name.slice('TreeLights_'.length)) || 0;
    material.emissiveIntensity = reducedMotion ? 1.6 : .5 + 2.1 * (.5 + .5 * Math.sin(time * Math.PI + phase * Math.PI * 2 / 3));
  }
}
