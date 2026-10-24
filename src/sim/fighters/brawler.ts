// KESTREL — fast rushdown brawler. Light, quick frame data, combo-oriented, short-range ki.
import { FighterDef, MoveDef, Mv } from '../defs';
import { B, MoveBuilder, hb, grabBox, proj, mv, makeEx, stateAnims, m, ProjKind, Sfx } from './common';

const stance = {
  f: 0,
  r: {
    Spine: -8,
    Spine2: -4,
    Head: 8,
    RightArm: 55,
    RightForeArm: 100,
    LeftArm: 25,
    LeftForeArm: 115,
    RightUpLeg: 22,
    RightLeg: -30,
    RightFoot: 8,
    LeftUpLeg: -14,
    LeftLeg: -4,
  },
  root: [0, -0.035] as [number, number],
};

const mb = new MoveBuilder(stance);
const R = B.RightHand;
const L = B.LeftHand;
const RF = B.RightFoot;
const FIST: [number, number] = [0, -0.06];
const TOE: [number, number] = [0.08, -0.02];
const KI = 0x4fd8ff;

const moves: MoveDef[] = [];

moves[Mv.Jab] = mb.move(
  'Snap Jab',
  18,
  [
    { f: 0 },
    { f: 2, r: { RightArm: 88, RightForeArm: 5, Spine: -14 } },
    { f: 6, r: { RightArm: 88, RightForeArm: 5 } },
    { f: 12, r: { RightArm: 55, RightForeArm: 100, Spine: -8 } },
  ],
  [hb(3, 5, { bone: R, at: FIST, r: 0.13, dmg: 3, bkb: 18, kbg: 40, angle: 361, hitstun: 14 })],
  { iasa: 12, chain: { from: 6, next: Mv.Jab2 } },
);

moves[Mv.Jab2] = mb.move(
  'Cross',
  20,
  [
    { f: 0, r: { RightArm: 70, RightForeArm: 60 } },
    { f: 3, r: { LeftArm: 90, LeftForeArm: 5, Spine: -18 }, root: [0.05, -0.04] },
    { f: 7, r: { LeftArm: 88 } },
    { f: 14 },
  ],
  [hb(3, 5, { bone: L, at: FIST, r: 0.14, dmg: 3, bkb: 20, kbg: 40, angle: 361, hitstun: 16 })],
  { iasa: 14, chain: { from: 7, next: Mv.Jab3 } },
);

moves[Mv.Jab3] = mb.move(
  'Spinning Heel',
  32,
  [
    { f: 0, r: { Hips: 0, RightUpLeg: 70, RightLeg: -100 } },
    { f: 4, r: { Hips: -90, RightUpLeg: 95, RightLeg: -10, Spine: 10 } },
    { f: 8, r: { Hips: -180, RightUpLeg: 92, RightLeg: -5 } },
    { f: 14, r: { Hips: -360, RightUpLeg: 30, RightLeg: -30 } },
    { f: 24, r: { Hips: 0 } },
  ],
  [hb(6, 9, { bone: RF, at: TOE, r: 0.2, dmg: 6, bkb: 50, kbg: 70, angle: 40, hitstun: 26 })],
);

moves[Mv.FTilt] = mb.move(
  'Hook Kick',
  26,
  [
    { f: 0 },
    { f: 4, r: { RightUpLeg: 95, RightLeg: -90, Spine: 10, LeftUpLeg: -20 } },
    { f: 7, r: { RightUpLeg: 92, RightLeg: -5, RightFoot: 0 } },
    { f: 11, r: { RightUpLeg: 90, RightLeg: -10 } },
    { f: 20 },
  ],
  [hb(6, 9, { bone: RF, at: TOE, r: 0.16, dmg: 8, bkb: 30, kbg: 85, angle: 38, hitstun: 18 })],
);

