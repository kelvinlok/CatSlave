import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import type { CatDefinition } from './types';

export interface CatModel {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; tail: THREE.Group; anger: THREE.Group;
  eyes: THREE.Mesh[]; closedEyes: THREE.Group[]; legs: THREE.Group[]; lowerLegs: THREE.Group[]; paws: THREE.Group[];
  ears: THREE.Group[]; tailJoints: THREE.Bone[]; eyeHeight: number;
}
type Appearance = Pick<CatDefinition, 'color' | 'accent'> & Partial<Pick<CatDefinition, 'appearance'>>;
type Paint = (x: number, y: number, z: number) => string;
const templates = new Map<string, THREE.Group>();
const colors = new Map<string, THREE.Color>();
function color(hex: string) {
  if (!colors.has(hex)) colors.set(hex, new THREE.Color(hex));
  return colors.get(hex)!;
}
// One shared tiny fur grain, also usable in headless model tests.
const grain = new Uint8Array(64 * 64 * 4);
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const value = 115 + Math.floor(30 * (Math.sin(x * 71.13 + Math.floor(y / 3) * 37.7) * 43758.5453 % 1));
  const i = (y * 64 + x) * 4; grain[i] = grain[i + 1] = grain[i + 2] = value; grain[i + 3] = 255;
}
const furGrain = new THREE.DataTexture(grain, 64, 64);
furGrain.wrapS = furGrain.wrapT = THREE.RepeatWrapping;
furGrain.magFilter = furGrain.minFilter = THREE.LinearFilter;
furGrain.repeat.set(5, 3); furGrain.needsUpdate = true;
const fur = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.93, bumpMap: furGrain, bumpScale: 0.003 });
const detail = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.70 });
const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.22 });
const noseMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.48 });
const coatMaterials = new WeakMap<THREE.BufferGeometry, THREE.MeshStandardMaterial>();
const sharedCoats = new Map<string, THREE.MeshStandardMaterial>();
const tailMaterial = fur.clone();

/** UV-painted coats keep narrow markings smooth without adding silhouette polygons. */
function coatGeometry(geometry: THREE.BufferGeometry, paint: Paint, sample: (u: number, v: number) => number[], key?: string) {
  if (key && sharedCoats.has(key)) { coatMaterials.set(geometry, sharedCoats.get(key)!); return paintGeometry(geometry, '#ffffff'); }
  const width = 512, height = 256, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = sample((x + 0.5) / width, (y + 0.5) / height), hex = parseInt(paint(p[0], p[1], p[2]).slice(1), 16);
    const i = (y * width + x) * 4;
    pixels[i] = hex >> 16; pixels[i + 1] = hex >> 8 & 255; pixels[i + 2] = hex & 255; pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, width, height); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping; map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
  const material = fur.clone(); material.map = map; coatMaterials.set(geometry, material);
  if (key) sharedCoats.set(key, material);
  return paintGeometry(geometry, '#ffffff');
}

