// SERA VALE — spear knight. Mid weight, long disjointed reach, punishes from range, weak up close.
// Spear is held in the right hand; its tip is ~1.5 m along the hand's "down" axis.
import { FighterDef, MoveDef, Mv } from '../defs';
import { B, MoveBuilder, hb, grabBox, proj, mv, makeEx, stateAnims, m, Sfx } from './common';

const stance = {
  f: 0,
  r: {
    Spine: -6,
    Head: 6,
    RightArm: 70,
    RightForeArm: 40,
    RightHand: 50, // spear angled forward-down
    LeftArm: 40,
    LeftForeArm: 70,
    RightUpLeg: 26,
    RightLeg: -24,
    LeftUpLeg: -18,
    LeftLeg: -6,
  },
  root: [0, -0.035] as [number, number],
};

const mb = new MoveBuilder(stance);
const R = B.RightHand;
const TIP: [number, number] = [0, -1.45];
const MID: [number, number] = [0, -0.85];
const STEEL = 0xbfe6ff;

// Spear thrust helper: arm straight forward, hand aligned so the spear points along the arm.
const thrust = { RightArm: 90, RightForeArm: 0, RightHand: 0 };

const moves: MoveDef[] = [];

moves[Mv.Jab] = mb.move(
  'Butt Strike',
  20,
  [{ f: 0 }, { f: 3, r: { ...thrust, RightArm: 80, Spine: -12 } }, { f: 7, r: { RightArm: 82 } }, { f: 14 }],
  [hb(4, 6, { bone: R, at: MID, r: 0.16, dmg: 3, bkb: 18, kbg: 40, angle: 361, hitstun: 14 })],
  { iasa: 14, chain: { from: 7, next: Mv.Jab2 } },
);
moves[Mv.Jab2] = mb.move(
  'Shaft Sweep',
  22,
  [{ f: 0, r: thrust }, { f: 4, r: { RightArm: 130, RightForeArm: 10, RightHand: 0 } }, { f: 8, r: { RightArm: 40 } }, { f: 16 }],
  [hb(4, 7, { bone: R, at: MID, r: 0.2, dmg: 3, bkb: 20, kbg: 40, angle: 361, hitstun: 16 })],
  { iasa: 16, chain: { from: 8, next: Mv.Jab3 } },
);
moves[Mv.Jab3] = mb.move(
  'Driving Lunge',
  32,
  [{ f: 0, r: { RightArm: 20, RightForeArm: 90 } }, { f: 6, r: { ...thrust, Spine: -25 }, root: [0.25, -0.1] }, { f: 12, r: thrust, root: [0.25, -0.1] }, { f: 24 }],
  [hb(6, 9, { bone: R, at: TIP, r: 0.2, dmg: 6, bkb: 55, kbg: 65, angle: 38, hitstun: 26 })],
);

moves[Mv.FTilt] = mb.move(
  'Long Thrust',
  30,
  [{ f: 0 }, { f: 6, r: { RightArm: 30, RightForeArm: 80 } }, { f: 10, r: { ...thrust, Spine: -15 }, root: [0.1, -0.05] }, { f: 16, r: thrust }, { f: 24 }],
  [
    hb(10, 13, { bone: R, at: TIP, r: 0.17, dmg: 10, bkb: 30, kbg: 85, angle: 361, hitstun: 20, sfx: Sfx.Medium }),
    hb(10, 13, { bone: R, at: MID, r: 0.13, dmg: 7, bkb: 25, kbg: 70, angle: 361 }),
  ],
);
moves[Mv.UTilt] = mb.move(
  'Overhead Arc',
  30,
  [{ f: 0 }, { f: 5, r: { RightArm: 20, RightHand: 90 } }, { f: 10, r: { RightArm: 175, RightForeArm: 0, RightHand: 0 } }, { f: 15, r: { RightArm: 120 } }, { f: 24 }],
  [hb(8, 13, { bone: R, at: TIP, r: 0.2, dmg: 8, bkb: 35, kbg: 100, angle: 92, hitstun: 22 })],
);
moves[Mv.DTilt] = mb.move(
  'Ankle Reap',
  26,
  [
    { f: 0, r: { Spine: -30, RightUpLeg: 75, RightLeg: -110, LeftUpLeg: 50, LeftLeg: -115 }, root: [0, -0.3] },
    { f: 6, r: { RightArm: 55, RightForeArm: 0, RightHand: 0 }, root: [0, -0.36] },
    { f: 12, r: { RightArm: 50 } },
    { f: 20 },
  ],
  [hb(6, 9, { bone: R, at: TIP, r: 0.18, dmg: 7, bkb: 40, kbg: 45, angle: 78, hitstun: 22 })],
);