moves[Mv.UTilt] = mb.move(
  'Rising Palm',
  24,
  [
    { f: 0 },
    { f: 3, r: { RightArm: 70, RightForeArm: 100 }, root: [0, -0.12] },
    { f: 6, r: { RightArm: 175, RightForeArm: 10, Spine: 5 }, root: [0, 0.02] },
    { f: 11, r: { RightArm: 170, RightForeArm: 20 } },
    { f: 18 },
  ],
  [hb(5, 9, { bone: R, at: FIST, r: 0.17, dmg: 6, bkb: 30, kbg: 110, angle: 88, hitstun: 20 })],
);

moves[Mv.DTilt] = mb.move(
  'Sweep',
  24,
  [
    { f: 0, r: { Spine: -25, RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 50, LeftLeg: -120 }, root: [0, -0.32] },
    { f: 4, r: { RightUpLeg: 85, RightLeg: -10, RightFoot: 0 }, root: [0, -0.42] },
    { f: 9, r: { RightUpLeg: 80, RightLeg: -15 } },
    { f: 18, r: { RightUpLeg: 80, RightLeg: -110 }, root: [0, -0.32] },
  ],
  [hb(5, 8, { bone: RF, at: TOE, r: 0.15, dmg: 6, bkb: 35, kbg: 50, angle: 75, hitstun: 22 })],
);

moves[Mv.FSmash] = mb.move(
  'Comet Fist',
  46,
  [
    { f: 0 },
    { f: 8, r: { RightArm: -50, RightForeArm: 110, Spine: 10, LeftArm: 80, LeftForeArm: 40 }, root: [0, -0.06] },
    { f: 15, r: { RightArm: 92, RightForeArm: 0, Spine: -25, LeftArm: -20 }, root: [0.15, -0.08] },
    { f: 20, r: { RightArm: 90, RightForeArm: 0 }, root: [0.15, -0.08] },
    { f: 36 },
  ],
  [
    hb(15, 17, { bone: R, at: FIST, r: 0.2, dmg: 15, bkb: 34, kbg: 98, angle: 361, sfx: Sfx.Heavy }),
    hb(15, 17, { bone: B.RightForeArm, at: [0, -0.1], r: 0.15, dmg: 13, bkb: 30, kbg: 95, angle: 361 }),
  ],
  { charge: 7, motion: [mv(15, 0.05), mv(18, 0)] },
);

moves[Mv.USmash] = mb.move(
  'Skyward Flip',
  44,
  [
    { f: 0, root: [0, -0.15] },
    { f: 8, r: { Spine: -30, RightUpLeg: 70, RightLeg: -100 }, root: [0, -0.2] },
    { f: 12, r: { Hips: 120, Spine: 10, RightUpLeg: 150, RightLeg: 0, LeftUpLeg: 20 }, root: [0, 0.2] },
    { f: 18, r: { Hips: 300, RightUpLeg: 120 }, root: [0, 0.25] },
    { f: 24, r: { Hips: 360, RightUpLeg: 22, RightLeg: -30 }, root: [0, -0.03] },
    { f: 34 },
  ],
  [hb(12, 17, { bone: RF, at: TOE, r: 0.2, dmg: 14, bkb: 32, kbg: 100, angle: 85, sfx: Sfx.Heavy })],
  { charge: 6 },
);

moves[Mv.DSmash] = mb.move(
  'Twin Sweep',
  44,
  [
    { f: 0, root: [0, -0.3] },
    { f: 6, r: { Spine: -40, RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 70, LeftLeg: -120 }, root: [0, -0.42] },
    { f: 10, r: { Hips: 0, RightUpLeg: 90, RightLeg: -5 }, root: [0, -0.48] },
    { f: 16, r: { Hips: -180, RightUpLeg: 90, RightLeg: -5 }, root: [0, -0.48] },
    { f: 22, r: { Hips: -360 } },
    { f: 34, r: { Hips: 0 }, root: [0, -0.035] },
  ],
  [
    hb(10, 12, { bone: RF, at: TOE, r: 0.2, dmg: 13, bkb: 30, kbg: 95, angle: 30 }),
    hb(15, 18, { bone: RF, at: TOE, r: 0.2, dmg: 12, bkb: 30, kbg: 92, angle: 150, group: 1 }),
  ],
  { charge: 5 },
);

