// VESHA — shadow ninja. Lightest and fastest; teleports, twin blades, a mirror counter. Dies early.
import { FighterDef, MoveDef, Mv } from '../defs';
import { B, MoveBuilder, hb, grabBox, proj, mv, makeEx, stateAnims, m, Sfx } from './common';

const stance = {
  f: 0,
  r: {
    Spine: -18,
    Head: 14,
    RightArm: 40,
    RightForeArm: 90,
    RightHand: -60, // reverse grip: blade points back
    LeftArm: 80,
    LeftForeArm: 60,
    LeftHand: -60,
    RightUpLeg: 40,
    RightLeg: -60,
    LeftUpLeg: -20,
    LeftLeg: -30,
  },
  root: [0, -0.12] as [number, number],
};

const mb = new MoveBuilder(stance);
const R = B.RightHand;
const L = B.LeftHand;
const BLADE: [number, number] = [0.02, -0.38];
const RF = B.RightFoot;
const TOE: [number, number] = [0.08, -0.02];
const SHADOW = 0xb36bff;

const slash = (arm: 'Right' | 'Left', a: number) => ({ [`${arm}Arm`]: a, [`${arm}ForeArm`]: 0, [`${arm}Hand`]: 0 });

const moves: MoveDef[] = [];

moves[Mv.Jab] = mb.move(
  'Quick Cut',
  14,
  [{ f: 0 }, { f: 2, r: slash('Right', 95) }, { f: 5, r: slash('Right', 60) }, { f: 10 }],
  [hb(2, 4, { bone: R, at: BLADE, r: 0.14, dmg: 2, bkb: 15, kbg: 35, angle: 361, hitstun: 12 })],
  { iasa: 10, chain: { from: 5, next: Mv.Jab2 } },
);
moves[Mv.Jab2] = mb.move(
  'Cross Cut',
  16,
  [{ f: 0 }, { f: 2, r: slash('Left', 100) }, { f: 5, r: slash('Left', 50) }, { f: 12 }],
  [hb(2, 4, { bone: L, at: BLADE, r: 0.14, dmg: 2, bkb: 15, kbg: 35, angle: 361, hitstun: 14 })],
  { iasa: 12, chain: { from: 5, next: Mv.Jab3 } },
);
moves[Mv.Jab3] = mb.move(
  'Shadow Flurry',
  34,
  [
    { f: 0, r: slash('Right', 100) },
    { f: 4, r: { ...slash('Right', 40), ...slash('Left', 100) } },
    { f: 8, r: { ...slash('Right', 100), ...slash('Left', 40) } },
    { f: 12, r: { ...slash('Right', 40), ...slash('Left', 100) } },
    { f: 18, r: { ...slash('Right', 140), Spine: 0 } },
    { f: 28 },
  ],
  [
    hb(2, 3, { bone: R, at: BLADE, r: 0.18, dmg: 1, bkb: 10, kbg: 0, angle: 0, fixedKb: true, hitstun: 10 }),
    hb(6, 7, { bone: L, at: BLADE, r: 0.18, dmg: 1, bkb: 10, kbg: 0, angle: 0, group: 1, fixedKb: true, hitstun: 10 }),
    hb(10, 11, { bone: R, at: BLADE, r: 0.18, dmg: 1, bkb: 10, kbg: 0, angle: 0, group: 2, fixedKb: true, hitstun: 10 }),
    hb(14, 15, { bone: L, at: BLADE, r: 0.18, dmg: 1, bkb: 10, kbg: 0, angle: 0, group: 3, fixedKb: true, hitstun: 12 }),
    hb(18, 20, { bone: R, at: BLADE, r: 0.22, dmg: 4, bkb: 50, kbg: 60, angle: 50, group: 4, hitstun: 24 }),
  ],
);

