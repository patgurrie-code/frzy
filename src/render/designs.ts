// Procedural character designs. Each fighter id gets a hand-authored outfit built with the Kit toolkit
// on the shared Mixamo skeleton. Colours always come from FighterLook so story bosses can recolour any design.
// Bone frames at rest: limbs point down (-Y), torso/head up (+Y), the character faces +X, +Z = its right side.
import * as THREE from 'three';
import { B } from '../sim/skeleton';
import type { FighterLook } from '../sim/defs';
import { Kit } from './kit';
import { toonMat, flatMat } from './toon';

const RIM = 0.32;
const T = (c: number, emissive = 0) => toonMat(c, emissive, RIM);

/** Multiply a colour's brightness. */
export function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

interface BodyOpts {
  k: number; // width factor (build)
  female?: boolean;
  skinArms?: boolean; // bare upper arms
  skinForearms?: boolean;
  skinTorso?: boolean;
  torsoMat: THREE.Material;
  armMat?: THREE.Material;
  legMat: THREE.Material;
  shinMat?: THREE.Material;
  shoeMat: THREE.Material;
  handMat?: THREE.Material;
  eyeColor?: number;
  eyeGlow?: boolean;
  browAngle?: number; // + = angry
  noFace?: boolean; // masked lower face
}

const SIDES: [number, number, number, number, number][] = [
  // arm, fore, hand, sideSign (z), unused
  [B.RightArm, B.RightForeArm, B.RightHand, 1, 0],
  [B.LeftArm, B.LeftForeArm, B.LeftHand, -1, 0],
];
const LEGS: [number, number, number, number][] = [
  [B.RightUpLeg, B.RightLeg, B.RightFoot, 1],
  [B.LeftUpLeg, B.LeftLeg, B.LeftFoot, -1],
];