// Aerials
moves[Mv.NAir] = mb.move(
  'Spin Kick',
  32,
  [
    { f: 0, r: { RightUpLeg: 80, RightLeg: -110, LeftUpLeg: 80, LeftLeg: -110 } },
    { f: 4, r: { Hips: 0, RightUpLeg: 90, RightLeg: 0, LeftUpLeg: -60, LeftLeg: 0 } },
    { f: 10, r: { Hips: -180 } },
    { f: 16, r: { Hips: -360 } },
    { f: 24, r: { Hips: 0, RightUpLeg: 30, RightLeg: -40, LeftUpLeg: -10, LeftLeg: -30 } },
  ],
  [
    hb(4, 7, { bone: RF, at: TOE, r: 0.18, dmg: 9, bkb: 25, kbg: 90, angle: 361 }),
    hb(8, 18, { bone: RF, at: TOE, r: 0.16, dmg: 5, bkb: 10, kbg: 90, angle: 361 }),
  ],
  { landLag: 6 },
);

moves[Mv.FAir] = mb.move(
  'Axe Kick',
  36,
  [
    { f: 0 },
    { f: 6, r: { RightUpLeg: 160, RightLeg: 0, Spine: 15, LeftUpLeg: -20 } },
    { f: 12, r: { RightUpLeg: 40, RightLeg: -5, Spine: -20 } },
    { f: 22, r: { RightUpLeg: 30, RightLeg: -40 } },
  ],
  [
    hb(9, 10, { bone: RF, at: TOE, r: 0.2, dmg: 13, bkb: 30, kbg: 80, angle: 285, sfx: Sfx.Heavy }),
    hb(11, 13, { bone: RF, at: TOE, r: 0.16, dmg: 8, bkb: 25, kbg: 80, angle: 45 }),
  ],
  { landLag: 11 },
);

moves[Mv.BAir] = mb.move(
  'Back Mule',
  30,
  [
    { f: 0, r: { RightUpLeg: 80, RightLeg: -120, Spine: -20 } },
    { f: 6, r: { RightUpLeg: -95, RightLeg: -5, Spine: -40, Head: 30 } },
    { f: 12, r: { RightUpLeg: -90, RightLeg: -10 } },
    { f: 22, r: { RightUpLeg: 30, RightLeg: -40, Spine: -8 } },
  ],
  [hb(6, 9, { bone: RF, at: [0.02, -0.05], r: 0.18, dmg: 12, bkb: 25, kbg: 100, angle: 145 })],
  { landLag: 8 },
);

moves[Mv.UAir] = mb.move(
  'Scissor Up',
  28,
  [
    { f: 0, r: { RightUpLeg: 60, RightLeg: -90, Spine: 20 } },
    { f: 5, r: { RightUpLeg: 170, RightLeg: 0, Spine: 40, Hips: 30 } },
    { f: 10, r: { RightUpLeg: 200, Hips: 50 } },
    { f: 20, r: { RightUpLeg: 30, RightLeg: -40, Hips: 0, Spine: -8 } },
  ],
  [hb(5, 9, { bone: RF, at: TOE, r: 0.19, dmg: 8, bkb: 28, kbg: 105, angle: 80 })],
  { landLag: 6 },
);

