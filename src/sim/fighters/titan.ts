// BRAKKA — giant grappler. Heaviest and slowest; armoured specials, a command grab, devastating throws.
import { FighterDef, MoveDef, Mv } from '../defs';
import { B, MoveBuilder, hb, grabBox, proj, mv, makeEx, stateAnims, m, Sfx } from './common';

const stance = {
  f: 0,
  r: {
    Spine: -12,
    Head: 12,
    RightArm: 45,
    RightForeArm: 60,
    LeftArm: 35,
    LeftForeArm: 70,
    RightUpLeg: 28,
    RightLeg: -30,
    LeftUpLeg: -22,
    LeftLeg: -10,
  },
  root: [0, -0.06] as [number, number],
};

const mb = new MoveBuilder(stance);
const R = B.RightHand;
const L = B.LeftHand;
const FIST: [number, number] = [0, -0.08];
const RF = B.RightFoot;
const TOE: [number, number] = [0.08, -0.02];
const ROCK = 0xc9a26b;

const moves: MoveDef[] = [];

moves[Mv.Jab] = mb.move(
  'Heavy Jab',
  24,
  [{ f: 0 }, { f: 5, r: { RightArm: 90, RightForeArm: 10, Spine: -18 } }, { f: 10, r: { RightArm: 88 } }, { f: 18 }],
  [hb(5, 7, { bone: R, at: FIST, r: 0.2, dmg: 5, bkb: 25, kbg: 45, angle: 361, hitstun: 16 })],
  { iasa: 18, chain: { from: 9, next: Mv.Jab2 } },
);
moves[Mv.Jab2] = mb.move(
  'Hook',
  26,
  [{ f: 0 }, { f: 6, r: { LeftArm: 95, LeftForeArm: 40, Spine: -20 } }, { f: 11, r: { LeftArm: 70 } }, { f: 20 }],
  [hb(6, 8, { bone: L, at: FIST, r: 0.22, dmg: 5, bkb: 25, kbg: 45, angle: 361, hitstun: 18 })],
  { iasa: 20, chain: { from: 10, next: Mv.Jab3 } },
);
moves[Mv.Jab3] = mb.move(
  'Hammer Down',
  40,
  [{ f: 0, r: { RightArm: 178, LeftArm: 178, RightForeArm: 20, LeftForeArm: 20 } }, { f: 12, r: { RightArm: 60, LeftArm: 60, RightForeArm: 0, LeftForeArm: 0, Spine: -40 }, root: [0, -0.2] }, { f: 30 }],
  [hb(12, 15, { bone: R, at: FIST, r: 0.32, dmg: 10, bkb: 60, kbg: 60, angle: 70, hitstun: 30, sfx: Sfx.Heavy })],
);

moves[Mv.FTilt] = mb.move(
  'Stone Shoulder',
  34,
  [{ f: 0 }, { f: 9, r: { Spine: -40, RightArm: 20, RightForeArm: 90 }, root: [0.2, -0.1] }, { f: 16 }, { f: 28 }],
  [hb(9, 13, { bone: B.Spine2, at: [0.15, 0], r: 0.4, dmg: 12, bkb: 40, kbg: 85, angle: 361, hitstun: 22, sfx: Sfx.Heavy })],
  { armor: [6, 12] },
);
moves[Mv.UTilt] = mb.move(
  'Overhead Clap',
  34,
  [{ f: 0 }, { f: 8, r: { RightArm: 178, LeftArm: 178, RightForeArm: 0, LeftForeArm: 0 } }, { f: 16, r: { RightArm: 170, LeftArm: 170 } }, { f: 28 }],
  [hb(8, 13, { bone: R, at: FIST, r: 0.34, dmg: 11, bkb: 35, kbg: 98, angle: 90, hitstun: 22 })],
);
moves[Mv.DTilt] = mb.move(
  'Knee Crush',
  30,
  [{ f: 0, root: [0, -0.2] }, { f: 8, r: { RightUpLeg: 70, RightLeg: -5, Spine: -10 }, root: [0, -0.2] }, { f: 22 }],
  [hb(8, 11, { bone: RF, at: TOE, r: 0.22, dmg: 9, bkb: 45, kbg: 45, angle: 80, hitstun: 24 })],
);

