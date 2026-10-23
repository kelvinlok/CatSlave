import * as THREE from 'three';
import type { CareEvent, CatState } from './types';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
const templates = new Map<string, THREE.Group>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
const clamp = (n: number) => THREE.MathUtils.clamp(n, 0, 1);
const random = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
interface MessState {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  wipe?: { value: number };
  fur?: { line: THREE.LineSegments; scattered: Float32Array; gathered: Float32Array; progress: number };
  kibble?: THREE.InstancedMesh;
  stream?: THREE.InstancedMesh;
}
const states = new WeakMap<THREE.Group, MessState>();
const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3();
const bowlGeometry = new THREE.LatheGeometry([
  new THREE.Vector2(0, 0.015), new THREE.Vector2(0.26, 0.015),
  new THREE.Vector2(0.34, 0.20), new THREE.Vector2(0.30, 0.22),
  new THREE.Vector2(0.27, 0.19), new THREE.Vector2(0.20, 0.055), new THREE.Vector2(0, 0.055),
], 32);
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
      for (let i = 0; i < 3; i++) {
        const layer = part(root, ['#76503a', '#886046', '#977053'][i], [i * 0.025, 0.11 + i * 0.115, 0], [0.25 - i * 0.065, 0.12 - i * 0.02, 0.18 - i * 0.04]);
        layer.name = `poop-layer-${i}`; layer.userData.basePosition = layer.position.toArray(); layer.userData.baseScale = layer.scale.toArray();
      }
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
      part(root, '#c77d68', [0, 0, 0], [1, 1, 1], false, bowlGeometry).name = 'bowl';
      part(root, '#f1d9b9', [0, 0.056, 0], [0.20, 0.008, 0.20], false, cylinder).name = 'bowl-bottom';
      const rim = part(root, '#f1d9b9', [0, 0.206, 0], [1, 1, 1], false, new THREE.TorusGeometry(0.313, 0.018, 8, 32));
      rim.rotation.x = Math.PI / 2; rim.name = 'bowl-rim';
    }
    templates.set(key, root);
  }
  const result = templates.get(key)!.clone(true);
  result.userData.eventId = event.id;
  const state: MessState = { materials: [], geometries: [] };
  states.set(result, state);
  if (event.kind === 'vomit') {
    state.wipe = { value: 0 };
    result.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = (object.material as THREE.MeshStandardMaterial).clone();
      material.transparent = true; material.depthWrite = false;
      object.updateMatrix();
      const local = object.matrix.clone(), wipe = state.wipe!;
      // The same advancing, scalloped mop edge cuts the liquid, food pieces and foam.
      // Coordinates are relative to the mess, so moving the event never moves its wipe edge.
      material.onBeforeCompile = shader => {
        shader.uniforms.careWipe = wipe; shader.uniforms.careLocal = { value: local };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 careLocal;\nvarying vec2 vCareFloor;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCareFloor = (careLocal * vec4(transformed, 1.0)).xz;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float careWipe;\nvarying vec2 vCareFloor;')
          .replace('#include <alphatest_fragment>', `
            float careEdge = -0.66 + careWipe * 1.45 + sin(vCareFloor.y * 37.0) * 0.024 + sin(vCareFloor.y * 61.0) * 0.015;
            diffuseColor.a *= smoothstep(careEdge - 0.035, careEdge + 0.035, vCareFloor.x);
            if (diffuseColor.a < 0.005) discard;
            #include <alphatest_fragment>`);
      };
      material.customProgramCacheKey = () => 'care-mop-wipe-v1';
      state.materials.push(material); object.material = material;
    });
  } else if (event.kind === 'fur') {
    const line = result.children[0] as THREE.LineSegments;
    line.geometry = line.geometry.clone(); line.material = (line.material as THREE.LineBasicMaterial).clone();
    state.geometries.push(line.geometry); state.materials.push(line.material);
    const scattered = new Float32Array(line.geometry.getAttribute('position').array), gathered = new Float32Array(scattered.length);
    for (let vertex = 0; vertex < scattered.length / 3; vertex++) {
      const strand = Math.floor(vertex / 10), endpoint = vertex % 10;
      const t = (Math.floor(endpoint / 2) + endpoint % 2) / 5;
      const latitude = Math.acos(random(strand * 11 + 1) * 2 - 1), longitude = random(strand * 11 + 2) * Math.PI * 2 + (t - 0.5) * 1.4;
      const radius = 0.075 + random(strand * 11 + 3) * 0.065 + Math.sin(t * Math.PI) * 0.014;
      gathered[vertex * 3] = Math.sin(latitude) * Math.cos(longitude) * radius;
      gathered[vertex * 3 + 1] = 0.14 + Math.cos(latitude) * radius * 0.85;
      gathered[vertex * 3 + 2] = Math.sin(latitude) * Math.sin(longitude) * radius;
    }
    state.fur = { line, scattered, gathered, progress: -1 };
  } else if (event.kind === 'hunger') {
    const material = new THREE.MeshStandardMaterial({ color: '#94603b', roughness: 0.92 });
    state.materials.push(material);
    state.kibble = new THREE.InstancedMesh(sphere, material, 64); state.kibble.name = 'kibble';
    state.stream = new THREE.InstancedMesh(sphere, material, 9); state.stream.name = 'food-stream';
    // Four loose layers, each with a differently rotated distribution, visibly fill the recess.
    for (let i = 0; i < 64; i++) {
      const layer = Math.floor(i / 16), a = i * 2.39996, r = Math.sqrt((i % 16 + 0.5) / 16) * (0.17 + layer * 0.012);
      position.set(Math.cos(a) * r, 0.073 + layer * 0.036 + random(i) * 0.009, Math.sin(a) * r);
      scale.set(0.028 + random(i + 1) * 0.009, 0.023, 0.026);
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a); matrix.compose(position, rotation, scale);
      state.kibble.setMatrixAt(i, matrix);
    }
    state.kibble.instanceMatrix.needsUpdate = true;
    state.kibble.computeBoundingSphere();
    state.stream.instanceMatrix.setUsage(THREE.DynamicDrawUsage); state.stream.frustumCulled = false;
    result.add(state.kibble, state.stream);
  }
  updateMess(result, event, 0);
  return result;
}