moves[Mv.FTilt] = mb.move(
  'Crescent Kick',
  22,
  [{ f: 0 }, { f: 4, r: { RightUpLeg: 110, RightLeg: -10, Spine: 10 } }, { f: 8, r: { RightUpLeg: 100 } }, { f: 16 }],
  [hb(4, 7, { bone: RF, at: TOE, r: 0.16, dmg: 7, bkb: 28, kbg: 80, angle: 40, hitstun: 18 })],
);
moves[Mv.UTilt] = mb.move(
  'Rising Edge',
  22,
  [{ f: 0 }, { f: 4, r: slash('Right', 175) }, { f: 9, r: slash('Right', 160) }, { f: 16 }],
  [hb(4, 8, { bone: R, at: BLADE, r: 0.18, dmg: 6, bkb: 30, kbg: 105, angle: 90, hitstun: 20 })],
);
moves[Mv.DTilt] = mb.move(
  'Low Slice',
  18,
  [
    { f: 0, r: { Spine: -40, RightUpLeg: 90, RightLeg: -120, LeftUpLeg: 60, LeftLeg: -120 }, root: [0, -0.4] },
    { f: 3, r: slash('Right', 60) },
    { f: 8, r: slash('Right', 40) },
    { f: 14 },
  ],
  [hb(3, 6, { bone: R, at: BLADE, r: 0.16, dmg: 5, bkb: 30, kbg: 40, angle: 70, hitstun: 18 })],
);

moves[Mv.FSmash] = mb.move(
  'Twin Fang',
  44,
  [
    { f: 0 },
    { f: 8, r: { ...slash('Right', -40), ...slash('Left', -40), Spine: 10 } },
    { f: 13, r: { ...slash('Right', 95), ...slash('Left', 90), Spine: -30 }, root: [0.3, -0.12] },
    { f: 20, root: [0.3, -0.12] },
    { f: 34 },
  ],
  [
    hb(13, 15, { bone: R, at: BLADE, r: 0.2, dmg: 13, bkb: 30, kbg: 98, angle: 361, sfx: Sfx.Heavy }),
    hb(13, 15, { bone: L, at: BLADE, r: 0.2, dmg: 13, bkb: 30, kbg: 98, angle: 361 }),
  ],
  { charge: 6 },
);
moves[Mv.USmash] = mb.move(
  'Moon Flip',
  40,
  [
    { f: 0, root: [0, -0.2] },
    { f: 8, r: { Hips: 140, RightUpLeg: 150, RightLeg: 0, ...slash('Right', 170) }, root: [0, 0.3] },
    { f: 14, r: { Hips: 320 }, root: [0, 0.35] },
    { f: 20, r: { Hips: 360 } },
    { f: 32 },
  ],
  [hb(8, 13, { bone: RF, at: TOE, r: 0.2, dmg: 12, bkb: 32, kbg: 100, angle: 88, sfx: Sfx.Heavy })],
  { charge: 5 },
);
moves[Mv.DSmash] = mb.move(
  'Shadow Split',
  40,
  [
    { f: 0, root: [0, -0.4] },
    { f: 8, r: { ...slash('Right', 90), ...slash('Left', -90), Spine: -20, RightUpLeg: 90, RightLeg: 0, LeftUpLeg: -90, LeftLeg: 0 }, root: [0, -0.7] },
    { f: 16 },
    { f: 32, root: [0, -0.12] },
  ],
  [
    hb(8, 11, { bone: R, at: BLADE, r: 0.2, dmg: 12, bkb: 30, kbg: 92, angle: 30 }),
    hb(8, 11, { bone: L, at: BLADE, r: 0.2, dmg: 12, bkb: 30, kbg: 92, angle: 150 }),
  ],
  { charge: 5 },
);