moves[Mv.DAir] = mb.move(
  'Meteor Stomp',
  38,
  [
    { f: 0, r: { RightUpLeg: 100, RightLeg: -130, LeftUpLeg: 90, LeftLeg: -120 } },
    { f: 10, r: { RightUpLeg: -5, RightLeg: 0, LeftUpLeg: 60, LeftLeg: -110, Spine: -10 } },
    { f: 16, r: { RightUpLeg: -5, RightLeg: 0 } },
    { f: 28, r: { RightUpLeg: 30, RightLeg: -40, LeftUpLeg: -10, LeftLeg: -30 } },
  ],
  [hb(11, 14, { bone: RF, at: [0.04, -0.05], r: 0.2, dmg: 14, bkb: 25, kbg: 90, angle: 270, sfx: Sfx.Heavy })],
  { landLag: 16, motion: [mv(9, undefined, 0.02)] },
);

// Specials
moves[Mv.NSpec] = mb.move(
  'Ki Dart',
  34,
  [
    { f: 0, r: { RightArm: 40, RightForeArm: 130, RightHand: 30 } },
    { f: 10, r: { RightArm: 90, RightForeArm: 0, RightHand: 90, Spine: -15 } },
    { f: 24, r: { RightArm: 85, RightForeArm: 5 } },
  ],
  [],
  {
    projectile: proj({ f: 11, bone: R, at: [0, -0.1], speed: 0.22, r: 0.15, life: 55, dmg: 5, bkb: 25, kbg: 30, angle: 361, color: KI }),
    gravity: false,
    motion: [mv(1, 0, 0)],
  },
);

moves[Mv.SSpec] = mb.move(
  'Blitz Elbow',
  40,
  [
    { f: 0, r: { RightArm: 60, RightForeArm: 140, Spine: -20 } },
    { f: 6, r: { RightArm: 100, RightForeArm: 160, Spine: -35 }, root: [0.05, -0.1] },
    { f: 20, r: { RightArm: 100, RightForeArm: 160 } },
    { f: 30 },
  ],
  [hb(7, 18, { bone: B.RightForeArm, at: [0, 0], r: 0.22, dmg: 10, bkb: 40, kbg: 70, angle: 40 })],
  { motion: [mv(6, 0.32, 0), mv(19, 0.04, 0)], gravity: false, ledgeFrom: 8 },
);

moves[Mv.USpec] = mb.move(
  'Rising Comet',
  42,
  [
    { f: 0, r: { RightArm: 40, RightForeArm: 110 }, root: [0, -0.15] },
    { f: 5, r: { RightArm: 175, RightForeArm: 0, Spine: 5, RightUpLeg: 40, RightLeg: -80 }, root: [0, 0.05] },
    { f: 22, r: { RightArm: 170, Hips: 0 } },
    { f: 30, r: { RightArm: 140, RightForeArm: 20 } },
  ],
  [
    hb(5, 7, { bone: R, at: FIST, r: 0.2, dmg: 7, bkb: 50, kbg: 40, angle: 85, fixedKb: false }),
    hb(8, 20, { bone: R, at: FIST, r: 0.18, dmg: 4, bkb: 35, kbg: 70, angle: 80, group: 1 }),
  ],
  { motion: [mv(4, 0.04, 0.36), mv(20, 0.04, 0.06)], gravity: false, helpless: true, ledgeFrom: 10 },
);

moves[Mv.DSpec] = mb.move(
  'Counter Stance',
  44,
  [
    { f: 0, r: { RightArm: 110, RightForeArm: 120, LeftArm: 30, LeftForeArm: 120, Spine: -5 } },
    { f: 30, r: { RightArm: 110, RightForeArm: 120 } },
    { f: 34, r: { RightArm: 90, RightForeArm: 0, Spine: -20 } },
    { f: 40 },
  ],
  // Simple version: brief intangible parry window followed by a palm strike.
  [hb(33, 36, { bone: R, at: FIST, r: 0.24, dmg: 11, bkb: 50, kbg: 75, angle: 40 })],
  { counter: { from: 4, to: 24, jump: 31 } },
);