/** Base anatomy shared by every design. */
function body(kit: Kit, lk: FighterLook, o: BodyOpts): void {
  const k = o.k;
  const skin = T(lk.skin);
  const fem = o.female ? 0.86 : 1;
  // Pelvis
  kit.lathe(B.Hips, [[0.11 * k, -0.1], [0.15 * k, -0.04], [0.155 * k, 0.04], [0.13 * k, 0.12]], o.legMat, { depth: 0.78 });
  // Abdomen
  kit.lathe(B.Spine, [[0.13 * k, -0.02], [0.118 * k * fem, 0.1], [0.135 * k, 0.24]], o.skinTorso ? skin : o.torsoMat, { depth: 0.74 });
  // Chest (V taper; females get narrower shoulders)
  const sw = fem;
  kit.lathe(
    B.Spine2,
    [[0.135 * k, -0.03], [0.18 * k * sw, 0.06], [0.205 * k * sw, 0.15], [0.17 * k * sw, 0.215], [0.07 * k, 0.245]],
    o.skinTorso ? skin : o.torsoMat,
    { depth: 0.66 },
  );
  if (o.female && !o.skinTorso) {
    kit.sphere(B.Spine2, 0.07 * k, o.torsoMat, { pos: [0.08 * k, 0.1, 0.06 * k], scale: [0.8, 0.9, 0.9] });
    kit.sphere(B.Spine2, 0.07 * k, o.torsoMat, { pos: [0.08 * k, 0.1, -0.06 * k], scale: [0.8, 0.9, 0.9] });
  }
  // Neck
  kit.cyl(B.Neck, 0.052 * k * fem, 0.048 * k * fem, 0.12, skin, { pos: [0, 0.04, 0] });
  // Head
  const hk = Math.min(1.12, 0.92 + k * 0.08);
  kit.sphere(B.Head, 0.118 * hk, skin, { pos: [0.012, 0.115, 0], scale: [0.98, 1.08, 0.9] });
  kit.box(B.Head, [0.13 * hk, 0.08, 0.15 * hk], skin, { pos: [0.04, 0.045, 0], round: 0.035, line: 0.012 });
  kit.sphere(B.Head, 0.028, skin, { pos: [-0.005, 0.1, 0.112 * hk], scale: [0.6, 1, 0.5], line: 0.01 });
  kit.sphere(B.Head, 0.028, skin, { pos: [-0.005, 0.1, -0.112 * hk], scale: [0.6, 1, 0.5], line: 0.01 });
  if (!o.noFace) kit.cone(B.Head, 0.018, 0.045, skin, { pos: [0.125 * hk, 0.095, 0], rot: [0, 0, -Math.PI / 2], line: 0.008 });
  // Faces: separate groups (normal / hurt / shout / blink) so the renderer can swap expressions.
  const head = kit.bones[B.Head];
  const mk = () => {
    const g = new THREE.Group();
    head.add(g);
    return g;
  };
  const faces = { normal: mk(), hurt: mk(), shout: mk(), blink: mk() };
  kit.faces = faces;
  const eyeMat = o.eyeGlow ? flatMat(o.eyeColor ?? 0xffffff) : flatMat(0xffffff);
  const irisMat = flatMat(o.eyeColor ?? 0x1a1a24);
  const browMat = flatMat(shade(lk.hair, 0.8));
  const mouthMat = flatMat(0x2a1414);
  const ex = 0.108 * hk;
  const browAng = o.browAngle ?? 0.35;
  for (const side of [1, -1]) {
    const z = side * 0.044;
    // normal
    kit.sphere(faces.normal, 0.024, eyeMat, { pos: [ex, 0.13, z], scale: [0.35, 0.9, 1], line: 0.006 });
    if (!o.eyeGlow) kit.sphere(faces.normal, 0.014, irisMat, { pos: [ex + 0.009, 0.128, z], scale: [0.4, 1, 1], line: 0 });
    kit.box(faces.normal, [0.016, 0.014, 0.055], browMat, { pos: [ex + 0.01, 0.165, side * 0.045], rot: [browAng * side, 0, 0], line: 0, round: 0.004 });
    // shout: wide eyes, small irises, furious brows
    kit.sphere(faces.shout, 0.027, eyeMat, { pos: [ex, 0.13, z], scale: [0.35, 1.05, 1.05], line: 0.006 });
    if (!o.eyeGlow) kit.sphere(faces.shout, 0.009, irisMat, { pos: [ex + 0.01, 0.13, z], scale: [0.4, 1, 1], line: 0 });
    kit.box(faces.shout, [0.016, 0.016, 0.06], browMat, { pos: [ex + 0.01, 0.16, side * 0.045], rot: [(browAng + 0.3) * side, 0, 0], line: 0, round: 0.004 });
    // hurt: squeezed shut ( > < ), brows up in pain
    for (const t of [0.35, -0.35]) kit.box(faces.hurt, [0.008, 0.006, 0.035], o.eyeGlow ? eyeMat : browMat, { pos: [ex + 0.008, 0.13 + t * 0.02, z], rot: [t * side, 0, 0], line: 0 });
    kit.box(faces.hurt, [0.016, 0.014, 0.055], browMat, { pos: [ex + 0.01, 0.17, side * 0.045], rot: [-0.35 * side, 0, 0], line: 0, round: 0.004 });
    // blink: closed lids
    kit.box(faces.blink, [0.008, 0.006, 0.04], browMat, { pos: [ex + 0.008, 0.125, z], line: 0 });
    kit.box(faces.blink, [0.016, 0.014, 0.055], browMat, { pos: [ex + 0.01, 0.165, side * 0.045], rot: [browAng * side, 0, 0], line: 0, round: 0.004 });
  }
  if (!o.noFace) {
    kit.box(faces.normal, [0.01, 0.007, 0.045], mouthMat, { pos: [0.118 * hk, 0.05, 0], line: 0 });
    kit.box(faces.blink, [0.01, 0.007, 0.045], mouthMat, { pos: [0.118 * hk, 0.05, 0], line: 0 });
    kit.box(faces.shout, [0.012, 0.045, 0.06], mouthMat, { pos: [0.115 * hk, 0.048, 0], round: 0.01, line: 0 });
    kit.box(faces.hurt, [0.012, 0.03, 0.04], mouthMat, { pos: [0.116 * hk, 0.05, 0], rot: [0, 0, 0], round: 0.008, line: 0 });
  }
  // Arms
  for (const [arm, fore, hand] of SIDES) {
    kit.limb(arm, fore, 0.062 * k * fem, 0.05 * k * fem, o.skinArms ? skin : o.armMat ?? o.torsoMat, { bulge: 0.18 });
    kit.limb(fore, hand, 0.05 * k * fem, 0.04 * k * fem, o.skinForearms ? skin : o.armMat ?? o.torsoMat, { bulge: 0.12 });
    // Fist with thumb
    const hm = o.handMat ?? skin;
    kit.box(hand, [0.085 * k * fem, 0.1 * k * fem, 0.085 * k * fem], hm, { pos: [0.005, -0.06, 0], round: 0.03 });
    kit.box(hand, [0.03, 0.05, 0.03], hm, { pos: [0.04 * k, -0.04, 0], round: 0.012, line: 0.01 });
  }
  // Legs
  for (const [up, leg, foot] of LEGS) {
    kit.limb(up, leg, 0.092 * k * (o.female ? 0.95 : 1), 0.07 * k, o.legMat, { bulge: 0.15 });
    kit.limb(leg, foot, 0.068 * k, 0.05 * k, o.shinMat ?? o.legMat, { bulge: 0.18 });
    kit.box(foot, [0.23 * Math.min(1.25, k), 0.095, 0.115 * k], o.shoeMat, { pos: [0.055, -0.035, 0], round: 0.035 });
  }
}

