import * as THREE from 'three';
import type { CatDefinition } from './types';
import type { PawdicureRound } from './pawdicure';

/** A reusable close-up sole, independent of each resident's body rig. */
export class PawdicureModel {
  readonly root = new THREE.Group();
  readonly toes: THREE.Group[] = [];
  private claws: THREE.Mesh[] = [];
  private fur = new THREE.MeshStandardMaterial({ color: '#fff5e5', roughness: 0.9 });
  private pads = new THREE.MeshStandardMaterial({ color: '#df9b99', roughness: 0.65 });
  private ivory = new THREE.MeshStandardMaterial({ color: '#fff9df', roughness: 0.35 });
  private steel = new THREE.MeshStandardMaterial({ color: '#d2e0e2', metalness: 0.65, roughness: 0.3 });
  private teal = new THREE.MeshStandardMaterial({ color: '#4d928d', roughness: 0.65 });
  private clipper = new THREE.Group();
  private jaws: THREE.Group[] = [];
  private toeFur: THREE.MeshStandardMaterial[] = [];
  private toePads: THREE.MeshStandardMaterial[] = [];
  private tip: THREE.Mesh;
  private sparks: THREE.Mesh[] = [];
  private toolTarget = new THREE.Vector3();
  private lastToolTarget = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private effectContact = new THREE.Vector3();
  private effectSnip?: PawdicureRound['lastSnip'];
  private softColor = new THREE.Color('#ddd4c5');
  private axisZ = new THREE.Vector3(0, 0, 1);
  private sphere = new THREE.SphereGeometry(1, 24, 16);
  constructor() {
    this.root.name = 'pawdicure-closeup';
    const oval = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const mesh = new THREE.Mesh(this.sphere, mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); parent.add(mesh); return mesh;
    };
    oval(this.root, this.fur, 0,-.27,-.1,.63,.88,.26);
    oval(this.root, this.fur, 0,.05,0,1.02,.68,.32);
    // Three overlapping lobes make the central pad a soft heart shape.
    oval(this.root, this.pads, 0,-.09,.29,.42,.29,.085);
    for (const side of [-1,1]) oval(this.root,this.pads,side*.21,.11,.29,.25,.25,.09);
    const positions = [[-.93,.52],[-.31,.76],[.31,.76],[.93,.52],[-1.15,-.22]];
    const clawShape = new THREE.Shape(); clawShape.moveTo(-.08,0); clawShape.quadraticCurveTo(-.13,.28,.03,.43);
    clawShape.quadraticCurveTo(.16,.17,.08,0); clawShape.closePath();
    const clawGeo = new THREE.ExtrudeGeometry(clawShape,{depth:.075,bevelEnabled:true,bevelThickness:.018,bevelSize:.02,bevelSegments:2,steps:1,curveSegments:12});
    for (const [i,[x,y]] of positions.entries()) {
      const toe = new THREE.Group(); toe.position.set(x,y,.08); if (i === 4) toe.rotation.z = .6;
      this.root.add(toe); this.toes.push(toe);
      const toeFur = this.fur.clone(), toePad = this.pads.clone();
      this.toeFur.push(toeFur); this.toePads.push(toePad);
      oval(toe,toeFur,0,0,0,.235,.3,.23);
      oval(toe,toePad,0,-.015,.205,.145,.185,.045);
      const claw = new THREE.Mesh(clawGeo,this.ivory); claw.position.set(0,.18,.07); toe.add(claw); this.claws.push(claw);
    }
    // Crossed steel jaws and open rubber finger loops read as pet nail clippers.
    for (const side of [-1,1]) {
      const jaw = new THREE.Group(); this.clipper.add(jaw); this.jaws.push(jaw);
      oval(jaw,this.steel,side*.035,.06,0,.045,.21,.04);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.095,.028,10,24),this.teal);
      ring.position.set(side*.075,-.22,0); ring.scale.y=1.35; jaw.add(ring);
      oval(jaw,this.steel,side*.028,.225,0,.08,.055,.045);
    }
    oval(this.clipper,this.teal,0,-.04,.05,.065,.065,.03);
    this.root.add(this.clipper); this.clipper.scale.setScalar(1.15);
    this.clipper.name = 'pawdicure-clippers';
    this.tip = new THREE.Mesh(clawGeo, this.ivory); this.tip.name = 'pawdicure-clipped-tip';
    this.tip.visible = false; this.root.add(this.tip);
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = i % 2 ? .24 : 1;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    const sparkleGeometry = new THREE.ShapeGeometry(star);
    const sparkleMaterial = new THREE.MeshBasicMaterial({ color: '#fff6bc', side: THREE.DoubleSide, depthTest: false });
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
      spark.name = `pawdicure-spark-${i}`; spark.visible = false;
      this.root.add(spark); this.sparks.push(spark);
    }
  }
  private clawContact(index: number, target: THREE.Vector3, scale = this.toes[index].scale.x) {
    const toe = this.toes[index];
    return target.set(0, .48, .15).multiplyScalar(scale).applyQuaternion(toe.quaternion).add(toe.position);
  }
  update(paw: PawdicureRound, cat: CatDefinition, won: boolean) {
    this.fur.color.set(cat.appearance === 'choco' || cat.appearance === 'latte' ? '#f8eddf' : cat.color);
    this.pads.color.set(cat.appearance === 'didi' ? '#aa8e9d' : '#df9b99');
    const moving = paw.mood === 'moving', warning = paw.mood === 'warning';
    const last = paw.lastSnip, age = paw.snipAge;
    const success = !!last?.success;
    const transfer = THREE.MathUtils.smoothstep(age, .12, .22);
    const recoil = last && !success && age < .5 ? Math.sin(age / .5 * Math.PI) : 0;
    this.root.position.set((moving ? Math.sin(paw.clock*12)*.1 : 0) + recoil * .08, .68 - (moving ? .2 : 0) - recoil * .1, 1.35 - recoil * .2);
    this.root.rotation.z = (warning ? Math.sin(paw.clock*23)*.025 : moving ? Math.sin(paw.clock*12)*.12 : Math.sin(paw.clock*1.4)*.008) - recoil * .09;
    if (last && last !== this.effectSnip) {
      this.effectSnip = last;
      this.clawContact(last.clawIndex, this.effectContact, 1.16);
    }
    for (let i=0;i<5;i++) {
      const previous = success && last?.clawIndex === i && age < .22;
      this.toes[i].visible=i<paw.clawCount || previous;
      const done = paw.trimmed[Math.min(3,paw.pawIndex)]?.[i] || won;
      const active = paw.activeClaw===i && !won;
      const focus = Math.max(previous ? 1 - transfer : 0, active ? (success && age < .22 ? transfer : 1) : 0);
      const closingClaw = previous ? THREE.MathUtils.lerp(1, .22, THREE.MathUtils.smoothstep(age, 0, .09)) : undefined;
      this.claws[i].scale.y=closingClaw ?? (done ? .22 : active ? 1 : .4);
      this.toes[i].scale.setScalar(THREE.MathUtils.lerp(.97, 1.16, focus));
      this.toeFur[i].color.copy(this.fur.color).lerp(this.softColor, (1 - focus) * .22);
      this.toePads[i].color.copy(this.pads.color).lerp(this.softColor, (1 - focus) * .44);
    }
    this.clipper.visible=(paw.activeClaw!==undefined && !won) || (success && age < .22);
    if (this.clipper.visible) {
      const next = paw.activeClaw ?? last!.clawIndex;
      const toe=this.toes[next];
      this.clawContact(next, this.toolTarget);
      let turn = toe.rotation.z;
      if (success && last && age < .22) {
        this.clawContact(last.clawIndex, this.lastToolTarget, 1.16);
        this.toolTarget.lerpVectors(this.lastToolTarget, this.toolTarget, transfer);
        turn = THREE.MathUtils.lerp(this.toes[last.clawIndex].rotation.z, turn, transfer);
      }
      // Offset the rotated jaw tip back onto the claw's actual contact point.
      this.offset.set(.11, .24, .07).applyAxisAngle(this.axisZ, turn);
      this.clipper.position.copy(this.toolTarget).add(this.offset);
      this.clipper.rotation.z=2.7 + turn;
      const close = success && age < .12 ? Math.sin(Math.min(1, age / .12) * Math.PI) : 0;
      this.jaws.forEach((jaw,i)=>jaw.rotation.z=(i ? -1:1)*THREE.MathUtils.lerp(.28, .025, close));
    }
    this.tip.visible = success && age > .035 && age < .45;
    if (this.tip.visible) {
      const t = age / .45;
      this.tip.position.copy(this.effectContact).add(this.offset.set(.55*t, .4*t - .8*t*t, .25));
      this.tip.scale.set(.34 * (1 - t), .3 * (1 - t), .34 * (1 - t)); this.tip.rotation.z = age * 10;
    }
    this.sparks.forEach((spark, i) => {
      spark.visible = success && age > .035 && age < .45;
      if (!spark.visible) return;
      const t = age / .45, angle = i * Math.PI / 3;
      spark.position.copy(this.effectContact).add(this.offset.set(Math.cos(angle) * (.08 + .38*t), Math.sin(angle) * (.08 + .38*t), .4));
      spark.scale.setScalar(.055 * (1 - t)); spark.rotation.z = angle + age * 2;
    });
    this.root.updateMatrixWorld(true);
  }
}
