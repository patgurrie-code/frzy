// TORVAL — heavy ki-blaster. Slow and heavy, long range ki attacks, huge knockback.
import { FighterDef, MoveDef, Mv } from '../defs';
import { B, MoveBuilder, hb, grabBox, proj, mv, makeEx, stateAnims, m, ProjKind, Sfx } from './common';

const stance = {
  f: 0,
  r: {
    Spine: -4,
    Head: 4,
    RightArm: 35,
    RightForeArm: 70,
    RightHand: 30,
    LeftArm: 15,
    LeftForeArm: 60,
    RightUpLeg: 18,
    RightLeg: -22,
    LeftUpLeg: -16,
    LeftLeg: -6,
  },
  root: [0, -0.03] as [number, number],
};

const mb = new MoveBuilder(stance);
const R = B.RightHand;
const PALM: [number, number] = [0, -0.07];
const KI = 0xffc23d;
const SUPER_KI = 0xff7a2b;

const moves: MoveDef[] = [];

moves[Mv.Jab] = mb.move(
  'Hammer Jab',
  24,
  [
    { f: 0 },
    { f: 4, r: { RightArm: 92, RightForeArm: 8, Spine: -12 } },
    { f: 9, r: { RightArm: 90, RightForeArm: 10 } },
    { f: 16 },
  ],
  [hb(5, 7, { bone: R, at: PALM, r: 0.17, dmg: 5, bkb: 25, kbg: 45, angle: 361, hitstun: 16 })],
  { iasa: 16, chain: { from: 8, next: Mv.Jab2 } },
);

moves[Mv.Jab2] = mb.move(
  'Backhand',
  24,
  [
    { f: 0, r: { RightArm: 80, RightForeArm: 30 } },
    { f: 5, r: { LeftArm: 92, LeftForeArm: 10, Spine: -14 } },
    { f: 10, r: { LeftArm: 90 } },
    { f: 18 },
  ],
  [hb(5, 7, { bone: B.LeftHand, at: PALM, r: 0.18, dmg: 4, bkb: 25, kbg: 40, angle: 361, hitstun: 18 })],
  { iasa: 18, chain: { from: 9, next: Mv.Jab3 } },
);

moves[Mv.Jab3] = mb.move(
  'Twin Palm Burst',
  36,
  [
    { f: 0, r: { RightArm: 20, LeftArm: 20, RightForeArm: 110, LeftForeArm: 110 } },
    { f: 8, r: { RightArm: 92, LeftArm: 90, RightForeArm: 0, LeftForeArm: 0, RightHand: 90, LeftHand: 90, Spine: -20 }, root: [0.1, -0.06] },
    { f: 14, r: { RightArm: 90 } },
    { f: 28 },
  ],
  [hb(8, 11, { bone: R, at: [0, -0.15], r: 0.3, dmg: 8, bkb: 55, kbg: 70, angle: 40, hitstun: 28, sfx: Sfx.Ki })],
);

moves[Mv.FTilt] = mb.move(
  'Charged Palm',
  32,
  [
    { f: 0 },
    { f: 6, r: { RightArm: 20, RightForeArm: 120, Spine: 8 } },
    { f: 10, r: { RightArm: 90, RightForeArm: 0, RightHand: 90, Spine: -18 }, root: [0.08, -0.05] },
    { f: 15, r: { RightArm: 90, RightForeArm: 0 } },
    { f: 26 },
  ],
  [hb(10, 13, { bone: R, at: [0, -0.1], r: 0.24, dmg: 11, bkb: 35, kbg: 90, angle: 361, hitstun: 20, sfx: Sfx.Ki })],
);

moves[Mv.UTilt] = mb.move(
  'Ki Crown',
  32,
  [
    { f: 0 },
    { f: 6, r: { RightArm: 175, LeftArm: 175, RightForeArm: 20, LeftForeArm: 20 }, root: [0, 0.02] },
    { f: 16, r: { RightArm: 170, LeftArm: 170 } },
    { f: 26 },
  ],
  [
    hb(7, 13, { bone: B.Head, at: [0, 0.55], r: 0.38, dmg: 10, bkb: 35, kbg: 95, angle: 90, hitstun: 22, sfx: Sfx.Ki }),
  ],
);

