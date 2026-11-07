import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyRoomLayoutVisuals, roomFurniture, roomObjectVisible } from '../src/room-layout-view';
import { updateRoomWheel } from '../src/room-asset';
import { defaultRoomLayout } from '../src/room-layout';

function fixture() {
  const room = new THREE.Group(); room.userData.loaded = true;
  const converted = new THREE.Group(); converted.rotation.x = -Math.PI / 2; room.add(converted);
  const sofa = new THREE.Group(); sofa.userData.furnitureId = 'sofa'; sofa.position.set(2.65, -6.4, 0); converted.add(sofa);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); cushion.position.set(.5, 0, .8); sofa.add(cushion);
  const wheel = new THREE.Group(); wheel.userData.furnitureId = 'wheel'; wheel.position.set(-1.65, -6.5, 0); converted.add(wheel);
  const rotor = new THREE.Group(); rotor.userData.catWheelRotor = true; rotor.position.z = 1.5; wheel.add(rotor);
  const marker = new THREE.Object3D(); marker.position.x = 1; rotor.add(marker);
  const ceiling = new THREE.Object3D(); ceiling.userData.editorHide = true; converted.add(ceiling);
  room.updateMatrixWorld(true);
  return { room, cushion, rotor, marker, ceiling };
}

describe('room layout render binding', () => {
  it('applies the preset relative to authored Y-up pivots while normalizing Blender parents', () => {
    const { room, cushion } = fixture();
    const layout = defaultRoomLayout(); applyRoomLayoutVisuals(room, layout);
    const presetPosition = cushion.getWorldPosition(new THREE.Vector3());
    expect(presetPosition.x).toBeCloseTo(layout.placed.sofa.x + .5);
    expect(presetPosition.y).toBeCloseTo(.8); expect(presetPosition.z).toBeCloseTo(layout.placed.sofa.z);
    layout.placed.sofa = { x: 1, z: 2, turn: 1 }; applyRoomLayoutVisuals(room, layout);
    const after = cushion.getWorldPosition(new THREE.Vector3());
    expect(after.x).toBeCloseTo(1); expect(after.y).toBeCloseTo(.8); expect(after.z).toBeCloseTo(1.5);
    expect(roomFurniture(room)?.size).toBe(2); // Binding twice must not add wrappers.
  });
  it('omits invalid furniture from rendering and restores structure after editing', () => {
    const { room, cushion, ceiling } = fixture(), layout = defaultRoomLayout();
    delete layout.placed.sofa;
    applyRoomLayoutVisuals(room, layout, true);
    expect(roomObjectVisible(cushion)).toBe(false); expect(ceiling.visible).toBe(false);
    applyRoomLayoutVisuals(room, defaultRoomLayout(), false);
    expect(roomObjectVisible(cushion)).toBe(true); expect(ceiling.visible).toBe(true);
  });
  it('spins the wheel in its own plane after moving and rotating the owner', () => {
    const { room, rotor, marker } = fixture(), layout = defaultRoomLayout();
    layout.placed.wheel = { x: -2, z: 1, turn: 1 };
    applyRoomLayoutVisuals(room, layout);
    updateRoomWheel(room, Math.PI / 2); room.updateMatrixWorld(true);
    const center = rotor.getWorldPosition(new THREE.Vector3()), tip = marker.getWorldPosition(new THREE.Vector3());
    expect(center.x).toBeCloseTo(-2); expect(center.y).toBeCloseTo(1.5); expect(center.z).toBeCloseTo(1);
    expect(tip.x).toBeCloseTo(-2); expect(tip.y).toBeCloseTo(2.5); expect(tip.z).toBeCloseTo(1);
    const once = tip.clone(); updateRoomWheel(room, Math.PI / 2); room.updateMatrixWorld(true);
    expect(marker.getWorldPosition(new THREE.Vector3()).distanceTo(once)).toBeLessThan(1e-6);
  });
});
