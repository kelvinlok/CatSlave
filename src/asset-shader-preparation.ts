import type * as THREE from 'three';

export type AssetScene = 'cat' | 'room';
type Prepare = (root: THREE.Object3D, kind: AssetScene) => Promise<void>;
let prepare: Prepare | undefined;

/** Installed by the renderer; headless model tests need no graphics context. */
export function setAssetShaderPreparation(handler: Prepare) { prepare = handler; }
export async function prepareAssetShaders(root: THREE.Object3D, kind: AssetScene) {
  try { await prepare?.(root, kind); }
  catch (error) {
    // Preparation is optional: keep the normal renderer's first-use fallback.
    console.warn('Shader preparation failed; using normal first-use compilation.', error);
  }
}

export interface ShaderTarget { scene: THREE.Scene; camera: THREE.Camera; transmission?: boolean; }

/** Wait for parallel compilation without exposing a partially prepared asset. */
export class ShaderPreparation {
  private generation = 0;
  private available = Promise.resolve();
  private releaseAvailable = () => {};
  private interrupt = () => {};
  private interrupted: Promise<void>;

  constructor(private renderer: Pick<THREE.WebGLRenderer, 'compileAsync'>,
    private compileTransmission?: (root: THREE.Object3D, target: ShaderTarget) => Promise<unknown>) {
    this.interrupted = new Promise(resolve => { this.interrupt = resolve; });
  }

  suspend() {
    this.generation++;
    this.interrupt();
    this.interrupted = new Promise(resolve => { this.interrupt = resolve; });
    this.available = new Promise(resolve => { this.releaseAvailable = resolve; });
  }

  resume() { this.releaseAvailable(); }

  async prepare(root: THREE.Object3D, targets: ShaderTarget[]) {
    for (;;) {
      await this.available;
      const generation = this.generation;
      for (const target of targets) {
        if (target.transmission && this.compileTransmission) {
          await Promise.race([this.compileTransmission(root, target), this.interrupted]);
          if (generation !== this.generation) break;
        }
        await Promise.race([
          this.renderer.compileAsync(root, target.camera, target.scene), this.interrupted,
        ]);
        if (generation !== this.generation) break;
      }
      if (generation === this.generation) return;
      // A lost context invalidates its programs. Resume with the new context.
    }
  }
}