moves[Mv.FSmash] = mb.move(
  'Meteor Haymaker',
  60,
  [
    { f: 0 },
    { f: 14, r: { RightArm: -80, RightForeArm: 90, Spine: 20 }, root: [-0.1, -0.05] },
    { f: 22, r: { RightArm: 92, RightForeArm: 0, Spine: -35 }, root: [0.3, -0.15] },
    { f: 30, root: [0.3, -0.15] },
    { f: 50 },
  ],
  [hb(22, 25, { bone: R, at: FIST, r: 0.36, dmg: 23, bkb: 38, kbg: 100, angle: 361, sfx: Sfx.Heavy })],
  { charge: 12, armor: [10, 22] },
);
moves[Mv.USmash] = mb.move(
  'Sky Breaker',
  56,
  [{ f: 0, root: [0, -0.2] }, { f: 12, r: { RightArm: 20, LeftArm: 20 }, root: [0, -0.3] }, { f: 18, r: { RightArm: 178, LeftArm: 178, RightForeArm: 0, LeftForeArm: 0 }, root: [0, 0.05] }, { f: 46 }],
  [hb(18, 23, { bone: R, at: FIST, r: 0.4, dmg: 20, bkb: 36, kbg: 100, angle: 88, sfx: Sfx.Heavy })],
  { charge: 11 },
);
moves[Mv.DSmash] = mb.move(
  'Earthquake',
  58,
  [{ f: 0 }, { f: 14, r: { RightUpLeg: 120, RightLeg: -40 }, root: [0, 0.05] }, { f: 20, r: { RightUpLeg: 20, RightLeg: -10, Spine: -20 }, root: [0, -0.1] }, { f: 46 }],
  [
    hb(20, 24, { bone: B.Hips, at: [1.0, -0.8], r: 0.5, dmg: 18, bkb: 34, kbg: 95, angle: 60, sfx: Sfx.Heavy }),
    hb(20, 24, { bone: B.Hips, at: [-1.0, -0.8], r: 0.5, dmg: 18, bkb: 34, kbg: 95, angle: 120 }),
  ],
  { charge: 12 },
);

moves[Mv.NAir] = mb.move(
  'Body Press',
  40,
  [{ f: 0, r: { RightArm: 120, LeftArm: 120 } }, { f: 8, r: { RightArm: 90, LeftArm: 90, Spine: -20 } }, { f: 18 }, { f: 30 }],
  [hb(8, 16, { bone: B.Spine1, at: [0, 0], r: 0.6, dmg: 12, bkb: 30, kbg: 88, angle: 361 })],
  { landLag: 12 },
);
moves[Mv.FAir] = mb.move(
  'Axe Fist',
  44,
  [{ f: 0, r: { RightArm: 178, LeftArm: 178 } }, { f: 14, r: { RightArm: 40, LeftArm: 40, Spine: -30 } }, { f: 32 }],
  [hb(14, 17, { bone: R, at: FIST, r: 0.32, dmg: 16, bkb: 30, kbg: 92, angle: 290, sfx: Sfx.Heavy })],
  { landLag: 16 },
);
moves[Mv.BAir] = mb.move(
  'Back Hammer',
  40,
  [{ f: 0 }, { f: 10, r: { RightArm: -100, RightForeArm: 0, Spine: 15 } }, { f: 16 }, { f: 30 }],
  [hb(10, 14, { bone: R, at: FIST, r: 0.3, dmg: 16, bkb: 30, kbg: 100, angle: 145, sfx: Sfx.Heavy })],
  { landLag: 14 },
);
moves[Mv.UAir] = mb.move(
  'Headbutt',
  36,
  [{ f: 0, r: { Head: -30 } }, { f: 9, r: { Head: 40, Spine: 20 } }, { f: 14 }, { f: 26 }],
  [hb(9, 13, { bone: B.Head, at: [0, 0.15], r: 0.3, dmg: 13, bkb: 30, kbg: 100, angle: 88 })],
  { landLag: 10 },
);
moves[Mv.DAir] = mb.move(
  'Crater Drop',
  48,
  [{ f: 0, r: { RightUpLeg: 90, LeftUpLeg: 90, RightLeg: -110, LeftLeg: -110 } }, { f: 12, r: { RightUpLeg: 0, LeftUpLeg: 0, RightLeg: 0, LeftLeg: 0 } }, { f: 44 }],
  [hb(12, 44, { bone: B.Hips, at: [0, -0.9], r: 0.4, dmg: 15, bkb: 35, kbg: 85, angle: 275, sfx: Sfx.Heavy })],
  { landLag: 24, motion: [mv(1, undefined, 0.04), mv(11, 0, -0.36)], gravity: false, endOnLand: true },
);

