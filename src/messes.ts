import * as THREE from 'three';
import type { CareEvent, CatState } from './types';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
const templates = new Map<string, THREE.Group>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
function part(root: THREE.Group, color: string, p: number[], s: number[], wet = false, geometry: THREE.BufferGeometry = sphere) {
  const key = color + wet;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: wet ? 0.18 : 0.95, metalness: 0 }));
  const mesh = new THREE.Mesh(geometry, materials.get(key));
  mesh.position.set(p[0], p[1], p[2]); mesh.scale.set(s[0], s[1], s[2]); root.add(mesh); return mesh;
}
export function createMess(event: CareEvent, cat: CatState) {
  const key = event.kind + (event.kind === 'fur' ? cat.color : '');
  if (!templates.has(key)) {
    const root = new THREE.Group();
    if (event.kind === 'poop') {
      for (let i = 0; i < 3; i++) part(root, ['#76503a', '#886046', '#977053'][i], [i * 0.025, 0.11 + i * 0.115, 0], [0.25 - i * 0.065, 0.12 - i * 0.02, 0.18 - i * 0.04]);
    } else if (event.kind === 'vomit') {
      // A thin, irregular liquid perimeter, with darker partially digested food and foam.
      const outline = new THREE.Shape();
      for (let i = 0; i <= 48; i++) {
        const angle = i / 48 * Math.PI * 2, r = 1 + Math.sin(angle * 3) * 0.16 + Math.cos(angle * 7) * 0.09;
        const x = Math.cos(angle) * 0.49 * r, z = Math.sin(angle) * 0.30 * r;
        if (i === 0) outline.moveTo(x, z); else outline.lineTo(x, z);
      }
      const puddle = part(root, '#b69b4c', [0, 0.013, 0], [1, 1, 1], true, new THREE.ShapeGeometry(outline));
      puddle.rotation.x = -Math.PI / 2;
      part(root, '#c4a85f', [-0.03, 0.018, 0.015], [0.34, 0.015, 0.21], true);
      for (let i = 0; i < 15; i++) {
        const a = i * 2.4, r = 0.07 + (i % 4) * 0.065;
        const chunk = part(root, i % 3 ? '#8d683c' : '#d0b780', [Math.cos(a) * r, 0.04, Math.sin(a) * r * 0.7], [0.035 + (i % 3) * 0.012, 0.022, 0.025], true);
        chunk.rotation.y = a;
      }
      for (let i = 0; i < 10; i++) part(root, '#e4d5a9', [Math.cos(i * 1.7) * 0.3, 0.027, Math.sin(i * 1.7) * 0.18], [0.019, 0.009, 0.015], true);
      for (let i = 0; i < 4; i++) part(root, '#b69b4c', [0.42 + i * 0.065, 0.012, -0.05 + Math.sin(i) * 0.12], [0.04 - i * 0.006, 0.008, 0.025], true);
    } else if (event.kind === 'fur') {
      // Hundreds of fine curled strands, not opaque balls: airy edges and a tangled dry center.
      const positions: number[] = [], colors: number[] = [];
      const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      const coat = new THREE.Color(cat.color).lerp(new THREE.Color('#a29686'), 0.4);
      for (let i = 0; i < 450; i++) {
        const x = (rand(i * 7) + rand(i * 7 + 1) - 1) * 0.38;
        const z = (rand(i * 7 + 2) + rand(i * 7 + 3) - 1) * 0.27;
        const a = rand(i * 7 + 4) * Math.PI * 2, length = 0.055 + rand(i * 7 + 5) * 0.15;
        const color = coat.clone().multiplyScalar(0.48 + rand(i * 7 + 6) * 0.75);
        for (let j = 0; j < 5; j++) {
          for (const t of [j / 5, (j + 1) / 5]) {
            const bend = Math.sin(t * Math.PI) * length * 0.22;
            positions.push(x + Math.cos(a) * length * (t - 0.5) + Math.sin(a) * bend,
              0.016 + Math.sin(t * Math.PI) * (1 - Math.min(1, Math.hypot(x, z) * 2.5)) * 0.07,
              z + Math.sin(a) * length * (t - 0.5) - Math.cos(a) * bend);
            colors.push(color.r, color.g, color.b);
          }
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      root.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })));
    } else if (event.kind === 'hunger') {
      part(root, '#c77d68', [0, 0.11, 0], [0.34, 0.20, 0.34], false, cylinder);
      part(root, '#f1d9b9', [0, 0.22, 0], [0.30, 0.03, 0.30], false, cylinder);
      part(root, '#7e5b42', [0, 0.24, 0], [0.25, 0.014, 0.25], false, cylinder);
    } else {
      part(root, '#b9a4cc', [0, 0.14, 0], [0.15, 0.15, 0.15]);
      const feather = part(root, '#81a7ad', [0.2, 0.12, 0], [0.21, 0.025, 0.08]); feather.rotation.z = 0.35;
      part(root, '#d6ad69', [-0.18, 0.1, 0.03], [0.14, 0.025, 0.055]);
    }
    templates.set(key, root);
  }
  const result = templates.get(key)!.clone(true); result.userData.eventId = event.id; return result;
}