function paintGeometry(geometry: THREE.BufferGeometry, paint: Paint | string) {
  const points = geometry.getAttribute('position'), rgb = new Float32Array(points.count * 3);
  for (let i = 0; i < points.count; i++) {
    const c = color(typeof paint === 'string' ? paint : paint(points.getX(i), points.getY(i), points.getZ(i)));
    rgb.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3)); return geometry;
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material = fur) {
  const result = new THREE.Mesh(geometry, material === fur ? coatMaterials.get(geometry) ?? fur : material); parent.add(result); return result;
}
function ellipsoid(parent: THREE.Object3D, p: number[], s: number[], paint: Paint | string, material = fur, segments = 24) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.65));
  geometry.scale(s[0], s[1], s[2]); paintGeometry(geometry, paint);
  const result = mesh(parent, geometry, material); result.position.set(p[0], p[1], p[2]); return result;
}
function group(parent: THREE.Object3D, name: string, p = [0, 0, 0]) {
  const result = new THREE.Group(); result.name = name; result.position.set(p[0], p[1], p[2]); parent.add(result); return result;
}
function curve(parent: THREE.Object3D, points: number[][], radius: number, hex: string, material = detail) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  return mesh(parent, paintGeometry(new THREE.TubeGeometry(path, 10, radius, 5, false), hex), material);
}
/** Merge only inside a joint; cached geometry is shared by independently cloned rigs. */
function batch(parent: THREE.Group | THREE.Mesh) {
  for (const material of [fur, detail, eyeMaterial, noseMaterial]) {
    const children = parent.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material === material && !c.name);
    if (children.length < 2) continue;
    const parts = children.map(child => {
      child.updateMatrix(); let geometry = child.geometry.clone().applyMatrix4(child.matrix);
      if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
      return geometry;
    });
    const merged = mergeGeometries(parts)!; parts.forEach(g => g.dispose());
    children.forEach(child => { child.removeFromParent(); child.geometry.dispose(); }); mesh(parent, merged, material);
  }
}
/** Iris, pupil, glints and lid all move together, so each eye needs one draw call. */
function batchEye(eye: THREE.Mesh) {
  const pieces = [eye.geometry.clone(), ...eye.children.map(child => {
    const part = child as THREE.Mesh; part.updateMatrix(); return part.geometry.clone().applyMatrix4(part.matrix);
  })].map(geometry => {
    if (!geometry.index) return geometry;
    const flat = geometry.toNonIndexed(); geometry.dispose(); return flat;
  });
  const merged = mergeGeometries(pieces)!; pieces.forEach(part => part.dispose());
  eye.geometry.dispose(); eye.children.forEach(child => (child as THREE.Mesh).geometry.dispose()); eye.clear(); eye.geometry = merged;
}
/** Smooth ring loft for the torso, tapered limbs, rounded ears and flexible tail. */
function loft(profile: number[][], axis: 'y' | 'z', paint: Paint | string, segments = 28, rings = 36, coatKey?: string) {
  const path = new THREE.CatmullRomCurve3(profile.map(([along, width, height]) => new THREE.Vector3(along, width, height)));
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const p = path.getPoint(j / rings);
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2, x = Math.cos(a) * Math.max(0.001, p.y), cross = Math.sin(a) * Math.max(0.001, p.z);
      if (axis === 'y') vertices.push(x, p.x, cross); else vertices.push(x, cross, p.x);
      uvs.push(i / segments, j / rings);
      if (j && i) {
        const n = j * (segments + 1) + i, b = n - segments - 1;
        if (axis === 'y') indices.push(b - 1, n - 1, n, b - 1, n, b);
        else indices.push(b - 1, n, n - 1, b - 1, b, n);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  // Duplicated UV seam positions must share a normal to avoid a horizontal crease.
  const normals = geometry.getAttribute('normal');
  for (let j = 0; j <= rings; j++) {
    const a = j * (segments + 1), b = a + segments;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, a).add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z); normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  if (typeof paint === 'string') return paintGeometry(geometry, paint);
  return coatGeometry(geometry, paint, (u, v) => {
    const p = path.getPoint(v), a = u * Math.PI * 2, x = Math.cos(a) * Math.max(0.001, p.y), cross = Math.sin(a) * Math.max(0.001, p.z);
    return axis === 'y' ? [x, p.x, cross] : [x, cross, p.x];
  }, coatKey);
}

