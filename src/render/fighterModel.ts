// Placeholder fighters: primitives parented to a Mixamo-named THREE.Bone skeleton.
// A GLB with the same bone names can later replace the primitives (see glbLoader.ts) — the pose
// application below works on bone names, so gameplay and animation code don't change.
import * as THREE from 'three';
import { BONES, BONE_COUNT, B } from '../sim/skeleton';
import type { FighterDef } from '../sim/defs';
import { FX } from '../sim/fixed';
import { outlined, toonMat } from './toon';

export const MIXAMO_PREFIX = 'mixamorig:';
const DEG = Math.PI / 180;

export interface FighterModel {
  root: THREE.Group; // positioned at the fighter's feet, rotated for facing
  body: THREE.Group; // scaled by fighter scale
  bones: THREE.Bone[]; // indexed like BONES
  /** Optional GLB replacing the placeholder. */
  glb?: { scene: THREE.Object3D; bones: (THREE.Bone | null)[]; mixer?: THREE.AnimationMixer; clips: Map<string, THREE.AnimationClip> };
  auraMat: THREE.MeshBasicMaterial;
  aura: THREE.Mesh;
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
}

function cap(r: number, len: number): THREE.CapsuleGeometry {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8);
}

/** Add a capsule spanning from the bone origin to its child offset. */
function limb(bone: THREE.Bone, child: number, r: number, mat: THREE.Material): void {
  const c = BONES[child];
  const dir = new THREE.Vector3(c.x, c.y, 0);
  const len = dir.length();
  const mesh = outlined(cap(r, Math.max(0.01, len - r)), mat);
  mesh.position.copy(dir).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  bone.add(mesh);
}