moves[Mv.DTilt] = mb.move(
  'Ground Pulse',
  30,
  [
    { f: 0, r: { Spine: -30, RightUpLeg: 70, RightLeg: -100, LeftUpLeg: 50, LeftLeg: -110 }, root: [0, -0.28] },
    { f: 8, r: { RightArm: 70, RightForeArm: 10, RightHand: 90 }, root: [0, -0.32] },
    { f: 22 },
  ],
  [hb(8, 12, { bone: R, at: [0.1, -0.1], r: 0.24, dmg: 8, bkb: 45, kbg: 45, angle: 80, hitstun: 22, sfx: Sfx.Ki })],
);

moves[Mv.FSmash] = mb.move(
  'Nova Palm',
  56,
  [
    { f: 0 },
    { f: 12, r: { RightArm: -60, RightForeArm: 100, LeftArm: -50, LeftForeArm: 100, Spine: 15 }, root: [-0.08, -0.06] },
    { f: 20, r: { RightArm: 90, RightForeArm: 0, RightHand: 90, LeftArm: 85, LeftForeArm: 0, LeftHand: 90, Spine: -20 }, root: [0.15, -0.1] },
    { f: 28, r: { RightArm: 88 } },
    { f: 46 },
  ],
  [
    hb(20, 23, { bone: R, at: [0, -0.18], r: 0.36, dmg: 20, bkb: 36, kbg: 100, angle: 361, sfx: Sfx.Ki }),
    hb(20, 23, { bone: B.RightForeArm, at: [0, -0.1], r: 0.2, dmg: 17, bkb: 34, kbg: 98, angle: 361 }),
  ],
  { charge: 11 },
);

moves[Mv.USmash] = mb.move(
  'Pillar of Light',
  54,
  [
    { f: 0, root: [0, -0.15] },
    { f: 10, r: { RightArm: 60, LeftArm: 60, RightForeArm: 100, LeftForeArm: 100 }, root: [0, -0.2] },
    { f: 16, r: { RightArm: 178, LeftArm: 178, RightForeArm: 0, LeftForeArm: 0, RightHand: 0 }, root: [0, 0.03] },
    { f: 28, r: { RightArm: 175, LeftArm: 175 } },
    { f: 44 },
  ],
  [
    hb(16, 22, { bone: R, at: [0, -0.15], r: 0.38, dmg: 18, bkb: 34, kbg: 100, angle: 90, sfx: Sfx.Ki }),
    hb(16, 22, { bone: B.Head, at: [0, 0.3], r: 0.32, dmg: 16, bkb: 32, kbg: 98, angle: 90 }),
  ],
  { charge: 9 },
);

moves[Mv.DSmash] = mb.move(
  'Quake Burst',
  54,
  [
    { f: 0 },
    { f: 12, r: { RightArm: 170, LeftArm: 170, Spine: 10 }, root: [0, 0.03] },
    { f: 18, r: { RightArm: 40, LeftArm: 40, RightForeArm: 10, LeftForeArm: 10, Spine: -45 }, root: [0, -0.3] },
    { f: 30, r: { Spine: -40 } },
    { f: 44 },
  ],
  [
    hb(18, 21, { bone: B.Hips, at: [0.9, -0.75], r: 0.45, dmg: 17, bkb: 32, kbg: 96, angle: 35, sfx: Sfx.Ki }),
    hb(18, 21, { bone: B.Hips, at: [-0.9, -0.75], r: 0.45, dmg: 17, bkb: 32, kbg: 96, angle: 145 }),
  ],
  { charge: 10 },
);

// Aerials
moves[Mv.NAir] = mb.move(
  'Ki Flare',
  40,
  [
    { f: 0, r: { RightArm: 40, LeftArm: 40, RightForeArm: 120, LeftForeArm: 120, RightUpLeg: 70, RightLeg: -100, LeftUpLeg: 60, LeftLeg: -100 } },
    { f: 7, r: { RightArm: 120, LeftArm: 120, RightForeArm: 0, LeftForeArm: 0, RightUpLeg: 10, LeftUpLeg: -10, RightLeg: -20, LeftLeg: -20 } },
    { f: 16, r: { RightArm: 115, LeftArm: 115 } },
    { f: 30 },
  ],
  [hb(7, 12, { bone: B.Spine1, at: [0, 0], r: 0.6, dmg: 11, bkb: 30, kbg: 90, angle: 361, sfx: Sfx.Ki })],
  { landLag: 10 },
);

