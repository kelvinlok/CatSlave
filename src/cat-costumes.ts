import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COSTUME_SLOTS, isCatOutfit, normalizeCatOutfit, outfitKey } from './wardrobe';
import type { CatOutfit, CostumeItemId, CostumeSlot } from './wardrobe';
import { buildFootwearFlex, updateCatCostumeMotion } from './cat-costume-motion';
import { buildClothDrape, clothDrapeMaterial, updateCatClothMotion } from './cat-cloth-motion';
import clothGeometry from './generated/costume-geometry.json';
import { indexCostumeGeometry } from './index-costume-geometry';

export type ChristmasCostume = 'santa' | 'elf' | 'reindeer' | 'winter' | 'holly' | 'gift';
const outfits: Record<string, { style: ChristmasCostume; name: string; color?: string }> = {
  choco: { style: 'santa', name: 'Santa Paws' },
  latte: { style: 'elf', name: 'Little helper' },
  didi: { style: 'reindeer', name: 'Reindeer pal' },
  xiaosai: { style: 'elf', name: 'Toy workshop elf', color: '#b62d3c' },
  yelo: { style: 'santa', name: 'Christmas cape', color: '#285f48' },
  miller: { style: 'reindeer', name: 'Woodland reindeer', color: '#285f48' },
  momo: { style: 'winter', name: 'Snow day' },
  zhenzhenzi: { style: 'holly', name: 'Holly wishes' },
  dingding: { style: 'gift', name: 'Best little gift' },
};
export function christmasCostumeFor(appearance?: string) { return outfits[appearance ?? ''] ?? outfits.choco; }

// Small, shared fabric/trim palette: batches are cached with the cat templates.
const fabric = new THREE.MeshPhysicalMaterial({ name: 'Christmas woven wool', vertexColors: true, roughness: 0.94,
  sheen: .24, sheenRoughness: .88, sheenColor: '#e4d3be', side: THREE.DoubleSide });
const trim = new THREE.MeshPhysicalMaterial({ name: 'Christmas brushed fleece', vertexColors: true, roughness: 1,
  sheen: .42, sheenRoughness: 1, sheenColor: '#fff3dc' });
const metal = new THREE.MeshStandardMaterial({ name: 'Christmas brass', vertexColors: true, roughness: 0.3, metalness: 0.65 });
// Blender-authored, seamless data maps are shared by every garment. DOM-backed
// images remain restorable after a mobile WebGL context loss.
if (typeof document !== 'undefined') {
  const loader = new THREE.TextureLoader();
  for (const [file, property] of [['fabric-normal.png', 'normalMap'], ['fabric-roughness.png', 'roughnessMap']] as const) {
    const texture = loader.load(`${import.meta.env.BASE_URL}textures/costumes/${file}`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8); texture.anisotropy = 4;
    fabric[property] = texture; trim[property] = texture;
  }
  fabric.normalScale.set(.46, .46); trim.normalScale.set(.7, .7);
}
const red = '#b62d3c', green = '#285f48', ivory = '#fff3dc', gold = '#d9aa50';
type Layer = 'fabric' | 'trim' | 'metal';
const materials = { fabric, trim, metal };
const clothMaterials = { fabric: clothDrapeMaterial(fabric), trim: clothDrapeMaterial(trim), metal: clothDrapeMaterial(metal) };
type Vec = [number, number, number];

/** Three's relative-target bounds accumulate deltas; bound each pose from rest. */
function costumeBounds(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const bounds = new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
  const point = new THREE.Vector3();
  for (const target of geometry.morphAttributes.position ?? []) {
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      point.x += target.getX(i); point.y += target.getY(i); point.z += target.getZ(i);
      bounds.expandByPoint(point);
    }
  }
  // Signed neck corrections are bounded by .42 * .58 / .88 (smallest fit).
  if (geometry.userData.clothDrape) bounds.expandByScalar(.30);
  geometry.boundingBox = bounds;
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
}

