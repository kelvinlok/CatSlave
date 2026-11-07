import * as THREE from 'three';
import { readModelResponse } from './model-download';
import { prepareAssetShaders } from './asset-shader-preparation';

/** Replace only the wall kit; inherit the existing festive visibility switch. */
export async function loadChristmasWallDecor(parent: THREE.Group, fallback: THREE.Group) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}models/christmas-wall-decor.glb${import.meta.env.PROD ? '.gz' : ''}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Wall decoration asset HTTP ${response.status}`);
    const buffer = await readModelResponse(response);
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const asset = (await new GLTFLoader().parseAsync(buffer, `${import.meta.env.BASE_URL}models/`)).scene;
    asset.name = 'Blender wall decorations';
    asset.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    await prepareAssetShaders(asset, 'room');
    parent.add(asset); fallback.removeFromParent(); parent.userData.wallDecorLoaded = true;
    if (parent.parent) parent.parent.userData.visualRevision = (parent.parent.userData.visualRevision ?? 0) + 1;
    fallback.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  } catch (error) { console.warn('Wall decorations could not load; keeping the fallback.', error); }
  finally { clearTimeout(timeout); }
}
