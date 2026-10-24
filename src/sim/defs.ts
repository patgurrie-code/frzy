// Static data definitions (fighters, moves, projectiles). Never mutated at runtime,
// never stored in GameState (state refers to them by index).
import type { Anim } from './anim';

export const enum Mv {
  Jab,
  FTilt,
  UTilt,
  DTilt,
  FSmash,
  USmash,
  DSmash,
  NAir,
  FAir,
  BAir,
  UAir,
  DAir,
  NSpec,
  SSpec,
  USpec,
  DSpec,
  NSpecEx,
  SSpecEx,
  USpecEx,
  DSpecEx,
  Grab,
  Pummel,
  FThrow,
  BThrow,
  UThrow,
  DThrow,
  Super,
  DashAttack,
  LedgeAttack,
  Jab2,
  Jab3,
  CmdThrow, // throw performed automatically after a command-grab special connects
  COUNT,
}
export const MOVE_COUNT = Mv.COUNT as number;

export const MOVE_NAMES: readonly string[] = [
  'Jab', 'Forward Tilt', 'Up Tilt', 'Down Tilt', 'Forward Smash', 'Up Smash', 'Down Smash',
  'Neutral Air', 'Forward Air', 'Back Air', 'Up Air', 'Down Air',
  'Neutral Special', 'Side Special', 'Up Special', 'Down Special',
  'Neutral Special EX', 'Side Special EX', 'Up Special EX', 'Down Special EX',
  'Grab', 'Pummel', 'Forward Throw', 'Back Throw', 'Up Throw', 'Down Throw', 'Super', 'Dash Attack', 'Ledge Attack', 'Jab 2', 'Jab 3', 'Command Throw',
];

export const enum Sfx {
  Light,
  Medium,
  Heavy,
  Ki,
}

export const enum HitKind {
  Hit,
  Grab,
}

export interface HitboxDef {
  /** Active window, inclusive, in move frames (first frame of a move is 1). */
  start: number;
  end: number;
  bone: number;
  ox: number; // FX, in bone frame
  oy: number;
  r: number; // FX
  dmg: number; // percent (Platform). Versus multiplies by VERSUS_DMG_SCALE.
  bkb: number; // base knockback
  kbg: number; // knockback growth (100 = normal)
  angle: number; // degrees, 0 = forward, 90 = up. 361 = "auto" (low angle on ground, 40° in air)
  group: number; // a victim is hit once per group per move (0..7)
  ki: number; // ki gained by the attacker on hit (victim gains half of dmg)
  hitstun?: number; // Versus: fixed hitstun frames (else derived from knockback)
  hitlag?: number; // percent multiplier, default 100
  sfx: Sfx;
  kind: HitKind;
  /** Extra shield damage. */
  shield?: number;
  /** Fixed knockback (ignores percent), used by multi-hit links. */
  fixedKb?: boolean;
}

export interface MotionKey {
  f: number;
  /** FX per frame in facing space. Undefined = keep. */
  vx?: number;
  vy?: number;
}

export const enum ProjKind {
  Blast,
  Beam,
}

export interface ProjectileDef {
  kind: ProjKind;
  /** Spawn frame within the move. */
  f: number;
  bone: number;
  ox: number;
  oy: number;
  vx: number; // FX/frame (Blast) or beam growth speed (Beam)
  vy: number;
  r: number; // radius (Blast) or half-height (Beam)
  life: number; // frames
  maxLen: number; // Beam max length (FX)
  dmg: number;
  bkb: number;
  kbg: number;
  angle: number;
  ki: number;
  /** Frames between re-hits (multi-hit beams). 0 = single hit. */
  rehit: number;
  hits: number; // max number of hits
  color: number; // render hint (0xRRGGBB)
}

export interface MoveDef {
  name: string;
  anim: Anim;
  length: number;
  hitboxes: HitboxDef[];
  motion?: MotionKey[];
  /** Apply gravity during the move (default true in air). */
  gravity?: boolean;
  /** Aerials: landing lag when landing during the move. */
  landLag?: number;
  /** Enter helpless fall after the move ends (recoveries). */
  helpless?: boolean;
  /** Intangible on these frames (inclusive). */
  invuln?: [number, number];
  /** Super armour frames (take damage, no flinch). */
  armor?: [number, number];
  projectile?: ProjectileDef;
  /** Smash attacks: frame at which holding Attack pauses the move to charge. */
  charge?: number;
  /** Ki cost (0..300). EX = 100, Super = 300. */
  kiCost?: number;
  /** Throws: release frame + launch parameters. */
  throwRelease?: { f: number; dmg: number; bkb: number; kbg: number; angle: number; ki: number };
  /** Super: triggers the cinematic freeze before starting. */
  cinematic?: boolean;
  /** Can grab ledges from this frame (recoveries). */
  ledgeFrom?: number;
  /** End the move as soon as the fighter lands (e.g. dive kicks). */
  endOnLand?: boolean;
  /** Frame from which the move can be cancelled by any action (IASA). */
  iasa?: number;
  /** Ground move that keeps sliding with this traction (FX/frame^2). */
  slide?: boolean;
  /** Jab chains: pressing Attack from this frame on continues into `next`. */
  chain?: { from: number; next: number };
  /** Counter: if hit during [from, to], ignore the hit and jump to move frame `jump` (the counter strike). */
  counter?: { from: number; to: number; jump: number };
  /** Command grab: a grab hitbox in this move immediately performs this throw (usually Mv.CmdThrow). */
  grabThrow?: number;
}

export interface FighterStats {
  weight: number; // ~70 light .. 120 heavy
  walk: number; // FX/frame
  run: number;
  dash: number; // initial dash speed
  dashFrames: number;
  traction: number; // FX/frame^2 deceleration on ground
  jumpSquat: number;
  jumpV: number; // full hop initial vy
  hopV: number; // short hop vy
  airJumpV: number;
  airJumps: number;
  airSpeed: number; // max horizontal air speed
  airAccel: number;
  airFriction: number;
  gravity: number; // FX/frame^2
  fallSpeed: number; // max fall speed
  fastFall: number;
  scale: number; // per-mille skeleton scale
  shieldSize: number; // FX radius at full
}

export interface FighterAnims {
  idle: Anim;
  walk: Anim;
  run: Anim;
  dash: Anim;
  crouch: Anim;
  jumpSquat: Anim;
  jump: Anim;
  fall: Anim;
  land: Anim;
  shield: Anim;
  roll: Anim;
  airDodge: Anim;
  hitstun: Anim;
  tumble: Anim;
  ledge: Anim;
  getup: Anim;
  helpless: Anim;
  grabbed: Anim;
  dizzy: Anim;
  ko: Anim;
  victory: Anim;
  beam: Anim;
  charge: Anim;
}

export interface FighterLook {
  /** Primary, secondary, skin, accent colors (0xRRGGBB). */
  body: number;
  trim: number;
  skin: number;
  accent: number;
  hair: number;
  /** Placeholder build style hints for the renderer. */
  build: 'lean' | 'bulky' | 'slim' | 'giant';
  /** Optional props on the placeholder model. */
  weapon?: 'spear' | 'blades' | 'none';
  cape?: boolean;
  hairStyle?: 'spiky' | 'flat' | 'long' | 'mohawk' | 'hood';
}

export interface FighterDef {
  id: string;
  name: string;
  title: string;
  description: string;
  stats: FighterStats;
  anims: FighterAnims;
  moves: MoveDef[]; // indexed by Mv
  look: FighterLook;
  superName: string;
}