/** Bake color and transforms into one mesh per material and animated attachment. */
class CostumePart {
  readonly root = new THREE.Group();
  ankleFlex = 0;
  private readonly pieces: Record<Layer, THREE.BufferGeometry[]> = { fabric: [], trim: [], metal: [] };
  constructor(name: string) { this.root.name = name; this.root.userData.isCatCostume = true; }
  add(geometry: THREE.BufferGeometry, color: string, layer: Layer = 'fabric', position: Vec = [0, 0, 0], scale: Vec = [1, 1, 1], rotation: Vec = [0, 0, 0]) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    // Authored cloth keeps its unwrapped meter-scale UVs. Small trim/details
    // get a local projection at the same texel density instead of stretched UVs.
    if (!geometry.userData.authoredUV) {
      const points = flat.getAttribute('position'), normals = flat.getAttribute('normal');
      const uv = new Float32Array(points.count * 2);
      for (let i = 0; i < points.count; i += 3) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
        for (let j = i; j < Math.min(i + 3, points.count); j++) {
          uv[j * 2] = nx > ny && nx > nz ? points.getZ(j) : points.getX(j);
          uv[j * 2 + 1] = ny > nx && ny > nz ? points.getZ(j) : points.getY(j);
        }
      }
      flat.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    const tint = new THREE.Color(color), count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.setAttribute('ankleFlex', new THREE.Float32BufferAttribute(new Float32Array(count).fill(this.ankleFlex), 1));
    this.pieces[layer].push(flat);
  }
  ball(position: Vec, size: Vec, color: string, layer: Layer = 'fabric') {
    this.add(new THREE.SphereGeometry(1, 12, 8), color, layer, position, size);
  }
  tube(points: Vec[], radius: number, color: string, layer: Layer = 'fabric', steps = 12) {
    this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), steps, radius, 6, false), color, layer);
  }
  ring(position: Vec, radius: number, thickness: number, color: string, layer: Layer = 'fabric', scale: Vec = [1, 1, 1]) {
    this.add(new THREE.TorusGeometry(radius, thickness, 8, 32), color, layer, position, scale, [Math.PI / 2, 0, 0]);
  }
  finish() {
    for (const layer of Object.keys(this.pieces) as Layer[]) {
      const pieces = this.pieces[layer]; if (!pieces.length) continue;
      const geometry = mergeGeometries(pieces)!; pieces.forEach(piece => piece.dispose());
      indexCostumeGeometry(geometry);
      if (this.root.name === 'christmas-footwear') buildFootwearFlex(geometry);
      if (this.root.name === 'christmas-neckwear') buildClothDrape(geometry);
      costumeBounds(geometry);
      const mesh = new THREE.Mesh(geometry, geometry.userData.clothDrape ? clothMaterials[layer] : materials[layer]);
      mesh.name = `${this.root.name}-${layer}`; mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    return this.root;
  }
}

