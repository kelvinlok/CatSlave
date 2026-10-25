import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Game } from './simulation';
import type { CareEvent, Point } from './types';
import { freeBowlPosition } from './free-roam';
import { ROOM } from './config';
import { createCat, disposeCat, type CatModel } from './cat-model';
import { createMess, updateMess, disposeMess } from './messes';
import { createFurniture } from './furniture-model';
import { animateCat } from './cat-animation';
import { BENCH, BED, POST, RUG } from './furniture';
import { gameLayout, type Rect } from './layout';

const sphere = new THREE.SphereGeometry(1, 16, 10);
const box = new THREE.BoxGeometry(1, 1, 1);
const cone = new THREE.ConeGeometry(1, 1, 3);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
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

/** Batch fixed pieces by material while preserving separately animated parts. */
function batchMeshes(root: THREE.Object3D, deep = false, exclude: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  const collect = (object: THREE.Object3D) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || exclude.includes(object) || Array.isArray(object.material)) return;
    for (let parent: THREE.Object3D | null = object; parent && parent !== root; parent = parent.parent) if (!parent.visible) return;
    const list = batches.get(object.material) ?? []; list.push(object); batches.set(object.material, list);
  };
  if (deep) root.traverse(collect); else root.children.forEach(collect);
  for (const [mat, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)));
    if (geometries.some(g => !g.index) && geometries.some(g => g.index)) {
      // Extruded openings and primitive furniture may use different index layouts.
      geometries.forEach((geometry, i) => {
        if (geometry.index) { geometries[i] = geometry.toNonIndexed(); geometry.dispose(); }
      });
    }
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    meshes.forEach(mesh => mesh.removeFromParent()); root.add(new THREE.Mesh(merged, mat));
  }
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
  attackScene = new THREE.Scene();
  attackCamera = new THREE.PerspectiveCamera(55, 1, 0.05, 20);
  attackAge = 2;
  private lastDamage = 0;
  private attackModel?: CatModel;
  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 60);
  viewZoom = 1.65;
  private viewYaw = 0;
  private viewPitch = Math.atan2(1.2, 7);
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

  constructor() {
    this.attackScene.add(new THREE.HemisphereLight('#fff2e7', '#604540', 3));
    const attackLight = new THREE.DirectionalLight('#ffffff', 3); attackLight.position.set(-2, 3, 4); this.attackScene.add(attackLight);
    this.scene.background = new THREE.Color('#e8ddca');
    this.scene.fog = new THREE.Fog('#e8ddca', 24, 42);
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#b4a695', 2.6));
    const sun = new THREE.DirectionalLight('#fff1db', 3.2); sun.position.set(-3, 8, 4); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#d4e9ed', 1.2); fill.position.set(5, 3, -4); this.scene.add(fill);
    this.camera.position.set(0, 1.65, 5.8); this.camera.lookAt(0, 0.45, -1.2);
    block(this.scene, '#d6bea1', [0, -0.10, 0], [16, 0.2, 16]);
    for (let i = -8; i <= 8; i++) block(this.scene, '#c7ae92', [i, 0.006, 0], [0.016, 0.008, 16]);
    for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z += 3) block(this.scene, '#c7ae92', [x + 0.5, 0.006, z + (x % 2 ? 1.5 : 0)], [1, 0.008, 0.012]);
    const wallColors = ['#e4e3cf', '#ead9d1', '#d8e0df', '#e1dae5'];
    const accents = ['#8d9d7d', '#bc8f85', '#85a4ae', '#a495b2'];
    for (let direction = 0; direction < 1; direction++) {
      const room = new THREE.Group(); this.scene.add(room);
      block(room, wallColors[direction], [0, 2.65, -8], [10, 5.4, 0.18]);
      block(room, '#fbefd8', [0, 0.17, -7.86], [10, 0.3, 0.12]);
      block(room, '#d5c6ac', [0, 1.18, -7.86], [10, 0.055, 0.12]);
      // One continuous living room, with an open doorway behind the viewer.
      for (let x = -4.7; x < 5; x += 0.7) block(room, '#d2c9b5', [x, 0.66, -7.87], [0.025, 0.88, 0.08]);
      shape(room, cylinder, accents[0], [RUG.x, 0.025, RUG.z], [RUG.radiusX, 0.035, RUG.radiusZ]);
      shape(room, cylinder, '#e8ddc4', [RUG.x, 0.047, RUG.z], [RUG.radiusX - 0.15, 0.01, RUG.radiusZ - 0.15]);
      shape(room, cylinder, accents[0], [RUG.x, 0.055, RUG.z], [RUG.radiusX - 0.23, 0.008, RUG.radiusZ - 0.23]);
      for (const side of [-1, 1]) {
        block(room, side < 0 ? '#ead9d1' : '#d8e0df', [side * 5, 2.65, -2], [0.18, 5.4, 12]);
        block(room, '#fbefd8', [side * 4.87, 0.17, -2], [0.12, 0.3, 12]);
        block(room, '#d5c6ac', [side * 4.87, 1.18, -2], [0.12, 0.055, 12]);
        for (let z = -7.6; z < 4; z += 0.7) block(room, '#d2c9b5', [side * 4.87, 0.66, z], [0.08, 0.88, 0.025]);
      }
      // Low furnishings at the perimeter leave the shared floor clear for wandering.
      block(room, '#b79370', [BENCH.x - 0.03, 0.42, BENCH.z], [0.9, 0.75, 2.8]);
      block(room, '#b5bca0', [BENCH.x, 0.88, BENCH.z], [0.97, 0.22, 2.85]);
      for (const dz of [-0.85, 0.05, 0.95]) ball(room, '#e1ceab', [BENCH.x, 1.03, BENCH.z + dz], [0.32, 0.12, 0.34]);
      shape(room, cylinder, '#b78c72', [BED.x, 0.1, BED.z], [0.68, 0.18, 0.82]);
      shape(room, cylinder, '#dfbd9c', [BED.x, 0.19, BED.z], [0.55, 0.06, 0.69]);
      block(room, '#b59370', [POST.x, 0.14, POST.z], [1.05, 0.15, 1.05]);
      shape(room, cylinder, '#c8b08a', [POST.x, 0.82, POST.z], [0.14, 1.35, 0.14]);
      block(room, '#a2ac8f', [POST.x, 1.55, POST.z], [0.95, 0.12, 0.95]);
      // Window and curtains.
      block(room, '#f9efd9', [-2.35, 2.95, -7.75], [1.85, 2.1, 0.18]);
      block(room, '#bad4d3', [-2.35, 2.95, -7.64], [1.58, 1.83, 0.04]);
      ball(room, '#fae2a2', [-2.68, 3.35, -7.6], [0.24, 0.24, 0.035]);
      block(room, '#f9efd9', [-2.35, 2.95, -7.59], [0.065, 1.9, 0.08]);
      block(room, '#f9efd9', [-2.35, 2.95, -7.59], [1.65, 0.065, 0.08]);
      for (const side of [-1, 1]) block(room, '#f0ddc4', [-2.35 + side * 1.01, 2.92, -7.52], [0.38, 2.4, 0.18]);
      block(room, '#bb9876', [-2.35, 1.86, -7.4], [2.2, 0.12, 0.9]);
      // Low cabinet, books and plant.
      block(room, '#b79370', [2.38, 0.65, -7.1], [1.8, 1.2, 0.8]);
      block(room, '#dec3a0', [2.38, 1.3, -7.1], [1.95, 0.12, 0.95]);
      for (const side of [-1, 1]) {
        block(room, '#c6a27b', [2.38 + side * 0.44, 0.72, -6.68], [0.78, 0.94, 0.05]);
        ball(room, '#745b4c', [2.38 + side * 0.12, 0.8, -6.62], [0.04, 0.04, 0.03]);
      }
      shape(room, cylinder, '#d0a086', [2.98, 1.5, -7.35], [0.22, 0.35, 0.22]);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const leaf = ball(room, i % 2 ? '#809676' : '#9caf87', [2.98 + Math.cos(a) * 0.22, 1.8 + i * 0.06, -7.35 + Math.sin(a) * 0.2], [0.14, 0.36, 0.08]);
        leaf.rotation.z = Math.cos(a) * 0.65;
      }
      for (let i = 0; i < 3; i++) block(room, ['#a8b2a0', '#dca195', '#d7bf8c'][i], [1.65, 1.41 + i * 0.095, -7.35], [0.4, 0.085, 0.3]);
      // Small cat portrait, built from geometry rather than external artwork.
      block(room, '#b99879', [0.3, 2.75, -7.77], [1.36, 1.5, 0.12]);
      block(room, '#f5ead3', [0.3, 2.75, -7.68], [1.17, 1.3, 0.04]);
      const portrait = createCat({ color: accents[direction], accent: '#6d7164' });
      portrait.root.scale.setScalar(0.45); portrait.root.position.set(0.3, 2.3, -7.5); room.add(portrait.root);
      // Sunlight on the floor.
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.7), new THREE.MeshBasicMaterial({ color: '#fff0c9', transparent: true, opacity: 0.12, depthWrite: false }));
      patch.rotation.x = -Math.PI / 2; patch.rotation.z = -0.3; patch.position.set(-2.7, 0.012, -4.3); room.add(patch);
      room.add(createFurniture());
      batchMeshes(room, true);
    }
    batchMeshes(this.scene);
    this.scene.add(this.previews);
    this.freeWand.name = 'free-play-wand';
    rod(this.freeWand, '#8b6650', new THREE.Vector3(0.14, 0.5, 0), new THREE.Vector3(0.75, 1.05, 0), 0.018);
    rod(this.freeWand, '#e5d8be', new THREE.Vector3(0.14, 0.5, 0), new THREE.Vector3(0, 0.06, 0), 0.008);
    for (let i = 0; i < 3; i++) {
      const feather = ball(this.freeWand, ['#b2b7d9', '#e7b095', '#95bdad'][i], [(i - 1) * 0.065, 0, 0], [0.045, 0.15, 0.025]);
      feather.rotation.z = (i - 1) * -0.45;
    }
    this.freeWand.visible = false; this.scene.add(this.freeWand);
  }

  resize(width: number, height: number, viewport = gameLayout(width, height).room) {
    this.width = width; this.height = height; this.viewport = viewport;
    this.camera.aspect = viewport.w / viewport.h;
    // A fixed eye position at the front of the room: swipes turn your head.
    if (!this.freeCamera) this.camera.position.set(0, 1.65, 5.8);
    this.camera.fov = 65;
    this.attackCamera.aspect = width / height; this.attackCamera.updateProjectionMatrix();
    const firstResize = !this.viewReady;
    this.viewReady = true;
    if (firstResize) this.applyView();
    else this.applyProjection();
  }
  private applyView() {
    if (!this.viewReady) return;
    if (!this.freeCamera) this.viewYaw = THREE.MathUtils.clamp(this.viewYaw, -Math.PI * 5 / 12, Math.PI * 5 / 12);
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
  private boundFreeCamera() {
    if (!this.freeCamera) return;
    // Enclose the entire near plane in a sphere, so looking down or zooming out
    // cannot cut through the floor, walls, or the edge of the open doorway.
    const halfHeight = this.camera.near * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / this.camera.zoom;
    const clearance = Math.max(0.28, Math.hypot(this.camera.near, halfHeight, halfHeight * this.camera.aspect) + 0.08);
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -4.8 + clearance, 4.8 - clearance);
    this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, 0.07 + clearance, 5.25 - clearance);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -7.75 + clearance, 7.7 - clearance);
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
  resetView(zoom = 1.65) { this.camera.position.set(0, 1.65, 5.8); this.viewYaw = 0; this.viewPitch = Math.atan2(1.2, 7); this.viewZoom = zoom; this.applyView(); }
  /** Camera-local movement, constrained to the room with near-plane clearance. */
  translateView(dx: number, dy: number, dz: number) {
    if (!this.freeCamera || ![dx, dy, dz].every(Number.isFinite)) return;
    this.camera.position.add(new THREE.Vector3(dx, dy, dz).applyQuaternion(this.camera.quaternion));
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
    this.applyView();
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
    if (this.freeCamera !== game.inFreePlay) {
      this.freeCamera = game.inFreePlay;
      this.freePointer = undefined; this.freePats.clear();
      this.resetView();
    }
    if (game.phase === 'victory') {
      this.victoryCamera = true;
      // Sit with the cats. Keep the entire semicircle in view on narrow phones.
      const distance = Math.max(3.25, 2 / this.camera.aspect + 1.6);
      this.camera.position.set(0, 0.65 + distance * 0.48, 3 + distance);
      this.camera.zoom = 1; this.camera.lookAt(0, 0.65, 3);
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
      this.camera.position.set(0, 1.65, 5.8); this.applyView();
    }
    const careDt = Math.max(0, Math.min(0.1, game.clock - this.lastCareClock));
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
      if (this.freeBowls.has(cat.id)) return;
      const event: CareEvent = { id: -cat.id, catId: cat.id, kind: 'hunger', progress: 1,
        createdAt: 0, deadline: Infinity, nextAttackAt: Infinity, attacks: 0, position: freeBowlPosition(index, game.cats.length) };
      const bowl = createMess(event, cat); bowl.name = `free-food-${cat.id}`;
      bowl.position.set(event.position.x, this.floorHeight(event.position.x, event.position.z), event.position.z);
      bowl.scale.setScalar(0.8); this.scene.add(bowl); this.freeBowls.set(cat.id, bowl);
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
      base.set(cat.position.x, cat.elevation > 0 ? cat.elevation + 0.012 : this.floorHeight(cat.position.x, cat.position.z), cat.position.z);
      model.root.position.copy(base); model.root.rotation.y = cat.yaw; model.root.visible = !isPreview;
      const event = game.events.find(e => e.catId === cat.id);
      const angry = !!event && game.urgency(event) === 'angry';
      const happy = cat.happyUntil > game.clock;
      model.root.scale.setScalar(ROOM.catScale);
      const attention = event?.kind === 'boredom' && this.carePointer?.eventId === event.id ? this.carePointer : undefined;
      if (game.inBonus && game.bonus) {
        model.root.position.set((index - (game.cats.length - 1) / 2) * 1.24, 0.07, 0);
        model.root.rotation.y = Math.PI; model.root.scale.setScalar(0.68);
        animateCat(model, { ...cat, activity: 'idle' }, game.bonus.clock, {
          angry: game.bonus.failedCatId === cat.id,
          buttPat: { lift: game.bonus.lift(cat.id), side: index < (game.cats.length - 1) / 2 ? -1 : 1 },
        });
      } else {
        const patAge = game.clock - (this.freePats.get(cat.id) ?? -Infinity);
        const patting = game.inFreePlay && patAge >= 0 && patAge < 1.2;
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

  private floorHeight(x: number, z: number) {
    return ((x - RUG.x) / RUG.radiusX) ** 2 + ((z - RUG.z) / RUG.radiusZ) ** 2 < 1 ? 0.07 : 0.015;
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
      if (game.phase === 'victory') {
        const elapsed = Math.max(0, time - this.previewStartedAt);
        const progress = THREE.MathUtils.clamp((elapsed - i * 0.24) / 3.2, 0, 1);
        const approach = 1 - (1 - progress) ** 2;
        const angle = cats.length === 1 ? 0 : (i / (cats.length - 1) - 0.5) * 2;
        const x = Math.sin(angle * 1.3) * 1.16;
        const z = 2.1 + Math.abs(angle) ** 1.5 * 2;
        model.root.scale.setScalar(0.85);
        model.root.position.set(x * (1.65 - approach * 0.65), 0.07, z - (1 - approach) * 3.1);
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
