import * as THREE from 'three';

interface InfluenceBounds { boxes: { bone: number; box: THREE.Box3 }[]; minWeight: number; maxWeight: number; }
const cache = new WeakMap<THREE.BufferGeometry, Map<string, InfluenceBounds | null>>();
const point = new THREE.Vector3(), transform = new THREE.Matrix4();
const axes = ['x', 'y', 'z'] as const;

function supportedMaterial(material: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(material)) return material.every(supportedMaterial);
  return (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial)
    && material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
    && !('displacementMap' in material && material.displacementMap);
}

function influenceBounds(mesh: THREE.SkinnedMesh): InfluenceBounds | null {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
  if (!position || !indices || !weights || indices.itemSize !== 4 || weights.itemSize !== 4
    || indices.count !== position.count || weights.count !== position.count || geometry.morphAttributes.position?.length) return null;
  // Clones share geometry but only equal bind transforms may share these boxes.
  const key = [mesh.bindMatrix.elements.join(','), ...mesh.skeleton.boneInverses.map(m => m.elements.join(','))].join('|');
  let entries = cache.get(geometry); if (!entries) { entries = new Map(); cache.set(geometry, entries); }
  if (entries.has(key)) return entries.get(key)!;
  const boxes = mesh.skeleton.bones.map(() => new THREE.Box3());
  const matrices = mesh.skeleton.boneInverses.map(inverse => inverse.clone().multiply(mesh.bindMatrix));
  let minWeight = Infinity, maxWeight = 0;
  for (let vertex = 0; vertex < position.count; vertex++) {
    let total = 0;
    for (let slot = 0; slot < 4; slot++) {
      const weight = weights.getComponent(vertex, slot), bone = indices.getComponent(vertex, slot);
      if (!Number.isFinite(weight) || weight < 0 || (weight > 0 && (!Number.isInteger(bone) || !matrices[bone]))) {
        entries.set(key, null); return null;
      }
      total += weight;
      if (weight === 0) continue;
      point.fromBufferAttribute(position, vertex).applyMatrix4(matrices[bone]);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) { entries.set(key, null); return null; }
      boxes[bone].expandByPoint(point);
    }
    minWeight = Math.min(minWeight, total); maxWeight = Math.max(maxWeight, total);
  }
  const result = { boxes: boxes.flatMap((box, bone) => box.isEmpty() ? [] : [{ bone, box }]), minWeight, maxWeight };
  if (!result.boxes.length) { entries.set(key, null); return null; }
  entries.set(key, result); return result;
}

/** Bounds a convex blend of bone transforms without deforming vertices each frame. */
export class SkinBounds {
  private readonly influences: InfluenceBounds | null;
  private readonly transformed = new THREE.Box3();
  private readonly box = new THREE.Box3();
  private readonly sphere = new THREE.Sphere();
  constructor(private readonly mesh: THREE.SkinnedMesh) { this.influences = influenceBounds(mesh); }

  update() {
    const mesh = this.mesh, influences = this.influences;
    if (!influences || !supportedMaterial(mesh.material) || mesh.geometry.morphAttributes.position?.length) {
      mesh.frustumCulled = false; return;
    }
    this.box.makeEmpty();
    for (const influence of influences.boxes) {
      transform.multiplyMatrices(mesh.bindMatrixInverse, mesh.skeleton.bones[influence.bone].matrixWorld);
      this.transformed.copy(influence.box).applyMatrix4(transform);
      this.box.union(this.transformed);
    }
    // GPU skinning is a positive weighted sum. Dividing by each vertex's weight
    // sum gives a convex combination inside the union; scale by the full sum
    // interval to include quantized/non-unit weights without assuming exact 1.
    for (const axis of axes) {
      const lo = this.box.min[axis], hi = this.box.max[axis];
      this.box.min[axis] = Math.min(lo * influences.minWeight, lo * influences.maxWeight);
      this.box.max[axis] = Math.max(hi * influences.minWeight, hi * influences.maxWeight);
    }
    const magnitude = Math.max(1, this.box.min.length(), this.box.max.length());
    this.box.expandByScalar(magnitude * 1e-5); // Float32 bone palette / shader rounding.
    this.box.getBoundingSphere(this.sphere);
    // Three transforms spheres with max column length. Under shear that can
    // underestimate the operator norm; a Gram-matrix row-sum bound is safe.
    const m = mesh.matrixWorld.elements;
    const a = m[0]*m[0]+m[1]*m[1]+m[2]*m[2], b = m[4]*m[4]+m[5]*m[5]+m[6]*m[6], c = m[8]*m[8]+m[9]*m[9]+m[10]*m[10];
    const ab = Math.abs(m[0]*m[4]+m[1]*m[5]+m[2]*m[6]), ac = Math.abs(m[0]*m[8]+m[1]*m[9]+m[2]*m[10]), bc = Math.abs(m[4]*m[8]+m[5]*m[9]+m[6]*m[10]);
    const maxColumn = Math.max(a, b, c);
    if (maxColumn > 0) this.sphere.radius *= Math.sqrt(Math.max(a+ab+ac, b+ab+bc, c+ac+bc) / maxColumn);
    if (!Number.isFinite(this.sphere.radius) || !Number.isFinite(this.sphere.center.length())) { mesh.frustumCulled = false; return; }
    mesh.boundingBox = this.box; mesh.boundingSphere = this.sphere; mesh.frustumCulled = true;
  }
}
