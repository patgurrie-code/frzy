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
  auraU: { uColor: { value: THREE.Color }; uOpacity: { value: number }; uTime: { value: number } };
  aura: THREE.Mesh;
  /** Per-model toon materials + their base emissive (hit flash / glow). */
  mats: { m: THREE.MeshToonMaterial; base: THREE.Color }[];
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
  /** Secondary-motion chains (scarves, capes, hair). Render only. */
  dangles: Dangle[];
  /** Expression groups (render swaps visibility). */
  faces?: { normal: THREE.Object3D; hurt: THREE.Object3D; shout: THREE.Object3D; blink: THREE.Object3D };
  blinkAt: number;
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

  // Per-model material instances (so one fighter can flash/glow without affecting others)
  const mats: { m: THREE.MeshToonMaterial; base: THREE.Color }[] = [];
  const cloned = new Map<THREE.Material, THREE.Material>();
  scaled.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.Material;
    if (!(src as THREE.MeshToonMaterial).isMeshToonMaterial) return;
    let c = cloned.get(src);
    if (!c) {
      const tm = (src as THREE.MeshToonMaterial).clone();
      tm.onBeforeCompile = src.onBeforeCompile;
      tm.customProgramCacheKey = src.customProgramCacheKey;
      mats.push({ m: tm, base: tm.emissive.clone() });
      cloned.set(src, tm);
      c = tm;
    }
    mesh.material = c;
  });

  // Ki aura: flame shader (fresnel glow + rising noise), Dragon Ball style
  const auraU = { uColor: { value: new THREE.Color(look.accent) }, uOpacity: { value: 0 }, uTime: { value: 0 } };
  const auraMat = new THREE.ShaderMaterial({
    uniforms: auraU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        vec3 p = position;
        float h = clamp(p.y * 0.5 + 0.5, 0.0, 1.0);
        float ang = atan(p.z, p.x);
        // licking flames: stretch the top, wobble sideways
        float flame = sin(ang * 5.0 + uTime * 9.0) * 0.5 + sin(ang * 9.0 - uTime * 13.0) * 0.5;
        p.y += h * h * (0.35 + flame * 0.18);
        p.xz *= 1.0 + h * flame * 0.12 - h * h * 0.35;
        vY = h;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float fr = pow(1.0 - abs(dot(vN, vV)), 1.6);
        float bands = 0.6 + 0.4 * sin(vY * 22.0 - uTime * 14.0);
        float a = fr * bands * (1.0 - vY * 0.55) * uOpacity;
        vec3 col = mix(uColor, vec3(1.0), fr * 0.35);
        gl_FragColor = vec4(col * a * 2.2, a);
      }`,
  });
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), auraMat);
  aura.scale.set(0.9, 1.6, 0.9);
  aura.position.y = 0.92;
  aura.frustumCulled = false;
  aura.renderOrder = 5;
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

  if (kit.faces) {
    kit.faces.hurt.visible = kit.faces.shout.visible = kit.faces.blink.visible = false;
  }
  return { root, body: scaled, bones, auraU, aura, mats, shield, shadow, dangles: kit.dangles, faces: kit.faces, blinkAt: 2 + Math.random() * 3 };
}

/** Apply a float pose (degrees per bone, root offset in FX) to the placeholder skeleton. */
export function applyPose(model: FighterModel, rot: Float32Array, root: Float32Array): void {
  const bones = model.bones;
  for (let i = 0; i < BONE_COUNT; i++) bones[i].rotation.z = rot[i] * DEG;
  // Render-only torso twist: the shoulder of the extended arm (and hip of the kicking leg) comes forward,
  // so 2D-plane poses read as 3D strikes. Head counter-rotates to keep looking at the opponent.
  const armTwist = (rot[B.RightArm] - rot[B.LeftArm]) * 0.0042;
  const legTwist = (rot[B.RightUpLeg] - rot[B.LeftUpLeg]) * 0.0025;
  const tw = Math.max(-0.6, Math.min(0.6, armTwist));
  bones[B.Spine2].rotation.y = tw;
  bones[B.Spine].rotation.y = tw * 0.3;
  bones[B.Hips].rotation.y = Math.max(-0.45, Math.min(0.45, legTwist)) - tw * 0.25;
  bones[B.Head].rotation.y = -tw * 0.8;
  // The sim adds the root offset unscaled; undo the body group's scale so visuals match hitboxes.
  const s = model.body.scale.x;
  bones[B.Hips].position.x = BONES[0].x + root[0] / FX / s;
  bones[B.Hips].position.y = BONES[0].y + root[1] / FX / s;
}

export type Expression = 'normal' | 'hurt' | 'shout' | 'blink';
export function setExpression(model: FighterModel, e: Expression): void {
  const f = model.faces;
  if (!f) return;
  f.normal.visible = e === 'normal';
  f.hurt.visible = e === 'hurt';
  f.shout.visible = e === 'shout';
  f.blink.visible = e === 'blink';
}

const WHITE = new THREE.Color(1, 1, 1);
/** Blend every material's emissive toward white (amount 0..1) — hit flash, super glow. */
export function setFlash(model: FighterModel, amount: number, tint: THREE.Color = WHITE): void {
  for (const { m, base } of model.mats) m.emissive.copy(base).lerp(tint, amount);
}