// EX specials (1 ki bar)
moves[Mv.NSpecEx] = makeEx(moves[Mv.NSpec], 'Ki Lance', {
  projectile: proj({
    kind: ProjKind.Beam,
    f: 11,
    bone: R,
    at: [0, -0.1],
    speed: 0.5,
    r: 0.22,
    life: 40,
    maxLen: 9,
    dmg: 2,
    bkb: 20,
    kbg: 40,
    angle: 30,
    rehit: 5,
    hits: 6,
    color: KI,
  }),
  length: 52,
});
moves[Mv.SSpecEx] = makeEx(moves[Mv.SSpec], 'Blitz Elbow EX', {
  motion: [mv(6, 0.42, 0), mv(19, 0.04, 0)],
  invuln: [1, 8],
});
moves[Mv.USpecEx] = makeEx(moves[Mv.USpec], 'Rising Comet EX', {
  motion: [mv(4, 0.05, 0.44), mv(20, 0.04, 0.06)],
  invuln: [1, 10],
});
moves[Mv.DSpecEx] = makeEx(moves[Mv.DSpec], 'Counter Stance EX', { counter: { from: 2, to: 30, jump: 31 }, armor: undefined });

// Grab & throws
moves[Mv.Grab] = mb.move(
  'Grab',
  30,
  [
    { f: 0 },
    { f: 5, r: { RightArm: 90, RightForeArm: 10, LeftArm: 90, LeftForeArm: 10, Spine: -15 } },
    { f: 10, r: { RightArm: 90, LeftArm: 90 } },
    { f: 24 },
  ],
  [grabBox(6, 8, R, [0, -0.05], 0.2)],
);
moves[Mv.Pummel] = mb.move(
  'Knee',
  14,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 4, r: { LeftUpLeg: 90, LeftLeg: -110 } }, { f: 10, r: { LeftUpLeg: -14 } }],
  [],
);
moves[Mv.FThrow] = mb.move(
  'Palm Launch',
  30,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 8, r: { RightArm: 90, RightForeArm: 0, RightHand: 90, Spine: -25 } }, { f: 22 }],
  [],
  { throwRelease: { f: 9, dmg: 8, bkb: 55, kbg: 60, angle: 40, ki: 12 } },
);
moves[Mv.BThrow] = mb.move(
  'Hip Toss',
  34,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 10, r: { Spine: 40, RightArm: 160, LeftArm: 160 } }, { f: 26 }],
  [],
  { throwRelease: { f: 12, dmg: 10, bkb: 60, kbg: 65, angle: 135, ki: 14 } },
);
moves[Mv.UThrow] = mb.move(
  'Sky Toss',
  32,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 10, r: { RightArm: 175, LeftArm: 175 }, root: [0, 0.05] }, { f: 24 }],
  [],
  { throwRelease: { f: 11, dmg: 7, bkb: 70, kbg: 55, angle: 90, ki: 12 } },
);
moves[Mv.DThrow] = mb.move(
  'Floor Slam',
  32,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 10, r: { RightArm: 10, LeftArm: 10, Spine: -45 }, root: [0, -0.2] }, { f: 24 }],
  [],
  { throwRelease: { f: 11, dmg: 6, bkb: 60, kbg: 40, angle: 78, ki: 10 } },
);