// ---------------------------------------------------------------------------
// Hair & accessories
// ---------------------------------------------------------------------------

function spikyHair(kit: Kit, mat: THREE.Material, scale = 1): void {
  kit.sphere(B.Head, 0.125 * scale, mat, { pos: [-0.01, 0.16, 0], scale: [1, 0.75, 0.95] });
  const spikes: [number, number, number, number, number, number][] = [
    // x, y, z, rotZ (sweep back), rotX (side splay), length
    [-0.02, 0.27, 0, 0.9, 0, 0.26],
    [-0.08, 0.24, 0.07, 1.25, 0.45, 0.24],
    [-0.08, 0.24, -0.07, 1.25, -0.45, 0.24],
    [0.04, 0.27, 0.06, 0.55, 0.35, 0.2],
    [0.04, 0.27, -0.06, 0.55, -0.35, 0.2],
    [-0.13, 0.17, 0, 1.75, 0, 0.24],
    [-0.12, 0.12, 0.08, 2.0, 0.6, 0.18],
    [-0.12, 0.12, -0.08, 2.0, -0.6, 0.18],
    [0.1, 0.22, 0.04, -0.1, 0.3, 0.13], // bangs
    [0.1, 0.22, -0.05, -0.2, -0.3, 0.12],
  ];
  for (const [x, y, z, rz, rx, l] of spikes) {
    kit.cone(B.Head, 0.055 * scale, l * scale, mat, { pos: [x * scale, y * scale, z * scale], rot: [rx, 0, rz], seg: 5 });
  }
}

/** Headband with two trailing tails (dangles). */
function headband(kit: Kit, mat: THREE.Material, tailLen = 0.14, segs = 3): void {
  kit.cyl(B.Head, 0.123, 0.123, 0.035, mat, { pos: [0.005, 0.175, 0], scale: [1, 1, 0.94], seg: 14 });
  for (const z of [0.03, -0.03]) {
    kit.dangle(B.Head, [-0.12, 0.17, z], segs, tailLen, (kk, h, i) => {
      kk.box(h, [0.012, tailLen, 0.035 - i * 0.004], mat, { pos: [0, -tailLen / 2, 0], line: 0.008 });
    }, { bias: [1.2, -0.2, z * 4], drag: 0.12, stiffness: 9, flutter: 0.25 });
  }
}

// ---------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------