/** Soft bent hat, lofted across a curved spine instead of a rigid cone. */
function cap(part: CostumePart, color: string, elf = false) {
  const sections = [
    [-0.035, 0.28, -0.06, 0.218, 0.167], [-0.03, 0.36, -0.06, 0.202, 0.157],
    [-0.006, 0.48, -0.06, 0.162, 0.127], [0.055, 0.59, -0.055, 0.111, 0.09],
    [0.135, 0.655, -0.045, 0.065, 0.056], [0.215, 0.63, -0.025, 0.032, 0.03],
    [0.255, elf ? 0.62 : 0.565, 0, 0.004, 0.004],
  ];
  const points: number[] = [], indices: number[] = [], uvs: number[] = [], around = 36, rows = 24;
  const spine = new THREE.CatmullRomCurve3(sections.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const widths = new THREE.CatmullRomCurve3(sections.map(([, , , x, z]) => new THREE.Vector3(x, z, 0)));
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, center = spine.getPoint(t), width = widths.getPoint(t);
    for (let i = 0; i <= around; i++) {
      const a = i / around * Math.PI * 2;
      const fold = (.004 * Math.sin(a * 7 + t * 2) + .002 * Math.sin(a * 11 - t)) * Math.sin(Math.PI * t);
      points.push(center.x + Math.cos(a) * (width.x + fold), center.y,
        center.z + Math.sin(a) * (width.y + fold));
      uvs.push(i / around * 1.16, t * .52);
      if (row && i) { const n = row * (around + 1) + i, b = n - around - 1; indices.push(b - 1, n - 1, n, b - 1, n, b); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.userData.authoredUV = true;
  geometry.setIndex(indices); geometry.computeVertexNormals(); part.add(geometry, color);
  part.ring([-0.035, 0.29, -0.06], 0.213, elf ? 0.036 : 0.044, elf ? (color === red ? green : red) : ivory, elf ? 'fabric' : 'trim', [1, 0.78, 1]);
  if (elf) {
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      part.ball([-.035 + Math.cos(angle) * .217, .263, -.06 + Math.sin(angle) * .169], [.019, .021, .019], gold, 'metal');
    }
    bell(part, [.255, .59, 0], .043);
  } else {
    // Scalloped fleece edge and pompom keep the silhouette soft at game scale.
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      part.ball([-.035 + Math.cos(a) * .215, .29, -.06 + Math.sin(a) * .167], [.035, .039, .034], ivory, 'trim');
    }
    part.ball([.26, .55, 0], [.074, .072, .068], ivory, 'trim');
  }
}

function bell(part: CostumePart, position: Vec, radius = .046) {
  part.ball(position, [radius, radius, radius], gold, 'metal');
  part.add(new THREE.TorusGeometry(radius * .72, .006, 5, 12), '#7a552e', 'metal', position, [1, 1, 1], [Math.PI / 2, 0, 0]);
  part.ball([position[0], position[1] - .016, position[2] + radius * .91], [.011, .012, .005], '#54402e', 'metal');
}

function authoredCloth(part: CostumePart, kind: 'cape' | 'scarf', color: string, fluffy = false) {
  for (const source of clothGeometry[kind]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(source.uvs, 2));
    geometry.setIndex(source.indices); geometry.userData.authoredUV = true;
    part.add(geometry, source.role === 'trim' ? ivory : color, source.role as Layer,
      [0, 0, fluffy ? .04 : 0], [fluffy ? 1.19 : 1, 1, 1]);
  }
}

function scarf(part: CostumePart, color = red, fluffy = false) {
  authoredCloth(part, 'scarf', color, fluffy);
}

/** Open shoulder cape leaves the belly, all legs and tail unobstructed. */
function cape(part: CostumePart, color: string) {
  authoredCloth(part, 'cape', color);
  // The scooped neckline holds the back; soft front ties meet at the clasp.
  // A full tilted torus would hang as a rigid hoop around the cat's cheeks.
  for (const side of [-1, 1]) part.tube([[side * .33, .66, .40], [side * .29, .68, .57],
    [side * .17, .67, .72], [0, .69, .75]], .017, ivory, 'trim', 18);
  bell(part, [0, .69, .75], .049);
}

function antlers(part: CostumePart) {
  part.ring([0, .27, -.06], .29, .024, red, 'fabric', [1, .67, 1]);
  for (const side of [-1, 1]) {
    const x = (n: number) => n * side;
    part.tube([[x(.26), .30, -.10], [x(.34), .49, -.12], [x(.36), .70, -.13], [x(.46), .83, -.13]], .027, '#ad794e');
    part.tube([[x(.35), .61, -.13], [x(.22), .69, -.13], [x(.20), .78, -.12]], .022, '#ad794e');
    part.tube([[x(.36), .70, -.13], [x(.46), .71, -.12], [x(.53), .77, -.11]], .019, '#ad794e');
    part.ball([x(.26), .31, -.10], [.05, .044, .045], ivory, 'trim');
  }
}

function bow(part: CostumePart, position: Vec, size = 1, color = red) {
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape(); shape.moveTo(0, 0);
    shape.bezierCurveTo(side * .11, .12, side * .25, .14, side * .235, -.02);
    shape.bezierCurveTo(side * .22, -.13, side * .09, -.08, 0, 0);
    part.add(new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelSize: .012, bevelThickness: .009, bevelSegments: 2, steps: 1, curveSegments: 8 }), color, 'fabric', position, [size, size, size]);
    part.add(new THREE.BoxGeometry(.072, .17, .022), color, 'fabric', [position[0] + side * .06 * size, position[1] - .1 * size, position[2]], [size, size, size], [0, 0, side * -.3]);
  }
  part.ball([position[0], position[1], position[2] + .02], [.047 * size, .057 * size, .041 * size], gold, 'metal');
}

