// Keyframed bone poses authored in code. Compiled once at load into dense integer arrays.
// The sim samples them with integer maths (drives hitboxes/hurtboxes); the renderer samples
// the same data with floats for smooth display.
import { m } from './fixed';
import { BONES, BONE_COUNT, Pose } from './skeleton';

export type BoneName = (typeof BONES)[number]['name'];
/** Sparse authored key: bone name -> degrees; root offset in metres. */
export interface KeySpec {
  f: number;
  r?: Partial<Record<string, number>>;
  root?: [number, number];
  /** Easing of the segment that STARTS at this key (see Ease). Auto-assigned for moves if omitted. */
  ease?: Ease;
}

/** 0 linear · 1 snap (ease-out cubic: arrives fast, good for strikes) · 2 smooth (smoothstep, wind-ups/recoveries). */
export const enum Ease {
  Linear = 0,
  Snap = 1,
  Smooth = 2,
}

export interface CompiledKey {
  f: number;
  rot: Int16Array;
  rootX: number;
  rootY: number;
  ease: number;
}

/** Integer easing: t in [0,1024] -> eased [0,1024]. Exact integer maths (deterministic). */
export function easeI(ease: number, t: number): number {
  if (ease === Ease.Snap) {
    const u = 1024 - t;
    return 1024 - Math.trunc((u * u * u) / 1048576);
  }
  if (ease === Ease.Smooth) return Math.trunc((t * t * (3072 - 2 * t)) / 1048576);
  return t;
}

/** Float easing for the renderer (same curves). */
export function easeF(ease: number, t: number): number {
  if (ease === Ease.Snap) return 1 - (1 - t) * (1 - t) * (1 - t);
  if (ease === Ease.Smooth) return t * t * (3 - 2 * t);
  return t;
}

export interface Anim {
  keys: CompiledKey[];
  length: number;
  loop: boolean;
}

const BONE_INDEX: Record<string, number> = {};
BONES.forEach((b, i) => (BONE_INDEX[b.name] = i));

export function boneIndex(name: string): number {
  const i = BONE_INDEX[name];
  if (i === undefined) throw new Error(`Unknown bone ${name}`);
  return i;
}

/**
 * Compile sparse keys. Each key inherits from the previous one (the first inherits from `base`).
 * Keys must be sorted by frame and the first should be at f=0.
 */
export function compileAnim(base: KeySpec | null, keys: KeySpec[], length: number, loop = false): Anim {
  const rot = new Int16Array(BONE_COUNT);
  let rootX = 0;
  let rootY = 0;
  const apply = (k: KeySpec) => {
    if (k.r) for (const [n, v] of Object.entries(k.r)) rot[boneIndex(n)] = v as number;
    if (k.root) {
      rootX = m(k.root[0]);
      rootY = m(k.root[1]);
    }
  };
  if (base) apply(base);
  const out: CompiledKey[] = [];
  for (const k of keys) {
    apply(k);
    out.push({ f: k.f, rot: rot.slice(), rootX, rootY, ease: k.ease ?? (loop ? Ease.Smooth : Ease.Linear) });
  }
  if (out.length === 0) out.push({ f: 0, rot: rot.slice(), rootX, rootY, ease: Ease.Linear });
  return { keys: out, length: Math.max(1, length), loop };
}

function findKey(a: Anim, frame: number): number {
  const keys = a.keys;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].f <= frame) i++;
  return i;
}

/** Integer sample (sim). */
export function samplePose(a: Anim, frame: number, out: Pose): Pose {
  let f = frame;
  if (a.loop) f = ((f % a.length) + a.length) % a.length;
  const i = findKey(a, f);
  const k0 = a.keys[i];
  const k1 = a.keys[i + 1];
  if (!k1 || f <= k0.f) {
    for (let b = 0; b < BONE_COUNT; b++) out.rot[b] = k0.rot[b];
    out.rootX = k0.rootX;
    out.rootY = k0.rootY;
    return out;
  }
  const t = easeI(k0.ease, Math.trunc(((f - k0.f) * 1024) / (k1.f - k0.f)));
  for (let b = 0; b < BONE_COUNT; b++) out.rot[b] = k0.rot[b] + Math.trunc(((k1.rot[b] - k0.rot[b]) * t) / 1024);
  out.rootX = k0.rootX + Math.trunc(((k1.rootX - k0.rootX) * t) / 1024);
  out.rootY = k0.rootY + Math.trunc(((k1.rootY - k0.rootY) * t) / 1024);
  return out;
}

/** Float sample (renderer only). Angles in degrees, root in FX units (float). */
export function samplePoseF(a: Anim, frame: number, rot: Float32Array, root: Float32Array): void {
  let f = frame;
  if (a.loop) f = ((f % a.length) + a.length) % a.length;
  else if (f > a.length) f = a.length;
  const i = findKey(a, Math.floor(f));
  const k0 = a.keys[i];
  const k1 = a.keys[i + 1];
  if (!k1 || f <= k0.f) {
    for (let b = 0; b < BONE_COUNT; b++) rot[b] = k0.rot[b];
    root[0] = k0.rootX;
    root[1] = k0.rootY;
    return;
  }
  const t = easeF(k0.ease, Math.min(1, (f - k0.f) / (k1.f - k0.f)));
  for (let b = 0; b < BONE_COUNT; b++) rot[b] = k0.rot[b] + (k1.rot[b] - k0.rot[b]) * t;
  root[0] = k0.rootX + (k1.rootX - k0.rootX) * t;
  root[1] = k0.rootY + (k1.rootY - k0.rootY) * t;
}