/** KESTREL — street brawler: sleeveless gi, belt tails, wraps, wild spiky hair, headband tails. */
function kestrel(kit: Kit, lk: FighterLook): void {
  const gi = T(lk.body);
  const pants = T(lk.trim);
  const wrap = T(0xf2efe6);
  const acc = T(lk.accent, shade(lk.accent, 0.15));
  body(kit, lk, {
    k: 1,
    skinArms: true,
    skinForearms: true,
    torsoMat: gi,
    legMat: pants,
    shoeMat: T(shade(lk.body, 0.75)),
    handMat: T(0x24242e),
    browAngle: 0.45,
  });
  // Dark undershirt V
  kit.box(B.Spine2, [0.03, 0.16, 0.1], pants, { pos: [0.115, 0.11, 0], rot: [0, 0, -0.08], line: 0.01 });
  // Gi lapels
  for (const z of [1, -1]) kit.box(B.Spine2, [0.03, 0.2, 0.05], T(shade(lk.body, 1.15)), { pos: [0.12, 0.09, z * 0.065], rot: [z * 0.45, 0, -0.08], line: 0.01 });
  // Gi skirt flaps over the hips
  for (const z of [1, -1]) kit.box(B.Hips, [0.2, 0.18, 0.05], gi, { pos: [0.02, -0.07, z * 0.13], rot: [z * 0.12, 0, 0] });
  // Belt + knot + tails
  kit.cyl(B.Spine, 0.145, 0.14, 0.05, acc, { pos: [0, 0.02, 0], scale: [1, 1, 0.78], seg: 14 });
  kit.box(B.Spine, [0.05, 0.05, 0.06], acc, { pos: [0.115, 0.02, 0.04], round: 0.015 });
  for (const z of [0.06, 0.02]) {
    kit.dangle(B.Spine, [0.12, 0.0, z], 2, 0.11, (kk, h) => kk.box(h, [0.012, 0.11, 0.04], acc, { pos: [0, -0.055, 0], line: 0.008 }), {
      bias: [0.5, 0, 0.2],
      drag: 0.1,
      flutter: 0.15,
    });
  }
  // Wrist & ankle wraps
  for (const [, fore] of SIDES) kit.cyl(fore, 0.052, 0.046, 0.12, wrap, { pos: [0, -0.18, 0] });
  for (const [, leg] of LEGS) kit.cyl(leg, 0.072, 0.07, 0.1, wrap, { pos: [0, -0.37, 0] });
  // Baggy pant cuffs
  for (const [up] of LEGS) kit.cyl(up, 0.1, 0.098, 0.05, pants, { pos: [0, -0.02, 0] });
  // Hair + headband
  spikyHair(kit, T(lk.hair));
  headband(kit, acc, 0.15, 3);
}

/** TORVAL — veteran ki master: long coat with tails, pauldrons, glowing gauntlets, white topknot & beard. */
function torval(kit: Kit, lk: FighterLook): void {
  const coat = T(lk.body);
  const cream = T(lk.trim);
  const gold = T(lk.accent, shade(lk.accent, 0.35));
  const hair = T(lk.hair);
  body(kit, lk, {
    k: 1.28,
    torsoMat: coat,
    armMat: coat,
    legMat: cream,
    shoeMat: T(0x2a2622),
    handMat: gold,
    browAngle: 0.25,
  });
  // Coat collar & open chest
  kit.box(B.Spine2, [0.04, 0.17, 0.1], T(lk.skin), { pos: [0.15, 0.12, 0], rot: [0, 0, -0.12], line: 0.01 });
  for (const z of [1, -1]) kit.box(B.Spine2, [0.05, 0.12, 0.12], cream, { pos: [0.08, 0.23, z * 0.1], rot: [z * 0.3, 0, 0.2] });
  // Sash belt
  kit.cyl(B.Spine, 0.18, 0.175, 0.08, gold, { pos: [0, 0.02, 0], scale: [1, 1, 0.78], seg: 14 });
  // Pauldrons
  for (const [arm] of SIDES) {
    kit.sphere(arm, 0.11, cream, { pos: [0, 0.02, 0], scale: [1.1, 0.8, 1.15] });
    kit.sphere(arm, 0.085, gold, { pos: [0, 0.05, 0], scale: [1.1, 0.5, 1.15], line: 0.01 });
  }
  // Gauntlets
  for (const [, fore] of SIDES) kit.cyl(fore, 0.075, 0.068, 0.15, gold, { pos: [0, -0.18, 0], seg: 8 });
  // Long coat skirt: a ring of panels around the hips (open at the front), each swinging on its own
  const panels = 7;
  for (let i = 0; i < panels; i++) {
    const a = Math.PI * 0.32 + (i / (panels - 1)) * Math.PI * 1.36; // skip the front
    const r = 0.17;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    kit.dangle(B.Hips, [x, 0.02, z], 3, 0.16, (kk, h, j) =>
      kk.box(h, [0.025, 0.17, 0.12 + j * 0.012], coat, { pos: [0, -0.08, 0], rot: [0, -a, 0], line: 0.01 }),
      { bias: [x < 0 ? 0.3 : -0.05, 0, z * 1.2], drag: 0.07, stiffness: 8, flutter: 0.05 },
    );
  }
  // Boots
  for (const [, leg] of LEGS) kit.cyl(leg, 0.085, 0.075, 0.18, T(0x2a2622), { pos: [0, -0.33, 0] });
  // Bald head, topknot, beard
  kit.sphere(B.Head, 0.07, hair, { pos: [-0.06, 0.25, 0], scale: [1, 0.8, 1] });
  kit.sphere(B.Head, 0.045, hair, { pos: [-0.08, 0.31, 0] });
  kit.box(B.Head, [0.1, 0.12, 0.17], hair, { pos: [0.075, 0.02, 0], round: 0.04 });
  kit.cone(B.Head, 0.06, 0.14, hair, { pos: [0.1, -0.07, 0], rot: [0, 0, Math.PI], seg: 6 });
  kit.box(B.Head, [0.03, 0.03, 0.1], hair, { pos: [0.12, 0.075, 0], round: 0.01, line: 0.008 }); // moustache
  kit.cyl(B.Head, 0.122, 0.122, 0.03, gold, { pos: [0.0, 0.19, 0], scale: [1, 1, 0.94], seg: 14 }); // circlet
}

