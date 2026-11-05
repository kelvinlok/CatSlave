import { clampRoomCamera, moveRoomCamera } from './room-boundaries';
import { ENTRANCE_DURATION, entrancePose, FREE_EYE, MAIN_VIEW, ROOM_EYE, VICTORY_FOCUS } from './room-camera';
import * as THREE from 'three';
import { Game } from './simulation';
import type { CareEvent, Point } from './types';
import { freeBowlPosition } from './free-roam';
import { PALETTE, ROOM } from './config';
import { createCat, disposeCat, refreshCatModel, type CatModel } from './cat-model';
import { createMess, updateMess, disposeMess } from './messes';
import { createRoom, updateRoomWheel, isWheelMesh } from './room-asset';
import { WHEEL } from './cat-wheel';
import { applyRoomLayoutVisuals, roomFurniture, roomObjectVisible } from './room-layout-view';
import { FURNITURE_DEFINITIONS, type RoomLayout } from './room-layout';
import { RoomLighting } from './room-lighting';
import { animateCat } from './cat-animation';
import { gameLayout, type Rect } from './layout';
import { PawdicureModel } from './pawdicure-model';
import type { PawdicureRound } from './pawdicure';
import { updateBlenderCatRig } from './blender-cat-rig';
import { hasBlenderCatAsset } from './blender-cat-asset';