moves[Mv.NAir] = mb.move(
  'Blade Wheel',
  28,
  [
    { f: 0, r: { ...slash('Right', 90), ...slash('Left', -90) } },
    { f: 4, r: { Hips: -120 } },
    { f: 10, r: { Hips: -360 } },
    { f: 20, r: { Hips: 0 } },
  ],
  [hb(3, 12, { bone: R, at: BLADE, r: 0.2, dmg: 7, bkb: 20, kbg: 90, angle: 361 }), hb(3, 12, { bone: L, at: BLADE, r: 0.2, dmg: 7, bkb: 20, kbg: 90, angle: 361 })],
  { landLag: 5 },
);
moves[Mv.FAir] = mb.move(
  'Falling Fang',
  28,
  [{ f: 0, r: slash('Right', 170) }, { f: 5, r: slash('Right', 30) }, { f: 10, r: slash('Right', 20) }, { f: 20 }],
  [hb(5, 8, { bone: R, at: BLADE, r: 0.2, dmg: 9, bkb: 25, kbg: 85, angle: 60 })],
  { landLag: 7 },
);
moves[Mv.BAir] = mb.move(
  'Reverse Grip',
  26,
  [{ f: 0 }, { f: 5, r: { RightArm: -80, RightForeArm: 0, RightHand: 0, Spine: 15 } }, { f: 10, r: { RightArm: -80 } }, { f: 18 }],
  [hb(5, 8, { bone: R, at: BLADE, r: 0.2, dmg: 10, bkb: 25, kbg: 100, angle: 145 })],
  { landLag: 7 },
);
moves[Mv.UAir] = mb.move(
  'Updraft Slash',
  26,
  [{ f: 0, r: slash('Right', 60) }, { f: 4, r: slash('Right', 178) }, { f: 9, r: slash('Right', 170) }, { f: 18 }],
  [hb(4, 8, { bone: R, at: BLADE, r: 0.2, dmg: 7, bkb: 28, kbg: 105, angle: 85 })],
  { landLag: 5 },
);
moves[Mv.DAir] = mb.move(
  'Dive Kick',
  40,
  [{ f: 0, r: { RightUpLeg: 90, RightLeg: -120 } }, { f: 8, r: { RightUpLeg: 30, RightLeg: 0, Spine: -20, Hips: -40 } }, { f: 36 }],
  [hb(8, 36, { bone: RF, at: TOE, r: 0.18, dmg: 8, bkb: 35, kbg: 60, angle: 50 })],
  { landLag: 8, motion: [mv(8, 0.16, -0.3)], gravity: false, endOnLand: true },
);

moves[Mv.NSpec] = mb.move(
  'Shadow Kunai',
  26,
  [{ f: 0, r: slash('Right', 40) }, { f: 6, r: { ...slash('Right', 95), Spine: -25 } }, { f: 18 }],
  [],
  { projectile: proj({ f: 7, bone: R, at: [0, -0.1], speed: 0.38, r: 0.1, life: 30, dmg: 3, bkb: 15, kbg: 30, angle: 361, color: SHADOW }) },
);
moves[Mv.SSpec] = mb.move(
  'Phase Step',
  36,
  [{ f: 0, r: { Spine: -40 }, root: [0, -0.2] }, { f: 6, r: { ...slash('Right', 95), Spine: -45 } }, { f: 14, r: slash('Right', 40) }, { f: 28 }],
  [hb(6, 12, { bone: R, at: BLADE, r: 0.3, dmg: 9, bkb: 40, kbg: 60, angle: 45 })],
  { motion: [mv(5, 0.6, 0), mv(11, 0.02, 0)], gravity: false, invuln: [4, 11], ledgeFrom: 12, vanish: [4, 10] },
);
moves[Mv.USpec] = mb.move(
  'Shade Ascent',
  40,
  [{ f: 0, root: [0, -0.2] }, { f: 8, r: { ...slash('Right', 178), ...slash('Left', 178) } }, { f: 28, r: slash('Right', 140) }],
  [hb(14, 18, { bone: R, at: BLADE, r: 0.3, dmg: 8, bkb: 45, kbg: 60, angle: 80 })],
  { motion: [mv(6, 0, 0.7), mv(12, 0.04, 0.06)], gravity: false, invuln: [5, 12], helpless: true, ledgeFrom: 12, vanish: [6, 12] },
);
moves[Mv.DSpec] = mb.move(
  'Mirror Veil',
  42,
  [{ f: 0, r: { ...slash('Right', 110), ...slash('Left', 110), Spine: -5 } }, { f: 26, r: slash('Right', 110) }, { f: 30, r: { ...slash('Right', 95), Spine: -30 }, root: [0.25, -0.1] }, { f: 38 }],
  [hb(30, 33, { bone: R, at: BLADE, r: 0.3, dmg: 10, bkb: 55, kbg: 70, angle: 40 })],
  { counter: { from: 3, to: 22, jump: 28 } },
);
moves[Mv.NSpecEx] = makeEx(moves[Mv.NSpec], 'Kunai Fan', {
  projectile: proj({ f: 7, bone: R, at: [0, -0.1], speed: 0.45, r: 0.16, life: 34, dmg: 3, bkb: 15, kbg: 30, angle: 361, rehit: 4, hits: 4, color: SHADOW }),
});
moves[Mv.SSpecEx] = makeEx(moves[Mv.SSpec], 'Phase Step EX', { motion: [mv(5, 0.8, 0), mv(11, 0.02, 0)], invuln: [1, 12] });
moves[Mv.USpecEx] = makeEx(moves[Mv.USpec], 'Shade Ascent EX', { motion: [mv(6, 0, 0.85), mv(12, 0.04, 0.06)], invuln: [1, 14] });
moves[Mv.DSpecEx] = makeEx(moves[Mv.DSpec], 'Mirror Veil EX', { counter: { from: 2, to: 26, jump: 28 }, armor: undefined });