/** SERA — lancer knight: plate armour, layered pauldrons, tassets, flowing cape, long red ponytail, ornate spear. */
function sera(kit: Kit, lk: FighterLook): void {
  const plate = T(lk.body);
  const under = T(lk.trim);
  const acc = T(lk.accent, shade(lk.accent, 0.2));
  const hair = T(lk.hair);
  const gold = T(0xe8c66a);
  body(kit, lk, {
    k: 1,
    female: true,
    torsoMat: under,
    legMat: under,
    shinMat: plate,
    shoeMat: plate,
    handMat: plate,
    eyeColor: 0x3a6fb0,
    browAngle: 0.2,
  });
  // Breastplate over chest
  kit.lathe(B.Spine2, [[0.15, -0.02], [0.19, 0.07], [0.19, 0.15], [0.15, 0.21], [0.08, 0.235]], plate, { depth: 0.7 });
  kit.box(B.Spine2, [0.02, 0.18, 0.025], gold, { pos: [0.135, 0.1, 0], line: 0.006 });
  // Faulds / tassets (armoured skirt plates)
  kit.lathe(B.Hips, [[0.165, -0.12], [0.16, 0.0], [0.145, 0.1]], plate, { depth: 0.8 });
  for (const [x, z] of [
    [0.1, 0.07],
    [0.1, -0.07],
    [-0.02, 0.15],
    [-0.02, -0.15],
  ]) {
    kit.dangle(B.Hips, [x, -0.08, z], 1, 0.16, (kk, h) => kk.box(h, [0.04, 0.16, 0.11], plate, { pos: [0, -0.08, 0], line: 0.01 }), {
      bias: [0.1, 0, z * 1.2],
      drag: 0.04,
      stiffness: 12,
      flutter: 0.02,
    });
  }
  // Layered pauldrons
  for (const [arm] of SIDES) {
    kit.sphere(arm, 0.095, plate, { pos: [0, 0.01, 0], scale: [1.1, 0.75, 1.2] });
    kit.sphere(arm, 0.085, gold, { pos: [0, -0.04, 0], scale: [1.15, 0.45, 1.25], line: 0.008 });
  }
  // Vambraces & knee guards
  for (const [, fore] of SIDES) kit.cyl(fore, 0.06, 0.05, 0.16, plate, { pos: [0, -0.15, 0], seg: 8 });
  for (const [, leg] of LEGS) kit.sphere(leg, 0.075, plate, { pos: [0.02, 0, 0], scale: [1.1, 0.9, 1] });
  // Gorget
  kit.cyl(B.Neck, 0.075, 0.065, 0.06, plate, { pos: [0, 0.0, 0] });
  // Hair: cap + side locks + long ponytail (dangle)
  kit.sphere(B.Head, 0.128, hair, { pos: [-0.012, 0.145, 0], scale: [1, 0.82, 1.02] });
  for (const z of [1, -1]) kit.box(B.Head, [0.05, 0.16, 0.035], hair, { pos: [0.07, 0.07, z * 0.1], rot: [z * 0.1, 0, -0.1], round: 0.015 });
  kit.box(B.Head, [0.04, 0.05, 0.16], hair, { pos: [0.1, 0.2, 0], round: 0.02, line: 0.01 }); // fringe
  kit.dangle(B.Head, [-0.13, 0.17, 0], 4, 0.12, (kk, h, i) => kk.box(h, [0.07 - i * 0.008, 0.13, 0.08 - i * 0.008], hair, { pos: [0, -0.06, 0], round: 0.03, line: 0.01 }), {
    bias: [0.6, 0, 0],
    drag: 0.09,
    stiffness: 7,
    flutter: 0.1,
  });
  // Circlet with crest
  kit.cyl(B.Head, 0.13, 0.13, 0.025, gold, { pos: [0.01, 0.2, 0], scale: [1, 1, 0.95], seg: 14 });
  kit.cone(B.Head, 0.02, 0.07, acc, { pos: [0.12, 0.22, 0], seg: 4, line: 0.008 });
  // Cape (3 wide segments) from the shoulder blades
  kit.dangle(B.Spine2, [-0.13, 0.2, 0], 3, 0.28, (kk, h, i) => kk.box(h, [0.02, 0.29, 0.36 + i * 0.05], acc, { pos: [0, -0.14, 0], line: 0.012 }), {
    bias: [0.55, 0, 0],
    drag: 0.06,
    stiffness: 6,
    flutter: 0.06,
  });
  // Ornate spear: shaft, grip wraps, crossguard, leaf blade, pennant
  const shaft = T(0x3a2e2a);
  kit.cyl(B.RightHand, 0.022, 0.022, 1.9, shaft, { pos: [0, -0.45, 0], seg: 6, line: 0.01 });
  kit.cyl(B.RightHand, 0.03, 0.03, 0.14, gold, { pos: [0, -0.06, 0], seg: 6, line: 0.008 });
  kit.cyl(B.RightHand, 0.03, 0.035, 0.06, gold, { pos: [0, 0.52, 0], seg: 6, line: 0.008 }); // butt cap
  kit.box(B.RightHand, [0.03, 0.04, 0.2], gold, { pos: [0, -1.34, 0], round: 0.01, line: 0.008 });
  kit.add(B.RightHand, new THREE.OctahedronGeometry(0.07, 0), T(0xdff4ff, 0x203040), { pos: [0, -1.5, 0], scale: [0.35, 2.4, 0.9], line: 0.008 });
  kit.dangle(B.RightHand, [0, -1.25, 0], 2, 0.12, (kk, h, i) => kk.box(h, [0.008, 0.12, 0.09 - i * 0.03], acc, { pos: [0, -0.06, 0], line: 0.006 }), {
    bias: [0.3, -0.6, 0],
    drag: 0.12,
    flutter: 0.3,
  });
}

