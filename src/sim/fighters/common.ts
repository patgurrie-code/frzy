// Helpers for authoring fighters as data.
import { compileAnim, KeySpec, Anim, Ease } from '../anim';
import { m } from '../fixed';
import { HitboxDef, HitKind, MoveDef, ProjectileDef, ProjKind, Sfx, FighterAnims } from '../defs';
import { B, BONE_COUNT } from '../skeleton';

export { B, Sfx, HitKind, ProjKind, m };

export interface HbOpts {
  bone: number;
  at?: [number, number]; // offset in bone frame, metres
  r: number; // metres
  dmg: number;
  bkb: number;
  kbg: number;
  angle: number;
  group?: number;
  ki?: number;
  hitstun?: number;
  hitlag?: number;
  sfx?: Sfx;
  shield?: number;
  fixedKb?: boolean;
  level?: 'mid' | 'low' | 'overhead';
}

/** Hitbox active on frames [start, end]. */
export function hb(start: number, end: number, o: HbOpts): HitboxDef {
  return {
    start,
    end,
    bone: o.bone,
    ox: m(o.at ? o.at[0] : 0),
    oy: m(o.at ? o.at[1] : 0),
    r: m(o.r),
    dmg: o.dmg,
    bkb: o.bkb,
    kbg: o.kbg,
    angle: o.angle,
    group: o.group ?? 0,
    ki: o.ki ?? Math.max(4, o.dmg * 2),
    hitstun: o.hitstun,
    hitlag: o.hitlag,
    sfx: o.sfx ?? (o.dmg >= 13 ? Sfx.Heavy : o.dmg >= 7 ? Sfx.Medium : Sfx.Light),
    kind: HitKind.Hit,
    shield: o.shield,
    fixedKb: o.fixedKb,
    level: o.level,
  };
}

export function grabBox(start: number, end: number, bone: number, at: [number, number], r: number): HitboxDef {
  return {
    start,
    end,
    bone,
    ox: m(at[0]),
    oy: m(at[1]),
    r: m(r),
    dmg: 0,
    bkb: 0,
    kbg: 0,
    angle: 0,
    group: 0,
    ki: 0,
    sfx: Sfx.Light,
    kind: HitKind.Grab,
  };
}

export interface ProjOpts {
  kind?: ProjKind;
  f: number;
  bone: number;
  at?: [number, number];
  speed: number; // m/frame
  vy?: number;
  r: number;
  life: number;
  maxLen?: number;
  dmg: number;
  bkb: number;
  kbg: number;
  angle: number;
  ki?: number;
  rehit?: number;
  hits?: number;
  color: number;
}

export function proj(o: ProjOpts): ProjectileDef {
  return {
    kind: o.kind ?? ProjKind.Blast,
    f: o.f,
    bone: o.bone,
    ox: m(o.at ? o.at[0] : 0),
    oy: m(o.at ? o.at[1] : 0),
    vx: m(o.speed),
    vy: m(o.vy ?? 0),
    r: m(o.r),
    life: o.life,
    maxLen: m(o.maxLen ?? 0),
    dmg: o.dmg,
    bkb: o.bkb,
    kbg: o.kbg,
    angle: o.angle,
    ki: o.ki ?? o.dmg * 2,
    rehit: o.rehit ?? 0,
    hits: o.hits ?? 1,
    color: o.color,
  };
}

export type MoveOpts = Omit<MoveDef, 'name' | 'anim' | 'length' | 'hitboxes'>;

/**
 * Auto easing for attacks (only where a key doesn't specify one):
 *  - the segment that arrives at (or just before) the first active frame = Snap (strike lands fast),
 *  - earlier wind-up segments = Smooth (anticipation),
 *  - segments after the active window = Smooth (follow-through settles back into stance).
 */
function autoEase(keys: KeySpec[], hitboxes: HitboxDef[], opts: MoveOpts): KeySpec[] {
  let first = 999;
  for (const h of hitboxes) first = Math.min(first, h.start);
  if (opts.projectile) first = Math.min(first, opts.projectile.f);
  if (opts.throwRelease) first = Math.min(first, opts.throwRelease.f);
  return keys.map((k, i) => {
    if (k.ease !== undefined) return k;
    const next = keys[i + 1];
    if (!next) return k;
    if (first === 999) return { ...k, ease: Ease.Smooth };
    if (next.f <= first + 1 && (i + 2 >= keys.length || keys[i + 2].f > first + 1)) return { ...k, ease: Ease.Snap };
    return { ...k, ease: Ease.Smooth };
  });
}

