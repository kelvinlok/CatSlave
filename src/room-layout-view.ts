import * as THREE from 'three';
import type { RoomLayout } from './room-layout';
import { updateRoomWheel } from './room-asset';

interface Bindings {
  furniture: Map<string, THREE.Group>;
  hidden: Map<THREE.Object3D, boolean>;
}
const bindings = new WeakMap<THREE.Group, Bindings>();

/** Visibility is inherited; Three's raycaster alone does not check it. */
export function roomObjectVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function roomFurniture(room: THREE.Group): Map<string, THREE.Group> | undefined {
  if (!room.userData.loaded) return;
  let bound = bindings.get(room);
  if (bound) return bound.furniture;
  // Bind the rotor axis in its authored parent space before any furniture turns.
  updateRoomWheel(room, 0);
  bound = { furniture: new Map(), hidden: new Map() };
  const owners: THREE.Object3D[] = [];
  room.updateMatrixWorld(true);
  room.traverse(object => {
    if (typeof object.userData.furnitureId === 'string') owners.push(object);
    if (object.userData.editorHide) bound!.hidden.set(object, object.visible);
  });
  // GLTF's Blender coordinate conversion can sit above the exported roots.
  // A world-space wrapper makes all runtime transforms consistently Y-up.
  for (const owner of owners) {
    const id = owner.userData.furnitureId as string;
    const wrapper = new THREE.Group(); wrapper.name = `furniture:${id}`;
    wrapper.userData.furnitureId = id;
    wrapper.position.copy(owner.getWorldPosition(new THREE.Vector3()));
    wrapper.position.y = 0;
    room.add(wrapper); wrapper.updateMatrixWorld(true); wrapper.attach(owner);
    delete owner.userData.furnitureId;
    bound.furniture.set(id, wrapper);
  }
  bindings.set(room, bound);
  return bound.furniture;
}

export function applyRoomLayoutVisuals(room: THREE.Group, layout: RoomLayout, editing = false) {
  const furniture = roomFurniture(room);
  if (!furniture) return;
  for (const [id, root] of furniture) {
    const pose = layout.placed[id];
    root.visible = !!pose;
    if (pose) { root.position.set(pose.x, 0, pose.z); root.rotation.y = pose.turn * Math.PI / 2; }
  }
  for (const [object, visible] of bindings.get(room)!.hidden) object.visible = editing ? false : visible;
  room.updateMatrixWorld(true);
}
