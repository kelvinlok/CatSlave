import * as THREE from 'three';
import room from '../assets/lounge/layout.json';
import { roomFloorContains } from './room-boundaries';
import { FURNITURE_DEFINITIONS, furnitureFootprints, type FurniturePose } from './room-layout';
import type { FloorPoint, Point } from './types';

interface Viewport { x: number; y: number; w: number; h: number; }
const up = new THREE.Vector3(0, 1, 0);
const floor = new THREE.Plane(up, 0);

/** Camera and overlays only; the host owns draft state and routes native input. */
export class RoomEditorView {
  private readonly topCamera = new THREE.OrthographicCamera(-12, 12, 12, -12, .1, 150);
  private readonly freeCamera = new THREE.PerspectiveCamera(45, 1, .1, 150);
  freeView = false;
  get camera() { return this.freeView ? this.freeCamera : this.topCamera; }
  private yaw = -.4;
  private pitch = .55;
  readonly overlay = new THREE.Group();
  readonly target = new THREE.Vector3((room.bounds.minX + room.bounds.maxX) / 2, 0, 0);
  private viewport: Viewport = { x: 0, y: 0, w: 1, h: 1 };
  private quarter = 0;
  private raycaster = new THREE.Raycaster();
  private grid: THREE.LineSegments;
  private selection: THREE.LineSegments;
  private highlighted = '';
  private material = new THREE.LineBasicMaterial({ color: '#42834f', depthTest: false, transparent: true, opacity: .95 });
  constructor() {
    this.overlay.name = 'room-editor-overlays';
    const gridPoints: THREE.Vector3[] = [];
    const minX = Math.ceil(room.bounds.minX * 2) / 2, maxX = room.bounds.maxX;
    for (let x = minX; x <= maxX; x += .5) for (let z = room.bounds.minZ; z < room.bounds.maxZ; z += .5) {
      if (roomFloorContains({ x, z: z + .25 })) gridPoints.push(new THREE.Vector3(x, .012, z), new THREE.Vector3(x, .012, z + .5));
    }
    for (let z = room.bounds.minZ; z <= room.bounds.maxZ; z += .5) for (let x = minX; x < maxX; x += .5) {
      if (roomFloorContains({ x: x + .25, z })) gridPoints.push(new THREE.Vector3(x, .012, z), new THREE.Vector3(x + .5, .012, z));
    }
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gridPoints),
      new THREE.LineBasicMaterial({ color: '#5a655b', transparent: true, opacity: .16, depthWrite: false }));
    this.grid.name = 'room-editor-grid'; this.overlay.add(this.grid);
    const boundaries: THREE.Vector3[] = [];
    const box = (bounds: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
      const corners = [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]];
      corners.forEach(([x, z], i) => { const next = corners[(i + 1) % 4]; boundaries.push(new THREE.Vector3(x, .03, z), new THREE.Vector3(next[0], .03, next[1])); });
    };
    box(room.mainRoom); box(room.sunroom); box(room.blockedFloor);
    room.structuralWalls.forEach(box);
    const structures = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(boundaries),
      new THREE.LineBasicMaterial({ color: '#97624c', transparent: true, opacity: .8, depthTest: false }));
    structures.name = 'room-editor-boundaries'; structures.renderOrder = 5; this.overlay.add(structures);
    this.selection = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.selection.name = 'room-editor-selection'; this.selection.renderOrder = 10; this.overlay.add(this.selection);
    this.fit();
  }
  resize(viewport: Viewport) {
    this.viewport = { ...viewport };
    this.updateFrustum();
  }
  private updatePose() {
    const pitch = this.freeView ? this.pitch : THREE.MathUtils.degToRad(55), yaw = this.freeView ? this.yaw : this.quarter * Math.PI / 2;
    const distance = this.freeView ? Math.max(22, 15 / Math.max(.35, this.viewport.w / this.viewport.h)) : 35;
    this.camera.position.set(this.target.x + Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance,
      this.target.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld(true);
  }
  private updateFrustum() {
    this.updatePose();
    // Reserve vertical space for the tallest trees, not just the floor plane.
    const pitch = THREE.MathUtils.degToRad(55);
    const wide = this.quarter % 2 ? room.bounds.maxZ - room.bounds.minZ : room.bounds.maxX - room.bounds.minX;
    const deep = this.quarter % 2 ? room.bounds.maxX - room.bounds.minX : room.bounds.maxZ - room.bounds.minZ;
    const aspect = Math.max(.1, this.viewport.w / Math.max(1, this.viewport.h));
    const halfHeight = Math.max((deep * Math.sin(pitch) + 5 * Math.cos(pitch)) * .62, wide * .56 / aspect);
    this.topCamera.left = -halfHeight * aspect; this.topCamera.right = halfHeight * aspect;
    this.topCamera.top = halfHeight; this.topCamera.bottom = -halfHeight;
    this.topCamera.updateProjectionMatrix(); this.freeCamera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  fit() {
    this.target.set((room.bounds.minX + room.bounds.maxX) / 2, 0, (room.bounds.minZ + room.bounds.maxZ) / 2);
    this.camera.zoom = 1; this.updateFrustum();
  }
  turn(direction = 1) { this.quarter = (this.quarter + direction + 4) % 4; this.updateFrustum(); }
  toggleView() { this.freeView = !this.freeView; this.updateFrustum(); }
  orbitPixels(dx: number, dy: number) {
    this.yaw -= dx * .008; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * .006, .25, 1.3); this.updatePose();
  }
  selectionAnchor(id: string, pose: FurniturePose, height: number): Point | undefined {
    const definition = FURNITURE_DEFINITIONS.find(item => item.id === id); if (!definition) return;
    const v = this.viewport, points: THREE.Vector3[] = [];
    for (const box of furnitureFootprints(definition, pose)) for (const x of [box.minX, box.maxX]) for (const z of [box.minZ, box.maxZ]) {
      for (const y of [0, height]) points.push(new THREE.Vector3(x, y, z).project(this.camera));
    }
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return;
    return { x: THREE.MathUtils.clamp(v.x + (maxX + 1) * v.w / 2 - 44, v.x + 4, v.x + v.w - 98),
      y: THREE.MathUtils.clamp(v.y + (1 - maxY) * v.h / 2 - 48, v.y + 4, v.y + v.h - 48) };
  }
  zoomBy(factor: number) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, .7, 6); this.camera.updateProjectionMatrix();
  }
  panPixels(dx: number, dy: number) {
    const center = { x: this.viewport.x + this.viewport.w / 2, y: this.viewport.y + this.viewport.h / 2 };
    const before = this.floorPoint(center), after = this.floorPoint({ x: center.x + dx, y: center.y + dy });
    if (!before || !after) return;
    this.target.x = THREE.MathUtils.clamp(this.target.x + before.x - after.x, room.bounds.minX - 3, room.bounds.maxX + 3);
    this.target.z = THREE.MathUtils.clamp(this.target.z + before.z - after.z, room.bounds.minZ - 3, room.bounds.maxZ + 3);
    this.updatePose();
  }
  private ray(point: Point) {
    const v = this.viewport;
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2((point.x - v.x) / v.w * 2 - 1, 1 - (point.y - v.y) / v.h * 2), this.camera);
  }
  floorPoint(point: Point): FloorPoint | undefined {
    this.ray(point);
    const hit = this.raycaster.ray.intersectPlane(floor, new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : undefined;
  }
  pick(roomRoot: THREE.Object3D, point: Point): string | undefined {
    this.ray(point); roomRoot.updateWorldMatrix(true, true);
    for (const hit of this.raycaster.intersectObject(roomRoot, true)) {
      let node: THREE.Object3D | null = hit.object, id: string | undefined, excluded = false;
      while (node) {
        if (!node.visible || node.userData.contactShadow || node.name.includes('Soft furniture contact')) excluded = true;
        if (typeof node.userData.furnitureId === 'string') id = node.userData.furnitureId;
        node = node.parent;
      }
      if (!excluded && id) return id;
    }
    return undefined;
  }
  highlight(id?: string, pose?: FurniturePose, valid = true) {
    const signature = JSON.stringify([id, pose, valid]);
    if (signature === this.highlighted) return;
    this.highlighted = signature;
    const definition = FURNITURE_DEFINITIONS.find(item => item.id === id);
    this.selection.visible = !!definition && !!pose;
    if (!definition || !pose) return;
    const points: THREE.Vector3[] = [];
    for (const box of furnitureFootprints(definition, pose)) {
      const corners = [[box.minX, box.minZ], [box.maxX, box.minZ], [box.maxX, box.maxZ], [box.minX, box.maxZ]];
      corners.forEach(([x, z], i) => { const next = corners[(i + 1) % 4]; points.push(new THREE.Vector3(x, .055, z), new THREE.Vector3(next[0], .055, next[1])); });
    }
    this.selection.geometry.dispose(); this.selection.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.material.color.set(valid ? '#42834f' : '#d7413b');
  }
  setGridVisible(visible: boolean) { this.grid.visible = visible; }
  dispose() {
    this.overlay.traverse(object => {
      if (!(object instanceof THREE.LineSegments)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    this.overlay.removeFromParent();
  }
}