const sphere = new THREE.SphereGeometry(1, 16, 10);
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
// A solid picking volume makes the open centre as easy to tap as the visible rim.
// It is never rendered or added to the scene.
const wheelTapTarget = new THREE.Mesh(
  new THREE.CylinderGeometry(WHEEL.outerRadius, WHEEL.outerRadius, WHEEL.depth + .12, 48),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
wheelTapTarget.rotation.x = Math.PI / 2;
wheelTapTarget.position.set(WHEEL.x, WHEEL.centerY, WHEEL.z);
wheelTapTarget.updateMatrixWorld(true);
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
  return materials.get(color)!;
}
function shape(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, position: number[], scale: number[]) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh); return mesh;
}
function ball(parent: THREE.Object3D, color: string, position: number[], scale: number[]) { return shape(parent, sphere, color, position, scale); }
function block(parent: THREE.Object3D, color: string, position: number[], scale: number[]) { return shape(parent, box, color, position, scale); }
function rod(parent: THREE.Object3D, color: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const mesh = shape(parent, cylinder, color, mid.toArray(), [radius, a.distanceTo(b), radius]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return mesh;
}

interface Resident { model: CatModel; base: THREE.Vector3; }
export interface PlayArea { x: number; y: number; outerX: number; outerY: number; innerX: number; innerY: number; }
export function inPlayArea(area: PlayArea, point: Point) {
  const dx = point.x - area.x, dy = point.y - area.y;
  return dy <= 8 && (dx / area.outerX) ** 2 + (dy / area.outerY) ** 2 <= 1
    && (dx / area.innerX) ** 2 + (dy / area.innerY) ** 2 >= 1;
}
export class World {
  scene = new THREE.Scene();
  dexScene = new THREE.Scene();
  dexCamera = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
  dexCatIndex?: number;
  private dexModel?: CatModel;
  private dexModelIndex?: number;
  private dexSize = new THREE.Vector3(1, 1, 1);
  private dexCenter = new THREE.Vector3();
  private dexPivot = new THREE.Group();
  private wheelPickables?: THREE.Object3D[];
  editorLayout?: RoomLayout;
  get roomRoot() { return this.room; }
  get roomEditable() {
    const bindings = roomFurniture(this.room);
    return !!bindings && FURNITURE_DEFINITIONS.every(def => bindings.has(def.id));
  }

  resetDexRotation() { this.dexPivot.quaternion.identity(); }

  wheelHit(point: Point) {
    const v = this.viewport;
    if (!this.room.userData.loaded || point.x < v.x || point.x > v.x + v.w || point.y < v.y || point.y > v.y + v.h) return false;
    const wheel = roomFurniture(this.room)?.get('wheel');
    if (wheel && !wheel.visible) return false;
    if (wheel) {
      wheelTapTarget.position.copy(wheel.position); wheelTapTarget.position.y = WHEEL.centerY;
      wheelTapTarget.rotation.set(Math.PI / 2, 0, 0);
      wheelTapTarget.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wheel.rotation.y));
      wheelTapTarget.updateMatrixWorld(true);
    }
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2((point.x - v.x) / v.w * 2 - 1, 1 - (point.y - v.y) / v.h * 2), this.camera);
    // Most pointer moves miss the wheel. Only test the detailed room for
    // occlusion after a wheel surface or its solid tap volume is on the ray.
    if (!this.wheelPickables) {
      this.wheelPickables = [];
      this.room.traverse(object => { if (isWheelMesh(object)) this.wheelPickables!.push(object); });
    }
    for (const object of this.wheelPickables) object.updateWorldMatrix(true, false);
    const target = this.raycaster.intersectObject(wheelTapTarget)[0];
    if (!target && !this.raycaster.intersectObjects(this.wheelPickables, false).length) return false;
    this.room.updateMatrixWorld(true);
    const hit = this.raycaster.intersectObject(this.room, true).find(hit => roomObjectVisible(hit.object));
    if (hit && isWheelMesh(hit.object)) return true;
    // Keep walls and furniture in front of the wheel from becoming click-through.
    return !!target && (!hit || target.distance < hit.distance);
  }

  rotateDex(from: Point, to: Point) {
    if (!this.dexModel) return;
    // A virtual trackball rotates in X/Y through its center and rolls in Z near its rim.
    const project = (point: Point) => {
      const v = this.viewport, radius = Math.min(v.w, v.h) / 2;
      const x = (point.x - v.x - v.w / 2) / radius;
      const y = -(point.y - v.y - v.h / 2) / radius;
      return new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)))
        .normalize().applyQuaternion(this.dexCamera.quaternion);
    };
    this.dexPivot.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(project(from), project(to))).normalize();
  }
  attackScene = new THREE.Scene();
  attackCamera = new THREE.PerspectiveCamera(55, 1, 0.05, 20);
  attackAge = 2;
  private lastDamage = 0;
  private attackModel?: CatModel;
  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);
  readonly lighting: RoomLighting;
  private readonly room: THREE.Group;
  viewZoom = MAIN_VIEW.zoom;
  private viewYaw = MAIN_VIEW.yaw;
  private viewPitch = MAIN_VIEW.pitch;
  private entranceAge = ENTRANCE_DURATION;
  get enteringRoom() { return this.entranceAge < ENTRANCE_DURATION; }
  get entranceProgress() { return Math.min(1, this.entranceAge / ENTRANCE_DURATION); }
  startEntrance() { this.resetView(); this.entranceAge = 0; entrancePose(this.camera, 0); }
  finishEntrance() {
    if (!this.enteringRoom) return;
    this.entranceAge = ENTRANCE_DURATION; this.resetView();
  }
  private viewReady = false;
  private residents = new Map<number, Resident>();
  private messes = new Map<number, THREE.Group>();
  private completedMesses = new Map<number, { mesh: THREE.Group; age: number; kind: CareEvent['kind'] }>();
  carePointer?: { eventId: number; point: Point; focus: THREE.Vector3; working: boolean; energy: number };
  private lastCareClock = 0;
  private raycaster = new THREE.Raycaster();
  private vector = new THREE.Vector3();
  private width = 1;
  private height = 1;
  viewport: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private previews = new THREE.Group();
  private previewCats: CatModel[] = [];
  private previewKey = '';
  private previewStartedAt = 0;
  private victoryCamera = false;
  private bonusCamera = false;
  private freeCamera = false;
  private freePointer?: Point;
  private freeWand = new THREE.Group();
  private freeBowls = new Map<number, THREE.Group>();
  private freePats = new Map<number, number>();
  private groomingPaw = new PawdicureModel();
  private groomingBackdrop = new THREE.Group();

  constructor() {
    this.dexScene.add(this.dexPivot);
    this.dexScene.background = new THREE.Color('#f6f1e7');
    this.dexScene.add(new THREE.HemisphereLight('#fff2e7', '#604540', 3));
    const dexLight = new THREE.DirectionalLight('#ffffff', 3);
    dexLight.position.set(-2, 3, 4); this.dexScene.add(dexLight);
    this.scene.add(this.groomingPaw.root, this.groomingBackdrop);
    this.groomingPaw.root.visible = false; this.groomingBackdrop.visible = false;
    block(this.groomingBackdrop, '#e3ece3', [0, 1.5, -1.4], [15, 12, .12]);
    ball(this.groomingBackdrop, '#a53243', [0, -.35, 1], [2.3, .24, 1.8]);
    ball(this.groomingBackdrop, '#cfb785', [0, -.4, 1], [2.34, .21, 1.84]);
    this.attackScene.add(new THREE.HemisphereLight('#fff2e7', '#604540', 3));
    const attackLight = new THREE.DirectionalLight('#ffffff', 3); attackLight.position.set(-2, 3, 4); this.attackScene.add(attackLight);
    this.camera.position.copy(ROOM_EYE); this.camera.rotation.set(-MAIN_VIEW.pitch, -MAIN_VIEW.yaw, 0, 'YXZ');
    const room = this.room = createRoom(); this.scene.add(room);
    this.lighting = new RoomLighting(this.scene, room);
    this.scene.add(this.previews);
    this.freeWand.name = 'free-play-wand';
    rod(this.freeWand, '#8b6650', new THREE.Vector3(0.14, 0.5, 0), new THREE.Vector3(0.75, 1.05, 0), 0.018);
    rod(this.freeWand, '#e5d8be', new THREE.Vector3(0.14, 0.5, 0), new THREE.Vector3(0, 0.06, 0), 0.008);
    for (let i = 0; i < 3; i++) {
      const feather = ball(this.freeWand, ['#a53243', '#d6a74e', '#357453'][i], [(i - 1) * 0.065, 0, 0], [0.045, 0.15, 0.025]);
      feather.rotation.z = (i - 1) * -0.45;
    }
    this.freeWand.visible = false; this.scene.add(this.freeWand);
  }

  resize(width: number, height: number, viewport = gameLayout(width, height).room) {
    this.width = width; this.height = height; this.viewport = viewport;
    this.camera.aspect = viewport.w / viewport.h;
    // A fixed eye position at the front of the room: swipes turn your head.
    if (!this.freeCamera && !this.enteringRoom) this.camera.position.copy(ROOM_EYE);
    this.camera.fov = 65;
    this.attackCamera.aspect = width / height; this.attackCamera.updateProjectionMatrix();
    const firstResize = !this.viewReady;
    this.viewReady = true;
    if (firstResize) this.applyView();
    else this.applyProjection();
    if (this.enteringRoom) entrancePose(this.camera, this.entranceProgress);
  }
  private applyView() {
    if (!this.viewReady) return;
    if (!this.freeCamera) this.viewYaw = THREE.MathUtils.clamp(this.viewYaw, -MAIN_VIEW.yawLimit, MAIN_VIEW.yawLimit);
    this.viewPitch = this.freeCamera
      ? THREE.MathUtils.clamp(this.viewPitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01)
      : THREE.MathUtils.clamp(this.viewPitch, -Math.PI / 9, Math.PI * 13 / 36);
    this.camera.rotation.set(-this.viewPitch, -this.viewYaw, 0, 'YXZ');
    this.applyProjection();
  }
  private applyProjection() {
    if (this.freeCamera) {
      // Keep even a very wide resized viewport's near plane small enough to fit
      // inside the room. Ordinary portrait/desktop views retain the full zoom range.
      const near = this.camera.near;
      const minimumZoom = near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
        * Math.hypot(1, this.camera.aspect) / Math.sqrt(1.5 ** 2 - near ** 2);
      this.viewZoom = Math.max(this.viewZoom, minimumZoom);
    }
    this.camera.zoom = this.viewZoom;
    this.camera.updateProjectionMatrix();
    this.boundFreeCamera(); this.camera.updateMatrixWorld();
  }
  private cameraClearance() {
    const halfHeight = this.camera.near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / this.camera.zoom;
    return Math.max(0.28, Math.hypot(this.camera.near, halfHeight, halfHeight * this.camera.aspect) + 0.08);
  }
  private boundFreeCamera() {
    if (!this.freeCamera) return;
    // Bound the full near-plane sphere inside the lounge, right doorway and wing.
    this.camera.position.copy(clampRoomCamera(this.camera.position, this.cameraClearance()));
  }
  setViewOrientation(orientation: THREE.Quaternion) {
    this.camera.quaternion.copy(orientation);
    this.boundFreeCamera(); this.camera.updateMatrixWorld();
    this.viewYaw = -this.camera.rotation.y; this.viewPitch = -this.camera.rotation.x;
  }
  lookView(dx: number, dy: number) {
    const radians = THREE.MathUtils.degToRad(100) / Math.max(1, Math.min(this.viewport.w, this.viewport.h)) / this.viewZoom;
    this.viewYaw += dx * radians; this.viewPitch += dy * radians;
    this.applyView();
  }
  zoomView(delta: number) {
    if (!Number.isFinite(delta)) return;
    this.viewZoom = THREE.MathUtils.clamp(this.viewZoom + delta, this.freeCamera ? 0.2 : 1, this.freeCamera ? 12 : 2.5); this.applyProjection();
  }
  resetView(zoom = this.freeCamera ? 1.65 : MAIN_VIEW.zoom) {
    this.entranceAge = ENTRANCE_DURATION;
    this.camera.position.copy(this.freeCamera ? FREE_EYE : ROOM_EYE); this.viewYaw = this.freeCamera ? 0 : MAIN_VIEW.yaw;
    this.viewPitch = this.freeCamera ? Math.atan2(1.2, 7) : MAIN_VIEW.pitch;
    this.viewZoom = zoom; this.applyView();
  }
  /** Camera-local movement, constrained to the room with near-plane clearance. */
  translateView(dx: number, dy: number, dz: number) {
    if (!this.freeCamera || ![dx, dy, dz].every(Number.isFinite)) return;
    const destination = this.camera.position.clone().add(new THREE.Vector3(dx, dy, dz).applyQuaternion(this.camera.quaternion));
    this.camera.position.copy(moveRoomCamera(this.camera.position, destination, this.cameraClearance()));
    this.boundFreeCamera(); this.camera.updateMatrixWorld();
  }
  freeWandTargets(game: Game, point: Point) {
    const v = this.viewport;
    if (point.x < v.x || point.x > v.x + v.w || point.y < v.y || point.y > v.y + v.h) return [];
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2((point.x - v.x) / v.w * 2 - 1, 1 - (point.y - v.y) / v.h * 2), this.camera);
    const normal = this.camera.getWorldDirection(new THREE.Vector3());
    return game.cats.flatMap(cat => {
      const origin = new THREE.Vector3(cat.position.x, cat.elevation + 0.65, cat.position.z);
      const screen = this.project(origin);
      if (!screen.visible) return [];
      const focus = this.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin), new THREE.Vector3());
      if (!focus) return [];
      const distance = Math.hypot(screen.x - point.x, screen.y - point.y);
      // A small touch allowance keeps distant cats reachable without selecting them.
      if (focus.distanceTo(origin) > 1.25 && distance > 65) return [];
      return [{ catId: cat.id, focus, distance }];
    }).sort((a, b) => a.distance - b.distance);
  }
  freeCatHit(point: Point) { return this.pickCat(point.x, point.y); }
  freePetHit(catId: number, point: Point) {
    const target = this.bonusPatTarget(catId);
    return !!target?.visible && Math.hypot(target.x - point.x, target.y - point.y) <= 44;
  }
  setFreePointer(point?: Point) { this.freePointer = point ? { ...point } : undefined; }
  freePat(catId: number) { this.freePats.set(catId, this.lastCareClock); }
  focusOn(position: THREE.Vector3) {
    const dx = position.x - this.camera.position.x, dz = this.camera.position.z - position.z;
    this.viewYaw = Math.atan2(dx, dz);
    this.viewPitch = Math.atan2(this.camera.position.y - position.y, Math.hypot(dx, dz));
    // Explicit focus reaches every perch, including the right-hand window wing.
    this.camera.rotation.set(-this.viewPitch, -this.viewYaw, 0, 'YXZ');
    this.applyProjection();
  }
  project(position: THREE.Vector3) {
    this.vector.copy(position).applyMatrix4(this.camera.matrixWorldInverse);
    if (this.vector.z >= -this.camera.near) {
      // Keep a usable edge cue even when a need is behind the current gaze.
      return { x: this.viewport.x + this.viewport.w / 2 + Math.sign(this.vector.x || 1) * this.viewport.w,
        y: this.viewport.y + this.viewport.h / 2 - THREE.MathUtils.clamp(this.vector.y, -1, 1) * this.viewport.h / 2, visible: false };
    }
    this.vector.copy(position).project(this.camera);
    return { x: this.viewport.x + (this.vector.x + 1) * this.viewport.w / 2,
      y: this.viewport.y + (1 - this.vector.y) * this.viewport.h / 2, visible: this.vector.z < 1 && this.vector.z > -1 };
  }
  catPosition(id: number) { return this.residents.get(id)?.model.root.position.clone(); }
  pawClawTarget(index: number) {
    const toe = this.groomingPaw.toes[index];
    if (!this.groomingPaw.root.visible || !toe?.visible) return undefined;
    return this.project(toe.localToWorld(new THREE.Vector3(0, -.015, .25)));
  }
  pawTimingTarget(paw: PawdicureRound) {
    if (paw.activeClaw === undefined) return undefined;
    const current = this.pawClawTarget(paw.activeClaw);
    if (!current) return undefined;
    const previous = paw.lastSnip?.pawIndex === paw.pawIndex && paw.lastSnip.success
      ? this.pawClawTarget(paw.lastSnip.clawIndex) : undefined;
    const t = THREE.MathUtils.clamp((paw.snipAge - .12) / .10, 0, 1), blend = t * t * (3 - 2 * t);
    const x = previous ? THREE.MathUtils.lerp(previous.x, current.x, blend) : current.x;
    const y = previous ? THREE.MathUtils.lerp(previous.y, current.y, blend) : current.y;
    const v = this.viewport;
    const radius = Math.min(42, Math.max(29, v.w * .095), x - v.x - 8, v.x + v.w - x - 8, y - v.y - 8, v.y + v.h - y - 8);
    return { x, y, radius };
  }
  pawTapArea() {
    if (!this.groomingPaw.root.visible) return undefined;
    const root = this.groomingPaw.root;
    root.updateMatrixWorld(true);
    const regions: { x: number; y: number; rx: number; ry: number }[] = [];
    const region = (parent: THREE.Object3D, x: number, y: number, rx: number, ry: number) => {
      const p = this.project(parent.localToWorld(new THREE.Vector3(x, y, .26)));
      const ex = this.project(parent.localToWorld(new THREE.Vector3(x + rx, y, .26)));
      const ey = this.project(parent.localToWorld(new THREE.Vector3(x, y + ry, .26)));
      regions.push({ x: p.x, y: p.y, rx: Math.abs(ex.x - p.x) + 7, ry: Math.abs(ey.y - p.y) + 7 });
    };
    region(root, 0, .05, 1.02, .68); region(root, 0, -.55, .6, .55);
    this.groomingPaw.toes.forEach(toe => { if (toe.visible) region(toe, 0, .07, .30, .44); });
    const v = this.viewport;
    const x = Math.max(v.x, Math.min(...regions.map(p => p.x - p.rx)));
    const y = Math.max(v.y, Math.min(...regions.map(p => p.y - p.ry)));
    const right = Math.min(v.x + v.w, Math.max(...regions.map(p => p.x + p.rx)));
    const bottom = Math.min(v.y + v.h, Math.max(...regions.map(p => p.y + p.ry)));
    return { x, y, w: right - x, h: bottom - y, regions };
  }
  bonusPatTarget(id: number) {
    const model = this.residents.get(id)?.model;
    if (!model) return undefined;
    model.root.updateMatrixWorld(true);
    const rump = new THREE.Vector3(0, 0.78, -0.66);
    model.body.localToWorld(rump);
    return this.project(rump);
  }
  catLabelPosition(id: number) {
    const model = this.residents.get(id)?.model;
    return model ? model.root.position.clone().add(new THREE.Vector3(0, 1.85 * model.root.scale.y, 0)) : undefined;
  }
  eventPosition(event: CareEvent) {
    if (event.kind === 'boredom') return new THREE.Vector3(event.position.x, this.floorHeight(event.position.x, event.position.z) + 0.65, event.position.z + 0.35);
    return this.messes.get(event.id)?.position.clone() ?? this.catPosition(event.catId) ?? new THREE.Vector3();
  }
  playArea(event: CareEvent): PlayArea {
    const center = this.eventPosition(event); center.y -= 0.10;
    const screen = this.project(center);
    const edge = this.project(center.clone().add(new THREE.Vector3(0.55, 0, 0)));
    const outerX = THREE.MathUtils.clamp(Math.abs(edge.x - screen.x), 72, Math.min(120, this.viewport.w * 0.3));
    return { x: screen.x, y: screen.y + 8, outerX, outerY: outerX * 1.25, innerX: outerX * 0.44, innerY: outerX * 0.56 };
  }
  toyHit(event: CareEvent, point: Point) {
    const v = this.viewport;
    return point.x >= v.x && point.x <= v.x + v.w && point.y >= v.y && point.y <= v.y + v.h
      && inPlayArea(this.playArea(event), point);
  }
  setCarePointer(event: CareEvent, point: Point, working: boolean, movement = 0) {
    const v = this.viewport, origin = this.eventPosition(event);
    this.raycaster.setFromCamera(new THREE.Vector2((point.x - v.x) / v.w * 2 - 1, 1 - (point.y - v.y) / v.h * 2), this.camera);
    const normal = this.camera.getWorldDirection(new THREE.Vector3()); normal.y = 0; normal.normalize();
    // A vertical play plane keeps an overhead feather in front of the cat,
    // rather than pushing it behind the head as the camera tilts downward.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const focus = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? origin.clone();
    // Keep this exact ray-plane point: the standalone feathers are drawn at
    // the pointer. The animator bounds joints, not the target's screen position.
    // Accumulate travel and decay per simulation second: high-frequency devices
    // must feel as lively as the same stroke sampled at a lower rate.
    const energy = Math.min(1, (this.carePointer?.eventId === event.id ? this.carePointer.energy : 0) + movement / 35);
    this.carePointer = { eventId: event.id, point: { ...point }, focus, working, energy };
  }
  pickCat(x: number, y: number): number | undefined {
    const v = this.viewport;
    if (x < v.x || x > v.x + v.w || y < v.y || y > v.y + v.h) return;
    this.raycaster.setFromCamera(new THREE.Vector2((x - v.x) / v.w * 2 - 1, 1 - (y - v.y) / v.h * 2), this.camera);
    const roots = [...this.residents.values()].map(r => r.model.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (hit) { let object: THREE.Object3D | null = hit.object; while (object) { if (object.userData.catId) return object.userData.catId as number; object = object.parent; } }
    return undefined;
  }

  update(game: Game, dt: number, time: number, effectsDt = dt) {
    applyRoomLayoutVisuals(this.room, this.editorLayout ?? game.roomLayout.layout, game.phase === 'room-editor');
    if (this.enteringRoom) {
      if (!game.active && !(game.phase === 'paused' && ['playing', 'tutorial'].includes(game.resumePhase))) this.finishEntrance();
      else {
        if (game.active) this.entranceAge = Math.min(ENTRANCE_DURATION, this.entranceAge + Math.max(0, effectsDt));
        entrancePose(this.camera, this.entranceProgress);
      }
    }
    updateRoomWheel(this.room, game.wheelAngle);
    this.lighting.update();
    this.updateDex(game, time);
    if (this.freeCamera !== game.inFreePlay) {
      this.freeCamera = game.inFreePlay;
      this.freePointer = undefined; this.freePats.clear();
      this.resetView();
    }
    if (game.phase === 'victory') {
      this.victoryCamera = true;
      // Sit with the cats. Keep the entire semicircle in view on narrow phones.
      const distance = Math.max(3.25, 2 / this.camera.aspect + 1.6);
      this.camera.position.set(VICTORY_FOCUS.x, VICTORY_FOCUS.y + distance * 0.48, VICTORY_FOCUS.z + distance);
      this.camera.zoom = 1; this.camera.lookAt(VICTORY_FOCUS);
      this.camera.updateProjectionMatrix();
    } else if (game.inBonus && game.bonus?.paw) {
      this.bonusCamera = true;
      const distance = Math.max(2.1, 1.6 / (Math.tan(THREE.MathUtils.degToRad(58 / 2)) * this.camera.aspect));
      this.camera.position.set(0, 1.35, 1.35 + distance);
      this.camera.zoom = 1; this.camera.lookAt(0, 1.35, 0);
      this.camera.updateProjectionMatrix();
    } else if (game.inBonus) {
      this.bonusCamera = true;
      const halfWidth = Math.max(0.9, game.cats.length * 0.62);
      const distance = Math.max(3, halfWidth / (Math.tan(THREE.MathUtils.degToRad(65 / 2)) * this.camera.aspect) * 1.15);
      this.camera.position.set(0, 1.65 + distance * 0.12, distance);
      this.camera.zoom = 1; this.camera.lookAt(0, 0.65, 0);
      this.camera.updateProjectionMatrix();
    } else if (this.bonusCamera || this.victoryCamera) {
      this.bonusCamera = false; this.victoryCamera = false;
      this.camera.position.copy(this.freeCamera ? FREE_EYE : ROOM_EYE); this.applyView();
    }
    const careDt = Math.max(0, Math.min(0.1, game.clock - this.lastCareClock));
    const paw = game.inBonus ? game.bonus?.paw : undefined;
    this.lighting.setPawdicure(!!paw);
    this.groomingPaw.root.visible = !!paw;
    this.groomingBackdrop.visible = !!paw;
    if (paw) this.groomingPaw.update(paw, game.cats.find(cat => cat.id === paw.selectedCatId) ?? game.cats[0], game.bonus!.won);
    if (game.clock < this.lastCareClock || game.inFreePlay || game.inBonus || ['title', 'adoption', 'upgrade'].includes(game.phase)) {
      for (const { mesh } of this.completedMesses.values()) { mesh.removeFromParent(); disposeMess(mesh); }
      this.completedMesses.clear();
    }
    this.lastCareClock = game.clock;
    if (!game.active || !game.events.some(e => e.id === this.carePointer?.eventId)) this.carePointer = undefined;
    if (this.carePointer) this.carePointer.energy *= Math.exp(-careDt * 7);
    this.camera.updateMatrixWorld();
    const wandTargets = game.inFreePlay && game.freeInteraction === 'wand' && this.freePointer
      ? this.freeWandTargets(game, this.freePointer) : [];
    this.freeWand.visible = game.inFreePlay && game.freeInteraction === 'wand' && !!this.freePointer;
    if (this.freeWand.visible && this.freePointer) {
      const v = this.viewport;
      this.raycaster.setFromCamera(new THREE.Vector2((this.freePointer.x - v.x) / v.w * 2 - 1, 1 - (this.freePointer.y - v.y) / v.h * 2), this.camera);
      const focus = wandTargets[0]?.focus ?? this.raycaster.ray.at(3, new THREE.Vector3());
      this.freeWand.position.copy(focus); this.freeWand.quaternion.copy(this.camera.quaternion);
    }
    for (const [id, bowl] of this.freeBowls) {
      if (!game.inFreePlay || !game.cats.some(cat => cat.id === id)) {
        bowl.removeFromParent(); disposeMess(bowl); this.freeBowls.delete(id);
      }
    }
    if (game.inFreePlay) game.cats.forEach((cat, index) => {
      const position = freeBowlPosition(index, game.cats.length);
      let bowl = this.freeBowls.get(cat.id);
      if (!bowl) {
        const event: CareEvent = { id: -cat.id, catId: cat.id, kind: 'hunger', progress: 1,
          createdAt: 0, deadline: Infinity, nextAttackAt: Infinity, attacks: 0, position };
        bowl = createMess(event, cat); bowl.name = `free-food-${cat.id}`;
        bowl.scale.setScalar(0.8); this.scene.add(bowl); this.freeBowls.set(cat.id, bowl);
      }
      bowl.position.set(position.x, this.floorHeight(position.x, position.z), position.z);
    });
    const isPreview = ['title', 'adoption', 'game-over', 'victory'].includes(game.phase);
    this.camera.updateMatrixWorld();
    for (const [id, resident] of this.residents) if (!game.cats.some(cat => cat.id === id)) {
      this.scene.remove(resident.model.root); disposeCat(resident.model); this.residents.delete(id);
    }
    for (const [index, cat] of game.cats.entries()) {
      let resident = this.residents.get(cat.id);
      if (!resident) {
        const model = createCat(cat); model.root.userData.catId = cat.id; this.scene.add(model.root);
        resident = { model, base: new THREE.Vector3() }; this.residents.set(cat.id, resident);
      }
      const { model, base } = resident;
      refreshCatModel(model, cat);
      base.set(cat.position.x, cat.elevation > 0 ? cat.elevation + 0.012 : this.floorHeight(cat.position.x, cat.position.z), cat.position.z);
      model.root.position.copy(base); model.root.rotation.y = cat.yaw;
      model.root.visible = game.phase !== 'room-editor' && !isPreview && (!paw || cat.id === (paw.selectedCatId ?? game.cats[0]?.id));
      const event = game.events.find(e => e.catId === cat.id);
      const angry = !!event && game.urgency(event) === 'angry';
      const happy = cat.happyUntil > game.clock;
      model.root.scale.setScalar(ROOM.catScale);
      const attention = event?.kind === 'boredom' && this.carePointer?.eventId === event.id ? this.carePointer : undefined;
      if (paw) {
        const shortView = this.viewport.h < 300;
        model.root.position.set(0, shortView ? 1.4 : 1.65, -.05); model.root.rotation.y = 0; model.root.scale.setScalar(shortView ? .95 : 1.25);
        animateCat(model, { ...cat, activity: 'idle' }, game.bonus!.clock, {
          happy: game.bonus!.won, angry: paw.mood === 'moving',
        });
        if (paw.mood === 'warning') {
          model.ears.forEach((ear,i) => ear.rotation.z += (i ? -1 : 1) * Math.sin(paw.clock*23)*.22);
          updateBlenderCatRig(model.root);
        }
      } else if (game.inBonus && game.bonus) {
        model.root.position.set((index - (game.cats.length - 1) / 2) * 1.24, 0.07, 0);
        model.root.rotation.y = Math.PI; model.root.scale.setScalar(0.68);
        animateCat(model, { ...cat, activity: 'idle' }, game.bonus.clock, {
          angry: game.bonus.failedCatId === cat.id,
          buttPat: { lift: game.bonus.lift(cat.id), side: index < (game.cats.length - 1) / 2 ? -1 : 1 },
        });
      } else {
        const patAge = game.clock - (this.freePats.get(cat.id) ?? -Infinity);
        const patting = game.inFreePlay && cat.visit?.id !== 'wheel' && patAge >= 0 && patAge < 1.2;
        const lift = patting ? Math.sin(Math.PI * patAge / 1.2) : 0;
        const partner = game.inFreePlay ? game.cats.find(other => other.id === game.freeRoam.playmate(cat.id)) : undefined;
        const socialFocus = partner ? new THREE.Vector3(partner.position.x, partner.elevation + 0.45, partner.position.z) : undefined;
        const focus = game.inFreePlay ? wandTargets.find(target => target.catId === cat.id)?.focus ?? socialFocus : attention?.working ? attention.focus : undefined;
        const cameraSide = Math.cos(cat.yaw) * (this.camera.position.x - cat.position.x) - Math.sin(cat.yaw) * (this.camera.position.z - cat.position.z);
        animateCat(model, cat, game.clock, { angry, happy, focus, engagement: focus ? 1 : 0, excited: game.inFreePlay && !partner,
          buttPat: patting ? { lift, side: cameraSide < 0 ? -1 : 1, lookBack: false } : undefined });
      }

    }
    for (const [id, mesh] of this.messes) if (!game.events.some(e => e.id === id)) {
      const previous = mesh.userData.careEvent as CareEvent | undefined;
      if (previous && game.cats.find(c => c.id === previous.catId)?.happyUntil! > game.clock && game.active) {
        updateMess(mesh, { ...previous, progress: 1 }, game.clock, false);
        this.completedMesses.set(id, { mesh, age: 0, kind: previous.kind });
      } else { mesh.removeFromParent(); disposeMess(mesh); }
      this.messes.delete(id);
    }
    for (const event of game.events) {
      if (event.kind === 'boredom') continue;
      const cat = game.cats.find(c => c.id === event.catId)!;
      let mesh = this.messes.get(event.id);
      if (!mesh) { mesh = createMess(event, cat); this.scene.add(mesh); this.messes.set(event.id, mesh); }
      mesh.position.set(event.position.x, this.floorHeight(event.position.x, event.position.z) + 0.005, event.position.z);
      if (event.kind === 'hunger') mesh.position.z += 0.5;
      mesh.scale.setScalar(0.8);
      const contact = this.carePointer?.eventId === event.id ? this.carePointer : undefined;
      updateMess(mesh, event, game.clock, !!contact?.working && (event.kind === 'hunger' || contact.energy > 0.08));
      mesh.userData.careEvent = { ...event };
      mesh.visible = !isPreview;
    }
    for (const [id, done] of this.completedMesses) {
      if (!game.cats.some(c => c.id === done.mesh.userData.careEvent?.catId)) {
        done.mesh.removeFromParent(); disposeMess(done.mesh); this.completedMesses.delete(id); continue;
      }
      done.age += careDt;
      done.mesh.visible = !isPreview;
      const duration = done.kind === 'hunger' ? 1.8 : 0.55;
      const fade = Math.max(0, 1 - Math.max(0, done.age - duration + 0.25) / 0.25);
      done.mesh.scale.setScalar(0.8 * fade);
      if (done.age >= duration) { done.mesh.removeFromParent(); disposeMess(done.mesh); this.completedMesses.delete(id); }
    }
    this.updatePreview(game, time);
    this.updateAttack(game, effectsDt);
  }

  private floorHeight(_x: number, _z: number) {
    return 0.015;
  }

  private updateAttack(game: Game, dt: number) {
    if (game.phase === 'victory' || game.inFreePlay) {
      // A scratch at the final buzzer must not cover the happy reunion.
      this.lastDamage = game.damageSerial; this.attackAge = 2;
      if (this.attackModel) this.attackModel.root.visible = false;
      return;
    }
    if (game.damageSerial < this.lastDamage || game.phase === 'title') this.attackAge = 2;
    if (game.damageSerial > this.lastDamage && game.lastAttackCatId !== undefined) {
      this.attackAge = 0;
      if (this.attackModel) { this.attackModel.root.removeFromParent(); disposeCat(this.attackModel); }
      const cat = game.cats.find(c => c.id === game.lastAttackCatId);
      if (cat) { this.attackModel = createCat(cat); this.attackScene.add(this.attackModel.root); }
    }
    this.lastDamage = game.damageSerial;
    if (game.phase !== 'paused') this.attackAge += dt;
    if (!this.attackModel) return;
    const t = this.attackAge, model = this.attackModel;
    model.root.visible = t < 0.76 && game.phase !== 'paused';
    const attacker = game.cats.find(cat => cat.id === game.lastAttackCatId);
    if (attacker) refreshCatModel(model, attacker);
    if (attacker) animateCat(model, { ...attacker, activity: 'jumping', pose: Math.min(1, t / 0.76) }, t, { angry: true });
    // A dedicated foreground camera makes attacks equally legible from every direction.
    const leap = Math.min(1, t / 0.23), retreat = Math.max(0, (t - 0.50) / 0.26);
    model.root.position.set(Math.sin(t * 18) * 0.035, -0.78 - retreat * 2, -5 + leap * 3.55 - retreat * 1.5);
    model.root.rotation.set(-0.18, Math.sin(t * 8) * 0.15, Math.sin(t * 16) * 0.12);
    model.root.scale.setScalar(Math.min(1, this.attackCamera.aspect / 0.65));
    model.legs[0].rotation.x = -1.4 + Math.sin(t * 18) * 0.6;
    model.legs[1].rotation.x = -1.4 + Math.sin(t * 18 + 2) * 0.6;
    for (let i = 0; i < 2; i++) { model.lowerLegs[i].rotation.x = 0.3; model.paws[i].rotation.x = 0.5; }
    model.head.rotation.x = 0.12;
    model.anger.visible = true;
    model.eyes.forEach(eye => { eye.scale.y = model.eyeHeight * 0.03 / 0.062; });
  }

  private updateDex(game: Game, time: number) {
    const definition = this.dexCatIndex === undefined ? undefined : PALETTE[this.dexCatIndex];
    const index = game.phase === 'cat-dex' && definition && game.adoptedCats.includes(definition.name) ? this.dexCatIndex : undefined;
    const upgrading = index !== undefined && this.dexModel?.root.userData.modelSource !== 'blender'
      && hasBlenderCatAsset(definition?.appearance);
    if (index !== this.dexModelIndex || upgrading) {
      const rotation = upgrading && index === this.dexModelIndex ? this.dexPivot.quaternion.clone() : undefined;
      if (this.dexModel) { this.dexModel.root.removeFromParent(); disposeCat(this.dexModel); }
      this.dexModel = undefined; this.dexModelIndex = index;
      this.resetDexRotation(); this.dexPivot.position.set(0, 0, 0);
      if (index !== undefined) {
        this.dexModel = createCat(PALETTE[index]);
        this.dexModel.root.name = 'dex-cat-model';
        this.dexModel.root.rotation.y = -0.5;
        this.dexPivot.add(this.dexModel.root);
        // Refresh the reset parent before measuring: setFromObject does not update
        // ancestors, so a previous profile's pivot otherwise offsets these bounds.
        this.dexPivot.updateWorldMatrix(true, true);
        animateCat(this.dexModel, { ...game.cats[0], ...PALETTE[index], id: index + 1,
          activity: 'grooming', stride: 0, pose: 0 }, time);
        const bounds = new THREE.Box3();
        this.dexModel.root.traverseVisible(object => {
          if (object instanceof THREE.Mesh && object.geometry.getAttribute('position')?.count) {
            bounds.union(new THREE.Box3().setFromObject(object, true));
          }
        });
        bounds.getCenter(this.dexCenter);
        bounds.getSize(this.dexSize);
        this.dexPivot.position.copy(this.dexCenter);
        this.dexModel.root.position.copy(this.dexCenter).negate();
        if (rotation) this.dexPivot.quaternion.copy(rotation);
      }
    }
    if (!this.dexModel || index === undefined) return;
    this.dexCamera.aspect = this.viewport.w / this.viewport.h;
    const halfFov = THREE.MathUtils.degToRad(20);
    const distance = 1.1 * (Math.max(this.dexSize.y, this.dexSize.x / this.dexCamera.aspect)
      / (2 * Math.tan(halfFov)) + this.dexSize.z / 2);
    this.dexCamera.position.copy(this.dexCenter).add(new THREE.Vector3(0, distance * .12, distance));
    this.dexCamera.lookAt(this.dexCenter); this.dexCamera.updateProjectionMatrix();
    animateCat(this.dexModel, { ...game.cats[0], ...PALETTE[index], id: index + 1,
      activity: 'grooming', stride: 0, pose: 0 }, time);
  }

  private updatePreview(game: Game, time: number) {
    const cats = game.phase === 'adoption' ? game.candidates : game.phase === 'victory' ? game.cats : [game.cats[0]];
    const key = `${game.phase}:${cats.map(c => c.id).join(',')}`;
    if (key !== this.previewKey) {
      this.previewCats.forEach(disposeCat); this.previews.clear(); this.previewCats = []; this.previewKey = key;
      this.previewStartedAt = time;
      if (['title', 'adoption', 'game-over', 'victory'].includes(game.phase)) cats.forEach((cat, i) => {
        const model = createCat(cat); const adoption = game.phase === 'adoption';
        model.root.userData.catId = cat.id;
        model.root.name = `preview-cat-${cat.id}`;
        model.root.position.set(adoption ? (i ? 1.2 : -1.2) : 0, 0.08, 0.2);
        model.root.scale.setScalar(0.85); this.previews.add(model.root); this.previewCats.push(model);
      });
    }
    this.previews.visible = ['title', 'adoption', 'game-over', 'victory'].includes(game.phase);
    this.previewCats.forEach((model, i) => {
      const definition = cats[i];
      refreshCatModel(model, definition);
      if (game.phase === 'victory') {
        const elapsed = Math.max(0, time - this.previewStartedAt);
        const progress = THREE.MathUtils.clamp((elapsed - i * 0.24) / 3.2, 0, 1);
        const approach = 1 - (1 - progress) ** 2;
        const angle = cats.length === 1 ? 0 : (i / (cats.length - 1) - 0.5) * 2;
        const x = Math.sin(angle * 1.3) * 1.16;
        const z = VICTORY_FOCUS.z - 0.9 + Math.abs(angle) ** 1.5 * 2;
        model.root.scale.setScalar(0.85);
        model.root.position.set(VICTORY_FOCUS.x + x * (1.65 - approach * 0.65), 0.07, z - (1 - approach) * 3.1);
        // Each cat comes in from its own side, then turns inward toward the player.
        model.root.rotation.y = Math.atan2(-x * 0.65, 3.1) * (1 - approach)
          + Math.atan2(-x, this.camera.position.z - z) * approach;
        animateCat(model, { ...game.cats[i], activity: progress < 1 ? 'walking' : 'idle', stride: approach * 32 }, elapsed, { happy: true });
        model.head.rotation.x -= 0.2 * approach;
        model.head.rotation.z += Math.sin(elapsed * 1.5 + i * 1.7) * 0.12 * approach;
        model.head.rotation.y += Math.sin(elapsed * 0.9 + i) * 0.1 * approach;
        model.tail.rotation.x -= 0.35;
        return;
      }
      animateCat(model, { ...game.cats[0], ...definition, activity: 'idle', stride: 0 }, time);
      model.root.rotation.y = -0.65 + Math.sin(time * 0.35 + i) * 0.12;
      model.head.rotation.y = 0.35;
    });
  }

  victoryHearts() {
    if (!this.victoryCamera || !this.previews.visible) return [];
    return this.previewCats.map(model => {
      model.root.updateMatrixWorld(true);
      return this.project(model.head.localToWorld(new THREE.Vector3(0, 0.48, 0)));
    });
  }
}