export class MoveBuilder {
  constructor(readonly stance: KeySpec) {}

  move(name: string, length: number, keys: KeySpec[], hitboxes: HitboxDef[], opts: MoveOpts = {}): MoveDef {
    const anim = compileAnim(this.stance, autoEase(keys, hitboxes, opts), length);
    // Sparse empty keys inherit the strike. Add a real follow-through/settle tail after all authored
    // keys AND every active/release frame; existing wind-ups and active poses remain exact.
    let hold = anim.keys[anim.keys.length - 1].f;
    for (const h of hitboxes) hold = Math.max(hold, h.end);
    if (opts.projectile) hold = Math.max(hold, opts.projectile.f);
    if (opts.throwRelease) hold = Math.max(hold, opts.throwRelease.f);
    if (hold < length) {
      const last = anim.keys[anim.keys.length - 1];
      if (hold > last.f) anim.keys.push({ ...last, f: hold, rot: last.rot.slice() });
      const rest = compileAnim(this.stance, [{ f: 0 }], 1).keys[0];
      const settle = rest.rot.slice();
      const over = rest.rot.slice();
      for (let b = 0; b < BONE_COUNT; b++) {
        // Settle to the nearest equivalent angle, preserving authored spins instead of unwinding them.
        settle[b] += Math.round((last.rot[b] - settle[b]) / 360) * 360;
        over[b] = settle[b] + Math.trunc((settle[b] - last.rot[b]) / 16);
      }
      anim.keys[anim.keys.length - 1].ease = Ease.Smooth;
      if (length - hold >= 6) anim.keys.push({ f: length - 2, rot: over,
        rootX: rest.rootX, rootY: rest.rootY + m(0.005), ease: Ease.Smooth });
      anim.keys.push({ f: length, rot: settle, rootX: rest.rootX, rootY: rest.rootY, ease: Ease.Smooth });
    }
    return { name, anim, length, hitboxes, ...opts };
  }

  anim(keys: KeySpec[], length: number, loop = false): Anim {
    return compileAnim(this.stance, keys, length, loop);
  }
}

/** Velocity key helper (m/frame). */
export function mv(f: number, vx?: number, vy?: number) {
  return { f, vx: vx === undefined ? undefined : m(vx), vy: vy === undefined ? undefined : m(vy) };
}

/**
 * EX version of a special: more damage/knockback, brief armour, costs 1 ki bar.
 * Fighters can override specific fields afterwards.
 */
export function makeEx(base: MoveDef, name: string, extra: Partial<MoveDef> = {}): MoveDef {
  const scaleHb = (h: HitboxDef): HitboxDef => ({
    ...h,
    dmg: Math.round(h.dmg * 1.35),
    bkb: Math.round(h.bkb * 1.15),
    ki: 0,
  });
  let anim = base.anim;
  if (extra.length !== undefined && extra.length > base.length) {
    // Longer EX casts must hold the firing pose longer, rather than settling while the beam is active.
    const delta = extra.length - base.length;
    const tail = anim.keys.findIndex((k) => k.f >= base.length - 2);
    if (tail > 0) {
      const hold = anim.keys[tail - 1];
      anim = { ...anim, length: extra.length, keys: [
        ...anim.keys.slice(0, tail),
        { ...hold, f: hold.f + delta, rot: hold.rot.slice() },
        ...anim.keys.slice(tail).map((k) => ({ ...k, f: k.f + delta })),
      ] };
    }
  }
  return {
    ...base,
    name,
    anim,
    hitboxes: base.hitboxes.map(scaleHb),
    projectile: base.projectile
      ? { ...base.projectile, dmg: Math.round(base.projectile.dmg * 1.4), ki: 0, life: base.projectile.life + 20 }
      : undefined,
    armor: base.armor ?? [1, Math.min(base.length, 12)],
    kiCost: 100,
    ...extra,
  };
}

