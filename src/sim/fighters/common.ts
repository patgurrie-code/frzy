// Helpers for authoring fighters as data.
import { compileAnim, KeySpec, Anim } from '../anim';
import { m } from '../fixed';
import { HitboxDef, HitKind, MoveDef, ProjectileDef, ProjKind, Sfx, FighterAnims } from '../defs';
import { B } from '../skeleton';

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

export class MoveBuilder {
  constructor(private stance: KeySpec) {}

  move(name: string, length: number, keys: KeySpec[], hitboxes: HitboxDef[], opts: MoveOpts = {}): MoveDef {
    return { name, anim: compileAnim(this.stance, keys, length), length, hitboxes, ...opts };
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
  return {
    ...base,
    name,
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
export function stateAnims(mb: MoveBuilder, heavy: boolean): FighterAnims {
  const bob = heavy ? -0.03 : -0.02;
  return {
    idle: mb.anim(
      [
        { f: 0 },
        { f: 30, r: { Spine: heavy ? -4 : -10, Head: 6 }, root: [0, -0.035 + bob] },
        { f: 60, r: { Spine: heavy ? -6 : -8, Head: 8 }, root: [0, -0.035] },
      ],
      60,
      true,
    ),
    walk: mb.anim(
      [
        { f: 0, r: { RightUpLeg: 30, RightLeg: -10, LeftUpLeg: -25, LeftLeg: -20, Spine: -6 }, root: [0, -0.04] },
        { f: 10, r: { RightUpLeg: 0, RightLeg: -40, LeftUpLeg: 0, LeftLeg: -5 }, root: [0, -0.02] },
        { f: 20, r: { RightUpLeg: -25, RightLeg: -20, LeftUpLeg: 30, LeftLeg: -10 }, root: [0, -0.04] },
        { f: 30, r: { RightUpLeg: 0, RightLeg: -5, LeftUpLeg: 0, LeftLeg: -40 }, root: [0, -0.02] },
        { f: 40, r: { RightUpLeg: 30, RightLeg: -10, LeftUpLeg: -25, LeftLeg: -20 }, root: [0, -0.04] },
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
    jumpSquat: mb.anim([{ f: 0, r: { Spine: -20, RightUpLeg: 70, RightLeg: -100, LeftUpLeg: 50, LeftLeg: -100 }, root: [0, -0.25] }], 1),
    jump: mb.anim(
      [
        { f: 0, r: { Spine: -5, RightUpLeg: 70, RightLeg: -90, LeftUpLeg: -10, LeftLeg: -30, RightArm: 140, LeftArm: 30 }, root: [0, 0] },
        { f: 14, r: { RightUpLeg: 50, RightLeg: -70, LeftUpLeg: 20, LeftLeg: -60, RightArm: 60 } },
      ],
      14,
    ),
    fall: mb.anim([{ f: 0, r: { Spine: 0, RightUpLeg: 30, RightLeg: -40, LeftUpLeg: -10, LeftLeg: -30, RightArm: 110, RightForeArm: 30, LeftArm: 70, LeftForeArm: 30 } }], 1),
    land: mb.anim([{ f: 0, r: { Spine: -25, RightUpLeg: 75, RightLeg: -105, LeftUpLeg: 45, LeftLeg: -110 }, root: [0, -0.28] }, { f: 6 }], 6),
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
    beam: mb.anim([{ f: 0, r: { Spine: -10, RightArm: 90, RightForeArm: 0, LeftArm: 90, LeftForeArm: 0, RightHand: 90, LeftHand: 90, RightUpLeg: 40, RightLeg: -50, LeftUpLeg: -30, LeftLeg: -10 }, root: [0, -0.1] }], 1),
  };
}
