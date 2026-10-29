// GameState: plain, serialisable data only (numbers, arrays, plain objects).
// Every number in here must be an integer (enforced by tests) so checksums are stable.
import { INPUT_HISTORY } from './input';

export const enum Act {
  Idle,
  Walk,
  Dash,
  Run,
  Crouch,
  JumpSquat,
  Air, // jumping / falling, actionable
  Land, // landing lag (normal or aerial)
  Attack, // performing a move (moveId)
  Shield,
  ShieldStun,
  Roll,
  SpotDodge,
  AirDodge,
  Hitstun, // includes tumble when launched hard
  Helpless, // special fall
  LedgeHang,
  LedgeGetup,
  Grabbing, // holding an opponent
  Grabbed,
  Dizzy, // shield break
  Dead, // waiting to respawn (Platform) or KO'd (Versus)
  Respawn, // on the respawn platform
  Beam, // locked in a beam clash
  Victory,
  KiCharge, // holding Guard + Special: fills ki, vulnerable
}

export const ACT_NAMES = [
  'Idle', 'Walk', 'Dash', 'Run', 'Crouch', 'JumpSquat', 'Air', 'Land', 'Attack', 'Shield', 'ShieldStun', 'Roll',
  'SpotDodge', 'AirDodge', 'Hitstun', 'Helpless', 'LedgeHang', 'LedgeGetup', 'Grabbing', 'Grabbed', 'Dizzy', 'Dead',
  'Respawn', 'Beam', 'Victory', 'KiCharge',
];

export const enum Mode {
  Platform,
  Versus,
}

export const enum Phase {
  Intro, // ROUND x / READY
  Fight,
  RoundEnd, // K.O. / TIME banner, slow-down
  MatchEnd,
}

export interface FighterState {
  char: number; // index into FIGHTERS
  port: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number; // 1 or -1
  act: number; // Act
  actFrame: number; // frames spent in current act (1 on first frame)
  move: number; // Mv or -1
  grounded: number; // 0/1
  platform: number; // index of platform stood on, -1 if airborne
  jumps: number; // air jumps remaining
  airDodged: number;
  fastFall: number;
  damage: number; // Platform percent ×10 (one decimal)
  health: number; // Versus health
  stocks: number;
  ki: number; // 0..300
  hitlag: number;
  hitstun: number;
  launchSpeed: number; // FX/frame, decays (for tumble visuals / trail)
  kbx: number; // knockback velocity (decays separately from self velocity, like Smash)
  kby: number;
  grabTimer: number;
  drop: number; // frames left ignoring soft platforms (drop-through)
  shieldHp: number; // ×100
  invuln: number; // intangibility frames remaining (respawn/ledge)
  ledge: number; // ledge index (-1 none)
  ledgeCooldown: number;
  grab: number; // port of grabbed/grabbing partner, -1 none
  lastHitBy: number; // port, -1 none
  hitGroups: number[]; // per hitbox group: bitmask of ports already hit by the current move
  charge: number; // smash charge frames
  landLag: number;
  inputs: number[]; // ring of the last INPUT_HISTORY masks, inputs[frame % N]
  consumed: number; // frame index of the last consumed button press (prevents double use)
  respawnTimer: number;
  ex: number; // current move is an EX/super version (render glow)
  combo: number; // consecutive hits taken without returning to neutral
  comboDamage: number;
  kos: number; // KOs scored
  falls: number;
  armorHits: number;
  // Handicaps / story modifiers (percent; 100 = normal)
  dmgMul: number; // damage dealt
  defMul: number; // damage taken
  maxHealth: number; // Versus health cap
  kiRegen: number; // passive ki per 60 frames
  kbMul: number; // knockback taken
  hitHeight: number; // last hit reaction: 0 high, 1 mid, 2 low
  guardLow: number; // 1 = crouch-guarding (Versus high/low blocking)
  wallBounced: number; // 1 once a wall bounce happened in the current combo
  throwTech: number; // frames left to break a fresh grab
  burstUsed: number; // Versus: 1 once the burst has been used this round
  shAerial: number; // 1 = short-hop aerial macro pending (Jump + Attack pressed together)
  stride: number; // Walk/Run: distance travelled along facing (FX) since the act began; drives the gait clock
}

export interface ProjectileState {
  owner: number; // port
  char: number;
  move: number; // Mv of the spawning move (def = FIGHTERS[char].moves[move].projectile)
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  life: number;
  len: number; // beam length
  hits: number; // hits remaining
  hitMask: number; // ports hit (single-hit) / rehit cooldown handled by rehitTimer
  rehitTimer: number;
  clash: number; // 1 while locked in a clash
  power: number; // ×100 damage multiplier (EX/super)
  dead: number;
}

export interface ClashState {
  active: number;
  a: number; // port A
  b: number; // port B
  pa: number; // projectile index A
  pb: number;
  pos: number; // meeting point x (FX)
  push: number; // -1000..1000: + means A winning
  timer: number;
  mashA: number;
  mashB: number;
}

export interface SimEvent {
  type: number; // EvType
  x: number;
  y: number;
  a: number;
  b: number;
}

