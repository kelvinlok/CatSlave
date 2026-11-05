import * as THREE from 'three';

// Several small rotations keep the opening round between poses. Blending a
// single 90-degree corrective with the rest shape would collapse the cuff.
const cuffAngles = [-1.5, -1.125, -.75, -.375, .375, .75, 1.125, 1.5];
const bendAxis = new THREE.Vector3(1, 0, 0);
const anklePivot = new THREE.Vector3(0, 0, -.067);
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

/** Author shared corrective shapes; each cloned shoe owns only its weights. */
export function buildFootwearFlex(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const flex = geometry.getAttribute('ankleFlex');
  if (!flex || !positions) return;
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  geometry.morphAttributes.normal = [];
  for (const angle of cuffAngles) {
    const vertices = new Float32Array(positions.count * 3), directions = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      // The ankle/trim tag excludes the rigid toe and sole. Ease the fabric
      // through the lower 45 mm so the shaft meets the shoe without a hard hinge.
      const weight = flex.getX(i) * smooth(positions.getY(i) / .045);
      if (!weight) continue;
      point.fromBufferAttribute(positions, i).sub(anklePivot).applyAxisAngle(bendAxis, angle * weight).add(anklePivot);
      vertices.set([point.x - positions.getX(i), point.y - positions.getY(i), point.z - positions.getZ(i)], i * 3);
      if (normals) {
        normal.fromBufferAttribute(normals, i).applyAxisAngle(bendAxis, angle * weight);
        directions.set([normal.x - normals.getX(i), normal.y - normals.getY(i), normal.z - normals.getZ(i)], i * 3);
      }
    }
    const position = new THREE.Float32BufferAttribute(vertices, 3); position.name = `cuff-${angle}`;
    geometry.morphAttributes.position.push(position);
    if (normals) geometry.morphAttributes.normal.push(new THREE.Float32BufferAttribute(directions, 3));
  }
  geometry.userData.shoeCuffAngles = cuffAngles;
}

/** Let a soft boot shaft follow the shin while its sole stays on the paw. */
export function updateCatCostumeMotion(root: THREE.Group) {
  for (let i = 0; i < 4; i++) {
    const paw = root.getObjectByName(`paw${i}`); if (!paw) continue;
    // The paw's counter-rotation is relative to the lower leg, including the
    // curved wheel's contact angle. This also works when the whole cat rears.
    const angle = Math.max(-1.5, Math.min(1.5, -paw.rotation.x));
    for (const garment of paw.children) {
      if (!garment.userData.isCatCostume) continue;
      garment.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !object.morphTargetInfluences || !object.geometry.userData.shoeCuffAngles) return;
        const weights = object.morphTargetInfluences;
        weights.fill(0);
        if (Math.abs(angle) < .000001) return;
        // Interpolate only adjacent corrective shapes, with an implicit rest
        // sample at zero. Vertex positions and shadow passes use the same morphs.
        const step = .375, magnitude = Math.abs(angle), upper = Math.min(4, Math.ceil(magnitude / step));
        const fraction = (magnitude - (upper - 1) * step) / step;
        const index = (sample: number) => angle < 0 ? 4 - sample : 3 + sample;
        weights[index(upper)] = fraction;
        if (upper > 1) weights[index(upper - 1)] = 1 - fraction;
      });
    }
  }
}