function buildCat(cat: Appearance) {
  const choco = cat.appearance === 'choco', white = choco ? '#faf6ef' : '#f3e7d4';
  const pink = choco ? '#d99b9f' : '#cf9390', ink = '#252020';
  const root = new THREE.Group(), body = group(root, 'body');
  const torso = loft([
    [-0.87, 0.005, 0.005], [-0.75, 0.25, 0.27], [-0.52, choco ? 0.37 : 0.33, 0.35],
    [-0.16, choco ? 0.355 : 0.31, 0.32], [0.17, 0.30, 0.30], [0.41, 0.29, 0.35], [0.64, 0.13, 0.24], [0.69, 0.005, 0.005],
  ], 'z', (x, y, z) => {
    if (choco && ((z > 0.43 + Math.abs(x) * 0.35 && y < 0.24) || (y < -0.20 && z > 0.12))) return white;
    if (!choco && z > 0.57 && y < 0.12) return white;
    if (!choco && Math.abs(x) > 0.22 && y > 0.04 && Math.sin(z * 24 + y * 5) > 0.89) return cat.accent;
    return cat.color;
  });
  mesh(body, torso).position.y = 0.69;
  for (let i = 0; i < 4; i++) {
    const front = i < 2, side = i % 2 ? 1 : -1;
    const leg = group(root, `leg${i}`, [side * 0.245, 0.57, front ? 0.4 : -0.62]);
    const coat = choco && front && side > 0 ? white : cat.color;
    mesh(leg, loft([[-0.28, 0.07, 0.075], [-0.20, front ? 0.105 : 0.13, 0.11], [-0.07, front ? 0.125 : 0.17, front ? 0.13 : 0.19], [0.08, 0.05, 0.06]], 'y', coat, 18, 18));
    const lower = group(leg, `lowerLeg${i}`, [0, -0.25, 0]);
    // Choco's left hind leg has a long white sock beneath its brown thigh.
    const lowerCoat = choco && side > 0 ? white : coat;
    mesh(lower, loft([[-0.27, 0.06, 0.06], [-0.20, 0.075, 0.08], [-0.04, 0.092, 0.09], [0.035, 0.065, 0.065]], 'y', lowerCoat, 16, 14));
    const paw = group(lower, `paw${i}`, [0, -0.25, 0.085]);
    ellipsoid(paw, [0, 0, 0], [0.115, 0.07, 0.15], white, fur, 24);
    for (const x of [-0.038, 0.038]) curve(paw, [[x, 0.035, 0.139], [x, 0.055, 0.11], [x, 0.062, 0.075]], 0.002, '#c9bcb0', fur);
    ellipsoid(paw, [0, -0.064, -0.015], [0.047, 0.006, 0.052], pink, fur, 14);
    for (const x of [-0.060, 0, 0.060]) ellipsoid(paw, [x, -0.052, 0.075], [0.024, 0.009, 0.030], pink, fur, 12);
    batch(paw);
  }
  const head = group(root, 'head', [0, 0.99, 0.57]);
  const headGeometry = new THREE.SphereGeometry(1, 64, 42), positions = headGeometry.getAttribute('position');
  function headPoint(x: number, y: number, z: number) {
    const cheeks = 1 + 0.08 * Math.exp(-(((y + 0.35) / 0.4) ** 2));
    return [x * (choco ? 0.39 : 0.355) * cheeks, y * 0.325,
      z * 0.30 + (z > 0 ? 0.025 * Math.exp(-(((y + 0.4) / 0.3) ** 2)) * z : 0)];
  }
  for (let i = 0; i < positions.count; i++) {
    const p = headPoint(positions.getX(i), positions.getY(i), positions.getZ(i));
    positions.setXYZ(i, p[0], p[1], p[2]);
  }
  headGeometry.computeVertexNormals();
  coatGeometry(headGeometry, (x, y, z) => {
    if (choco && z > 0.065) {
      const blaze = y > -0.035 ? Math.max(0, (0.13 - y) * 0.36) : y > -0.13 ? 0.06 + (-y - 0.035) * 1.9 : 0.255;
      if (y < 0.13 && Math.abs(x + 0.006) < blaze) {
        if (y < -0.19 && y > -0.275 && Math.abs(x - 0.012) < 0.095) return cat.color;
        return white;
      }
    }
    if (y > 0.15 && y < 0.29 && z > 0.06 && Math.abs(x) < 0.13) {
      const streak = Math.abs((x + 0.12) % 0.08 - 0.04);
      if (streak < 0.009 * Math.sin((y - 0.15) / 0.14 * Math.PI)) return choco ? '#563b33' : cat.accent;
    }
    return cat.color;
  }, (u, v) => {
    const phi = u * Math.PI * 2, theta = (1 - v) * Math.PI;
    return headPoint(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  });
  mesh(head, headGeometry);
  for (const side of [-1, 1]) {
    ellipsoid(head, [side * 0.083, -0.125, 0.286], [0.111, 0.077, 0.066], white, fur, 32);
    const ear = group(head, `ear${side < 0 ? 0 : 1}`, [side * 0.25, 0.19, -0.025]);
    const height = choco && side < 0 ? 0.28 : 0.34;
    const earGeometry = loft([[0, 0.11, 0.035], [height * 0.2, 0.145, 0.047], [height * 0.6, 0.085, 0.032], [height * 0.94, 0.023, 0.012], [height, 0.002, 0.002]], 'y',
      (x, y, z) => z > 0.020 && y > 0.045 && y < height * 0.86 && Math.abs(x) < (1 - y / height) * 0.13 ? '#ac7e7d' : cat.color, 26, 24, `${cat.color}:ear:${height}`);
    // Choco's left ear (viewer-right from the front) has a small clipped tip.
    // Flatten the existing surface so the clip stays part of the animated ear.
    if (choco && side > 0) {
      const points = earGeometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        points.setY(i, Math.min(points.getY(i), height * 0.92 + points.getX(i) * 0.12));
      }
      earGeometry.computeVertexNormals();
    }
    earGeometry.rotateZ(-side * (choco && side < 0 ? 0.36 : 0.17)); mesh(ear, earGeometry);
    const eyeHeight = choco ? 0.080 : 0.062;
    const eye = ellipsoid(head, [side * 0.166, 0.023, 0.286], [1, 1, 1], (x, y) => {
      const angle = Math.atan2(y, x), radius = Math.hypot(x, y);
      if (radius > 0.92) return choco ? '#88713e' : '#536748';
      return choco ? (Math.sin(angle * 34) > 0.35 ? '#cbb45e' : '#bda155') : '#a8b77b';
    }, eyeMaterial, 32);
    eye.name = `eye${side < 0 ? 0 : 1}`; eye.scale.set(0.082, eyeHeight, 0.016);
    ellipsoid(eye, [0, 0.025, 0.97], [0.34, 0.77, 0.12], ink, eyeMaterial, 24);
    ellipsoid(eye, [-0.21, 0.34, 1.08], [0.16, 0.18, 0.09], '#ffffff', eyeMaterial, 16);
    ellipsoid(eye, [0.22, -0.25, 1.02], [0.065, 0.07, 0.05], '#e9e5d5', eyeMaterial, 12);
    curve(eye, [[-0.93, 0.25, 0.4], [-0.50, 0.86, 0.4], [0.35, 0.93, 0.4], [0.93, 0.25, 0.4]], 0.055, cat.accent, eyeMaterial); batchEye(eye);
    const closedEye = group(head, `closedEye${side < 0 ? 0 : 1}`, [side * 0.166, 0.023, 0.296]);
    closedEye.visible = false;
    curve(closedEye, [[-0.063, -0.002, -0.008], [-0.025, 0.013, 0.008], [0.025, 0.013, 0.008], [0.063, -0.002, -0.008]], 0.004, cat.accent);
    for (let i = 0; i < 4; i++) {
      const y = -0.105 - i * 0.025, spread = 0.05 - i * 0.034;
      curve(head, [[side * 0.13, y, 0.337], [side * 0.28, y + spread * 0.3, 0.35], [side * 0.47, y + spread, 0.31]], 0.0024, white);
    }
    for (const [x, y] of [[0.08, -0.11], [0.12, -0.13], [0.07, -0.15]]) ellipsoid(head, [side * x, y, 0.352], [0.0035, 0.0035, 0.002], '#bba89c', detail, 8);
  }
  ellipsoid(head, [0, -0.234, 0.192], [0.16, 0.055, 0.07], white, fur, 28);
  if (choco) ellipsoid(head, [0.01, -0.217, 0.262], [0.086, 0.040, 0.016], cat.color, fur, 24);
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-0.041, 0.012); noseShape.quadraticCurveTo(0, 0.025, 0.041, 0.012);
  noseShape.quadraticCurveTo(0.041, 0, 0.008, -0.022); noseShape.quadraticCurveTo(0, -0.031, -0.008, -0.022);
  noseShape.quadraticCurveTo(-0.041, 0, -0.041, 0.012);
  const noseGeometry = new THREE.ExtrudeGeometry(noseShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, steps: 1, curveSegments: 6 });
  paintGeometry(noseGeometry, pink); mesh(head, noseGeometry, noseMaterial).position.set(0, -0.087, 0.354);
  curve(head, [[0, -0.113, 0.355], [0, -0.138, 0.352], [0, -0.148, 0.350]], 0.003, '#986963');
  for (const side of [-1, 1]) curve(head, [[0, -0.148, 0.350], [side * 0.025, -0.16, 0.348], [side * 0.056, -0.148, 0.342]], 0.003, cat.accent);
  const anger = group(head, 'anger'); anger.visible = false;
  for (const side of [-1, 1]) {
    curve(anger, [[side * 0.09, 0.075, 0.302], [side * 0.17, 0.12, 0.29], [side * 0.235, 0.13, 0.251]], 0.016, cat.accent, fur);
    const fang = paintGeometry(new THREE.ConeGeometry(0.013, 0.043, 8), white); fang.rotateZ(Math.PI);
    mesh(anger, fang, detail).position.set(side * 0.044, -0.186, 0.343);
  }
  batch(anger); batch(head);
  const tail = group(root, 'tail', [0, 0.82, -0.76]);
  let parent: THREE.Object3D = tail;
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < 5; i++) {
    const joint = new THREE.Bone(); joint.name = `tailJoint${i}`; joint.position.y = i === 0 ? 0 : 0.18;
    parent.add(joint); bones.push(joint); parent = joint;
  }
  const r = choco ? 0.074 : 0.060;
  const tailGeometry = loft([[-0.02, r * 0.8, r * 0.8], [0.04, r, r], [0.30, r * 0.85, r * 0.85], [0.60, r * 0.6, r * 0.6], [0.84, r * 0.35, r * 0.35], [0.90, 0.002, 0.002]], 'y', cat.color, 16, 48);
  const tailPoints = tailGeometry.getAttribute('position'), skinIndices: number[] = [], skinWeights: number[] = [];
  for (let i = 0; i < tailPoints.count; i++) {
    const along = THREE.MathUtils.clamp(tailPoints.getY(i) / 0.18, 0, 4), a = Math.floor(along), weight = along - a;
    skinIndices.push(a, Math.min(4, a + 1), 0, 0); skinWeights.push(1 - weight, weight, 0, 0);
  }
  tailGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  tailGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  const tailMesh = new THREE.SkinnedMesh(tailGeometry, tailMaterial); tailMesh.name = 'tailSkin'; tail.add(tailMesh);
  root.updateMatrixWorld(true); tailMesh.bind(new THREE.Skeleton(bones));
  // A conservative local bound contains all curled poses without per-frame recomputation.
  tailMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.35, 0), 1.15);
  bones.forEach((bone, i) => { bone.rotation.x = [0.5, 0.13, -0.15, -0.50, -0.65][i]; });
  return root;
}