/** VESHA — shadow assassin: bodysuit, hood and mask, glowing eyes, very long scarf, wraps, curved blades. */
function vesha(kit: Kit, lk: FighterLook): void {
  const suit = T(lk.body);
  const dark = T(lk.trim);
  const hood = T(lk.hair);
  const acc = T(lk.accent, shade(lk.accent, 0.4));
  const wrap = T(shade(lk.body, 1.6));
  body(kit, lk, {
    k: 0.86,
    female: true,
    torsoMat: suit,
    legMat: suit,
    shoeMat: dark,
    handMat: dark,
    eyeGlow: true,
    eyeColor: lk.accent,
    noFace: true,
    browAngle: 0.5,
  });
  // Hood + mask
  kit.add(B.Head, new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hood, { pos: [-0.015, 0.11, 0], rot: [0, 0, 0.42] });
  kit.cone(B.Head, 0.06, 0.16, hood, { pos: [-0.16, 0.12, 0], rot: [0, 0, 1.9], seg: 6 });
  kit.box(B.Head, [0.07, 0.085, 0.2], dark, { pos: [0.085, 0.055, 0], round: 0.03, line: 0.01 });
  // Armour bits: chest strap + belt with pouches
  kit.box(B.Spine2, [0.03, 0.3, 0.05], dark, { pos: [0.11, 0.08, 0], rot: [0.6, 0, -0.1], line: 0.008 });
  kit.cyl(B.Spine, 0.13, 0.125, 0.04, dark, { pos: [0, 0.02, 0], scale: [1, 1, 0.78], seg: 14 });
  for (const z of [0.1, -0.1]) kit.box(B.Spine, [0.06, 0.06, 0.04], dark, { pos: [0.02, -0.01, z], round: 0.015 });
  // Wraps on forearms and shins
  for (const [, fore] of SIDES) for (let i = 0; i < 3; i++) kit.cyl(fore, 0.047, 0.045, 0.025, wrap, { pos: [0, -0.06 - i * 0.06, 0], rot: [0.2, 0, 0], line: 0.006 });
  for (const [, leg] of LEGS) for (let i = 0; i < 3; i++) kit.cyl(leg, 0.062, 0.06, 0.03, wrap, { pos: [0, -0.12 - i * 0.08, 0], rot: [0.2, 0, 0], line: 0.006 });
  // Long scarf: a loop around the neck + two long tails
  kit.add(B.Neck, new THREE.TorusGeometry(0.075, 0.035, 6, 12), acc, { pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] });
  for (const z of [0.04, -0.04]) {
    kit.dangle(B.Neck, [-0.06, 0.02, z], 5, 0.13, (kk, h, i) => kk.box(h, [0.014, 0.14, 0.07 - i * 0.006], acc, { pos: [0, -0.065, 0], line: 0.008 }), {
      bias: [1.0, -0.1, z * 5],
      drag: 0.14,
      stiffness: 6,
      flutter: 0.3,
    });
  }
  // Curved blades (reverse grip): two angled segments + glowing edge
  for (const [, , hand] of SIDES) {
    kit.box(hand, [0.03, 0.05, 0.04], dark, { pos: [0, -0.04, 0], round: 0.01 });
    kit.box(hand, [0.022, 0.28, 0.07], T(0xc8c4d8), { pos: [0.015, -0.22, 0], rot: [0, 0, 0.12], round: 0.008, line: 0.008 });
    kit.box(hand, [0.02, 0.22, 0.06], T(0xc8c4d8), { pos: [0.06, -0.45, 0], rot: [0, 0, 0.42], round: 0.008, line: 0.008 });
    kit.box(hand, [0.008, 0.46, 0.012], acc, { pos: [0.05, -0.32, 0.035], rot: [0, 0, 0.25], line: 0 });
  }
}

