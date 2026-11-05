import * as THREE from 'three';
import roomDefinition from '../assets/lounge/layout.json';
import type { RoomLayout } from './room-layout';
import { renderPreview } from './furniture-previews';

export interface LayoutPreviewRequest { id: string; layout: RoomLayout; }
/** Four bounded cache entries: the draft and three slots. Rendering never changes the live room. */
export class RoomLayoutPreviews {
  readonly images = new Map<string, HTMLCanvasElement>();
  private signatures = new Map<string, string>();
  prepare(requests: LayoutPreviewRequest[]) {
    for (const request of requests) if (this.signatures.get(request.id) !== JSON.stringify(request.layout)) this.images.delete(request.id);
  }
  renderNext(renderer: THREE.WebGLRenderer, root: THREE.Group, requests: LayoutPreviewRequest[]) {
    if (!root.userData.loaded) return false;
    this.prepare(requests);
    const request = requests.find(request => this.signatures.get(request.id) !== JSON.stringify(request.layout));
    if (!request) return false;
    const scene = new THREE.Scene(), model = root.clone(true);
    model.traverse(object => {
      const id = object.userData.furnitureId as string | undefined;
      if (id) {
        const pose = request.layout.placed[id]; object.visible = !!pose;
        if (pose) { object.position.set(pose.x, 0, pose.z); object.rotation.set(0, pose.turn * Math.PI / 2, 0); }
      } else if (object.userData.editorHide) object.visible = false;
    });
    scene.background = new THREE.Color('#eee4d2');
    scene.add(model, new THREE.HemisphereLight('#fff8e8', '#b3a693', 2.5));
    const light = new THREE.DirectionalLight('#fff5df', 3); light.position.set(-3, 12, 6); scene.add(light);
    const b = roomDefinition.bounds, center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 100);
    camera.position.copy(center).add(new THREE.Vector3(0, 25, 16)); camera.lookAt(center); camera.updateMatrixWorld(true);
    let span = 0;
    for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) for (const y of [0, 5]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      span = Math.max(span, Math.abs(p.y), Math.abs(p.x) / 1.5);
    }
    span *= 1.04; camera.left = -span * 1.5; camera.right = span * 1.5; camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix();
    this.images.set(request.id, renderPreview(renderer, scene, camera));
    this.signatures.set(request.id, JSON.stringify(request.layout)); scene.clear(); return true;
  }
}