export function buildFighterModel(def: FighterDef): FighterModel {
  const look = def.look;
  const bulky = look.build === 'bulky' || look.build === 'giant';
  const hairStyle = look.hairStyle ?? (bulky ? 'flat' : 'spiky');
  const body = toonMat(look.body);
  const trim = toonMat(look.trim);
  const skin = toonMat(look.skin);
  const hair = toonMat(look.hair);
  const accent = toonMat(look.accent, look.accent & 0x3f3f3f);

  const root = new THREE.Group();
  const scaled = new THREE.Group();
  const s = def.stats.scale / 1000;
  scaled.scale.setScalar(s);
  root.add(scaled);

  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = new THREE.Bone();
    b.name = MIXAMO_PREFIX + BONES[i].name;
    b.position.set(BONES[i].x, BONES[i].y, BONES[i].z);
    bones.push(b);
    const p = BONES[i].parent;
    if (p < 0) scaled.add(b);
    else bones[p].add(b);
  }

  const k = look.build === 'giant' ? 1.55 : look.build === 'bulky' ? 1.3 : look.build === 'slim' ? 0.85 : 1;
  // Torso
  const hips = outlined(new THREE.BoxGeometry(0.3 * k, 0.2, 0.26 * k), trim);
  hips.position.set(0, 0.02, 0);
  bones[B.Hips].add(hips);
  const belly = outlined(new THREE.BoxGeometry(0.28 * k, 0.24, 0.22 * k), body);
  belly.position.set(0, 0.1, 0);
  bones[B.Spine].add(belly);
  const chest = outlined(new THREE.BoxGeometry(0.38 * k, 0.3, 0.26 * k), body);
  chest.position.set(0.01, 0.12, 0);
  bones[B.Spine2].add(chest);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.32 * k, 0.06, 0.28 * k), accent);
  belt.position.set(0, 0.11, 0);
  bones[B.Hips].add(belt);
  if (bulky) {
    for (const side of [1, -1]) {
      const pad = outlined(new THREE.SphereGeometry(0.13, 10, 8), trim);
      pad.position.set(0, 0.03, side * 0.2);
      pad.scale.set(1, 0.75, 1);
      bones[B.Spine2].add(pad);
    }
  } else {
    // Scarf
    const scarf = outlined(new THREE.TorusGeometry(0.11, 0.04, 6, 12), accent);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.24, 0);
    bones[B.Spine2].add(scarf);
    const tail = outlined(new THREE.BoxGeometry(0.06, 0.28, 0.04), accent);
    tail.position.set(-0.14, 0.12, 0.04);
    tail.rotation.z = -0.6;
    bones[B.Spine2].add(tail);
  }
  // Neck + head
  limb(bones[B.Neck], B.Head, 0.055 * k, skin);
  const head = outlined(new THREE.SphereGeometry(0.13, 14, 12), skin);
  head.position.set(0.01, 0.12, 0);
  bones[B.Head].add(head);
  // Eyes (facing +X)
  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.03), toonMat(0x111111));
    eye.position.set(0.125, 0.14, side * 0.045);
    bones[B.Head].add(eye);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.27), accent);
  band.position.set(0, 0.2, 0);
  bones[B.Head].add(band);
  if (hairStyle === 'long') {
    const cap = outlined(new THREE.SphereGeometry(0.14, 12, 10), hair);
    cap.position.set(-0.02, 0.15, 0);
    cap.scale.set(1, 1, 1.05);
    bones[B.Head].add(cap);
    const tail = outlined(new THREE.BoxGeometry(0.08, 0.42, 0.16), hair);
    tail.position.set(-0.13, -0.05, 0);
    tail.rotation.z = -0.15;
    bones[B.Head].add(tail);
  } else if (hairStyle === 'mohawk') {
    for (let i = 0; i < 4; i++) {
      const fin = outlined(new THREE.ConeGeometry(0.05, 0.16, 4), hair);
      fin.position.set(0.06 - i * 0.07, 0.27 - i * 0.015, 0);
      fin.rotation.z = 0.3 - i * 0.35;
      bones[B.Head].add(fin);
    }
  } else if (hairStyle === 'hood') {
    const hood = outlined(new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hood.position.set(-0.015, 0.12, 0);
    hood.rotation.z = 0.35;
    bones[B.Head].add(hood);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.2), hair);
    mask.position.set(0.11, 0.07, 0);
    bones[B.Head].add(mask);
  } else if (hairStyle === 'flat') {
    const top = outlined(new THREE.BoxGeometry(0.24, 0.1, 0.24), hair);
    top.position.set(-0.01, 0.26, 0);
    bones[B.Head].add(top);
    const beard = outlined(new THREE.BoxGeometry(0.1, 0.1, 0.16), hair);
    beard.position.set(0.1, 0.03, 0);
    bones[B.Head].add(beard);
  } else {
    // Spiky swept-back hair
    const spikes: [number, number, number, number][] = [
      [-0.02, 0.25, 0, -0.5],
      [-0.1, 0.22, 0.06, -1.0],
      [-0.1, 0.22, -0.06, -1.0],
      [0.04, 0.24, 0.08, -0.2],
      [0.04, 0.24, -0.08, -0.2],
      [-0.14, 0.14, 0, -1.6],
    ];
    for (const [x, y, z, rz] of spikes) {
      const sp = outlined(new THREE.ConeGeometry(0.06, 0.2, 5), hair);
      sp.position.set(x, y, z);
      sp.rotation.z = rz;
      bones[B.Head].add(sp);
    }
  }
  // Cape
  if (look.cape) {
    const capeMat = new THREE.MeshToonMaterial({ color: look.accent, side: THREE.DoubleSide });
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.42 * k, 0.95), capeMat);
    cape.rotation.y = Math.PI / 2;
    cape.rotation.x = 0;
    cape.position.set(-0.16 * k, -0.3, 0);
    bones[B.Spine2].add(cape);
  }
  // Weapons
  if (look.weapon === 'spear') {
    const shaft = outlined(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), trim, 0.012);
    shaft.position.set(0, -0.45, 0);
    bones[B.RightHand].add(shaft);
    const tip = outlined(new THREE.ConeGeometry(0.06, 0.28, 6), accent, 0.012);
    tip.rotation.z = Math.PI;
    tip.position.set(0, -1.52, 0);
    bones[B.RightHand].add(tip);
  } else if (look.weapon === 'blades') {
    for (const hand of [B.RightHand, B.LeftHand]) {
      const blade = outlined(new THREE.BoxGeometry(0.03, 0.55, 0.08), accent, 0.01);
      blade.position.set(0.02, -0.32, 0);
      bones[hand].add(blade);
    }
  }
  // Arms
  for (const [arm, fore, hand] of [
    [B.RightArm, B.RightForeArm, B.RightHand],
    [B.LeftArm, B.LeftForeArm, B.LeftHand],
  ]) {
    limb(bones[arm], fore, 0.065 * k, bulky ? body : skin);
    limb(bones[fore], hand, 0.058 * k, skin);
    const glove = outlined(new THREE.SphereGeometry(0.08 * k, 10, 8), bulky ? accent : trim);
    glove.position.set(0, -0.06, 0);
    bones[hand].add(glove);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * k, 0.07 * k, 0.06, 8), accent);
    cuff.position.set(0, -0.22, 0);
    bones[fore].add(cuff);
  }
  // Legs
  for (const [up, leg, foot, toe] of [
    [B.RightUpLeg, B.RightLeg, B.RightFoot, B.RightToeBase],
    [B.LeftUpLeg, B.LeftLeg, B.LeftFoot, B.LeftToeBase],
  ]) {
    limb(bones[up], leg, 0.09 * k, trim);
    limb(bones[leg], foot, 0.075 * k, trim);
    const boot = outlined(new THREE.BoxGeometry(0.22, 0.1, 0.12 * k), bulky ? trim : body);
    boot.position.set(0.05, -0.03, 0);
    bones[foot].add(boot);
    void toe;
  }

  // Ki aura (EX / super / charging)
  const auraMat = new THREE.MeshBasicMaterial({ color: look.accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), auraMat);
  aura.scale.set(0.8, 1.35, 0.8);
  aura.position.y = 0.95;
  scaled.add(aura);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: look.accent, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shield.visible = false;
  root.add(shield);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45 * s * k, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;

  return { root, body: scaled, bones, auraMat, aura, shield, shadow };
}

/** Apply a float pose (degrees per bone, root offset in FX) to the placeholder skeleton. */
export function applyPose(model: FighterModel, rot: Float32Array, root: Float32Array): void {
  const bones = model.bones;
  for (let i = 0; i < BONE_COUNT; i++) bones[i].rotation.z = rot[i] * DEG;
  // The sim adds the root offset unscaled; undo the body group's scale so visuals match hitboxes.
  const s = model.body.scale.x;
  bones[B.Hips].position.x = BONES[0].x + root[0] / FX / s;
  bones[B.Hips].position.y = BONES[0].y + root[1] / FX / s;
}
