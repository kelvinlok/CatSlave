import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createMess, disposeMess, updateMess } from '../src/messes';
import { Game } from '../src/simulation';
import type { CareEvent, EventKind } from '../src/types';

function setup(kind: EventKind) {
  const game = new Game(7); game.reset();
  const event: CareEvent = { id: 100, kind, catId: game.cats[0].id, progress: 0, createdAt: 0, deadline: 30, nextAttackAt: 30, attacks: 0, position: { x: 1, z: 2 } };
  return { event, root: createMess(event, game.cats[0]), cat: game.cats[0] };
}

describe('progressive care visuals', () => {
  it('removes the poop from top to bottom without changing untouched layers or the hit root', () => {
    const { root, event } = setup('poop');
    const initial = root.children.map(part => part.scale.clone());
    event.progress = 0.2; updateMess(root, event, 1, true);
    expect(root.children[0].scale.equals(initial[0])).toBe(true);
    expect(root.children[1].scale.equals(initial[1])).toBe(true);
    expect(root.children[2].scale.y).toBeLessThan(initial[2].y);
    for (const [progress, visibility] of [[1 / 3, [true, true, false]], [2 / 3, [true, false, false]], [1, [false, false, false]]] as const) {
      event.progress = progress; updateMess(root, event, 2);
      expect(root.children.map(part => part.visible)).toEqual(visibility);
      expect(root.userData.remainingLayers).toBe(visibility.filter(Boolean).length);
      expect(root.scale.toArray()).toEqual([1, 1, 1]);
    }
    disposeMess(root);
  });

  it('wipes every puddle component with an isolated uniform while retaining the untouched template', () => {
    const { root, event, cat } = setup('vomit');
    const other = createMess(event, cat);
    const material = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const otherMaterial = (other.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <alphatest_fragment>' };
    material.onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    const uniforms = shader.uniforms as { careWipe: { value: number }; careLocal: { value: THREE.Matrix4 } };
    expect(shader.fragmentShader).toContain('smoothstep(careEdge');
    event.progress = 0.6; updateMess(root, event, 1);
    expect(uniforms.careWipe.value).toBe(0.6);
    expect(material.opacity).toBeLessThan(1);
    expect(otherMaterial.opacity).toBe(1);
    expect(other.userData.progress).toBe(0);
    expect(root.children.every(part => part.visible)).toBe(true);
    event.progress = 1; updateMess(root, event, 2);
    expect(root.children.every(part => !part.visible)).toBe(true);
    disposeMess(root); disposeMess(other);
  });

  it('gathers separate strands into a raised, narrow ball before rolling it away', () => {
    const { root, event, cat } = setup('fur');
    const other = createMess(event, cat), line = root.children[0] as THREE.LineSegments;
    const otherLine = other.children[0] as THREE.LineSegments;
    const original = Array.from(otherLine.geometry.getAttribute('position').array);
    const before = new THREE.Box3().setFromObject(line);
    event.progress = 0.78; updateMess(root, event, 1);
    const gathered = new THREE.Box3().setFromObject(line);
    expect(gathered.max.x - gathered.min.x).toBeLessThan((before.max.x - before.min.x) * 0.7);
    expect(gathered.max.y).toBeGreaterThan(before.max.y * 2);
    expect(root.userData.gatherProgress).toBe(1);
    expect(root.userData.sweepProgress).toBe(0);
    expect(Array.from(otherLine.geometry.getAttribute('position').array)).toEqual(original);
    event.progress = 0.9; updateMess(root, event, 2);
    expect(new THREE.Box3().setFromObject(line).min.y).toBeGreaterThan(0);
    expect((line.material as THREE.LineBasicMaterial).opacity).toBeLessThan(0.85);
    event.progress = 1; updateMess(root, event, 3);
    expect(line.visible).toBe(false);
    event.progress = 0; updateMess(root, event, 4);
    expect(Array.from(line.geometry.getAttribute('position').array)).toEqual(original);
    disposeMess(root); disposeMess(other);
  });

  it('fills an initially empty bowl with kibble and only pours while actively working', () => {
    const { root, event, cat } = setup('hunger');
    const other = createMess(event, cat), kibble = root.getObjectByName('kibble') as THREE.InstancedMesh;
    const stream = root.getObjectByName('food-stream') as THREE.InstancedMesh;
    expect(kibble.count).toBe(0); expect(stream.visible).toBe(false);
    event.progress = 0.5; updateMess(root, event, 1, true);
    expect(kibble.count).toBe(32); expect(stream.visible).toBe(true);
    expect((other.getObjectByName('kibble') as THREE.InstancedMesh).count).toBe(0);
    const before = stream.instanceMatrix.array.slice();
    updateMess(root, event, 1.1, true);
    expect(stream.instanceMatrix.array).not.toEqual(before);
    updateMess(root, event, 1.2, false); expect(stream.visible).toBe(false);
    event.progress = 1; updateMess(root, event, 2, true);
    expect(kibble.count).toBe(64); expect(stream.visible).toBe(false);
    expect(root.getObjectByName('bowl')!.visible).toBe(true);
    const sharedGeometryDisposal = vi.spyOn(kibble.geometry, 'dispose');
    const instanceDisposal = vi.spyOn(kibble, 'dispose');
    disposeMess(root); disposeMess(root);
    expect(sharedGeometryDisposal).not.toHaveBeenCalled(); expect(instanceDisposal).toHaveBeenCalledTimes(1);
    sharedGeometryDisposal.mockRestore(); disposeMess(other);
  });
});