moves[Mv.Grab] = mb.move(
  'Grab',
  26,
  [{ f: 0 }, { f: 4, r: { LeftArm: 90, LeftForeArm: 10, LeftHand: 0, Spine: -20 } }, { f: 9, r: { LeftArm: 90 } }, { f: 20 }],
  [grabBox(5, 7, L, [0, -0.05], 0.18)],
);
moves[Mv.Pummel] = mb.move('Pommel Jab', 12, [{ f: 0, r: { LeftArm: 90 } }, { f: 4, r: slash('Right', 80) }, { f: 8 }], []);
moves[Mv.FThrow] = mb.move(
  'Kick Away',
  26,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 7, r: { RightUpLeg: 100, RightLeg: -5 } }, { f: 18 }],
  [],
  { throwRelease: { f: 8, dmg: 6, bkb: 55, kbg: 55, angle: 40, ki: 10 } },
);
moves[Mv.BThrow] = mb.move(
  'Shadow Swap',
  30,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 10, r: { Hips: -180 } }, { f: 22, r: { Hips: 0 } }],
  [],
  { throwRelease: { f: 11, dmg: 8, bkb: 60, kbg: 70, angle: 140, ki: 12 } },
);
moves[Mv.UThrow] = mb.move(
  'Updraft Toss',
  30,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 9, r: slash('Left', 178) }, { f: 22 }],
  [],
  { throwRelease: { f: 10, dmg: 6, bkb: 70, kbg: 55, angle: 92, ki: 10 } },
);
moves[Mv.DThrow] = mb.move(
  'Floor Cut',
  30,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 10, r: { ...slash('Right', 30), Spine: -45 }, root: [0, -0.3] }, { f: 22 }],
  [],
  { throwRelease: { f: 11, dmg: 5, bkb: 60, kbg: 40, angle: 80, ki: 10 } },
);
moves[Mv.CmdThrow] = moves[Mv.FThrow];