moves[Mv.FAir] = mb.move(
  'Hammerfall',
  42,
  [
    { f: 0, r: { RightArm: 175, LeftArm: 175, RightForeArm: 20, LeftForeArm: 20, Spine: 10 } },
    { f: 10, r: { RightArm: 175, LeftArm: 175 } },
    { f: 15, r: { RightArm: 50, LeftArm: 50, RightForeArm: 0, LeftForeArm: 0, Spine: -30 } },
    { f: 30 },
  ],
  [
    hb(13, 16, { bone: R, at: PALM, r: 0.3, dmg: 15, bkb: 30, kbg: 90, angle: 300, sfx: Sfx.Heavy }),
  ],
  { landLag: 14 },
);

moves[Mv.BAir] = mb.move(
  'Rear Cannon',
  38,
  [
    { f: 0, r: { Spine: 10, Head: 20 } },
    { f: 8, r: { RightArm: -100, RightForeArm: 0, RightHand: -90, Spine: 15 } },
    { f: 16, r: { RightArm: -100 } },
    { f: 28 },
  ],
  [hb(9, 13, { bone: R, at: [0, -0.12], r: 0.28, dmg: 15, bkb: 30, kbg: 100, angle: 150, sfx: Sfx.Ki })],
  { landLag: 12 },
);

moves[Mv.UAir] = mb.move(
  'Overhead Clap',
  36,
  [
    { f: 0, r: { RightArm: 110, LeftArm: 110, RightForeArm: 60, LeftForeArm: 60 } },
    { f: 8, r: { RightArm: 178, LeftArm: 178, RightForeArm: 0, LeftForeArm: 0 } },
    { f: 14, r: { RightArm: 175, LeftArm: 175 } },
    { f: 26 },
  ],
  [hb(8, 12, { bone: R, at: [0, -0.05], r: 0.32, dmg: 12, bkb: 30, kbg: 100, angle: 88, sfx: Sfx.Heavy })],
  { landLag: 10 },
);

moves[Mv.DAir] = mb.move(
  'Gravity Drop',
  44,
  [
    { f: 0, r: { RightArm: 150, LeftArm: 150, RightUpLeg: 70, LeftUpLeg: 70, RightLeg: -100, LeftLeg: -100 } },
    { f: 14, r: { RightArm: 10, LeftArm: 10, RightForeArm: 0, LeftForeArm: 0, RightHand: 0, RightUpLeg: 0, RightLeg: 0, LeftUpLeg: 0, LeftLeg: 0 } },
    { f: 34, r: { RightArm: 10 } },
  ],
  [hb(14, 34, { bone: B.Hips, at: [0, -0.9], r: 0.32, dmg: 14, bkb: 30, kbg: 85, angle: 275, sfx: Sfx.Heavy })],
  { landLag: 22, motion: [mv(1, undefined, 0.05), mv(13, 0, -0.32)], gravity: false, endOnLand: true },
);

// Specials
moves[Mv.NSpec] = mb.move(
  'Storm Beam',
  56,
  [
    { f: 0, r: { RightArm: -30, LeftArm: -30, RightForeArm: 110, LeftForeArm: 110, Spine: 15 } },
    { f: 14, r: { RightArm: -40, LeftArm: -40 } },
    { f: 18, r: { RightArm: 90, LeftArm: 90, RightForeArm: 0, LeftForeArm: 0, RightHand: 90, LeftHand: 90, Spine: -10 } },
    { f: 44, r: { RightArm: 90, LeftArm: 90 } },
    { f: 52 },
  ],
  [],
  {
    projectile: proj({
      kind: ProjKind.Beam,
      f: 18,
      bone: R,
      at: [0, -0.1],
      speed: 0.42,
      r: 0.26,
      life: 34,
      maxLen: 10,
      dmg: 2,
      bkb: 25,
      kbg: 40,
      angle: 35,
      ki: 4,
      rehit: 5,
      hits: 5,
      color: KI,
    }),
    gravity: false,
    motion: [mv(1, 0, 0)],
  },
);

moves[Mv.SSpec] = mb.move(
  'Orb Volley',
  44,
  [
    { f: 0, r: { RightArm: 40, RightForeArm: 130 } },
    { f: 12, r: { RightArm: 95, RightForeArm: 0, RightHand: 90, Spine: -10 } },
    { f: 34 },
  ],
  [],
  {
    projectile: proj({ f: 13, bone: R, at: [0, -0.12], speed: 0.12, r: 0.32, life: 110, dmg: 10, bkb: 40, kbg: 60, angle: 45, color: KI }),
  },
);