moves[Mv.FSmash] = mb.move(
  'Skewer',
  52,
  [
    { f: 0 },
    { f: 10, r: { RightArm: -30, RightForeArm: 100, Spine: 15 }, root: [-0.1, -0.06] },
    { f: 18, r: { ...thrust, Spine: -30 }, root: [0.35, -0.12] },
    { f: 26, r: thrust, root: [0.35, -0.12] },
    { f: 42 },
  ],
  [
    hb(18, 21, { bone: R, at: TIP, r: 0.22, dmg: 17, bkb: 36, kbg: 100, angle: 361, sfx: Sfx.Heavy }),
    hb(18, 21, { bone: R, at: MID, r: 0.15, dmg: 12, bkb: 30, kbg: 92, angle: 361 }),
  ],
  { charge: 9 },
);
moves[Mv.USmash] = mb.move(
  'Spiral Ascent',
  50,
  [
    { f: 0, root: [0, -0.12] },
    { f: 10, r: { RightArm: 175, RightForeArm: 0, RightHand: 0 }, root: [0, 0.04] },
    { f: 16, r: { RightArm: 178, Hips: 180 } },
    { f: 22, r: { RightArm: 178, Hips: 360 } },
    { f: 40, r: { Hips: 0 } },
  ],
  [
    hb(12, 15, { bone: R, at: TIP, r: 0.24, dmg: 9, bkb: 50, kbg: 30, angle: 90, fixedKb: true, hitstun: 18 }),
    hb(18, 22, { bone: R, at: TIP, r: 0.26, dmg: 9, bkb: 34, kbg: 100, angle: 90, group: 1, sfx: Sfx.Heavy }),
  ],
  { charge: 8 },
);
moves[Mv.DSmash] = mb.move(
  'Crescent Sweep',
  50,
  [
    { f: 0, root: [0, -0.3] },
    { f: 10, r: { Spine: -35, RightArm: 60, RightForeArm: 0, RightHand: 0, Hips: 0 }, root: [0, -0.4] },
    { f: 16, r: { Hips: -180 }, root: [0, -0.4] },
    { f: 24, r: { Hips: -360 } },
    { f: 40, r: { Hips: 0 }, root: [0, -0.035] },
  ],
  [
    hb(11, 14, { bone: R, at: TIP, r: 0.22, dmg: 14, bkb: 30, kbg: 95, angle: 30 }),
    hb(17, 21, { bone: R, at: TIP, r: 0.22, dmg: 14, bkb: 30, kbg: 95, angle: 150, group: 1 }),
  ],
  { charge: 7 },
);

moves[Mv.NAir] = mb.move(
  'Whirling Guard',
  38,
  [
    { f: 0, r: { RightArm: 90, RightForeArm: 0, RightHand: 90 } },
    { f: 6, r: { Hips: 0 } },
    { f: 12, r: { Hips: -180 } },
    { f: 18, r: { Hips: -360 } },
    { f: 28, r: { Hips: 0 } },
  ],
  [hb(6, 18, { bone: R, at: MID, r: 0.28, dmg: 8, bkb: 25, kbg: 85, angle: 361 })],
  { landLag: 9 },
);
moves[Mv.FAir] = mb.move(
  'Aerial Lance',
  34,
  [{ f: 0, r: { RightArm: 30, RightForeArm: 90 } }, { f: 7, r: thrust }, { f: 13, r: thrust }, { f: 24 }],
  [hb(7, 11, { bone: R, at: TIP, r: 0.19, dmg: 11, bkb: 30, kbg: 90, angle: 40 })],
  { landLag: 10 },
);
moves[Mv.BAir] = mb.move(
  'Rear Pike',
  34,
  [{ f: 0, r: { Head: 30 } }, { f: 8, r: { RightArm: -90, RightForeArm: 0, RightHand: 0, Spine: 15 } }, { f: 14, r: { RightArm: -90 } }, { f: 26 }],
  [hb(8, 12, { bone: R, at: TIP, r: 0.2, dmg: 13, bkb: 30, kbg: 100, angle: 145 })],
  { landLag: 11 },
);
moves[Mv.UAir] = mb.move(
  'Sky Piercer',
  32,
  [{ f: 0, r: { RightArm: 120 } }, { f: 6, r: { RightArm: 178, RightForeArm: 0, RightHand: 0 } }, { f: 12, r: { RightArm: 176 } }, { f: 22 }],
  [hb(6, 11, { bone: R, at: TIP, r: 0.2, dmg: 10, bkb: 30, kbg: 100, angle: 88 })],
  { landLag: 8 },
);
moves[Mv.DAir] = mb.move(
  'Plunging Spear',
  40,
  [{ f: 0, r: { RightArm: 150 } }, { f: 10, r: { RightArm: 0, RightForeArm: 0, RightHand: 0 } }, { f: 18, r: { RightArm: 0 } }, { f: 30 }],
  [hb(10, 14, { bone: R, at: TIP, r: 0.2, dmg: 13, bkb: 25, kbg: 90, angle: 270, sfx: Sfx.Heavy })],
  { landLag: 15 },
);

