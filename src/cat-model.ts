import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import type { CatDefinition } from './types';
import { applyBlenderCatAsset, hasBlenderCatAsset } from './blender-cat-asset';

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

/** Distance to a painted polyline, used for the tabby's branching facial stripes. */
function nearCoatStroke(x: number, y: number, points: number[][], width: number) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], dx = bx - ax, dy = by - ay;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 < width * width) return true;
  }
  return false;
}

function buildCat(cat: Appearance) {
  const choco = cat.appearance === 'choco', latte = cat.appearance === 'latte', didi = cat.appearance === 'didi';
  const xiaosai = cat.appearance === 'xiaosai', yelo = cat.appearance === 'yelo';
  const miller = cat.appearance === 'miller';
  const white = choco || yelo || miller ? '#faf6ef' : latte ? cat.color : xiaosai ? '#f5e6cd' : '#f3e7d4';
  const latteTan = '#bfa17c', latteDark = '#514944';
  const pink = choco ? '#d99b9f' : '#cf9390', ink = '#252020';
  const muzzleCoat = didi ? '#858b94' : white;
  const foreheadM = [[0.145, 0.135], [0.115, 0.255], [0.07, 0.28], [0.018, 0.185]];
  const foreheadFlame = [[0.026, 0.32], [0.034, 0.265], [0.018, 0.215], [0.014, 0.145]];
  const cheekUpper = [[0.235, 0.012], [0.285, -0.025], [0.325, -0.015]];
  const cheekLower = [[0.19, -0.085], [0.26, -0.12], [0.325, -0.105]];
  const root = new THREE.Group(), body = group(root, 'body');
  const torso = loft([
    [-0.87, 0.005, 0.005], [-0.75, 0.25, 0.27], [-0.52, didi ? 0.39 : choco ? 0.37 : 0.33, 0.35],
    [-0.16, didi ? 0.37 : choco ? 0.355 : 0.31, 0.32], [0.17, didi ? 0.34 : 0.30, 0.30], [0.41, 0.29, 0.35], [0.64, 0.13, 0.24], [0.69, 0.005, 0.005],
  ], 'z', (x, y, z) => {
    if (didi) return cat.color;
    if (miller) {
      if (z > 0.49 && y < 0.20) return white;
      if (y < -0.17) return Math.sin(z * 36 + x * 12) * Math.cos(x * 37) > 0.77 ? cat.accent : '#d7c7aa';
      const swirl = Math.hypot((z + 0.18) / 0.51, (y + 0.01) / 0.27);
      if (Math.abs(x) > 0.16 && (Math.abs(swirl - 0.60) < 0.13 || Math.abs(swirl - 1.25) < 0.15)) return cat.accent;
      if (y > 0.24 && Math.abs(x) < 0.07) return cat.accent;
      return cat.color;
    }
    if (yelo) {
      if (y < -0.16 || (z > 0.40 + Math.abs(x) * 0.3 && y < 0.24)) return white;
      return Math.abs(x) > 0.18 && Math.sin(z * 25 + y * 5) > 0.72 ? cat.accent : cat.color;
    }
    if (xiaosai) {
      if (y < -0.18 || (z > 0.52 && y < 0.14)) return '#ecd0a2';
      return cat.color;
    }
    if (latte) {
      // The large charcoal island is on her right hip; the belly stays white.
      if (x < -0.16 && ((z + 0.48) / 0.23) ** 2 + ((y + 0.005) / 0.23) ** 2 < 1 + 0.06 * Math.sin(z * 45)) return latteDark;
      // Separate dorsal islands from the rear/overhead reference, not a saddle.
      if (y > 0.14) {
        const edge = 1 + 0.055 * Math.sin(x * 65 + z * 37);
        if (((x + 0.025) / 0.21) ** 2 + ((z + 0.56) / 0.16) ** 2 < edge
          || ((x - 0.10) / 0.17) ** 2 + ((z + 0.13) / 0.18) ** 2 < edge
          || ((x + 0.095) / 0.065) ** 2 + ((z - 0.17) / 0.08) ** 2 < edge
          || ((x - 0.075) / 0.060) ** 2 + ((z - 0.20) / 0.065) ** 2 < edge) return '#655044';
      }
      return white;
    }
    if (choco && ((z > 0.43 + Math.abs(x) * 0.35 && y < 0.24) || (y < -0.20 && z > 0.12))) return white;
    if (!choco && z > 0.57 && y < 0.12) return white;
    if (!choco && Math.abs(x) > 0.22 && y > 0.04 && Math.sin(z * 24 + y * 5) > 0.89) return cat.accent;
    return cat.color;
  });
  mesh(body, torso).position.y = 0.69;
  for (let i = 0; i < 4; i++) {
    const front = i < 2, side = i % 2 ? 1 : -1;
    const leg = group(root, `leg${i}`, [side * 0.245, 0.57, front ? 0.4 : -0.62]);
    const coat: Paint | string = miller ? (_x, y, z) => Math.sin(y * 42 + z * 8) > 0.40 ? cat.accent : cat.color : yelo ? (front ? white : (_x, y, z) => y < -0.1 ? white : Math.sin(y * 48 + z * 7) > 0.65 ? cat.accent : cat.color) : xiaosai ? (_x, y, z) => Math.sin(y * 52 + z * 8) > 0.62 ? cat.accent : cat.color : latte && front && side > 0
      ? (x, y, z) => x > 0.025 && y < -0.08 && y > -0.23 && z > -0.06 ? latteTan : white
      : choco && front && side > 0 ? white : cat.color;
    mesh(leg, loft([[-0.28, 0.07, 0.075], [-0.20, front ? 0.105 : 0.13, 0.11], [-0.07, front ? 0.125 : 0.17, front ? 0.13 : 0.19], [0.08, 0.05, 0.06]], 'y', coat, 18, 18));
    const lower = group(leg, `lowerLeg${i}`, [0, -0.25, 0]);
    // Choco's left hind leg has a long white sock beneath its brown thigh.
    const lowerCoat: Paint | string = miller ? (_x, y, z) => y < -0.18 ? white : Math.sin(y * 44 + z * 7) > 0.4 ? cat.accent : cat.color : yelo ? white : xiaosai ? (_x, y, z) => y < -0.20 ? '#e9c58e' : Math.sin(y * 50 + z * 7) > 0.6 ? cat.accent : cat.color : latte ? (x, y, z) => {
      if (front && side < 0 && z > -0.045) {
        if (y > -0.12 && y < -0.065 && x < 0.025) return latteDark;
        if (y > -0.22 && y < -0.015) return latteTan;
      }
      if (!front && side > 0 && x < -0.025 && y > -0.19) return latteTan;
      return white;
    } : choco && side > 0 ? white : coat;
    mesh(lower, loft([[-0.27, 0.06, 0.06], [-0.20, 0.075, 0.08], [-0.04, 0.092, 0.09], [0.035, 0.065, 0.065]], 'y', lowerCoat, 16, 14));
    const paw = group(lower, `paw${i}`, [0, -0.25, 0.085]);
    ellipsoid(paw, [0, 0, 0], [0.115, 0.07, 0.15], didi ? cat.color : xiaosai ? '#e9c58e' : white, fur, 24);
    for (const x of [-0.038, 0.038]) curve(paw, [[x, 0.035, 0.139], [x, 0.055, 0.11], [x, 0.062, 0.075]], 0.002, didi ? '#505660' : '#c9bcb0', fur);
    ellipsoid(paw, [0, -0.064, -0.015], [0.047, 0.006, 0.052], miller ? '#3c3033' : pink, fur, 14);
    for (const x of [-0.060, 0, 0.060]) ellipsoid(paw, [x, -0.052, 0.075], [0.024, 0.009, 0.030], miller ? '#3c3033' : pink, fur, 12);
    batch(paw);
  }
  const head = group(root, 'head', [0, 0.99, 0.57]);
  const headGeometry = new THREE.SphereGeometry(1, 64, 42), positions = headGeometry.getAttribute('position');
  function headPoint(x: number, y: number, z: number) {
    const cheeks = 1 + (didi ? 0.12 : xiaosai ? 0.035 : 0.08) * Math.exp(-(((y + 0.35) / 0.4) ** 2));
    const taper = xiaosai ? 1 - 0.16 * Math.max(0, -y) : 1;
    return [x * (didi ? 0.405 : choco ? 0.39 : latte || xiaosai ? 0.335 : 0.355) * cheeks * taper, y * 0.325,
      z * 0.30 + (z > 0 ? 0.025 * Math.exp(-(((y + 0.4) / 0.3) ** 2)) * z : 0)];
  }
  for (let i = 0; i < positions.count; i++) {
    const p = headPoint(positions.getX(i), positions.getY(i), positions.getZ(i));
    positions.setXYZ(i, p[0], p[1], p[2]);
  }
  headGeometry.computeVertexNormals();
  coatGeometry(headGeometry, (x, y, z) => {
    if (didi) return cat.color;
    if (miller && z > 0.035) {
      const ax = Math.abs(x);
      if (y < -0.115 && ax < 0.24 + (y + 0.115) * 0.3) return white;
      if (nearCoatStroke(ax, y, foreheadM, 0.013) || nearCoatStroke(ax, y, foreheadFlame, 0.009)
        || nearCoatStroke(ax, y, cheekUpper, 0.017) || nearCoatStroke(ax, y, cheekLower, 0.015)) return cat.accent;
      return cat.color;
    }
    if (yelo) {
      if (z > 0.035) {
        const blaze = y > -0.02 ? Math.max(0, (0.22 - y) * 0.40) : 0.10 + (-y - 0.02) * 1.6;
        if (y < 0.22 && (Math.abs(x - 0.012) < blaze || y < -0.15)) return white;
        const ax = Math.abs(x);
        if (nearCoatStroke(ax, y, foreheadM, 0.008) || nearCoatStroke(ax, y, cheekUpper, 0.012)
          || nearCoatStroke(ax, y, cheekLower, 0.010)) return cat.accent;
      }
      return cat.color;
    }
    if (xiaosai) {
      const ax = Math.abs(x);
      if (z > 0.035) {
        const edge = 0.004 + 0.007 * THREE.MathUtils.clamp((y - 0.10) / 0.17, 0, 1) + 0.001 * Math.sin(y * 103 + x * 31);
        if (nearCoatStroke(ax, y, foreheadM, edge) || nearCoatStroke(ax, y, foreheadFlame, edge * 0.72)
          || nearCoatStroke(ax, y, cheekUpper, 0.009) || nearCoatStroke(ax, y, cheekLower, 0.011)) return cat.accent;
        if (((ax - 0.166) / 0.095) ** 2 + ((y - 0.027) / 0.061) ** 2 < 1) return white;
        if (y < -0.105 && ax < 0.23 + (y + 0.105) * 0.4) return white;
        if ((x / 0.029) ** 2 + ((y - 0.025) / 0.14) ** 2 < 1) return '#e8c08b';
      }
      return cat.color;
    }
    if (latte) {
      if (z > 0.025) {
        // Asymmetric left-eye mask, separated from the tan nose bridge by white.
        if (x > 0.055 && ((x - 0.18) / 0.17) ** 2 + ((y - 0.125) / 0.22) ** 2 < 1 + 0.05 * Math.sin(y * 65)) return latteDark;
        if (((x + 0.025) / 0.061) ** 2 + ((y + 0.005) / 0.16) ** 2 < 1) return latteTan;
        if (((x + 0.105) / 0.06) ** 2 + ((y - 0.235) / 0.052) ** 2 < 1) return latteTan;
      }
      return white;
    }
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
    ellipsoid(head, [side * 0.083, -0.125, 0.286], [didi ? 0.123 : 0.111, 0.077, 0.066], muzzleCoat, fur, 32);
    const ear = group(head, `ear${side < 0 ? 0 : 1}`, [side * 0.25, 0.19, -0.025]);
    const height = yelo ? (side < 0 ? 0.29 : 0.32) : choco && side < 0 ? 0.28 : latte ? 0.39 : xiaosai ? 0.38 : didi ? 0.30 : 0.34;
    const earGeometry = loft([[0, 0.11, 0.035], [height * 0.2, 0.145, 0.047], [height * 0.6, 0.085, 0.032], [height * 0.94, 0.023, 0.012], [height, 0.002, 0.002]], 'y',
      (x, y, z) => z > 0.020 && y > 0.045 && y < height * 0.86 && Math.abs(x) < (1 - y / height) * 0.13 ? (didi ? '#8d7b81' : miller ? '#c69895' : '#ac7e7d') : cat.color, 26, 24, `${cat.color}:ear:${height}`);
    // Choco's left ear (viewer-right from the front) has a small clipped tip.
    // Flatten the existing surface so the clip stays part of the animated ear.
    if (choco && side > 0 || yelo) {
      const points = earGeometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) {
        points.setY(i, Math.min(points.getY(i), height * (yelo ? side < 0 ? 0.80 : 0.88 : 0.92) + points.getX(i) * 0.12));
      }
      earGeometry.computeVertexNormals();
    }
    earGeometry.rotateZ(-side * (choco && side < 0 ? 0.36 : 0.17)); mesh(ear, earGeometry);
    const eyeHeight = choco || latte ? 0.080 : xiaosai ? 0.054 : didi ? 0.067 : 0.062;
    const eye = ellipsoid(head, [side * 0.166, 0.023, 0.286], [1, 1, 1], (x, y) => {
      const angle = Math.atan2(y, x), radius = Math.hypot(x, y);
      if (radius > 0.92) return miller ? '#292925' : xiaosai ? '#705035' : didi ? '#70502c' : choco ? '#88713e' : '#536748';
      if (xiaosai) return Math.sin(angle * 32) > 0.35 ? '#b7a16b' : '#9e895a';
      if (didi) return Math.sin(angle * 34) > 0.35 ? '#d2a04c' : '#bc8135';
      if (yelo) return Math.sin(angle * 32) > 0.35 ? '#bda05a' : '#a78a43';
      if (miller) return Math.sin(angle * 32) > 0.35 ? '#bac58b' : '#a7b375';
      return choco ? (Math.sin(angle * 34) > 0.35 ? '#cbb45e' : '#bda155') : latte ? (Math.sin(angle * 30) > 0.3 ? '#b8c582' : '#9eae6d') : '#a8b77b';
    }, eyeMaterial, 32);
    eye.name = `eye${side < 0 ? 0 : 1}`; eye.scale.set(0.082, eyeHeight, 0.016);
    if (xiaosai) eye.rotation.z = side * 0.12;
    ellipsoid(eye, [0, 0.025, 0.97], [xiaosai ? 0.51 : latte ? 0.44 : 0.34, 0.77, 0.12], ink, eyeMaterial, 24);
    ellipsoid(eye, [-0.21, 0.34, 1.08], [0.16, 0.18, 0.09], '#ffffff', eyeMaterial, 16);
    ellipsoid(eye, [0.22, -0.25, 1.02], [0.065, 0.07, 0.05], '#e9e5d5', eyeMaterial, 12);
    curve(eye, [[-0.93, 0.25, 0.4], [-0.50, 0.86, 0.4], [0.35, 0.93, 0.4], [0.93, 0.25, 0.4]], 0.055, xiaosai ? white : cat.accent, eyeMaterial);
    if (xiaosai) curve(eye, [[-0.93, -0.15, 0.4], [-0.45, -0.87, 0.4], [0.45, -0.87, 0.4], [0.93, -0.15, 0.4]], 0.05, white, eyeMaterial);
    batchEye(eye);
    if (xiaosai) {
      const points = eye.geometry.getAttribute('position');
      for (let i = 0; i < points.count; i++) points.setY(i, points.getY(i) * (1 - 0.28 * Math.min(1, Math.abs(points.getX(i)))));
      eye.geometry.computeVertexNormals();
    }
    const closedEye = group(head, `closedEye${side < 0 ? 0 : 1}`, [side * 0.166, 0.023, 0.296]);
    closedEye.visible = false;
    curve(closedEye, [[-0.063, -0.002, -0.008], [-0.025, 0.013, 0.008], [0.025, 0.013, 0.008], [0.063, -0.002, -0.008]], 0.012, ink);
    for (let i = 0; i < 4; i++) {
      const y = -0.105 - i * 0.025, spread = 0.05 - i * 0.034;
      curve(head, [[side * 0.13, y, 0.337], [side * 0.28, y + spread * 0.3, 0.35], [side * 0.47, y + spread, 0.31]], 0.0024, didi ? '#d7d9dc' : white);
    }
    for (const [x, y] of [[0.08, -0.11], [0.12, -0.13], [0.07, -0.15]]) ellipsoid(head, [side * x, y, 0.352], [0.0035, 0.0035, 0.002], '#bba89c', detail, 8);
  }
  ellipsoid(head, [0, -0.234, 0.192], [0.16, 0.055, 0.07], didi ? cat.color : white, fur, 28);
  if (choco) ellipsoid(head, [0.01, -0.217, 0.262], [0.086, 0.040, 0.016], cat.color, fur, 24);
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-0.041, 0.012); noseShape.quadraticCurveTo(0, 0.025, 0.041, 0.012);
  noseShape.quadraticCurveTo(0.041, 0, 0.008, -0.022); noseShape.quadraticCurveTo(0, -0.031, -0.008, -0.022);
  noseShape.quadraticCurveTo(-0.041, 0, -0.041, 0.012);
  const noseGeometry = new THREE.ExtrudeGeometry(noseShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, steps: 1, curveSegments: 6 });
  if (miller) {
    const rim = mesh(head, paintGeometry(noseGeometry.clone(), '#43352f'), detail);
    rim.position.set(0, -0.087, 0.351); rim.scale.set(1.14, 1.14, 1);
  }
  paintGeometry(noseGeometry, didi ? '#303844' : latte ? '#916b63' : miller ? '#bd817c' : pink); mesh(head, noseGeometry, noseMaterial).position.set(0, -0.087, 0.354);
  curve(head, [[0, -0.113, 0.355], [0, -0.138, 0.352], [0, -0.148, 0.350]], 0.003, didi ? cat.accent : '#986963');
  for (const side of [-1, 1]) curve(head, [[0, -0.148, 0.350], [side * 0.025, -0.16, 0.348], [side * 0.056, -0.148, 0.342]], 0.003, cat.accent);
  if (didi) {
    // His signature tongue follows the head through every pose and blink.
    const tongue = group(head, 'tongue', [0.006, -0.151, 0.350]);
    const shape = new THREE.Shape();
    shape.moveTo(-0.035, 0); shape.quadraticCurveTo(0, 0.009, 0.035, 0);
    shape.bezierCurveTo(0.042, -0.036, 0.030, -0.080, 0, -0.083);
    shape.bezierCurveTo(-0.030, -0.080, -0.042, -0.036, -0.035, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 3, steps: 1, curveSegments: 10 });
    mesh(tongue, paintGeometry(geometry, '#df8298'), detail);
    curve(tongue, [[0, -0.012, 0.018], [0.001, -0.035, 0.019], [0, -0.060, 0.018]], 0.0015, '#b95d76');
    batch(tongue);
  }
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
  const r = choco || didi ? 0.074 : 0.060;
  const tailGeometry = loft([[-0.02, r * 0.8, r * 0.8], [0.04, r, r], [0.30, r * 0.85, r * 0.85], [0.60, r * 0.6, r * 0.6], [0.84, r * 0.35, r * 0.35], [0.90, 0.002, 0.002]], 'y', cat.color, 16, 48);
  if (latte) paintGeometry(tailGeometry, (_x, y) => y > 0.76 || Math.sin(y * 39) > 0.55 ? latteDark : '#675b52');
  if (xiaosai || yelo || miller) paintGeometry(tailGeometry, (_x, y) => y > 0.83 || Math.sin(y * 37) > 0.25 ? cat.accent : cat.color);
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
  const imported = hasBlenderCatAsset(cat.appearance);
  const key = `${cat.appearance ?? 'primitive'}:${cat.color}:${cat.accent}:${imported ? 'blender' : 'builtin'}`;
  if (!templates.has(key)) {
    const template = buildCat(cat);
    if (imported && hasBlenderCatAsset(cat.appearance)) applyBlenderCatAsset(cat.appearance, template);
    templates.set(key, template);
  }
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
  const skeletons = new Set<THREE.Skeleton>();
  model.root.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
  skeletons.forEach(skeleton => skeleton.dispose());
}
