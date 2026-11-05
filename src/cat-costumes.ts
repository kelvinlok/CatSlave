import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
const fabric = new THREE.MeshStandardMaterial({ name: 'Christmas wool', vertexColors: true, roughness: 0.94, side: THREE.DoubleSide });
const trim = new THREE.MeshStandardMaterial({ name: 'Christmas fleece', vertexColors: true, roughness: 1 });
const metal = new THREE.MeshStandardMaterial({ name: 'Christmas brass', vertexColors: true, roughness: 0.3, metalness: 0.65 });
const red = '#b62d3c', green = '#285f48', ivory = '#fff3dc', gold = '#d9aa50';
type Layer = 'fabric' | 'trim' | 'metal';
const materials = { fabric, trim, metal };
type Vec = [number, number, number];

/** Bake color and transforms into one mesh per material and animated attachment. */
class CostumePart {
  readonly root = new THREE.Group();
  private readonly pieces: Record<Layer, THREE.BufferGeometry[]> = { fabric: [], trim: [], metal: [] };
  constructor(name: string) { this.root.name = name; this.root.userData.isCatCostume = true; }
  add(geometry: THREE.BufferGeometry, color: string, layer: Layer = 'fabric', position: Vec = [0, 0, 0], scale: Vec = [1, 1, 1], rotation: Vec = [0, 0, 0]) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    // All primitives have normals; UVs are unused by this texture-free kit.
    flat.deleteAttribute('uv');
    const tint = new THREE.Color(color), count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[layer]);
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
  const points: number[] = [], indices: number[] = [], around = 28;
  sections.forEach(([x, y, z, rx, rz], row) => {
    for (let i = 0; i <= around; i++) {
      const a = i / around * Math.PI * 2;
      points.push(x + Math.cos(a) * rx, y, z + Math.sin(a) * rz);
      if (row && i) { const n = row * (around + 1) + i, b = n - around - 1; indices.push(b - 1, n - 1, n, b - 1, n, b); }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
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

function scarf(part: CostumePart, color = red, fluffy = false) {
  const width = fluffy ? .37 : .31, z = fluffy ? .5 : .46;
  part.ring([0, .79, z], width, .051, color, 'fabric', [1, .77, 1]);
  part.ring([0, .84, z], width, .033, color, 'fabric', [1, .77, 1]);
  part.tube([[-.11, .79, z + .24], [-.13, .63, z + .29], [-.19, .44, z + .25]], .055, color);
  part.tube([[.075, .79, z + .25], [.09, .64, z + .30], [.13, .52, z + .27]], .049, color);
  for (const [x, y, zz, w] of [[-.18, .47, z + .26, .06], [-.145, .59, z + .285, .057], [.125, .55, z + .277, .053]]) {
    part.add(new THREE.CylinderGeometry(w, w, .027, 14, 1, true), ivory, 'trim', [x, y, zz], [1, 1, 1], [0, 0, -.14]);
  }
  for (const x of [-.22, -.19, -.16]) part.tube([[x, .445, z + .26], [x - .008, .399, z + .25]], .009, ivory, 'trim', 3);
}

/** Open shoulder cape leaves the belly, all legs and tail unobstructed. */
function cape(part: CostumePart, color: string) {
  const vertices: number[] = [], indices: number[] = [], sides = 24, rows = 10;
  const edge: Vec[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, z = .40 - t * .78;
    for (let i = 0; i <= sides; i++) {
      const angle = -.15 + i / sides * (Math.PI + .3);
      const x = Math.cos(angle) * (.35 + t * .065), y = .69 + Math.sin(angle) * (.39 - t * .015);
      vertices.push(x, y, z);
      if (row === rows) edge.push([x, y, z]);
      if (row && i) { const n = row * (sides + 1) + i, b = n - sides - 1; indices.push(b - 1, n, n - 1, b - 1, b, n); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); part.add(geometry, color);
  part.tube(edge, .026, ivory, 'trim', 24);
  for (const side of [-1, 1]) part.tube([[side * .346, .632, .4], [side * .378, .633, .01], [side * .410, .634, -.38]], .023, ivory, 'trim');
  part.ring([0, .80, .46], .31, .035, ivory, 'trim', [1, .77, 1]);
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
    [-.015, .134, .108], [.07, .128, .105], [.135, .085, .073],
    [.17, .04, .025], [.19, .001, -.045],
  ];
  const vertices: number[] = [], indices: number[] = [], around = 16;
  profile.forEach(([z, width, top], row) => {
    const bottom = -.055, center = (top + bottom) / 2, height = (top - bottom) / 2;
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
  part.add(new THREE.CylinderGeometry(.088, .102, height, 16, 1, true), color, 'fabric',
    [0, height / 2, -.067], [1, 1, .88]);
  part.ring([0, height, -.067], .088, .019, cuff, 'fabric', [1, .88, 1]);
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
    const y = .128, z = .028;
    for (const x of [-.033, .033]) part.add(new THREE.BoxGeometry(.009, .044, .008), gold, 'fabric', [x, y, z]);
    for (const offset of [-.022, .022]) part.add(new THREE.BoxGeometry(.075, .009, .008), gold, 'fabric', [0, y + offset, z]);
    part.add(new THREE.BoxGeometry(.009, .037, .009), gold, 'fabric', [0, y, z + .004]);
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

/**
 * Install after anatomy replacement. These gameplay pivots drive the native
 * Blender bones too, giving identical motion without depending on bone axes.
 * No parts are children of blink controls, so closing eyes never hides a hat.
 */
export function attachChristmasCostume(root: THREE.Group, appearance?: string) {
  const costume = christmasCostumeFor(appearance);
  const head = new CostumePart('christmas-headwear'), body = new CostumePart('christmas-neckwear');
  const color = costume.color ?? (costume.style === 'elf' ? green : red);
  switch (costume.style) {
    case 'santa': cap(head, color); cape(body, color); break;
    case 'elf':
      cap(head, color, true); scarf(body, color);
      for (const x of [-.18, 0, .18]) bell(body, [x, .66, .70], .034);
      break;
    case 'reindeer': antlers(head); scarf(body, color); bell(body, [0, .72, .75]); break;
    case 'winter': knitHat(head); scarf(body, '#527e8c', true); break;
    case 'holly':
      head.ring([0, .28, -.06], .27, .026, gold, 'metal', [1, .67, 1]);
      holly(head, [-.13, .30, .13]); cape(body, green); break;
    case 'gift':
      bow(head, [-.14, .29, -.01], .7); scarf(body, green); bow(body, [0, .74, .74], .78);
      bell(body, [0, .58, .77]); break;
  }
  root.getObjectByName('head')!.add(head.finish());
  root.getObjectByName('body')!.add(body.finish());
  for (let i = 0; i < 4; i++) {
    const shoe = shoeFor(costume.style, color).clone(); shoe.name = `christmas-shoe${i}`;
    root.getObjectByName(`paw${i}`)!.add(shoe);
  }
  root.userData.christmasCostume = costume.style;
  root.userData.christmasCostumeName = costume.name;
  root.userData.christmasFootwear = costume.style;
}