moves[Mv.NSpec] = mb.move(
  'Javelin',
  44,
  [{ f: 0, r: { RightArm: -40, RightForeArm: 120, Spine: 15 } }, { f: 12, r: { ...thrust, Spine: -15 } }, { f: 32 }],
  [],
  { projectile: proj({ f: 13, bone: R, at: [0, -0.4], speed: 0.3, r: 0.16, life: 45, dmg: 8, bkb: 40, kbg: 55, angle: 30, color: STEEL }) },
);
moves[Mv.SSpec] = mb.move(
  'Lancer Charge',
  44,
  [{ f: 0, r: { RightArm: 20, RightForeArm: 90, Spine: -20 } }, { f: 8, r: { ...thrust, Spine: -30 }, root: [0, -0.1] }, { f: 26, r: thrust }, { f: 36 }],
  [hb(8, 24, { bone: R, at: TIP, r: 0.22, dmg: 11, bkb: 45, kbg: 70, angle: 40 })],
  { motion: [mv(8, 0.3, 0), mv(25, 0.04, 0)], gravity: false, ledgeFrom: 10 },
);
moves[Mv.USpec] = mb.move(
  'Vaulting Spiral',
  46,
  [
    { f: 0, r: { RightArm: 10, RightHand: 0 }, root: [0, -0.15] },
    { f: 6, r: { RightArm: 178, RightForeArm: 0, RightHand: 0, RightUpLeg: 60, RightLeg: -90 } },
    { f: 14, r: { Hips: -180 } },
    { f: 22, r: { Hips: -360 } },
    { f: 34, r: { Hips: 0, RightArm: 150 } },
  ],
  [hb(6, 20, { bone: R, at: TIP, r: 0.22, dmg: 5, bkb: 40, kbg: 60, angle: 80 })],
  { motion: [mv(5, 0.06, 0.34), mv(22, 0.05, 0.05)], gravity: false, helpless: true, ledgeFrom: 10 },
);
moves[Mv.DSpec] = mb.move(
  'Pinning Strike',
  46,
  [{ f: 0, r: { RightArm: 175, RightForeArm: 0 } }, { f: 14, r: { RightArm: 40, RightForeArm: 0, RightHand: 0, Spine: -35 }, root: [0.1, -0.3] }, { f: 34 }],
  [hb(14, 17, { bone: R, at: TIP, r: 0.24, dmg: 14, bkb: 60, kbg: 50, angle: 270, sfx: Sfx.Heavy })],
);
moves[Mv.NSpecEx] = makeEx(moves[Mv.NSpec], 'Javelin Storm', {
  projectile: proj({ f: 13, bone: R, at: [0, -0.4], speed: 0.4, r: 0.2, life: 50, dmg: 5, bkb: 30, kbg: 50, angle: 30, rehit: 6, hits: 3, color: STEEL }),
});
moves[Mv.SSpecEx] = makeEx(moves[Mv.SSpec], 'Lancer Charge EX', { motion: [mv(8, 0.42, 0), mv(25, 0.04, 0)] });
moves[Mv.USpecEx] = makeEx(moves[Mv.USpec], 'Vaulting Spiral EX', { motion: [mv(5, 0.07, 0.42), mv(22, 0.05, 0.05)], invuln: [1, 10] });
moves[Mv.DSpecEx] = makeEx(moves[Mv.DSpec], 'Pinning Strike EX');