moves[Mv.Super] = mb.move(
  'Hundred Comet Barrage',
  80,
  [
    { f: 0, r: { RightArm: 60, RightForeArm: 120, LeftArm: 60, LeftForeArm: 120, Spine: -30 }, root: [0, -0.1] },
    { f: 8, r: { RightArm: 90, RightForeArm: 0, LeftArm: 40, LeftForeArm: 120 } },
    { f: 12, r: { RightArm: 40, RightForeArm: 120, LeftArm: 90, LeftForeArm: 0 } },
    { f: 16, r: { RightArm: 90, RightForeArm: 0, LeftArm: 40, LeftForeArm: 120 } },
    { f: 20, r: { RightArm: 40, RightForeArm: 120, LeftArm: 90, LeftForeArm: 0 } },
    { f: 24, r: { RightArm: 90, RightForeArm: 0, LeftArm: 40, LeftForeArm: 120 } },
    { f: 28, r: { RightArm: 40, RightForeArm: 120, LeftArm: 90, LeftForeArm: 0 } },
    { f: 32, r: { RightArm: 90, RightForeArm: 0, LeftArm: 40, LeftForeArm: 120 } },
    { f: 36, r: { RightArm: 40, RightForeArm: 120, LeftArm: 90, LeftForeArm: 0 } },
    { f: 44, r: { RightArm: 175, RightForeArm: 0, Spine: 10 }, root: [0, 0.1] },
    { f: 64 },
  ],
  [
    hb(6, 7, { bone: R, at: FIST, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 0, fixedKb: true, hitstun: 20 }),
    hb(14, 15, { bone: L, at: FIST, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 1, fixedKb: true, hitstun: 20 }),
    hb(22, 23, { bone: R, at: FIST, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 2, fixedKb: true, hitstun: 20 }),
    hb(30, 31, { bone: L, at: FIST, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 3, fixedKb: true, hitstun: 20 }),
    hb(36, 37, { bone: R, at: FIST, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 4, fixedKb: true, hitstun: 20 }),
    hb(44, 47, { bone: R, at: FIST, r: 0.4, dmg: 14, bkb: 80, kbg: 90, angle: 70, group: 5, sfx: Sfx.Heavy }),
  ],
  {
    kiCost: 300,
    cinematic: true,
    invuln: [1, 12],
    motion: [mv(1, 0.38, 0), mv(8, 0.04, 0), mv(40, 0, 0)],
    gravity: false,
  },
);

moves[Mv.DashAttack] = mb.move(
  'Sliding Knee',
  30,
  [
    { f: 0, r: { Spine: -30, RightUpLeg: 100, RightLeg: -120, LeftUpLeg: -30 }, root: [0, -0.1] },
    { f: 14, r: { RightUpLeg: 100 } },
    { f: 24 },
  ],
  [hb(5, 12, { bone: B.RightLeg, at: [0, 0], r: 0.2, dmg: 9, bkb: 40, kbg: 65, angle: 60 })],
  { slide: true },
);
moves[Mv.LedgeAttack] = mb.move(
  'Ledge Sweep',
  30,
  [{ f: 0, root: [-0.45, -1.2] }, { f: 8, r: { RightUpLeg: 90, RightLeg: -5 }, root: [0, -0.4] }, { f: 22 }],
  [hb(9, 12, { bone: RF, at: TOE, r: 0.2, dmg: 8, bkb: 50, kbg: 40, angle: 40 })],
  { invuln: [1, 10] },
);

moves[Mv.CmdThrow] = moves[Mv.FThrow];

export const KESTREL: FighterDef = {
  id: 'kestrel',
  name: 'KESTREL',
  title: 'The Blitz Wing',
  description: 'Fast brawler. Quick strikes, strong combos, light frame.',
  superName: 'Hundred Comet Barrage',
  stats: {
    weight: 84,
    walk: m(0.062),
    run: m(0.135),
    dash: m(0.15),
    dashFrames: 10,
    traction: m(0.008),
    jumpSquat: 3,
    jumpV: m(0.275),
    hopV: m(0.175),
    airJumpV: m(0.25),
    airJumps: 1,
    airSpeed: m(0.095),
    airAccel: m(0.008),
    airFriction: m(0.003),
    gravity: m(0.0118),
    fallSpeed: m(0.2),
    fastFall: m(0.3),
    scale: 960,
    shieldSize: m(0.75),
  },
  anims: stateAnims(mb, false),
  moves,
  look: { body: 0xe8553a, trim: 0x23243a, skin: 0xd9a27a, accent: 0x4fd8ff, hair: 0x1b1b24, build: 'lean' },
};