moves[Mv.NSpec] = mb.move(
  'Boulder Toss',
  52,
  [{ f: 0, r: { RightArm: 178, LeftArm: 178, RightForeArm: 30, LeftForeArm: 30 } }, { f: 16, r: { RightArm: 178, LeftArm: 178 } }, { f: 22, r: { RightArm: 70, LeftArm: 70, RightForeArm: 0, LeftForeArm: 0, Spine: -25 } }, { f: 40 }],
  [],
  { projectile: proj({ f: 22, bone: R, at: [0, -0.2], speed: 0.14, vy: 0.02, r: 0.4, life: 80, dmg: 13, bkb: 50, kbg: 70, angle: 45, color: ROCK }) },
);
moves[Mv.SSpec] = mb.move(
  'Avalanche Grab',
  42,
  [{ f: 0, r: { Spine: -30 }, root: [0, -0.1] }, { f: 8, r: { RightArm: 90, LeftArm: 90, RightForeArm: 10, LeftForeArm: 10, Spine: -35 } }, { f: 20, r: { RightArm: 90, LeftArm: 90 } }, { f: 34 }],
  [grabBox(8, 16, R, [0, -0.05], 0.32)],
  { motion: [mv(6, 0.2, 0), mv(17, 0.02, 0)], grabThrow: Mv.CmdThrow },
);
moves[Mv.USpec] = mb.move(
  'Rising Bull',
  50,
  [{ f: 0, root: [0, -0.2] }, { f: 8, r: { RightArm: 178, RightForeArm: 0, Spine: 10 } }, { f: 30, r: { RightArm: 170 } }, { f: 40 }],
  [hb(8, 26, { bone: R, at: FIST, r: 0.32, dmg: 12, bkb: 50, kbg: 70, angle: 85 })],
  { motion: [mv(7, 0.05, 0.3), mv(26, 0.03, 0.04)], gravity: false, helpless: true, ledgeFrom: 12, armor: [1, 14] },
);
moves[Mv.DSpec] = mb.move(
  'Seismic Stomp',
  50,
  [{ f: 0 }, { f: 14, r: { RightUpLeg: 120, RightLeg: -40 }, root: [0, 0.05] }, { f: 20, r: { RightUpLeg: 20, RightLeg: -10 }, root: [0, -0.1] }, { f: 40 }],
  [hb(20, 24, { bone: B.Hips, at: [0, -0.8], r: 1.1, dmg: 12, bkb: 70, kbg: 40, angle: 85, sfx: Sfx.Heavy })],
  { armor: [6, 22] },
);
moves[Mv.NSpecEx] = makeEx(moves[Mv.NSpec], 'Boulder Barrage', {
  projectile: proj({ f: 22, bone: R, at: [0, -0.2], speed: 0.2, vy: 0.02, r: 0.55, life: 80, dmg: 9, bkb: 45, kbg: 60, angle: 45, rehit: 10, hits: 2, color: ROCK }),
});
moves[Mv.SSpecEx] = makeEx(moves[Mv.SSpec], 'Avalanche Grab EX', { motion: [mv(4, 0.3, 0), mv(17, 0.02, 0)], invuln: [1, 8] });
moves[Mv.USpecEx] = makeEx(moves[Mv.USpec], 'Rising Bull EX', { motion: [mv(7, 0.05, 0.38), mv(26, 0.03, 0.04)] });
moves[Mv.DSpecEx] = makeEx(moves[Mv.DSpec], 'Seismic Stomp EX', { armor: [1, 24] });

moves[Mv.Grab] = mb.move(
  'Grab',
  38,
  [{ f: 0 }, { f: 8, r: { RightArm: 90, LeftArm: 90, RightForeArm: 10, LeftForeArm: 10, Spine: -15 } }, { f: 13, r: { RightArm: 90, LeftArm: 90 } }, { f: 32 }],
  [grabBox(9, 12, R, [0, -0.05], 0.28)],
);
moves[Mv.Pummel] = mb.move('Bear Hug', 18, [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 6, r: { RightArm: 70, LeftArm: 70 } }, { f: 14 }], []);
moves[Mv.FThrow] = mb.move(
  'Gorilla Press',
  44,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 12, r: { RightArm: 178, LeftArm: 178 } }, { f: 18, r: { RightArm: 100, LeftArm: 100 } }, { f: 36 }],
  [],
  { throwRelease: { f: 18, dmg: 13, bkb: 65, kbg: 70, angle: 40, ki: 18 } },
);
moves[Mv.BThrow] = mb.move(
  'Suplex',
  46,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 14, r: { Spine: 60, RightArm: 178, LeftArm: 178 }, root: [0, -0.2] }, { f: 36 }],
  [],
  { throwRelease: { f: 16, dmg: 15, bkb: 65, kbg: 72, angle: 135, ki: 20 } },
);
moves[Mv.UThrow] = mb.move(
  'Skyward Heave',
  42,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 14, r: { RightArm: 178, LeftArm: 178 }, root: [0, 0.05] }, { f: 34 }],
  [],
  { throwRelease: { f: 14, dmg: 12, bkb: 75, kbg: 70, angle: 90, ki: 18 } },
);
moves[Mv.DThrow] = mb.move(
  'Body Slam',
  42,
  [{ f: 0, r: { RightArm: 90, LeftArm: 90 } }, { f: 16, r: { RightArm: 20, LeftArm: 20, Spine: -60 }, root: [0, -0.4] }, { f: 34 }],
  [],
  { throwRelease: { f: 17, dmg: 11, bkb: 70, kbg: 50, angle: 80, ki: 16 } },
);
moves[Mv.CmdThrow] = mb.move(
  'Mountain Driver',
  54,
  [
    { f: 0, r: { RightArm: 90, LeftArm: 90 } },
    { f: 14, r: { RightArm: 178, LeftArm: 178 }, root: [0, 0.4] },
    { f: 24, r: { RightArm: 40, LeftArm: 40, Spine: -50 }, root: [0, -0.4] },
    { f: 44 },
  ],
  [],
  { throwRelease: { f: 24, dmg: 18, bkb: 70, kbg: 75, angle: 80, ki: 25 } },
);