/** Animate the work itself; the root stays full sized so tools and picking remain aligned. */
export function updateMess(root: THREE.Group, event: CareEvent, time: number, active = false): void {
  const state = states.get(root); if (!state) return;
  const progress = clamp(Number.isFinite(event.progress) ? event.progress : 0);
  root.userData.progress = progress;
  if (event.kind === 'poop') {
    let remaining = 0;
    root.children.forEach((layer, i) => {
      const work = clamp(progress * 3 - (2 - i));
      layer.visible = work < 1; if (layer.visible) remaining++;
      layer.position.fromArray(layer.userData.basePosition); layer.scale.fromArray(layer.userData.baseScale);
      // The current scoop compresses and slides off; lower layers keep their original volume.
      layer.scale.x *= 1 - work * 0.5; layer.scale.y *= 1 - work * 0.82; layer.scale.z *= 1 - work * 0.35;
      layer.position.x += work * work * 0.13;
      layer.position.y -= work * layer.userData.baseScale[1] * 0.58;
      layer.rotation.z = work * -0.2 + (active && work > 0 ? Math.sin(time * 24) * 0.025 : 0);
    });
    root.userData.remainingLayers = remaining;
  } else if (event.kind === 'vomit' && state.wipe) {
    state.wipe.value = progress;
    for (const object of root.children) object.visible = progress < 1;
    for (const material of state.materials) material.opacity = 1 - progress * 0.25;
    root.userData.wipeEdge = -0.66 + progress * 1.45;
  } else if (event.kind === 'fur' && state.fur) {
    const { line, scattered, gathered } = state.fur;
    const gather = THREE.MathUtils.smoothstep(progress, 0, 0.78), sweep = THREE.MathUtils.smoothstep(progress, 0.80, 1);
    if (state.fur.progress !== progress) {
      const attribute = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < array.length; i++) array[i] = THREE.MathUtils.lerp(scattered[i], gathered[i], gather);
      attribute.needsUpdate = true; line.geometry.computeBoundingSphere(); line.geometry.computeBoundingBox(); state.fur.progress = progress;
    }
    const roll = -sweep * Math.PI * 1.5;
    line.rotation.z = roll;
    // Roll around the gathered ball's center, keeping its lower strands above the floor.
    line.position.set(sweep * 0.55 + Math.sin(roll) * 0.14, 0.14 - Math.cos(roll) * 0.14 + Math.sin(sweep * Math.PI) * 0.08, -sweep * 0.12);
    (line.material as THREE.LineBasicMaterial).opacity = 0.85 * (1 - sweep);
    line.visible = progress < 1;
    root.userData.gatherProgress = gather; root.userData.sweepProgress = sweep;
  } else if (event.kind === 'hunger' && state.kibble && state.stream) {
    state.kibble.count = Math.floor(progress * 64);
    state.stream.visible = active && progress < 1;
    const foodHeight = 0.073 + progress * 0.11;
    if (state.stream.visible) {
      for (let i = 0; i < 9; i++) {
        const fall = (time * 2.3 + i / 9) % 1;
        const spread = 0.03 + fall * 0.045;
        position.set(Math.sin(i * 2.4) * spread, foodHeight + (1 - fall * fall) * 0.65, Math.cos(i * 2.4) * spread);
        scale.set(0.023, 0.029, 0.021); rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * 4 + i);
        matrix.compose(position, rotation, scale); state.stream.setMatrixAt(i, matrix);
      }
      state.stream.instanceMatrix.needsUpdate = true;
    }
    root.userData.kibbleCount = state.kibble.count;
  } else if (event.kind === 'boredom') {
    root.children.forEach((part, i) => {
      part.rotation.y = active ? Math.sin(time * 10 + i) * 0.25 : 0;
    });
  }
}

/** Only instance-owned resources are released; reusable templates and geometry remain valid. */
export function disposeMess(root: THREE.Group): void {
  const state = states.get(root); if (!state) return;
  for (const material of state.materials) material.dispose();
  for (const geometry of state.geometries) geometry.dispose();
  state.kibble?.dispose(); state.stream?.dispose();
  states.delete(root);
}