/** Forward is +Z. Every cat shares an articulated rig and an independent pose. */
export function createCat(cat: Appearance): CatModel {
  const key = `${cat.appearance ?? 'primitive'}:${cat.color}:${cat.accent}`;
  if (!templates.has(key)) templates.set(key, buildCat(cat));
  const root = cloneRig(templates.get(key)!) as THREE.Group;
  const joint = (name: string) => root.getObjectByName(name) as THREE.Group;
  return { root, body: joint('body'), head: joint('head'), tail: joint('tail'), anger: joint('anger'),
    eyes: [0, 1].map(i => root.getObjectByName(`eye${i}`) as THREE.Mesh), closedEyes: [0, 1].map(i => joint(`closedEye${i}`)), eyeHeight: (root.getObjectByName('eye0') as THREE.Mesh).scale.y,
    legs: [0, 1, 2, 3].map(i => joint(`leg${i}`)), lowerLegs: [0, 1, 2, 3].map(i => joint(`lowerLeg${i}`)),
    paws: [0, 1, 2, 3].map(i => joint(`paw${i}`)), ears: [0, 1].map(i => joint(`ear${i}`)),
    tailJoints: [0, 1, 2, 3, 4].map(i => root.getObjectByName(`tailJoint${i}`) as THREE.Bone) };
}

/** Only skeleton textures belong to an instance; cached meshes and coat maps are shared. */
export function disposeCat(model: CatModel) {
  model.root.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); });
}