function holly(part: CostumePart, position: Vec) {
  for (const side of [-1, 1]) {
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0);
    leaf.lineTo(side * .045, .045); leaf.lineTo(side * .04, .09); leaf.lineTo(side * .09, .095);
    leaf.lineTo(side * .15, .17); leaf.lineTo(side * .17, .095); leaf.lineTo(side * .13, .07);
    leaf.lineTo(side * .13, .025); leaf.lineTo(side * .08, .03); leaf.lineTo(0, 0);
    part.add(new THREE.ShapeGeometry(leaf), green, 'fabric', position);
  }
  for (const [x, y] of [[-.022, 0], [.023, 0], [0, .031]]) part.ball([position[0] + x, position[1] + y, position[2] + .014], [.028, .028, .023], red);
}

function knitHat(part: CostumePart) {
  part.ball([-.03, .355, -.06], [.225, .255, .17], '#527e8c');
  part.ring([-.03, .29, -.06], .218, .049, ivory, 'trim', [1, .78, 1]);
  // Raised knit ribs make a distinct beanie silhouette/material without a texture.
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    part.tube([[Math.cos(a) * .215 - .03, .34, Math.sin(a) * .165 - .06],
      [Math.cos(a) * .18 - .03, .49, Math.sin(a) * .14 - .06],
      [Math.cos(a) * .075 - .03, .59, Math.sin(a) * .06 - .06]], .008, '#92b4b8', 'fabric', 6);
  }
  part.ball([-.03, .635, -.06], [.075, .075, .07], ivory, 'trim');
}

const shoeTemplates = new Map<string, THREE.Group>();

