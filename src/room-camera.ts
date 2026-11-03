import * as THREE from 'three';
import { ROOM_ENTRANCE } from './room-boundaries';

export const MAIN_VIEW = { zoom: 1, pitch: 0.07, yaw: 0.32, yawLimit: THREE.MathUtils.degToRad(80) };
export const ROOM_EYE = new THREE.Vector3(-2.6, 1.65, 5.4);
export const FREE_EYE = new THREE.Vector3(0, 1.65, 4.8);
// The reunion uses the open aisle, clear of the sofa table and exercise wheel.
export const VICTORY_FOCUS = new THREE.Vector3(-3.5, 0.65, 2.5);
export const ENTRANCE_DURATION = 3.8;

// Cross the narrow glass doorway before curving around the wheel's left side.
const entrancePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(ROOM_ENTRANCE.x, 1.72, 9.1),
  new THREE.Vector3(ROOM_ENTRANCE.x, 1.71, 8.05),
  new THREE.Vector3(-4.2, 1.69, 7.35),
  new THREE.Vector3(-3.7, 1.67, 6.9),
  new THREE.Vector3(-3.6, 1.65, 5.6),
  ROOM_EYE.clone(),
]);
const startLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.025, -0.12, 0, 'YXZ'));
const endLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(-MAIN_VIEW.pitch, -MAIN_VIEW.yaw, 0, 'YXZ'));

export function entrancePose(camera: THREE.PerspectiveCamera, progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  entrancePath.getPointAt(eased, camera.position);
  camera.quaternion.slerpQuaternions(startLook, endLook, eased);
  camera.zoom = THREE.MathUtils.lerp(0.94, MAIN_VIEW.zoom, eased);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