/** Generic state animations built from a stance, with per-fighter flavour. */
export interface AnimStyle {
  /** Idle breathing/bounce period in frames (boxers bounce fast, veterans breathe slow). */
  idlePeriod?: number;
  /** Idle bob depth in metres. */
  bob?: number;
  /** Ninja run: torso far forward, arms trailing straight back. */
  ninjaRun?: boolean;
  /** Nominal movement speeds (metres/tick), scale (per-mille), and take-off clock. */
  walkSpeed?: number;
  runSpeed?: number;
  scale?: number;
  jumpSquat?: number;
}

export function stateAnims(mb: MoveBuilder, heavy: boolean, style: AnimStyle = {}): FighterAnims {
  const bob = style.bob ?? (heavy ? 0.03 : 0.02);
  const per = style.idlePeriod ?? 60;
  const ry = mb.stance.root ? mb.stance.root[1] : 0;
  const sp = (mb.stance.r?.Spine as number | undefined) ?? 0;
  const hd = (mb.stance.r?.Head as number | undefined) ?? 0;
  const ninja = style.ninjaRun
    ? {
        run: mb.anim(
          [
            { f: 0, r: { Spine: -45, Head: 35, RightArm: -70, LeftArm: -75, RightForeArm: 10, LeftForeArm: 10, RightUpLeg: 70, RightLeg: -40, LeftUpLeg: -50, LeftLeg: -70 }, root: [0, -0.16] },
            { f: 6, r: { RightUpLeg: 10, RightLeg: -100, LeftUpLeg: 20, LeftLeg: -20 }, root: [0, -0.1] },
            { f: 12, r: { RightUpLeg: -50, RightLeg: -70, LeftUpLeg: 70, LeftLeg: -40 }, root: [0, -0.16] },
            { f: 18, r: { RightUpLeg: 20, RightLeg: -20, LeftUpLeg: 10, LeftLeg: -100 }, root: [0, -0.1] },
            { f: 24, r: { RightUpLeg: 70, RightLeg: -40, LeftUpLeg: -50, LeftLeg: -70 }, root: [0, -0.16] },
          ],
          24,
          true,
        ),
      }
    : {};
  const scale = (style.scale ?? 1000) / 1000;
  const walkPeriod = Math.max(12, Math.round(1.6 * scale / (style.walkSpeed ?? 0.05)));
  const runPeriod = Math.max(10, Math.round(2.2 * scale / (style.runSpeed ?? 0.12)));
  // Retiming copies only locomotion clips, preserving integer key times and matching stride to speed.
  const gait = (a: Anim, period: number) => ({ ...a, length: period,
    keys: a.keys.map((k) => ({ ...k, f: Math.round(k.f * period / a.length) })) });
  const result: FighterAnims = {
    idle: mb.anim(
      [
        { f: 0 },
        { f: Math.round(per / 2), r: { Spine: sp - (heavy ? 2 : 3), Head: hd + 2 }, root: [0, ry - bob] },
        { f: per, r: { Spine: sp, Head: hd }, root: [0, ry] },
      ],
      per,
      true,
    ),
    walk: mb.anim(
      [
        { f: 0, r: { RightUpLeg: 30, RightLeg: -10, LeftUpLeg: -25, LeftLeg: -20, Spine: -6, RightArm: -12, LeftArm: 35, RightForeArm: 30, LeftForeArm: 40 }, root: [0, -0.04] },
        { f: 10, r: { RightUpLeg: 0, RightLeg: -40, LeftUpLeg: 0, LeftLeg: -5, RightArm: 12, LeftArm: 12 }, root: [0, -0.02] },
        { f: 20, r: { RightUpLeg: -25, RightLeg: -20, LeftUpLeg: 30, LeftLeg: -10, RightArm: 35, LeftArm: -12 }, root: [0, -0.04] },
        { f: 30, r: { RightUpLeg: 0, RightLeg: -5, LeftUpLeg: 0, LeftLeg: -40, RightArm: 12, LeftArm: 12 }, root: [0, -0.02] },
        { f: 40, r: { RightUpLeg: 30, RightLeg: -10, LeftUpLeg: -25, LeftLeg: -20, RightArm: -12, LeftArm: 35 }, root: [0, -0.04] },
      ],
      40,
      true,
    ),
    run: mb.anim(
      [
        { f: 0, r: { Spine: -25, RightUpLeg: 55, RightLeg: -30, LeftUpLeg: -40, LeftLeg: -60, RightArm: -40, RightForeArm: 90, LeftArm: 50, LeftForeArm: 90 }, root: [0, -0.08] },
        { f: 8, r: { RightUpLeg: 0, RightLeg: -90, LeftUpLeg: 10, LeftLeg: -10 }, root: [0, -0.03] },
        { f: 16, r: { RightUpLeg: -40, RightLeg: -60, LeftUpLeg: 55, LeftLeg: -30, RightArm: 50, LeftArm: -40 }, root: [0, -0.08] },
        { f: 24, r: { RightUpLeg: 10, RightLeg: -10, LeftUpLeg: 0, LeftLeg: -90 }, root: [0, -0.03] },
        { f: 32, r: { RightUpLeg: 55, RightLeg: -30, LeftUpLeg: -40, LeftLeg: -60, RightArm: -40, LeftArm: 50 }, root: [0, -0.08] },
      ],
      32,
      true,
    ),
    dash: mb.anim([{ f: 0, r: { Spine: -30, RightUpLeg: 60, RightLeg: -40, LeftUpLeg: -45, LeftLeg: -30, RightArm: -50, LeftArm: 40 }, root: [0, -0.1] }], 1),
    crouch: mb.anim([{ f: 0, r: { Spine: -25, RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 50, LeftLeg: -120, Head: 15 }, root: [0, -0.32] }], 1),
    jumpSquat: mb.anim([{ f: 0, ease: Ease.Smooth }, { f: style.jumpSquat ?? 3, r: { Spine: -20, RightUpLeg: 70, RightLeg: -100, LeftUpLeg: 50, LeftLeg: -100, RightArm: -15, LeftArm: -10 }, root: [0, -0.25] }], style.jumpSquat ?? 3),
    jump: mb.anim(
      [
        { f: 0, r: { Spine: -5, RightUpLeg: 70, RightLeg: -90, LeftUpLeg: -10, LeftLeg: -30, RightArm: 140, LeftArm: 30 }, root: [0, 0] },
        { f: 14, r: { Spine: 4, RightUpLeg: 25, RightLeg: -25, LeftUpLeg: -5, LeftLeg: -15, RightArm: 100, LeftArm: 70 }, root: [0, 0.045], ease: Ease.Smooth },
        { f: 24, r: { Spine: 0, RightUpLeg: 40, RightLeg: -55, LeftUpLeg: 15, LeftLeg: -40, RightArm: 85, LeftArm: 65 }, root: [0, 0] },
      ],
      24,
    ),
    fall: mb.anim([{ f: 0, r: { Spine: 0, RightUpLeg: 30, RightLeg: -40, LeftUpLeg: -10, LeftLeg: -30, RightArm: 110, RightForeArm: 30, LeftArm: 70, LeftForeArm: 30 } }], 1),
    land: mb.anim([{ f: 0, r: { Spine: -25, RightUpLeg: 75, RightLeg: -105, LeftUpLeg: 45, LeftLeg: -110 }, root: [0, -0.28] }, { f: 2, r: { Spine: -28 }, root: [0, -0.3], ease: Ease.Smooth }, { f: 6, r: mb.stance.r, root: mb.stance.root }], 6),
    shield: mb.anim([{ f: 0, r: { Spine: -15, RightArm: 100, RightForeArm: 120, LeftArm: 95, LeftForeArm: 125, RightUpLeg: 35, RightLeg: -50, LeftUpLeg: -10, LeftLeg: -30, Head: 15 }, root: [0, -0.1] }], 1),
    roll: mb.anim(
      [
        { f: 0, r: { Hips: 0, Spine: -40, RightUpLeg: 90, RightLeg: -120, LeftUpLeg: 90, LeftLeg: -120 }, root: [0, -0.35] },
        { f: 10, r: { Hips: -180 }, root: [0, -0.4] },
        { f: 20, r: { Hips: -360 }, root: [0, -0.35] },
        { f: 24, r: { Hips: 0, Spine: -10, RightUpLeg: 20, RightLeg: -30, LeftUpLeg: -10, LeftLeg: -20 }, root: [0, -0.05] },
      ],
      24,
    ),
    airDodge: mb.anim([{ f: 0, r: { Hips: -20, Spine: -30, RightUpLeg: 90, RightLeg: -120, LeftUpLeg: 80, LeftLeg: -120, RightArm: 60, RightForeArm: 120, LeftArm: 60, LeftForeArm: 120 } }, { f: 20, r: { Hips: 0, Spine: 0 } }], 20),
    hitstun: mb.anim([{ f: 0, r: { Spine: 25, Head: -20, RightArm: -30, LeftArm: -40, RightForeArm: 40, LeftForeArm: 40, RightUpLeg: -10, LeftUpLeg: 15 } }], 1),
    // Hit reactions by height: snap into the reaction, then partially recover over the hitstun
    hitHigh: mb.anim(
      [
        { f: 0, r: { Spine: 22, Spine2: 12, Head: -35, RightArm: -20, LeftArm: -35, RightForeArm: 50, LeftForeArm: 60, RightUpLeg: -5, LeftUpLeg: 20, LeftLeg: -25 }, root: [-0.06, -0.02], ease: Ease.Smooth },
        { f: 14, r: { Spine: 14, Spine2: 6, Head: -18 }, root: [-0.03, -0.03] },
      ],
      14,
    ),
    hitMid: mb.anim(
      [
        { f: 0, r: { Spine: -38, Spine2: -14, Head: 25, RightArm: 30, LeftArm: 40, RightForeArm: 90, LeftForeArm: 95, RightUpLeg: 25, RightLeg: -35, LeftUpLeg: -10, LeftLeg: -20 }, root: [-0.08, -0.1], ease: Ease.Smooth },
        { f: 14, r: { Spine: -25, Spine2: -8, Head: 15 }, root: [-0.04, -0.07] },
      ],
      14,
    ),
    hitLow: mb.anim(
      [
        { f: 0, r: { Spine: -15, Head: 10, RightArm: 50, LeftArm: -30, RightForeArm: 40, LeftForeArm: 30, RightUpLeg: -30, RightLeg: -5, LeftUpLeg: 35, LeftLeg: -60 }, root: [-0.02, -0.12], ease: Ease.Smooth },
        { f: 14, r: { Spine: -8, RightUpLeg: -15, LeftUpLeg: 20, LeftLeg: -40 }, root: [0, -0.08] },
      ],
      14,
    ),
    tumble: mb.anim(
      [
        { f: 0, r: { Hips: 0, Spine: 30, RightArm: 150, LeftArm: -150, RightUpLeg: 40, LeftUpLeg: -40, RightLeg: -60, LeftLeg: -30 } },
        { f: 12, r: { Hips: 180 } },
        { f: 24, r: { Hips: 360 } },
      ],
      24,
      true,
    ),
    ledge: mb.anim([{ f: 0, r: { RightArm: 175, LeftArm: 175, RightForeArm: 0, LeftForeArm: 0, Spine: 5, RightUpLeg: 10, LeftUpLeg: -10, RightLeg: -20, LeftLeg: -20 }, root: [0, -1.6] }], 1),
    getup: mb.anim(
      [
        { f: 0, r: { RightArm: 175, LeftArm: 175, RightUpLeg: 60, RightLeg: -90 }, root: [-0.45, -1.4] },
        { f: 10, r: { RightArm: 60, LeftArm: 40, RightUpLeg: 70, RightLeg: -100, LeftUpLeg: 40, LeftLeg: -90 }, root: [-0.2, -0.3] },
        { f: 20 },
      ],
      20,
    ),
    helpless: mb.anim([{ f: 0, r: { Spine: 15, Head: -10, RightArm: 160, LeftArm: 150, RightForeArm: 20, LeftForeArm: 20, RightUpLeg: 20, LeftUpLeg: -15, RightLeg: -30, LeftLeg: -30 } }], 1),
    grabbed: mb.anim([{ f: 0, r: { Spine: 20, Head: -15, RightArm: 30, LeftArm: 40, RightForeArm: 60, LeftForeArm: 60, RightUpLeg: 10, LeftUpLeg: -5 }, root: [0, 0.1] }], 1),
    dizzy: mb.anim(
      [
        { f: 0, r: { Spine: -30, Head: 20, RightArm: 10, LeftArm: 10, RightForeArm: 10, LeftForeArm: 10 } },
        { f: 30, r: { Spine: -10, Head: -20 } },
        { f: 60, r: { Spine: -30, Head: 20 } },
      ],
      60,
      true,
    ),
    ko: mb.anim([{ f: 0, r: { Hips: 90, Spine: 10, Head: 10, RightArm: 170, LeftArm: 150, RightUpLeg: 10, LeftUpLeg: -10, RightLeg: -10, LeftLeg: -10 }, root: [0, -0.8] }], 1),
    victory: mb.anim(
      [
        { f: 0, r: { RightArm: 175, RightForeArm: 10, LeftArm: 40, LeftForeArm: 110, Spine: 5, Head: -10 } },
        { f: 20, r: { RightArm: 165, RightForeArm: 30 }, root: [0, 0.02] },
        { f: 40, r: { RightArm: 175, RightForeArm: 10 } },
      ],
      40,
      true,
    ),
    charge: mb.anim(
      [
        { f: 0, r: { Spine: 8, Head: -10, RightArm: 30, LeftArm: 30, RightForeArm: 70, LeftForeArm: 70, RightHand: 0, RightUpLeg: 30, RightLeg: -45, LeftUpLeg: -25, LeftLeg: -30 }, root: [0, -0.1] },
        { f: 10, r: { Spine: 12, Head: -16, RightArm: 25, LeftArm: 25 }, root: [0, -0.12] },
        { f: 20, r: { Spine: 8, Head: -10, RightArm: 30, LeftArm: 30 }, root: [0, -0.1] },
      ],
      20,
      true,
    ),
    crouchGuard: mb.anim([{ f: 0, r: { Spine: -25, Head: 20, RightArm: 95, RightForeArm: 125, LeftArm: 90, LeftForeArm: 130, RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 50, LeftLeg: -120 }, root: [0, -0.32] }], 1),
    knockdown: mb.anim(
      [
        { f: 0, r: { Hips: 70, Spine: 10, Head: 10, RightArm: 120, LeftArm: 150, RightForeArm: 20, LeftForeArm: 30, RightUpLeg: 30, LeftUpLeg: 10, RightLeg: -40, LeftLeg: -20 }, root: [0, -0.75] },
        { f: 6, r: { Hips: 85 }, root: [0, -0.82] },
        { f: 16, r: { Hips: 80 }, root: [0, -0.8] },
        { f: 22, r: { Hips: 20, Spine: -30, RightArm: 20, LeftArm: 20, RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 50, LeftLeg: -110 }, root: [0, -0.35] },
        { f: 26 },
      ],
      26,
    ),
    ...ninja,
    beam: mb.anim([{ f: 0, r: { Spine: -10, RightArm: 90, RightForeArm: 0, LeftArm: 90, LeftForeArm: 0, RightHand: 90, LeftHand: 90, RightUpLeg: 40, RightLeg: -50, LeftUpLeg: -30, LeftLeg: -10 }, root: [0, -0.1] }], 1),
  };
  result.walk = gait(result.walk, walkPeriod);
  result.run = gait(result.run, runPeriod);
  return result;
}

/** Universal combo breaker: invulnerable shockwave that pushes the attacker away. */
export function burstMove(mb: MoveBuilder): MoveDef {
  return mb.move(
    'Burst',
    36,
    [
      { f: 0, r: { Spine: 10, RightArm: 30, LeftArm: 30, RightForeArm: 90, LeftForeArm: 90 }, root: [0, -0.05] },
      { f: 6, r: { Spine: -5, Head: -25, RightArm: 150, LeftArm: 150, RightForeArm: 10, LeftForeArm: 10, RightUpLeg: 25, LeftUpLeg: -25 }, root: [0, 0.05] },
      { f: 26 },
    ],
    [hb(6, 10, { bone: B.Spine1, at: [0, 0], r: 1.35, dmg: 1, bkb: 95, kbg: 0, angle: 45, fixedKb: true, hitstun: 26, ki: 0, sfx: Sfx.Ki })],
    { invuln: [1, 24], gravity: false, motion: [mv(1, 0, 0)], kiCost: 100 },
  );
}