/** BRAKKA — mountain grappler: huge bare torso with tattoos, fur mantle, bracers, title belt, mohawk, braided beard. */
function brakka(kit: Kit, lk: FighterLook): void {
  const skin = T(lk.skin);
  const fur = T(lk.body);
  const trim = T(lk.trim);
  const acc = T(lk.accent, shade(lk.accent, 0.25));
  const hair = T(lk.hair);
  const k = 1.5;
  body(kit, lk, {
    k,
    skinArms: true,
    skinForearms: true,
    skinTorso: true,
    torsoMat: skin,
    legMat: trim,
    shoeMat: T(0x2a2018),
    handMat: T(shade(lk.trim, 1.4)),
    browAngle: 0.55,
  });
  // Pecs + abs
  for (const z of [1, -1]) kit.sphere(B.Spine2, 0.11, skin, { pos: [0.12, 0.12, z * 0.1], scale: [0.65, 0.8, 1] });
  for (let i = 0; i < 3; i++) for (const z of [1, -1]) kit.box(B.Spine, [0.05, 0.06, 0.07], skin, { pos: [0.15, 0.06 + i * 0.065, z * 0.045], round: 0.02, line: 0.008 });
  // Tribal stripes (accent paint)
  for (const z of [1, -1]) {
    kit.box(B.Spine2, [0.012, 0.2, 0.025], acc, { pos: [0.19, 0.08, z * 0.15], rot: [z * 0.5, 0, 0], line: 0 });
    kit.box(B.RightArm, [0.025, 0.02, 0.12], acc, { pos: [0.08, -0.1, 0], rot: [0, 0, 0.3], line: 0 });
  }
  // Fur mantle around the shoulders
  // Draped pelt collar over the shoulders (lathe "poncho"), slightly further back than front
  kit.lathe(B.Spine2, [[0.25, 0.1], [0.27, 0.16], [0.22, 0.24], [0.12, 0.29], [0.05, 0.3]], fur, { pos: [-0.04, 0.0, 0], depth: 0.95 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 5) * Math.PI - Math.PI / 2;
    kit.cone(B.Spine2, 0.045, 0.13, fur, { pos: [-0.18 - Math.cos(a) * 0.04, 0.2, Math.sin(a) * 0.24], rot: [0, 0, 2.3], seg: 5, line: 0.01 });
  }
  // Bracers + spiked knuckles
  for (const [, fore, hand] of SIDES) {
    kit.cyl(fore, 0.1, 0.09, 0.2, trim, { pos: [0, -0.16, 0], seg: 8 });
    kit.cyl(fore, 0.105, 0.105, 0.03, acc, { pos: [0, -0.08, 0], seg: 8, line: 0.008 });
    kit.box(hand, [0.04, 0.05, 0.14], acc, { pos: [0.07, -0.08, 0], round: 0.012, line: 0.008 });
  }
  // Title belt with plate
  kit.cyl(B.Spine, 0.21, 0.205, 0.09, trim, { pos: [0, 0.0, 0], scale: [1, 1, 0.76], seg: 16 });
  kit.box(B.Spine, [0.04, 0.14, 0.22], acc, { pos: [0.2, 0.0, 0], round: 0.03 });
  kit.sphere(B.Spine, 0.04, T(0xffffff, 0x444444), { pos: [0.22, 0.0, 0], scale: [0.5, 1, 1], line: 0.006 });
  // Knee pads + boots
  for (const [, leg] of LEGS) {
    kit.sphere(leg, 0.11, acc, { pos: [0.03, 0, 0], scale: [1, 0.9, 1] });
    kit.cyl(leg, 0.12, 0.1, 0.2, T(0x2a2018), { pos: [0, -0.32, 0] });
  }
  // Head: mohawk fins + beard braid
  for (let i = 0; i < 5; i++) kit.cone(B.Head, 0.05, 0.17 - i * 0.012, hair, { pos: [0.07 - i * 0.055, 0.26 - i * 0.01, 0], rot: [0, 0, 0.35 - i * 0.32], seg: 4 });
  kit.box(B.Head, [0.1, 0.1, 0.17], hair, { pos: [0.075, 0.02, 0], round: 0.04 });
  kit.dangle(B.Head, [0.09, -0.03, 0], 3, 0.07, (kk, h, i) => {
    kk.sphere(h, 0.04 - i * 0.006, hair, { pos: [0, -0.035, 0], line: 0.008 });
    if (i === 2) kk.cyl(h, 0.03, 0.03, 0.02, acc, { pos: [0, -0.07, 0], line: 0.006 });
  }, { bias: [0.15, 0, 0], drag: 0.06, stiffness: 9, flutter: 0.04 });
}

/** Fallback for fighters without a hand-made design: a clean martial-artist built from the look. */
function generic(kit: Kit, lk: FighterLook): void {
  const k = lk.build === 'giant' ? 1.5 : lk.build === 'bulky' ? 1.28 : lk.build === 'slim' ? 0.86 : 1;
  body(kit, lk, { k, torsoMat: T(lk.body), legMat: T(lk.trim), shoeMat: T(shade(lk.trim, 0.7)), skinArms: true });
  spikyHair(kit, T(lk.hair));
  headband(kit, T(lk.accent));
}

const DESIGNS: Record<string, (kit: Kit, lk: FighterLook) => void> = { kestrel, torval, sera, vesha, brakka };

export function buildDesign(id: string, kit: Kit, lk: FighterLook): void {
  (DESIGNS[id] ?? generic)(kit, lk);
}