export const enum EvType {
  Hit, // a = strength 0..3, b = victim port
  Shield, // a = port
  Whiff,
  Jump,
  Land,
  KO, // a = port
  Grab,
  Throw,
  Beam,
  Clash,
  ClashEnd,
  SuperStart, // a = port
  Respawn,
  RoundStart, // a = round
  Fight,
  RoundKO, // a = winner port or -1 draw
  TimeUp,
  MatchEnd, // a = winner
  Ledge,
  ShieldBreak,
  Dodge,
  Parry,
  Tech, // a = port
  Punish, // a = attacker port, b = victim port
  CounterHit, // a = attacker port, b = victim port
  FirstHit, // a = attacker port
  Cancel, // a = port (special/super cancel)
  WrongGuard, // a = attacker, b = victim; low hit a standing guard / overhead hit a crouching guard
  ThrowTech, // a = port that escaped
  WallBounce, // a = port bounced
  Burst, // a = port
  Launch, // a = attacker, b = victim (launcher into air combo)
}

export interface GameState {
  frame: number;
  rng: number;
  mode: number; // Mode
  stage: number;
  phase: number; // Phase
  phaseTimer: number;
  timer: number; // Versus round timer in frames
  round: number;
  roundWins: number[];
  winner: number; // match winner port, -1 none
  roundWinner: number;
  freeze: number; // super cinematic freeze frames remaining
  freezeOwner: number;
  slowmo: number; // KO slow-down frames
  fighters: FighterState[];
  projectiles: ProjectileState[];
  clash: ClashState;
  events: SimEvent[]; // events emitted during the last tick (output only, deterministic)
  training: number; // 1 = training: infinite stocks, damage reset
  stockCount: number;
  roundsToWin: number; // Versus: rounds needed to win the match (2 = best of 3)
  roundFrames: number; // Versus: frames per round, 0 = no time limit
  firstHit: number; // 1 once someone has landed the first hit this round
}

export function newFighterState(char: number, port: number, team: number): FighterState {
  return {
    char,
    port,
    team,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    act: Act.Idle,
    actFrame: 0,
    move: -1,
    grounded: 1,
    platform: 0,
    jumps: 0,
    airDodged: 0,
    fastFall: 0,
    damage: 0,
    health: 0,
    stocks: 0,
    ki: 0,
    hitlag: 0,
    hitstun: 0,
    launchSpeed: 0,
    kbx: 0,
    kby: 0,
    grabTimer: 0,
    drop: 0,
    shieldHp: 5000,
    invuln: 0,
    ledge: -1,
    ledgeCooldown: 0,
    grab: -1,
    lastHitBy: -1,
    hitGroups: [0, 0, 0, 0, 0, 0, 0, 0],
    charge: 0,
    landLag: 0,
    inputs: new Array(INPUT_HISTORY).fill(0),
    consumed: -1,
    respawnTimer: 0,
    ex: 0,
    combo: 0,
    comboDamage: 0,
    kos: 0,
    falls: 0,
    armorHits: 0,
    dmgMul: 100,
    defMul: 100,
    maxHealth: 1000,
    kiRegen: 0,
    kbMul: 100,
    hitHeight: 1,
    guardLow: 0,
    wallBounced: 0,
    throwTech: 0,
    burstUsed: 0,
    shAerial: 0,
    stride: 0,
  };
}

export function newClash(): ClashState {
  return { active: 0, a: -1, b: -1, pa: -1, pb: -1, pos: 0, push: 0, timer: 0, mashA: 0, mashB: 0 };
}

// ---------------------------------------------------------------------------
// Save / load / checksum (for rollback netcode and tests)
// ---------------------------------------------------------------------------

function cloneFighter(f: FighterState): FighterState {
  return { ...f, hitGroups: f.hitGroups.slice(), inputs: f.inputs.slice() };
}

/** Fast deep copy of the state. */
export function saveState(s: GameState): GameState {
  return {
    ...s,
    roundWins: s.roundWins.slice(),
    fighters: s.fighters.map(cloneFighter),
    projectiles: s.projectiles.map((p) => ({ ...p })),
    clash: { ...s.clash },
    events: s.events.map((e) => ({ ...e })),
  };
}

/** Restore a saved snapshot into a fresh copy (the snapshot stays reusable). */
export function loadState(snapshot: GameState): GameState {
  return saveState(snapshot);
}

// FNV-1a over 32-bit words.
function mix(h: number, v: number): number {
  // Split into low/high 32-bit parts so values beyond int32 hash correctly.
  const lo = v | 0;
  const hi = Math.floor(v / 4294967296) | 0;
  h = Math.imul(h ^ lo, 16777619);
  h = Math.imul(h ^ hi, 16777619);
  return h;
}

function hashValue(h: number, v: unknown): number {
  if (typeof v === 'number') return mix(h, v);
  if (Array.isArray(v)) {
    h = mix(h, v.length);
    for (let i = 0; i < v.length; i++) h = hashValue(h, v[i]);
    return h;
  }
  if (v && typeof v === 'object') {
    for (const k in v as Record<string, unknown>) h = hashValue(h, (v as Record<string, unknown>)[k]);
    return h;
  }
  return mix(h, v ? 1 : 0);
}

export function checksum(s: GameState): number {
  return hashValue(0x811c9dc5, s) >>> 0;
}
