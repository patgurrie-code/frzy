// Placeholder fighters: primitives parented to a Mixamo-named THREE.Bone skeleton.
// A GLB with the same bone names can later replace the primitives (see glbLoader.ts) — the pose
// application below works on bone names, so gameplay and animation code don't change.
import * as THREE from 'three';
import { BONES, BONE_COUNT, B } from '../sim/skeleton';
import type { FighterDef } from '../sim/defs';
import { FX } from '../sim/fixed';
import { Kit, Dangle } from './kit';
import { buildDesign } from './designs';

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
  /** Secondary-motion chains (scarves, capes, hair). Render only. */
  dangles: Dangle[];
}

export function buildFighterModel(def: FighterDef): FighterModel {
  const look = def.look;

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

  const k = look.build === 'giant' ? 1.5 : look.build === 'bulky' ? 1.28 : look.build === 'slim' ? 0.86 : 1;
  // Sculpted procedural design (src/render/designs.ts), merged per bone for few draw calls.
  const kit = new Kit(bones, 1 / s);
  buildDesign(def.id, kit, look);
  kit.build();

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

  return { root, body: scaled, bones, auraMat, aura, shield, shadow, dangles: kit.dangles };
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