moves[Mv.Super] = mb.move(
  'Titanfall',
  92,
  [
    { f: 0, r: { RightArm: 178, LeftArm: 178 }, root: [0, -0.2] },
    { f: 20, r: { RightArm: 178, LeftArm: 178 }, root: [0, 0.2] },
    { f: 40, r: { RightArm: 40, LeftArm: 40, RightForeArm: 0, LeftForeArm: 0, Spine: -50 }, root: [0, -0.3] },
    { f: 78 },
  ],
  [hb(38, 46, { bone: B.Hips, at: [0, -0.6], r: 1.4, dmg: 32, bkb: 80, kbg: 85, angle: 70, sfx: Sfx.Heavy })],
  { kiCost: 300, cinematic: true, invuln: [1, 38], motion: [mv(4, 0.12, 0.36), mv(30, 0.12, -0.5), mv(40, 0, 0)], endOnLand: false },
);
moves[Mv.DashAttack] = mb.move(
  'Bull Rush',
  42,
  [{ f: 0, r: { Spine: -45, RightArm: 20, RightForeArm: 120 }, root: [0, -0.1] }, { f: 20 }, { f: 34 }],
  [hb(6, 16, { bone: B.Spine2, at: [0.1, 0], r: 0.42, dmg: 13, bkb: 45, kbg: 72, angle: 45 })],
  { slide: true, armor: [3, 12] },
);
moves[Mv.LedgeAttack] = mb.move(
  'Ledge Slam',
  36,
  [{ f: 0, root: [-0.45, -1.2] }, { f: 12, r: { RightArm: 60, RightForeArm: 0 }, root: [0, -0.3] }, { f: 28 }],
  [hb(12, 15, { bone: R, at: FIST, r: 0.3, dmg: 10, bkb: 50, kbg: 40, angle: 40 })],
  { invuln: [1, 12] },
);

export const BRAKKA: FighterDef = {
  id: 'brakka',
  name: 'BRAKKA',
  title: 'The Mountain Fist',
  description: 'Giant grappler. Armoured attacks, a command grab, and throws that end stocks.',
  superName: 'Titanfall',
  stats: {
    weight: 135,
    walk: m(0.04),
    run: m(0.09),
    dash: m(0.1),
    dashFrames: 14,
    traction: m(0.011),
    jumpSquat: 6,
    jumpV: m(0.24),
    hopV: m(0.15),
    airJumpV: m(0.22),
    airJumps: 1,
    airSpeed: m(0.07),
    airAccel: m(0.005),
    airFriction: m(0.003),
    gravity: m(0.013),
    fallSpeed: m(0.235),
    fastFall: m(0.34),
    scale: 1220,
    shieldSize: m(1.0),
    power: 90,
  },
  anims: {
    ...stateAnims(mb, true, { idlePeriod: 48, bob: 0.04 }),
    victory: mb.anim([
      { f: 0, r: { RightArm: 95, RightForeArm: 120, LeftArm: 95, LeftForeArm: 120, RightHand: 0, Spine: 10, Head: -15, RightUpLeg: 25, LeftUpLeg: -25, RightLeg: -10, LeftLeg: -10 }, root: [0, -0.04] },
      { f: 15, r: { RightForeArm: 140, LeftForeArm: 140, Spine: 14 }, root: [0, -0.06] },
      { f: 30, r: { RightForeArm: 120, LeftForeArm: 120, Spine: 10 }, root: [0, -0.04] },
    ], 30, true),
  },
  moves,
  look: { body: 0x6b4a32, trim: 0x2b2b2b, skin: 0x8a5a3c, accent: 0xff8a2b, hair: 0x1a1a1a, build: 'giant', hairStyle: 'mohawk' },
};