moves[Mv.USpec] = mb.move(
  'Ki Rocket',
  52,
  [
    { f: 0, r: { RightArm: 20, LeftArm: 20, RightHand: -90, LeftHand: -90 }, root: [0, -0.15] },
    { f: 12, r: { RightArm: 10, LeftArm: 10, RightUpLeg: 0, LeftUpLeg: 0, RightLeg: 0, LeftLeg: 0, Spine: 0 } },
    { f: 40, r: { RightArm: 10 } },
  ],
  [hb(12, 34, { bone: B.Hips, at: [0, -0.6], r: 0.35, dmg: 3, bkb: 35, kbg: 30, angle: 270, group: 0, sfx: Sfx.Ki })],
  { motion: [mv(1, 0, 0.02), mv(12, 0.04, 0.33), mv(34, 0.03, 0.08)], gravity: false, helpless: true, ledgeFrom: 14 },
);

moves[Mv.DSpec] = mb.move(
  'Aegis Burst',
  48,
  [
    { f: 0, r: { RightArm: 120, LeftArm: 120, RightForeArm: 120, LeftForeArm: 120, Spine: -10 }, root: [0, -0.1] },
    { f: 12, r: { RightArm: 160, LeftArm: 160, RightForeArm: 10, LeftForeArm: 10, Spine: 10 }, root: [0, 0] },
    { f: 22, r: { RightArm: 150 } },
    { f: 40 },
  ],
  [hb(12, 18, { bone: B.Spine1, at: [0, 0], r: 0.9, dmg: 12, bkb: 60, kbg: 60, angle: 50, sfx: Sfx.Ki })],
  { armor: [4, 18], gravity: false, motion: [mv(1, 0, 0)] },
);

moves[Mv.NSpecEx] = makeEx(moves[Mv.NSpec], 'Storm Beam EX', {
  projectile: proj({
    kind: ProjKind.Beam,
    f: 16,
    bone: R,
    at: [0, -0.1],
    speed: 0.55,
    r: 0.38,
    life: 44,
    maxLen: 14,
    dmg: 3,
    bkb: 35,
    kbg: 50,
    angle: 35,
    rehit: 5,
    hits: 7,
    color: KI,
  }),
});
moves[Mv.SSpecEx] = makeEx(moves[Mv.SSpec], 'Orb Volley EX', {
  projectile: proj({ f: 13, bone: R, at: [0, -0.12], speed: 0.18, r: 0.45, life: 110, dmg: 6, bkb: 30, kbg: 50, angle: 45, rehit: 10, hits: 3, color: KI }),
});
moves[Mv.USpecEx] = makeEx(moves[Mv.USpec], 'Ki Rocket EX', {
  motion: [mv(1, 0, 0.02), mv(8, 0.05, 0.42), mv(30, 0.03, 0.08)],
  invuln: [1, 14],
});
moves[Mv.DSpecEx] = makeEx(moves[Mv.DSpec], 'Aegis Burst EX', { invuln: [1, 18] });

// Grab & throws
moves[Mv.Grab] = mb.move(
  'Grab',
  36,
  [
    { f: 0 },
    { f: 7, r: { RightArm: 90, RightForeArm: 10, LeftArm: 90, LeftForeArm: 10, Spine: -15 } },
    { f: 12, r: { RightArm: 90, LeftArm: 90 } },
    { f: 30 },
  ],
  [grabBox(8, 10, R, [0, -0.05], 0.24)],
);
moves[Mv.Pummel] = mb.move('Ki Squeeze', 18, [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 6, r: { RightArm: 80, LeftArm: 80 } }, { f: 14 }], []);
moves[Mv.FThrow] = mb.move(
  'Shove Blast',
  36,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 12, r: { RightArm: 92, LeftArm: 92, RightForeArm: 0, LeftForeArm: 0, RightHand: 90, Spine: -20 } }, { f: 28 }],
  [],
  { throwRelease: { f: 13, dmg: 11, bkb: 60, kbg: 65, angle: 35, ki: 18 } },
);
moves[Mv.BThrow] = mb.move(
  'Giant Swing',
  44,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 10, r: { Hips: -180 } }, { f: 20, r: { Hips: -360 } }, { f: 36, r: { Hips: 0 } }],
  [],
  { throwRelease: { f: 21, dmg: 13, bkb: 60, kbg: 72, angle: 140, ki: 20 } },
);
moves[Mv.UThrow] = mb.move(
  'Geyser',
  40,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 12, r: { RightArm: 178, LeftArm: 178, RightForeArm: 0, LeftForeArm: 0 } }, { f: 30 }],
  [],
  { throwRelease: { f: 13, dmg: 12, bkb: 70, kbg: 70, angle: 90, ki: 18 } },
);
moves[Mv.DThrow] = mb.move(
  'Crater Press',
  40,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 14, r: { RightArm: 20, LeftArm: 20, Spine: -50 }, root: [0, -0.3] }, { f: 30 }],
  [],
  { throwRelease: { f: 15, dmg: 9, bkb: 65, kbg: 50, angle: 80, ki: 14 } },
);

