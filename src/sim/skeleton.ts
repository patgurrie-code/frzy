// Humanoid skeleton using Mixamo bone names. The sim does forward kinematics in the
// 2D gameplay plane (side view, facing +X, rotations about Z) with integer maths.
// The renderer builds a three.js skeleton from the same table (adding Z depth for limbs).
import { TRIG, isin, icos, m } from './fixed';

export const enum B {
  Hips,
  Spine,
  Spine1,
  Spine2,
  Neck,
  Head,
  RightShoulder,
  RightArm,
  RightForeArm,
  RightHand,
  LeftShoulder,
  LeftArm,
  LeftForeArm,
  LeftHand,
  RightUpLeg,
  RightLeg,
  RightFoot,
  RightToeBase,
  LeftUpLeg,
  LeftLeg,
  LeftFoot,
  LeftToeBase,
  COUNT,
}

export const BONE_COUNT = B.COUNT as number;

export interface BoneDef {
  name: string; // Mixamo name without the "mixamorig:" prefix
  parent: number; // -1 for root (Hips)
  /** Offset from parent joint in the parent's rest frame (metres, authored). */
  x: number;
  y: number;
  /** Render-only depth (+Z = fighter's right side when facing +X). */
  z: number;
}

// Rest pose: standing, arms hanging straight down, facing +X.
export const BONES: readonly BoneDef[] = [
  { name: 'Hips', parent: -1, x: 0, y: 0.95, z: 0 },
  { name: 'Spine', parent: B.Hips, x: 0, y: 0.1, z: 0 },
  { name: 'Spine1', parent: B.Spine, x: 0, y: 0.12, z: 0 },
  { name: 'Spine2', parent: B.Spine1, x: 0, y: 0.12, z: 0 },
  { name: 'Neck', parent: B.Spine2, x: 0, y: 0.16, z: 0 },
  { name: 'Head', parent: B.Neck, x: 0, y: 0.08, z: 0 },
  { name: 'RightShoulder', parent: B.Spine2, x: 0, y: 0.12, z: 0.06 },
  { name: 'RightArm', parent: B.RightShoulder, x: 0, y: 0, z: 0.14 },
  { name: 'RightForeArm', parent: B.RightArm, x: 0, y: -0.28, z: 0 },
  { name: 'RightHand', parent: B.RightForeArm, x: 0, y: -0.26, z: 0 },
  { name: 'LeftShoulder', parent: B.Spine2, x: 0, y: 0.12, z: -0.06 },
  { name: 'LeftArm', parent: B.LeftShoulder, x: 0, y: 0, z: -0.14 },
  { name: 'LeftForeArm', parent: B.LeftArm, x: 0, y: -0.28, z: 0 },
  { name: 'LeftHand', parent: B.LeftForeArm, x: 0, y: -0.26, z: 0 },
  { name: 'RightUpLeg', parent: B.Hips, x: 0, y: -0.04, z: 0.1 },
  { name: 'RightLeg', parent: B.RightUpLeg, x: 0, y: -0.44, z: 0 },
  { name: 'RightFoot', parent: B.RightLeg, x: 0, y: -0.42, z: 0 },
  { name: 'RightToeBase', parent: B.RightFoot, x: 0.13, y: -0.05, z: 0 },
  { name: 'LeftUpLeg', parent: B.Hips, x: 0, y: -0.04, z: -0.1 },
  { name: 'LeftLeg', parent: B.LeftUpLeg, x: 0, y: -0.44, z: 0 },
  { name: 'LeftFoot', parent: B.LeftLeg, x: 0, y: -0.42, z: 0 },
  { name: 'LeftToeBase', parent: B.LeftFoot, x: 0.13, y: -0.05, z: 0 },
];

/** Integer rest offsets (FX), precomputed. */
export const REST_X: readonly number[] = BONES.map((b) => m(b.x));
export const REST_Y: readonly number[] = BONES.map((b) => m(b.y));

/** A pose: local Z rotation per bone in integer degrees, plus a root (hip) offset in FX. */
export interface Pose {
  rot: number[]; // length BONE_COUNT
  rootX: number;
  rootY: number;
}

export function emptyPose(): Pose {
  return { rot: new Array(BONE_COUNT).fill(0), rootX: 0, rootY: 0 };
}

/** World joint positions of every bone relative to the fighter's feet, facing +X. */
export interface JointPositions {
  x: number[];
  y: number[];
  ang: number[]; // world angle in degrees
}

export function makeJoints(): JointPositions {
  return {
    x: new Array(BONE_COUNT).fill(0),
    y: new Array(BONE_COUNT).fill(0),
    ang: new Array(BONE_COUNT).fill(0),
  };
}

/**
 * Forward kinematics. `scale` is per-mille (1000 = authored size).
 * Bones are ordered so every parent precedes its children.
 */
export function solveFK(pose: Pose, scale: number, out: JointPositions): JointPositions {
  for (let i = 0; i < BONE_COUNT; i++) {
    const p = BONES[i].parent;
    const ox = Math.trunc((REST_X[i] * scale) / 1000);
    const oy = Math.trunc((REST_Y[i] * scale) / 1000);
    if (p < 0) {
      out.x[i] = ox + pose.rootX;
      out.y[i] = oy + pose.rootY;
      out.ang[i] = pose.rot[i];
    } else {
      const pa = out.ang[p];
      const c = icos(pa);
      const s = isin(pa);
      out.x[i] = out.x[p] + Math.trunc((ox * c - oy * s) / TRIG);
      out.y[i] = out.y[p] + Math.trunc((ox * s + oy * c) / TRIG);
      out.ang[i] = pa + pose.rot[i];
    }
  }
  return out;
}

/** A point at local offset (FX) in a bone's frame, in fighter space. */
export function bonePoint(j: JointPositions, bone: number, ox: number, oy: number): [number, number] {
  const a = j.ang[bone];
  const c = icos(a);
  const s = isin(a);
  return [j.x[bone] + Math.trunc((ox * c - oy * s) / TRIG), j.y[bone] + Math.trunc((ox * s + oy * c) / TRIG)];
}

/** Hurtbox capsules: segment between two bone joints (or a bone and an offset), radius in FX. */
export interface HurtCapsule {
  a: number;
  b: number; // -1 = use the offset (bx, by) in bone a's frame
  bx: number;
  by: number;
  r: number;
}

export const HURTBOXES: readonly HurtCapsule[] = [
  { a: B.Head, b: -1, bx: 0, by: m(0.12), r: m(0.13) },
  { a: B.Hips, b: B.Neck, bx: 0, by: 0, r: m(0.17) },
  { a: B.RightArm, b: B.RightForeArm, bx: 0, by: 0, r: m(0.07) },
  { a: B.RightForeArm, b: B.RightHand, bx: 0, by: 0, r: m(0.07) },
  { a: B.LeftArm, b: B.LeftForeArm, bx: 0, by: 0, r: m(0.07) },
  { a: B.LeftForeArm, b: B.LeftHand, bx: 0, by: 0, r: m(0.07) },
  { a: B.RightUpLeg, b: B.RightLeg, bx: 0, by: 0, r: m(0.09) },
  { a: B.RightLeg, b: B.RightFoot, bx: 0, by: 0, r: m(0.08) },
  { a: B.LeftUpLeg, b: B.LeftLeg, bx: 0, by: 0, r: m(0.09) },
  { a: B.LeftLeg, b: B.LeftFoot, bx: 0, by: 0, r: m(0.08) },
];