moves[Mv.Super] = mb.move(
  'Eclipse: Thousand Cuts',
  90,
  [
    { f: 0, r: { ...slash('Right', 95), ...slash('Left', 95), Spine: -40 }, root: [0, -0.2] },
    { f: 10, r: { ...slash('Right', 160), ...slash('Left', 20) } },
    { f: 16, r: { ...slash('Right', 20), ...slash('Left', 160) } },
    { f: 22, r: { ...slash('Right', 160), ...slash('Left', 20) } },
    { f: 28, r: { ...slash('Right', 20), ...slash('Left', 160) } },
    { f: 34, r: { ...slash('Right', 160), ...slash('Left', 20) } },
    { f: 48, r: { ...slash('Right', 95), ...slash('Left', 95), Spine: -10 } },
    { f: 76 },
  ],
  [
    hb(4, 6, { bone: R, at: BLADE, r: 0.4, dmg: 3, bkb: 25, kbg: 0, angle: 0, group: 0, fixedKb: true, hitstun: 30 }),
    hb(12, 13, { bone: L, at: BLADE, r: 0.45, dmg: 2, bkb: 5, kbg: 0, angle: 90, group: 1, fixedKb: true, hitstun: 30 }),
    hb(18, 19, { bone: R, at: BLADE, r: 0.45, dmg: 2, bkb: 5, kbg: 0, angle: 90, group: 2, fixedKb: true, hitstun: 30 }),
    hb(24, 25, { bone: L, at: BLADE, r: 0.45, dmg: 2, bkb: 5, kbg: 0, angle: 90, group: 3, fixedKb: true, hitstun: 30 }),
    hb(30, 31, { bone: R, at: BLADE, r: 0.45, dmg: 2, bkb: 5, kbg: 0, angle: 90, group: 4, fixedKb: true, hitstun: 30 }),
    hb(36, 37, { bone: L, at: BLADE, r: 0.45, dmg: 2, bkb: 5, kbg: 0, angle: 90, group: 5, fixedKb: true, hitstun: 30 }),
    hb(48, 51, { bone: R, at: BLADE, r: 0.5, dmg: 13, bkb: 85, kbg: 85, angle: 45, group: 6, sfx: Sfx.Heavy }),
  ],
  {
    kiCost: 300,
    cinematic: true,
    invuln: [1, 14],
    motion: [mv(2, 0.7, 0), mv(5, 0.02, 0), mv(44, 0, 0)],
    gravity: false,
    vanish: [2, 4],
  },
);
moves[Mv.DashAttack] = mb.move(
  'Sliding Cut',
  26,
  [{ f: 0, r: { ...slash('Right', 90), Spine: -40 }, root: [0, -0.3] }, { f: 12 }, { f: 20 }],
  [hb(4, 10, { bone: R, at: BLADE, r: 0.2, dmg: 7, bkb: 40, kbg: 55, angle: 60 })],
  { slide: true },
);
moves[Mv.LedgeAttack] = mb.move(
  'Ledge Flip',
  28,
  [{ f: 0, root: [-0.45, -1.2] }, { f: 8, r: { Hips: -180, ...slash('Right', 95) }, root: [0, -0.3] }, { f: 20, r: { Hips: -360 } }],
  [hb(8, 11, { bone: R, at: BLADE, r: 0.22, dmg: 7, bkb: 50, kbg: 40, angle: 40 })],
  { invuln: [1, 10] },
);

export const VESHA: FighterDef = {
  id: 'vesha',
  name: 'VESHA',
  title: 'The Hollow Shade',
  description: 'Shadow ninja. Fastest in the roster, teleports, counters — but launches easily.',
  superName: 'Eclipse: Thousand Cuts',
  stats: {
    weight: 78,
    walk: m(0.07),
    run: m(0.155),
    dash: m(0.17),
    dashFrames: 8,
    traction: m(0.009),
    jumpSquat: 3,
    jumpV: m(0.29),
    hopV: m(0.18),
    airJumpV: m(0.26),
    airJumps: 2,
    airSpeed: m(0.1),
    airAccel: m(0.009),
    airFriction: m(0.003),
    gravity: m(0.0125),
    fallSpeed: m(0.215),
    fastFall: m(0.33),
    scale: 930,
    shieldSize: m(0.7),
    power: 118,
  },
  anims: {
    ...stateAnims(mb, false, { idlePeriod: 40, bob: 0.025, ninjaRun: true }),
    victory: mb.anim([
      { f: 0, r: { RightArm: 50, RightForeArm: 130, LeftArm: 55, LeftForeArm: 128, RightHand: -80, LeftHand: -80, Spine: 2, Head: 18, RightUpLeg: 6, LeftUpLeg: -6, RightLeg: -4, LeftLeg: -4 }, root: [0, 0] },
      { f: 40, r: { Head: 24 } },
      { f: 80, r: { Head: 18 } },
    ], 80, true),
  },
  moves,
  look: { body: 0x2a2440, trim: 0x15121f, skin: 0xc79a7c, accent: 0xb36bff, hair: 0x3a2d5c, build: 'slim', weapon: 'blades', hairStyle: 'hood' },
};