moves[Mv.Super] = mb.move(
  'Cataclysm Cannon',
  110,
  [
    { f: 0, r: { RightArm: -40, LeftArm: -40, RightForeArm: 120, LeftForeArm: 120, Spine: 20 }, root: [-0.05, -0.1] },
    { f: 20, r: { RightArm: -50, LeftArm: -50 } },
    { f: 26, r: { RightArm: 90, LeftArm: 90, RightForeArm: 0, LeftForeArm: 0, RightHand: 90, LeftHand: 90, Spine: -15 }, root: [0.05, -0.12] },
    { f: 96, r: { RightArm: 90, LeftArm: 90 } },
    { f: 106 },
  ],
  [],
  {
    kiCost: 300,
    cinematic: true,
    invuln: [1, 26],
    gravity: false,
    motion: [mv(1, 0, 0)],
    projectile: proj({
      kind: ProjKind.Beam,
      f: 26,
      bone: R,
      at: [0, -0.1],
      speed: 0.7,
      r: 0.7,
      life: 70,
      maxLen: 26,
      dmg: 5,
      bkb: 45,
      kbg: 60,
      angle: 32,
      ki: 0,
      rehit: 6,
      hits: 9,
      color: SUPER_KI,
    }),
  },
);

moves[Mv.DashAttack] = mb.move(
  'Shoulder Ram',
  38,
  [{ f: 0, r: { Spine: -35, RightArm: 20, RightForeArm: 120 }, root: [0, -0.1] }, { f: 18 }, { f: 30 }],
  [hb(6, 14, { bone: B.Spine2, at: [0.1, 0], r: 0.35, dmg: 12, bkb: 45, kbg: 70, angle: 45 })],
  { slide: true },
);
moves[Mv.LedgeAttack] = mb.move(
  'Ledge Palm',
  34,
  [{ f: 0, root: [-0.45, -1.2] }, { f: 10, r: { RightArm: 90, RightForeArm: 0, RightHand: 90 }, root: [0, -0.3] }, { f: 26 }],
  [hb(11, 14, { bone: R, at: PALM, r: 0.28, dmg: 9, bkb: 50, kbg: 40, angle: 40 })],
  { invuln: [1, 12] },
);

moves[Mv.CmdThrow] = moves[Mv.FThrow];

export const TORVAL: FighterDef = {
  id: 'torval',
  name: 'TORVAL',
  title: 'The Storm Engine',
  description: 'Heavy ki-blaster. Long-range beams, huge power, slow but hard to launch.',
  superName: 'Cataclysm Cannon',
  stats: {
    weight: 112,
    walk: m(0.045),
    run: m(0.098),
    dash: m(0.11),
    dashFrames: 13,
    traction: m(0.01),
    jumpSquat: 5,
    jumpV: m(0.25),
    hopV: m(0.16),
    airJumpV: m(0.235),
    airJumps: 1,
    airSpeed: m(0.075),
    airAccel: m(0.006),
    airFriction: m(0.003),
    gravity: m(0.0125),
    fallSpeed: m(0.22),
    fastFall: m(0.32),
    scale: 1120,
    shieldSize: m(0.9),
    power: 96,
  },
  anims: {
    ...stateAnims(mb, true, { idlePeriod: 90, bob: 0.015 }),
    victory: mb.anim([
      { f: 0, r: { RightArm: 45, RightForeArm: 95, RightHand: 0, LeftArm: 48, LeftForeArm: 100, LeftHand: 60, Spine: 4, Head: -8, RightUpLeg: 8, LeftUpLeg: -8, RightLeg: -5, LeftLeg: -5 }, root: [0, 0] },
      { f: 60, r: { Head: -14 }, root: [0, 0.01] },
      { f: 120, r: { Head: -8 }, root: [0, 0] },
    ], 120, true),
  },
  moves,
  look: { body: 0x3b6fd9, trim: 0xe8e2d0, skin: 0x9b6a4b, accent: 0xffc23d, hair: 0xf2f2f2, build: 'bulky' },
};