moves[Mv.Grab] = mb.move(
  'Grab',
  32,
  [{ f: 0 }, { f: 6, r: { LeftArm: 90, LeftForeArm: 10, Spine: -15 } }, { f: 11, r: { LeftArm: 90 } }, { f: 26 }],
  [grabBox(7, 9, B.LeftHand, [0, -0.05], 0.2)],
);
moves[Mv.Pummel] = mb.move('Pommel', 14, [{ f: 0, r: { LeftArm: 90 } }, { f: 5, r: { RightArm: 70, RightForeArm: 60 } }, { f: 10 }], []);
moves[Mv.FThrow] = mb.move(
  'Shove Off',
  30,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 9, r: { ...thrust, Spine: -20 } }, { f: 22 }],
  [],
  { throwRelease: { f: 10, dmg: 8, bkb: 60, kbg: 60, angle: 40, ki: 12 } },
);
moves[Mv.BThrow] = mb.move(
  'Vault Toss',
  36,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 12, r: { Hips: -180, LeftArm: 160 } }, { f: 28, r: { Hips: 0 } }],
  [],
  { throwRelease: { f: 13, dmg: 10, bkb: 60, kbg: 68, angle: 140, ki: 14 } },
);
moves[Mv.UThrow] = mb.move(
  'Skyward Lift',
  34,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 10, r: { RightArm: 178, RightForeArm: 0, RightHand: 0 } }, { f: 26 }],
  [],
  { throwRelease: { f: 11, dmg: 8, bkb: 70, kbg: 62, angle: 90, ki: 12 } },
);
moves[Mv.DThrow] = mb.move(
  'Pin Down',
  34,
  [{ f: 0, r: { LeftArm: 90 } }, { f: 12, r: { RightArm: 20, RightForeArm: 0, Spine: -40 }, root: [0, -0.2] }, { f: 26 }],
  [],
  { throwRelease: { f: 13, dmg: 7, bkb: 60, kbg: 45, angle: 75, ki: 10 } },
);
moves[Mv.CmdThrow] = moves[Mv.FThrow];

moves[Mv.Super] = mb.move(
  'Thousand Lances',
  84,
  [
    { f: 0, r: { RightArm: -30, RightForeArm: 110, Spine: 15 } },
    { f: 8, r: thrust },
    { f: 12, r: { RightArm: 70, RightForeArm: 60 } },
    { f: 16, r: thrust },
    { f: 20, r: { RightArm: 70, RightForeArm: 60 } },
    { f: 24, r: thrust },
    { f: 28, r: { RightArm: 70, RightForeArm: 60 } },
    { f: 32, r: thrust },
    { f: 44, r: { RightArm: 178, RightForeArm: 0, RightHand: 0 }, root: [0, 0.1] },
    { f: 68 },
  ],
  [
    hb(8, 9, { bone: R, at: TIP, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 0, fixedKb: true, hitstun: 20 }),
    hb(16, 17, { bone: R, at: TIP, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 1, fixedKb: true, hitstun: 20 }),
    hb(24, 25, { bone: R, at: TIP, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 2, fixedKb: true, hitstun: 20 }),
    hb(32, 33, { bone: R, at: TIP, r: 0.35, dmg: 3, bkb: 30, kbg: 0, angle: 0, group: 3, fixedKb: true, hitstun: 24 }),
    hb(42, 46, { bone: R, at: TIP, r: 0.45, dmg: 16, bkb: 80, kbg: 90, angle: 75, group: 4, sfx: Sfx.Heavy }),
  ],
  { kiCost: 300, cinematic: true, invuln: [1, 10], motion: [mv(1, 0.3, 0), mv(8, 0.03, 0), mv(36, 0, 0)], gravity: false },
);
moves[Mv.DashAttack] = mb.move(
  'Running Thrust',
  34,
  [{ f: 0, r: { ...thrust, Spine: -25 }, root: [0, -0.1] }, { f: 16, r: thrust }, { f: 28 }],
  [hb(5, 12, { bone: R, at: TIP, r: 0.2, dmg: 9, bkb: 40, kbg: 65, angle: 45 })],
  { slide: true },
);
moves[Mv.LedgeAttack] = mb.move(
  'Ledge Sweep',
  32,
  [{ f: 0, root: [-0.45, -1.2] }, { f: 10, r: { RightArm: 60, RightForeArm: 0, RightHand: 0 }, root: [0, -0.3] }, { f: 24 }],
  [hb(10, 13, { bone: R, at: TIP, r: 0.2, dmg: 8, bkb: 50, kbg: 40, angle: 40 })],
  { invuln: [1, 10] },
);

export const SERA: FighterDef = {
  id: 'sera',
  name: 'SERA',
  title: 'The Last Lancer',
  description: 'Spear knight. Longest reach in the roster; keep foes at the tip.',
  superName: 'Thousand Lances',
  stats: {
    weight: 98,
    walk: m(0.055),
    run: m(0.12),
    dash: m(0.13),
    dashFrames: 11,
    traction: m(0.009),
    jumpSquat: 4,
    jumpV: m(0.265),
    hopV: m(0.17),
    airJumpV: m(0.245),
    airJumps: 1,
    airSpeed: m(0.085),
    airAccel: m(0.007),
    airFriction: m(0.003),
    gravity: m(0.012),
    fallSpeed: m(0.2),
    fastFall: m(0.3),
    scale: 1010,
    shieldSize: m(0.8),
  },
  anims: stateAnims(mb, false),
  moves,
  look: { body: 0xd8dde8, trim: 0x2f3b5c, skin: 0xe9c09a, accent: 0x8fd3ff, hair: 0xc94a3a, build: 'lean', weapon: 'spear', cape: true, hairStyle: 'long' },
};
