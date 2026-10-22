import * as THREE from 'three';
import { FURNITURE, HIDEOUT, TREE } from './furniture';

const cube = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const materials = new Map<string, THREE.MeshStandardMaterial>();
function part(root: THREE.Object3D, color: string, p: number[], s: number[], geometry: THREE.BufferGeometry = cube) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geometry, materials.get(color));
  mesh.position.set(p[0], p[1], p[2]); mesh.scale.set(s[0], s[1], s[2]); root.add(mesh); return mesh;
}

/** Geometry has a genuine tunnel opening, so the cat can enter without clipping. */
export function createFurniture() {
  const root = new THREE.Group(); root.name = 'cat-furniture';
  const tree = new THREE.Group(); tree.name = 'cat-tree'; root.add(tree);
  part(tree, '#b99875', [TREE.x, 0.07, TREE.z + 0.25], [1.35, 0.14, 1.9]);
  for (const [i, step] of FURNITURE[0].route.slice(1).entries()) {
    const height = step.height;
    // Offset posts toward the back of each landing, leaving the jump path clear.
    part(tree, '#c8ac83', [step.x, height / 2, step.z - 0.24], [0.105, height - 0.08, 0.105], cylinder);
    for (let y = 0.16; y < height - 0.12; y += 0.075) {
      const ring = new THREE.TorusGeometry(0.108, 0.012, 4, 16);
      const rope = part(tree, '#aa8d66', [step.x, y, step.z - 0.24], [1, 1, 1], ring); rope.rotation.x = Math.PI / 2;
    }
    part(tree, '#b99875', [step.x, height - 0.07, step.z], [1.05, 0.12, 0.98]);
    part(tree, i === 2 ? '#879a78' : '#bdc5a4', [step.x, height - 0.005, step.z], [1.08, 0.05, 1]);
    if (i === 2) {
      part(tree, '#879a78', [step.x, height + 0.1, step.z - 0.46], [1.08, 0.2, 0.08]);
      for (const side of [-1, 1]) part(tree, '#879a78', [step.x + side * 0.5, height + 0.1, step.z], [0.08, 0.2, 0.95]);
    }
  }
  const box = new THREE.Group(); box.name = 'cardboard-hideout'; box.position.set(HIDEOUT.x, 0, HIDEOUT.z); root.add(box);
  const kraft = '#bd9368', edge = '#946b48';
  part(box, edge, [0, 0.025, 0], [1.12, 0.05, 1.2]);
  part(box, kraft, [-0.56, 0.48, 0], [0.045, 0.96, 1.2]);
  part(box, kraft, [0.56, 0.48, 0], [0.045, 0.96, 1.2]);
  part(box, kraft, [0, 0.48, -0.6], [1.12, 0.96, 0.045]);
  part(box, '#715037', [0, 0.48, -0.57], [1.08, 0.91, 0.012]);
  const front = new THREE.Shape();
  front.moveTo(-0.56, 0); front.lineTo(0.56, 0); front.lineTo(0.56, 0.96); front.lineTo(-0.56, 0.96); front.closePath();
  const hole = new THREE.Path(); hole.absellipse(0, 0.43, 0.36, 0.37, 0, Math.PI * 2, true); front.holes.push(hole);
  const panel = new THREE.ExtrudeGeometry(front, { depth: 0.045, bevelEnabled: false, curveSegments: 28 });
  panel.setIndex(Array.from({ length: panel.attributes.position.count }, (_, i) => i));
  part(box, kraft, [0, 0, 0.58], [1, 1, 1], panel);
  const rim = part(box, edge, [0, 0.43, 0.63], [1, 1.028, 1], new THREE.TorusGeometry(0.36, 0.018, 5, 32));
  rim.name = 'entrance-rim';
  // Half-open flaps and packing tape make it read as a reused delivery box.
  for (const side of [-1, 1]) {
    const flap = part(box, '#cba477', [side * 0.43, 1.0, 0], [0.42, 0.035, 1.2]); flap.rotation.z = side * 0.35;
    part(box, '#ddc297', [side * 0.43, 1.025, 0], [0.18, 0.015, 0.24]).rotation.z = side * 0.35;
  }
  part(box, '#e2cba3', [0.45, 0.76, 0.633], [0.14, 0.11, 0.008]);
  // Simple paw stamp on the upper left corner.
  part(box, edge, [-0.39, 0.81, 0.635], [0.055, 0.045, 0.008], sphere);
  for (const x of [-0.45, -0.39, -0.33]) part(box, edge, [x, 0.88, 0.635], [0.022, 0.025, 0.008], sphere);
  // Stepping stools connect existing furniture to reachable cat-sized jumps.
  for (const id of ['window', 'cabinet']) {
    const step = FURNITURE.find(s => s.id === id)!.route[1];
    part(root, '#b99875', [step.x, step.height - 0.065, step.z], [0.65, 0.13, 0.65]);
    part(root, '#bdc5a4', [step.x, step.height, step.z], [0.67, 0.035, 0.67]);
    for (const x of [-0.24, 0.24]) for (const z of [-0.24, 0.24]) part(root, '#b99875', [step.x + x, step.height / 2, step.z + z], [0.075, step.height - 0.12, 0.075]);
  }
  return root;
}
