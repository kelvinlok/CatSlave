import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadChristmasWallDecor } from './christmas-wall-decor';

// Seasonal dressing lives on fixed architecture and high shelves. It never
// occupies a cat route or becomes part of the movable furniture/save format.
const palette = {
  pine: '#174d36', tips: '#357453', dark: '#123d2d', red: '#a8243c',
  gold: '#d6a74e', cream: '#fff2d6', bark: '#65503b', teal: '#3f8179',
};
type Paint = keyof typeof palette | 'light';
type V3 = [number, number, number];

/** CPU-backed, material-batched decoration kit; also works in the loading shell. */
export function createChristmasRoom() {
  const root = new THREE.Group(); root.name = 'Christmas lounge';
  root.userData.christmas = true;
  const fixedPieces = new Map<Paint, THREE.BufferGeometry[]>();
  const wallPieces = new Map<Paint, THREE.BufferGeometry[]>();
  let pieces = fixedPieces;
  const markers: { name: string; position: V3 }[] = [];
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const add = (geometry: THREE.BufferGeometry, paint: Paint, p: V3, scale: V3 = [1, 1, 1], euler: V3 = [0, 0, 0]) => {
    rotation.setFromEuler(new THREE.Euler(...euler));
    matrix.compose(new THREE.Vector3(...p), rotation, new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    // All primitive types share only these attributes after batching.
    geometry.deleteAttribute('uv');
    const bucket = pieces.get(paint) ?? []; bucket.push(geometry); pieces.set(paint, bucket);
  };
  const ball = (paint: Paint, p: V3, scale: V3) => add(new THREE.SphereGeometry(1, 10, 6), paint, p, scale);
  const box = (paint: Paint, p: V3, scale: V3) => add(new THREE.BoxGeometry(1, 1, 1), paint, p, scale);
  const tube = (paint: Paint, points: V3[], radius: number, segments = 30) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    add(new THREE.TubeGeometry(curve, segments, radius, 5, false), paint, [0, 0, 0]);
  };
  const mark = (name: string, position: V3) => markers.push({ name, position });

  function star(p: V3, radius: number, turn = 0) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = radius * (i % 2 ? .44 : 1);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    add(new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelThickness: .014,
      bevelSize: .012, bevelSegments: 1, steps: 1 }), 'gold', p, [1, 1, 1], [0, turn, 0]);
  }

  function bow(p: V3, size: number, turn = 0) {
    const local = new THREE.Matrix4().makeRotationY(turn);
    const at = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z).applyMatrix4(local).add(new THREE.Vector3(...p)).toArray() as V3;
    for (const sign of [-1, 1]) {
      add(new THREE.SphereGeometry(1, 12, 8), 'red', at(sign * size * .34, 0, 0),
        [size * .37, size * .23, size * .1], [0, turn, sign * .3]);
      add(new THREE.BoxGeometry(1, 1, 1), 'red', at(sign * size * .17, -size * .32, 0),
        [size * .23, size * .6, size * .055], [0, turn, sign * -.3]);
    }
    ball('gold', p, [size * .13, size * .14, size * .11]);
  }

  function gift(p: V3, size: V3, paint: Paint) {
    box(paint, p, size);
    box('gold', [p[0], p[1], p[2] + .003], [size[0] * .16, size[1] + .012, size[2] + .012]);
    box('gold', p, [size[0] + .012, size[1] + .014, size[2] * .16]);
    for (const sign of [-1, 1]) add(new THREE.TorusGeometry(size[0] * .14, .015, 5, 12), 'gold',
      [p[0] + sign * size[0] * .105, p[1] + size[1] / 2 + .04, p[2]], [1, .55, 1], [.3, sign * .3, sign * -.35]);
  }

  function tree(p: V3, height: number) {
    mark('Decorated Christmas tree', p);
    const radius = height * .27;
    add(new THREE.CylinderGeometry(radius * .36, radius * .27, height * .18, 12), 'gold',
      [p[0], p[1] + height * .09, p[2]]);
    add(new THREE.CylinderGeometry(.045, .06, height * .4, 9), 'bark', [p[0], p[1] + height * .25, p[2]]);
    // Scalloped branch skirts overlap into a full evergreen silhouette.
    for (let tier = 0; tier < 6; tier++) {
      const base = .16 + tier * .125, r = radius * (1 - tier * .135), length = height * .32;
      const positions: number[] = [], indices: number[] = [], sides = 40, rows = 8;
      for (let row = 0; row <= rows; row++) for (let i = 0; i <= sides; i++) {
        const t = row / rows, a = i / sides * Math.PI * 2;
        const edge = 1 + Math.sin(a * 10 + tier * .9) * .055;
        const rr = r * Math.pow(1 - t, 1.2) * edge + .008;
        positions.push(p[0] + Math.cos(a) * rr, p[1] + height * base + t * length - Math.cos(a * 10) * .022 * (1 - t), p[2] + Math.sin(a) * rr);
        if (row && i) { const n = row * (sides + 1) + i, b = n - sides - 1; indices.push(b - 1, n - 1, n, b - 1, n, b); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, tier % 2 ? 'tips' : 'pine', [0, 0, 0]);
    }
    const ribbon: V3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, a = t * Math.PI * 8, r = radius * (1 - t * .9) * 1.035;
      const point: V3 = [p[0] + Math.cos(a) * r, p[1] + height * (.19 + t * .72), p[2] + Math.sin(a) * r];
      ribbon.push(point);
      if (i % 3 === 0) ball('light', point, [.018, .022, .018]);
      if (i % 7 === 1) {
        ball(i % 2 ? 'red' : 'gold', [point[0], point[1] - .045, point[2]], [height * .027, height * .032, height * .027]);
      }
    }
    tube('gold', ribbon, .01, 120);
    star([p[0], p[1] + height * 1.12, p[2]], height * .105);
  }

  function garland(name: string, from: V3, to: V3, swags: number, sag = .22) {
    const previous = pieces; pieces = wallPieces;
    mark(name, from);
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), length = a.distanceTo(b);
    const points: V3[] = [], count = Math.ceil(length / .11);
    for (let i = 0; i <= count; i++) {
      const t = i / count, p = a.clone().lerp(b, t); p.y -= Math.abs(Math.sin(t * swags * Math.PI)) * sag;
      points.push(p.toArray() as V3);
      add(new THREE.SphereGeometry(1, 8, 5), i % 3 ? 'pine' : 'tips', p.toArray() as V3,
        [.16, .09, .1], [i * .8, i * .4, i * .9]);
      if (i % 4 === 0) ball('light', [p.x, p.y - .07, p.z + .075], [.027, .032, .027]);
      if (i % 11 === 3) {
        ball('red', [p.x, p.y - .17, p.z], [.075, .085, .075]);
        ball('gold', [p.x, p.y - .085, p.z], [.022, .025, .022]);
      }
    }
    tube('dark', points, .04, count);
    pieces = previous;
  }

  function wreath(p: V3, r: number, turn = 0) {
    const previous = pieces; pieces = wallPieces;
    mark('Evergreen wreath', p);
    add(new THREE.TorusGeometry(r, r * .17, 6, 40), 'dark', p, [1, 1, 1], [0, turn, 0]);
    const transform = new THREE.Matrix4().makeRotationY(turn);
    const at = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z).applyMatrix4(transform).add(new THREE.Vector3(...p)).toArray() as V3;
    for (let i = 0; i < 56; i++) {
      const a = i / 56 * Math.PI * 2;
      add(new THREE.SphereGeometry(1, 8, 5), i % 3 ? 'pine' : 'tips', at(Math.cos(a) * r, Math.sin(a) * r, .015),
        [r * .2, r * .12, r * .15], [0, turn, a + .7]);
      if (i % 7 === 0) ball(i % 2 ? 'red' : 'gold', at(Math.cos(a) * r, Math.sin(a) * r, r * .18), [r * .09, r * .09, r * .09]);
    }
    bow(at(0, -r * .8, r * .24), r * .75, turn);
    pieces = previous;
  }

  function stocking(p: V3, turn = 0) {
    const previous = pieces; pieces = wallPieces;
    mark('Hanging stocking', p);
    const shape = new THREE.Shape();
    shape.moveTo(-.13, .18); shape.lineTo(.13, .18); shape.lineTo(.12, -.17);
    shape.bezierCurveTo(.2, -.23, .29, -.19, .3, -.3);
    shape.bezierCurveTo(.3, -.44, -.09, -.46, -.13, -.29); shape.closePath();
    add(new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: true, bevelThickness: .025,
      bevelSize: .025, bevelSegments: 2, steps: 1 }), 'red', p, [1, 1, 1], [0, turn, -.06]);
    add(new THREE.BoxGeometry(.31, .12, .1), 'cream', [p[0], p[1] + .16, p[2] + .03], [1, 1, 1], [0, turn, -.06]);
    const starPos = new THREE.Vector3(0, -.1, .085).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(new THREE.Vector3(...p));
    star(starPos.toArray() as V3, .075, turn);
    pieces = previous;
  }

  // Leave the bedroom landing at z[-5.7,-4.8] and the perch at z=-.85 clear.
  tree([-7.03, 1.65, -3.4], 2.0);
  gift([-6.96, 1.82, -2.6], [.48, .34, .42], 'red');
  gift([-6.99, 1.79, -2.1], [.4, .28, .4], 'teal');
  gift([-6.98, 1.94, -1.6], [.46, .58, .38], 'cream');
  garland('Mural garland', [-6.12, 4.49, -7.66], [.9, 4.49, -7.66], 3, .3);
  garland('Cubby fairy lights', [-6.35, 3.55, -7.35], [-6.35, 3.55, -.55], 3, .23);
  pieces = wallPieces;
  for (const x of [-5.7, -3.35, -.95]) bow([x, 4.24, -7.57], .32);
  pieces = fixedPieces;
  // Projecting wall faces into the lounge; mounted dressing has no floor footprint.
  wreath([1.16, 2.7, -3.6], .66, -Math.PI / 2);
  garland('Right wall garland', [1.14, 4.15, -7.6], [1.14, 4.15, -1.5], 3, .28);
  // The fixed feeding shelf has its bowls below, with a small tree at its far end.
  tree([4.48, 1.33, -.84], .82);
  gift([1.91, 1.46, -.83], [.32, .26, .28], 'red');
  garland('Feeding shelf trim', [1.65, 1.28, -.57], [4.75, 1.28, -.57], 3, .12);
  for (const x of [2.1, 3.2, 4.3]) stocking([x, 2.85, -1.035]);
  garland('Feeding wall garland', [1.65, 3.22, -1.02], [4.75, 3.22, -1.02], 2, .15);
  // Entry and window wing are dressed too, including when using free camera.
  wreath([-4.6, 4.1, 7.86], .43, Math.PI);
  garland('Entry garland', [-7.5, 4.78, 7.75], [4.65, 4.78, 7.75], 5, .23);
  garland('Sunroom lights', [9.24, 4.8, -2.2], [9.24, 4.8, 7.1], 4, .22);
  wreath([9.21, 3.25, 2.3], .48, -Math.PI / 2);
  // Delicate window snowflakes, all in one batch, outside the window perch route.
  for (const [z, y, size] of [[-1.3, 3.4, .24], [.2, 4, .18], [3.8, 4.1, .25], [5.4, 3.1, .2], [6.5, 4.05, .16]]) {
    for (let spoke = 0; spoke < 6; spoke++) {
      const a = spoke * Math.PI / 3;
      const end: V3 = [9.21, y + Math.sin(a) * size, z + Math.cos(a) * size];
      tube('cream', [[9.21, y, z], end], .009, 1);
      for (const direction of [-1, 1]) {
        const tip: V3 = [9.21, y + Math.sin(a) * size * .6 + Math.sin(a + direction * .8) * size * .32,
          z + Math.cos(a) * size * .6 + Math.cos(a + direction * .8) * size * .32];
        tube('cream', [[9.21, y + Math.sin(a) * size * .6, z + Math.cos(a) * size * .6], tip], .008, 1);
      }
    }
  }

  // One draw per material for the whole room, rather than per bulb or needle.
  const wallFallback = new THREE.Group(); wallFallback.name = 'Wall decoration loading fallback'; root.add(wallFallback);
  for (const [bucket, parent] of [[fixedPieces, root], [wallPieces, wallFallback]] as const) for (const [paint, geometries] of bucket) {
    const material = new THREE.MeshStandardMaterial({ name: `Christmas | ${paint}`,
      color: paint === 'light' ? '#fff1c2' : palette[paint],
      roughness: paint === 'gold' ? .3 : paint === 'red' ? .48 : .84,
      metalness: paint === 'gold' ? .65 : 0,
      ...(paint === 'light' ? { emissive: '#ffd48a', emissiveIntensity: 2.8 } : {}),
    });
    const geometry = mergeGeometries(geometries)!; geometries.forEach(part => part.dispose());
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Christmas | ${paint}`;
    parent.add(mesh);
  }
  root.userData.decorations = markers;
  if (typeof window !== 'undefined') void loadChristmasWallDecor(root, wallFallback);
  return root;
}