/** Rounded toe box with a thin sole: the bottom matches the animator's paw contact. */
function shoeShell(part: CostumePart, color: string) {
  const profile = [
    [-.166, .005, .005], [-.145, .075, .075], [-.09, .12, .105],
    [-.015, .134, .108], [.07, .128, .105], [.115, .108, .088],
    [.145, .078, .065, -.046], [.168, .042, .041, -.022], [.18, .003, .014, .01],
  ];
  const vertices: number[] = [], indices: number[] = [], around = 24;
  profile.forEach(([z, width, top, bottom = -.055], row) => {
    const center = (top + bottom) / 2, height = (top - bottom) / 2;
    for (let i = 0; i <= around; i++) {
      const a = i / around * Math.PI * 2;
      vertices.push(Math.cos(a) * width, center + Math.sin(a) * height, z);
      if (row && i) { const n = row * (around + 1) + i, b = n - around - 1; indices.push(b - 1, n, n - 1, b - 1, b, n); }
    }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); part.add(geometry, color);
  part.ball([0, -.052, -.003], [.133, .017, .172], '#40352e');
}

function ankle(part: CostumePart, color: string, cuff: string, height = .12) {
  part.ankleFlex = 1;
  part.add(new THREE.CylinderGeometry(.088, .102, height, 24, 6, true), color, 'fabric',
    [0, height / 2, -.067], [1, 1, .88]);
  part.ring([0, height, -.067], .088, .019, cuff, 'fabric', [1, .88, 1]);
  part.ankleFlex = 0;
}

/** A tapered upturned elf toe, kept above the sole even at its lowest point. */
function curledToe(part: CostumePart, color: string) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -.005, .10), new THREE.Vector3(0, -.005, .18),
    new THREE.Vector3(0, .025, .23), new THREE.Vector3(0, .09, .235),
  ]);
  const steps = 14, around = 8, frames = path.computeFrenetFrames(steps, false);
  const positions: number[] = [], indices: number[] = [];
  for (let row = 0; row <= steps; row++) {
    const t = row / steps, center = path.getPointAt(t), radius = .062 * (1 - t) + .004;
    for (let i = 0; i <= around; i++) {
      const angle = i / around * Math.PI * 2;
      const p = center.clone().addScaledVector(frames.normals[row], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[row], Math.sin(angle) * radius);
      positions.push(p.x, Math.max(-.055, p.y), p.z);
      if (row && i) { const n = row * (around + 1) + i, b = n - around - 1; indices.push(b - 1, n - 1, n, b - 1, n, b); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); part.add(geometry, color);
  part.ball([0, .092, .237], [.019, .019, .019], gold);
  part.ball([0, .09, .254], [.005, .006, .003], '#76502d');
}

function shoeBow(part: CostumePart, color: string) {
  for (const side of [-1, 1]) part.ball([side * .041, .112, .047], [.044, .016, .027], color);
  part.ball([0, .12, .05], [.018, .019, .021], gold);
}

function shoeFor(style: ChristmasCostume, color: string) {
  const key = `${style}:${color}`, cached = shoeTemplates.get(key);
  if (cached) return cached;
  // Shoe brass and fleece use the same vertex-colored fabric batch. At this
  // scale silhouette/color carry the detail while four shoes add only four draws.
  const part = new CostumePart('christmas-footwear');
  if (style === 'santa') {
    shoeShell(part, '#3b3030'); ankle(part, color, ivory, .16);
    part.ankleFlex = 1;
    const y = .128, z = .028;
    for (const x of [-.033, .033]) part.add(new THREE.BoxGeometry(.009, .044, .008), gold, 'fabric', [x, y, z]);
    for (const offset of [-.022, .022]) part.add(new THREE.BoxGeometry(.075, .009, .008), gold, 'fabric', [0, y + offset, z]);
    part.add(new THREE.BoxGeometry(.009, .037, .009), gold, 'fabric', [0, y, z + .004]);
    part.ankleFlex = 0;
  } else if (style === 'elf') {
    shoeShell(part, color); ankle(part, color, color === green ? red : green, .105); curledToe(part, color);
  } else if (style === 'reindeer') {
    shoeShell(part, '#815235'); ankle(part, '#815235', '#d4b58a', .112);
    for (const z of [.025, .071]) part.tube([[-.041, .102, z], [0, .113, z + .004], [.041, .102, z]], .006, ivory, 'fabric', 4);
  } else if (style === 'winter') {
    shoeShell(part, '#527e8c'); ankle(part, '#527e8c', ivory, .09);
    part.ball([0, .126, .048], [.031, .027, .028], ivory);
    for (const x of [-.078, .078]) part.tube([[x, .057, .112], [x * .9, .095, .082], [x * .7, .102, .02]], .005, '#a9c8c9', 'fabric', 5);
  } else {
    shoeShell(part, style === 'holly' ? green : red);
    ankle(part, style === 'holly' ? green : red, style === 'holly' ? gold : ivory, .085);
    shoeBow(part, style === 'holly' ? red : green);
  }
  const result = part.finish(); shoeTemplates.set(key, result); return result;
}

const slotTemplates = new Map<string, THREE.Group>();

/** Cache the individual garments, never the combinatorial outfits or recipient cats. */
function garmentFor(slot: CostumeSlot, item: Exclude<CostumeItemId, 'none'>) {
  const key = `${slot}:${item}`, cached = slotTemplates.get(key); if (cached) return cached;
  const costume = christmasCostumeFor(item);
  const color = costume.color ?? (costume.style === 'elf' ? green : red);
  if (slot === 'footwear') {
    const shoe = shoeFor(costume.style, color); slotTemplates.set(key, shoe); return shoe;
  }
  const part = new CostumePart(slot === 'headwear' ? 'christmas-headwear' : 'christmas-neckwear');
  if (slot === 'headwear') {
    switch (costume.style) {
      case 'santa': cap(part, color); break;
      case 'elf': cap(part, color, true); break;
      case 'reindeer': antlers(part); break;
      case 'winter': knitHat(part); break;
      case 'holly': part.ring([0, .28, -.06], .27, .026, gold, 'metal', [1, .67, 1]); holly(part, [-.13, .30, .13]); break;
      case 'gift': bow(part, [-.14, .29, -.01], .7); break;
    }
  } else {
    switch (costume.style) {
      case 'santa': cape(part, color); break;
      case 'elf': scarf(part, color); for (const x of [-.18, 0, .18]) bell(part, [x, .66, .70], .034); break;
      case 'reindeer': scarf(part, color); bell(part, [0, .72, .75]); break;
      case 'winter': scarf(part, '#527e8c', true); break;
      case 'holly': cape(part, green); break;
      case 'gift': scarf(part, green); bow(part, [0, .74, .74], .78); bell(part, [0, .58, .77]); break;
    }
  }
  const result = part.finish(); slotTemplates.set(key, result); return result;
}

/**
 * Attach to the independent gameplay pivots that also drive the native Blender
 * bones. Re-equipping never changes anatomy, controller transforms or other cats.
 */
export function applyCatOutfit(root: THREE.Group, appearance?: string, outfit?: CatOutfit): void {
  const selected = normalizeCatOutfit(outfit, appearance);
  const selectedKey = outfitKey(selected);
  const previous = isCatOutfit(root.userData.catOutfit) ? root.userData.catOutfit : undefined;
  // Residents and previews can call this every frame; only an equip traverses
  // the controller tree. New native models are equipped before transplantation.
  if (previous && root.userData.catOutfitKey === selectedKey && outfitKey(previous) === selectedKey) return;
  for (const { id: slot } of COSTUME_SLOTS) {
    const item = selected[slot];
    const anchors = slot === 'headwear' ? ['head'] : slot === 'neckwear' ? ['body'] : ['paw0', 'paw1', 'paw2', 'paw3'];
    anchors.forEach((name, i) => {
      const parent = root.getObjectByName(name); if (!parent) return;
      const existing = parent.children.filter(child => child.userData.isCatCostume);
      if (previous?.[slot] === item && (item === 'none' ? !existing.length : existing.length === 1 && existing[0].userData.costumeItem === item)) return;
      existing.forEach(child => child.removeFromParent());
      if (item === 'none') return;
      const garment = garmentFor(slot, item).clone();
      if (slot === 'footwear') garment.name = `christmas-shoe${i}`;
      // Momo's long guard hairs sit beyond the short-haired torso envelope.
      // Fit the draped cape on this instance, keeping item geometry shared.
      const style = christmasCostumeFor(item).style;
      if (appearance === 'momo' && slot === 'neckwear' && (style === 'santa' || style === 'holly')) garment.scale.set(1.16, 1.05, 1);
      if (slot === 'neckwear' && style !== 'santa' && style !== 'holly') {
        // The Blender pattern is fitted to broad-necked Choco. Match the
        // slimmer native necks without baking a duplicate mesh per recipient.
        const slim = appearance === 'latte' || appearance === 'xiaosai';
        const medium = ['yelo', 'miller', 'zhenzhenzi', 'dingding'].includes(appearance ?? '');
        if (slim || medium) {
          garment.scale.set(slim ? .88 : .95, 1, slim ? .96 : 1);
          garment.position.z = .46 * (1 - garment.scale.z);
        }
      }
      if (appearance === 'momo' && slot === 'neckwear' && style !== 'santa' && style !== 'holly' && style !== 'winter') {
        garment.scale.set(1.19, 1.04, 1.04); garment.position.z = .035;
      }
      garment.userData.costumeSlot = slot; garment.userData.costumeItem = item;
      parent.add(garment);
    });
  }
  root.userData.catOutfit = { ...selected };
  root.userData.catOutfitKey = selectedKey;
  const matching = selected.headwear === selected.neckwear && selected.headwear === selected.footwear;
  root.userData.christmasCostume = matching ? (selected.headwear === 'none' ? 'none' : christmasCostumeFor(selected.headwear).style) : 'mixed';
  root.userData.christmasCostumeName = matching ? (selected.headwear === 'none' ? 'No outfit' : christmasCostumeFor(selected.headwear).name) : 'Mix and match';
  root.userData.christmasFootwear = selected.footwear === 'none' ? 'none' : christmasCostumeFor(selected.footwear).style;
  updateCatCostumeMotion(root);
  updateCatClothMotion(root);
}

/** Backward-compatible entry point for the default seasonal look. */
export function attachChristmasCostume(root: THREE.Group, appearance?: string) {
  applyCatOutfit(root, appearance);
}
