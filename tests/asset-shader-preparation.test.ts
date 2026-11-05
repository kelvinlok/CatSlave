import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ShaderPreparation } from '../src/asset-shader-preparation';

const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const target = () => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });

it('waits for every lighting variant before publishing readiness', async () => {
  const completions: (() => void)[] = [];
  const compileAsync = vi.fn(() => new Promise<THREE.Object3D>(resolve => completions.push(() => resolve(root))));
  const root = new THREE.Group(), targets = [target(), target()];
  const preparation = new ShaderPreparation({ compileAsync });
  let ready = false;
  const pending = preparation.prepare(root, targets).then(() => { ready = true; });
  await turn(); expect(compileAsync).toHaveBeenCalledWith(root, targets[0].camera, targets[0].scene);
  expect(ready).toBe(false); completions.shift()!(); await turn();
  expect(compileAsync).toHaveBeenLastCalledWith(root, targets[1].camera, targets[1].scene);
  expect(ready).toBe(false); completions.shift()!(); await pending; expect(ready).toBe(true);
});

it('does not publish an old-context completion and recompiles after restoration', async () => {
  const completions: (() => void)[] = [], root = new THREE.Group();
  const compileAsync = vi.fn(() => new Promise<THREE.Object3D>(resolve => completions.push(() => resolve(root))));
  const preparation = new ShaderPreparation({ compileAsync });
  let ready = false;
  const pending = preparation.prepare(root, [target()]).then(() => { ready = true; });
  await turn(); preparation.suspend(); completions.shift()!(); await turn();
  expect(ready).toBe(false); expect(compileAsync).toHaveBeenCalledTimes(1);
  preparation.resume(); await turn(); expect(compileAsync).toHaveBeenCalledTimes(2);
  completions.shift()!(); await pending; expect(ready).toBe(true);
});
