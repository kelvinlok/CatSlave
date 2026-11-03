import * as THREE from 'three';
import { readModelResponse } from './model-download';
import layout from '../assets/lounge/layout.json';
import { ROOM_ENTRANCE } from './room-boundaries';

let source: THREE.Group | undefined;
let pending: Promise<THREE.Group | undefined> | undefined;

/** A single cached room download, independent of the progressive cat queue. */
function loadRoom() {
  pending ??= (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const url = `${import.meta.env.BASE_URL}models/lounge.glb${import.meta.env.PROD ? '.gz' : ''}`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Room asset HTTP ${response.status}`);
      const buffer = await readModelResponse(response);
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      loader.register(parser => {
        parser.textureLoader = new THREE.TextureLoader(parser.options.manager)
          .setCrossOrigin(parser.options.crossOrigin).setRequestHeader(parser.options.requestHeader);
        return { name: 'CATSLAVE_RESTORABLE_ROOM_TEXTURES' };
      });
      source = (await loader.parseAsync(buffer, '')).scene;
      return source;
    } catch (error) {
      console.warn('The lounge model could not load; using the simple room shell.', error);
      return undefined;
    } finally { clearTimeout(timeout); }
  })();
  return pending;
}

/** Keep care playable while the authored room loads, including offline failure. */
export function createRoom() {
  const root = new THREE.Group(); root.name = 'video-lounge'; root.userData.loaded = false;
  const shell = new THREE.Group(); shell.name = 'room-loading-shell'; root.add(shell);
  const floor = new THREE.MeshStandardMaterial({ color: '#bd956b', roughness: 0.8 });
  const wall = new THREE.MeshStandardMaterial({ color: '#e5e0d4', roughness: 0.95 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const part = (material: THREE.Material, position: number[], scale: number[]) => {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.fromArray(position); mesh.scale.fromArray(scale); shell.add(mesh);
  };
  const main = layout.mainRoom, mainWidth = main.maxX - main.minX, mainCenter = (main.minX + main.maxX) / 2;
  part(floor, [mainCenter, -0.1, 0], [mainWidth, 0.2, 16]);
  part(floor, [7.25, -0.1, 2.5], [4.5, 0.2, 10]);
  part(wall, [mainCenter, 2.7, -8], [mainWidth, 5.4, 0.16]);
  // Keep the entrance passable even before the detailed lounge arrives.
  const door = ROOM_ENTRANCE;
  for (const [left, right] of [[main.minX, door.x - door.width / 2], [door.x + door.width / 2, main.maxX]]) {
    part(wall, [(left + right) / 2, 2.7, 8], [right - left, 5.4, 0.16]);
  }
  part(wall, [door.x, (5.4 + door.height) / 2, door.z], [door.width, 5.4 - door.height, 0.16]);
  part(floor, [door.x, -0.1, door.z + 0.8], [door.width, 0.2, 1.6]);
  part(wall, [main.minX, 2.7, 0], [0.16, 5.4, 16]);
  const recess = layout.blockedFloor;
  part(wall, [recess.minX + .1, 2.7, (recess.minZ + recess.maxZ) / 2], [.2, 5.4, recess.maxZ - recess.minZ]);
  part(wall, [(recess.minX + main.maxX) / 2, 2.7, recess.maxZ - .1], [main.maxX - recess.minX, 5.4, .2]);
  part(wall, [5, 2.7, -4.55], [0.16, 5.4, 6.9]);
  part(wall, [5, 2.7, 7.05], [0.16, 5.4, 1.9]);
  part(wall, [5, 4.75, 2.5], [0.16, 1.3, 7.2]);
  part(wall, [9.5, 2.7, 2.5], [0.16, 5.4, 10]);
  for (const z of [-2.5, 7.5]) part(wall, [7.25, 2.7, z], [4.5, 5.4, 0.16]);
  if (typeof window !== 'undefined') void loadRoom().then(asset => {
    if (!asset) return;
    root.add(asset.clone(true)); shell.removeFromParent();
    cube.dispose(); floor.dispose(); wall.dispose(); root.userData.loaded = true;
  });
  return root;
}

interface WheelBinding { rotor: THREE.Object3D; rest: THREE.Quaternion; axis: THREE.Vector3; turn: THREE.Quaternion; }
const wheels = new WeakMap<THREE.Group, WheelBinding>();

/** Absolute simulation angle: repeated renders and pauses never advance the drum. */
export function updateRoomWheel(room: THREE.Group, angle: number) {
  if (!room.userData.loaded) return;
  let binding = wheels.get(room);
  if (!binding) {
    let rotor: THREE.Object3D | undefined;
    room.traverse(object => { if (object.userData.catWheelRotor) rotor = object; });
    if (!rotor) return;
    room.updateMatrixWorld(true);
    const parent = rotor.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    binding = { rotor, rest: rotor.quaternion.clone(), axis: new THREE.Vector3(0, 0, 1).applyQuaternion(parent.invert()), turn: new THREE.Quaternion() };
    wheels.set(room, binding);
  }
  binding.turn.setFromAxisAngle(binding.axis, angle);
  binding.rotor.quaternion.copy(binding.rest).premultiply(binding.turn);
}

/** Wheel meshes remain separate so a real ray hit can invite the selected cat. */
export function isWheelMesh(object: THREE.Object3D) {
  return object.userData.catWheelRotor || object.userData.catWheel
    || object.name.includes('Wheel_|') || object.name.includes('Wheel |')
    || object instanceof THREE.Mesh && (Array.isArray(object.material) ? object.material : [object.material])
      .some(material => material.name.startsWith('Wheel |'));
}

export function restoreRoomTextures() {
  source?.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.needsUpdate = true;
    }
  });
}
