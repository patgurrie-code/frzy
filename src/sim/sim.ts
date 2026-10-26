// The deterministic simulation. Pure: no DOM, no rendering, no floats, no Math.random/sin/cos, no Date.
// step(state, inputs) advances exactly one 60 Hz frame and mutates `state` in place.
import { abs, clamp, iatan2, icos, isin, isqrt, m, normDeg, sign } from './fixed';
import { rngU32 } from './rng';
import {
  IN_ATTACK,
  IN_DOWN,
  IN_GRAB,
  IN_GUARD,
  IN_JUMP,
  IN_LEFT,
  IN_RIGHT,
  IN_SPECIAL,
  IN_SMASH,
  IN_UP,
  INPUT_HISTORY,
} from './input';
import { HitboxDef, HitKind, MoveDef, Mv, ProjKind, ProjectileDef, FighterDef } from './defs';
import { FIGHTERS } from './fighters';
import { STAGES, StageDef } from './stage';
import {
  Act,
  EvType,
  FighterState,
  GameState,
  Mode,
  Phase,
  ProjectileState,
  newClash,
  newFighterState,
} from './state';
import { HURTBOXES, JointPositions, bonePoint, emptyPose, makeJoints, solveFK } from './skeleton';
import { samplePose } from './anim';
import { AnimRef, fighterAnim } from './pose';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
export const VS_HEALTH = 1000;
export const VS_DMG_SCALE = 7;
export const VS_ROUND_FRAMES = 99 * 60;
export const KI_MAX = 300;
export const KI_BAR = 100;
const BUFFER = 8;
const AUTO_RUN = 9; // Platform: walking this many frames in one direction breaks into a run
const KI_CHARGE_RATE = 1; // ki per frame while charging
const DOUBLE_TAP = 14;
const KB_DECAY = 66; // FX/frame^2 knockback decay
const LAUNCH_MUL = 39; // FX/frame per knockback unit
const SHIELD_MAX = 5000;
const INTRO_PLATFORM = 100;
const INTRO_VERSUS = 150;
const ROUND_END_FRAMES = 180;
const GRAB_HOLD = 90;
const RESPAWN_WAIT = 70;
const RESPAWN_FLOAT = 150;
const LEDGE_MAX = 300;

export interface MatchConfig {
  mode: Mode;
  stage: number;
  chars: number[]; // one per player (1..4)
  teams?: number[];
  stocks?: number;
  seed?: number;
  training?: boolean;
  /** Versus: rounds to win (default 2 = best of 3). */
  roundsToWin?: number;
  /** Versus: seconds per round (default 99, 0 = untimed). */
  timeLimit?: number;
  /** Per-player modifiers (story mode bosses, handicaps). Percent values, 100 = normal. */
  mods?: (FighterMods | undefined)[];
}

export interface FighterMods {
  dmg?: number;
  def?: number;
  health?: number;
  kiRegen?: number;
  ki?: number;
  kb?: number;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createGame(cfg: MatchConfig): GameState {
  const n = cfg.mode === Mode.Versus ? 2 : clamp(cfg.chars.length, 1, 4);
  const fighters: FighterState[] = [];
  for (let i = 0; i < n; i++) {
    fighters.push(newFighterState(cfg.chars[i] ?? 0, i, cfg.teams ? cfg.teams[i] : i));
  }
  const s: GameState = {
    frame: 0,
    rng: (cfg.seed ?? 12345) >>> 0,
    mode: cfg.mode,
    stage: cfg.stage,
    phase: Phase.Intro,
    phaseTimer: 0,
    timer: VS_ROUND_FRAMES,
    round: 1,
    roundWins: fighters.map(() => 0),
    winner: -1,
    roundWinner: -1,
    freeze: 0,
    freezeOwner: -1,
    slowmo: 0,
    fighters,
    projectiles: [],
    clash: newClash(),
    events: [],
    training: cfg.training ? 1 : 0,
    stockCount: cfg.stocks ?? 3,
    roundsToWin: cfg.roundsToWin ?? 2,
    firstHit: 0,
    roundFrames: cfg.timeLimit === undefined ? VS_ROUND_FRAMES : cfg.timeLimit * 60,
  };
  fighters.forEach((f, i) => {
    const md = cfg.mods?.[i];
    if (!md) return;
    f.dmgMul = md.dmg ?? 100;
    f.defMul = md.def ?? 100;
    f.maxHealth = md.health ?? VS_HEALTH;
    f.kiRegen = md.kiRegen ?? 0;
    f.kbMul = md.kb ?? 100;
    f.health = f.maxHealth;
    if (md.ki !== undefined) f.ki = md.ki;
  });
  resetRound(s);
  return s;
}

function resetRound(s: GameState): void {
  const st = STAGES[s.stage];
  s.projectiles.length = 0;
  s.clash = newClash();
  s.phase = Phase.Intro;
  s.phaseTimer = 0;
  s.timer = s.roundFrames;
  s.freeze = 0;
  s.freezeOwner = -1;
  s.slowmo = 0;
  s.roundWinner = -1;
  s.firstHit = 0;
  for (const f of s.fighters) {
    const sp = st.spawns[f.port % st.spawns.length];
    f.x = s.mode === Mode.Versus ? (f.port === 0 ? m(-2.5) : m(2.5)) : sp.x;
    f.y = sp.y;
    f.vx = f.vy = f.kbx = f.kby = 0;
    f.facing = f.x <= 0 ? 1 : -1;
    setAct(f, Act.Idle);
    f.grounded = 1;
    f.platform = 0;
    f.jumps = FIGHTERS[f.char].stats.airJumps;
    f.damage = 0;
    f.health = f.maxHealth;
    if (s.phase === Phase.Intro && s.round === 1 && s.frame === 0) {
      f.stocks = s.mode === Mode.Versus ? 1 : s.stockCount;
      if (s.training) f.ki = KI_MAX;
    }
    f.hitlag = f.hitstun = 0;
    f.shieldHp = SHIELD_MAX;
    f.invuln = 0;
    f.ledge = -1;
    f.grab = -1;
    f.lastHitBy = -1;
    f.combo = f.comboDamage = 0;
    f.burstUsed = 0;
    f.wallBounced = 0;
    f.guardLow = 0;
  }
}

// ---------------------------------------------------------------------------
// Scratch (not state): per-frame derived data, recomputed deterministically.
// ---------------------------------------------------------------------------
const joints: JointPositions[] = [makeJoints(), makeJoints(), makeJoints(), makeJoints()];
const scratchPose = emptyPose();
const scratchRef: AnimRef = { anim: FIGHTERS[0].anims.idle, frame: 0, clip: '' };

function computeJoints(f: FighterState, out: JointPositions): JointPositions {
  const d = FIGHTERS[f.char];
  fighterAnim(f, d, scratchRef);
  samplePose(scratchRef.anim, scratchRef.frame, scratchPose);
  return solveFK(scratchPose, d.stats.scale, out);
}

/** Public helper (renderer/debug/tests): joints of a fighter in fighter space (facing +X). */
export function fighterJoints(f: FighterState, out: JointPositions = makeJoints()): JointPositions {
  return computeJoints(f, out);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function emit(s: GameState, type: EvType, x = 0, y = 0, a = 0, b = 0): void {
  s.events.push({ type, x, y, a, b });
}

function setAct(f: FighterState, act: Act): void {
  f.act = act;
  f.actFrame = 0;
  if (act !== Act.JumpSquat) f.shAerial = 0;
  if (act !== Act.Attack && act !== Act.Grabbing) f.move = -1;
  f.charge = 0;
}

function inp(f: FighterState, frame: number): number {
  return f.inputs[((frame % INPUT_HISTORY) + INPUT_HISTORY) % INPUT_HISTORY];
}

/** Frame of the most recent un-consumed rising edge of `btn` within the buffer, or -1. */
function pressed(s: GameState, f: FighterState, btn: number, win = BUFFER): number {
  for (let k = 0; k < win; k++) {
    const fr = s.frame - k;
    if (fr <= f.consumed || fr < 1) break;
    if (inp(f, fr) & btn && !(inp(f, fr - 1) & btn)) return fr;
  }
  return -1;
}

/** Was `btn` newly pressed within the last `window` frames (ignores consumption)? */
function tappedWithin(s: GameState, f: FighterState, btn: number, win: number, from = s.frame): boolean {
  for (let k = 0; k < win; k++) {
    const fr = from - k;
    if (fr < 1) break;
    if (inp(f, fr) & btn && !(inp(f, fr - 1) & btn)) return true;
  }
  return false;
}

function consume(s: GameState, f: FighterState): void {
  f.consumed = s.frame;
}

function dirX(cur: number): number {
  return (cur & IN_RIGHT ? 1 : 0) - (cur & IN_LEFT ? 1 : 0);
}
function dirY(cur: number): number {
  return (cur & IN_UP ? 1 : 0) - (cur & IN_DOWN ? 1 : 0);
}

function stage(s: GameState): StageDef {
  return STAGES[s.stage];
}

function def(f: FighterState): FighterDef {
  return FIGHTERS[f.char];
}

function isAerial(move: number): boolean {
  return move >= Mv.NAir && move <= Mv.DAir;
}

function alive(f: FighterState): boolean {
  return f.act !== Act.Dead;
}

function addKi(f: FighterState, v: number): void {
  f.ki = clamp(f.ki + v, 0, KI_MAX);
}

function platformsActive(s: GameState): number {
  return s.mode === Mode.Versus ? 1 : stage(s).platforms.length;
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

export function step(s: GameState, inputs: readonly number[]): void {
  s.events.length = 0;
  s.frame++;
  const fr = s.frame;
  for (const f of s.fighters) f.inputs[fr % INPUT_HISTORY] = (inputs[f.port] ?? 0) | 0;

  if (s.phase === Phase.MatchEnd) {
    s.phaseTimer++;
    for (const f of s.fighters) updateIdleOnly(s, f);
    return;
  }

  // KO slow-motion: only simulate every other frame.
  if (s.slowmo > 0) {
    s.slowmo--;
    if (s.slowmo % 2 === 1) return;
  }

  // Super cinematic freeze.
  if (s.freeze > 0) {
    s.freeze--;
    return;
  }

  const fighting = s.phase === Phase.Fight;
  if (s.phase === Phase.Intro) {
    if (s.phaseTimer === 0) emit(s, EvType.RoundStart, 0, 0, s.round);
    s.phaseTimer++;
    const len = s.mode === Mode.Versus ? INTRO_VERSUS : INTRO_PLATFORM;
    if (s.phaseTimer >= len) {
      s.phase = Phase.Fight;
      s.phaseTimer = 0;
      emit(s, EvType.Fight);
    }
  } else if (s.phase === Phase.RoundEnd) {
    s.phaseTimer++;
    if (s.phaseTimer >= ROUND_END_FRAMES) endRound(s);
  }

  if (s.clash.active) updateClash(s);

  for (const f of s.fighters) {
    if (f.hitlag > 0) {
      f.hitlag--;
      continue;
    }
    updateFighter(s, f, fighting);
  }

  updateProjectiles(s);
  resolveHits(s);
  pushApart(s);
  if (s.mode === Mode.Versus) autoFace(s);
  checkBlastZones(s);

  if (fighting) {
    if (s.mode === Mode.Versus) {
      if (s.roundFrames > 0) {
        if (s.timer > 0) s.timer--;
        if (s.timer === 0) timeUp(s);
      }
    }
    checkMatchState(s);
  }
}

function updateIdleOnly(s: GameState, f: FighterState): void {
  f.actFrame++;
  if (f.act === Act.Dead) return;
  if (s.winner >= 0 && (f.port === s.winner || f.team === s.fighters[s.winner].team) && f.grounded && f.act !== Act.Victory) {
    setAct(f, Act.Victory);
  }
  if (!f.grounded) {
    f.vy = Math.max(f.vy - def(f).stats.gravity, -def(f).stats.fallSpeed);
    moveAndCollide(s, f);
  }
}

// ---------------------------------------------------------------------------
// Fighter state machine
// ---------------------------------------------------------------------------

function updateFighter(s: GameState, f: FighterState, fighting: boolean): void {
  const d = def(f);
  const st = d.stats;
  const cur = fighting ? inp(f, s.frame) : 0;
  f.actFrame++;
  if (f.invuln > 0) f.invuln--;
  if (f.ledgeCooldown > 0) f.ledgeCooldown--;
  if (f.drop > 0) f.drop--;
  if (s.training) f.ki = KI_MAX;
  else if (f.kiRegen > 0 && fighting && s.frame % 60 === 0) addKi(f, f.kiRegen);

  // Shield regen
  if (f.act !== Act.Shield && f.act !== Act.ShieldStun && f.shieldHp < SHIELD_MAX) f.shieldHp = Math.min(SHIELD_MAX, f.shieldHp + 8);

  // Knockback velocity decay
  if (f.kbx !== 0 || f.kby !== 0) {
    const mag = isqrt(f.kbx * f.kbx + f.kby * f.kby);
    const nm = mag - KB_DECAY;
    if (nm <= 0) {
      f.kbx = f.kby = 0;
    } else {
      f.kbx = Math.trunc((f.kbx * nm) / mag);
      f.kby = Math.trunc((f.kby * nm) / mag);
    }
    f.launchSpeed = Math.max(0, nm);
  } else f.launchSpeed = 0;

  switch (f.act) {
    case Act.Dead:
      updateDead(s, f);
      return;
    case Act.Respawn:
      f.vx = f.vy = 0;
      if (f.actFrame > RESPAWN_FLOAT || (f.actFrame > 20 && cur !== 0)) {
        setAct(f, Act.Air);
        f.invuln = 120;
        f.jumps = st.airJumps;
      }
      return;
    case Act.Victory:
      groundFriction(f, st.traction);
      moveAndCollide(s, f);
      return;
    case Act.Beam:
      // Locked in a beam clash; nothing moves.
      f.vx = f.vy = 0;
      return;
    case Act.Grabbed:
      updateGrabbed(s, f);
      return;
    case Act.Grabbing:
      updateGrabbing(s, f, cur);
      return;
    case Act.LedgeHang:
      updateLedge(s, f, cur);
      return;
    case Act.LedgeGetup:
      f.vx = -stage(s).ledges[Math.max(0, f.ledge)].dir * m(0.025);
      f.vy = 0;
      f.x += f.vx;
      if (f.actFrame >= 20) {
        f.ledge = -1;
        setAct(f, Act.Idle);
        f.vx = 0;
      }
      return;
  }

  if (f.act === Act.Hitstun && tryBurst(s, f, cur)) {
    // burst started (handled below as a normal move)
  } else if (f.act === Act.Hitstun) {
    f.hitstun--;
    if (f.hitstun <= 0) {
      setAct(f, f.grounded ? Act.Idle : Act.Air);
      if (f.grounded) f.combo = f.comboDamage = 0;
    }
  }
  if (f.act !== Act.Hitstun && f.combo === 0) f.wallBounced = 0;
  if (f.act === Act.ShieldStun) {
    f.hitstun--;
    if (f.hitstun <= 0) setAct(f, cur & IN_GUARD ? Act.Shield : Act.Idle);
  }
  if (f.act === Act.Dizzy && f.actFrame > (s.mode === Mode.Versus ? 90 : 200)) {
    setAct(f, Act.Idle);
    f.shieldHp = SHIELD_MAX >> 1;
  }

  if (f.act !== Act.Hitstun && f.act !== Act.Dizzy && f.combo > 0 && f.grounded) f.combo = f.comboDamage = 0;

  if (f.grounded) updateGround(s, f, cur);
  else updateAirState(s, f, cur);

  // Attack progression (after action selection so new moves start on frame 1)
  if (f.act === Act.Attack) progressMove(s, f, cur);

  moveAndCollide(s, f);
}

function updateDead(s: GameState, f: FighterState): void {
  f.vx = f.vy = f.kbx = f.kby = 0;
  if (s.mode === Mode.Versus) {
    // KO'd in Versus: lie on the floor.
    f.y = 0;
    f.grounded = 1;
    return;
  }
  if (f.stocks <= 0 && !s.training) return;
  f.respawnTimer--;
  if (f.respawnTimer <= 0) {
    const st = stage(s);
    f.x = st.spawns[f.port % st.spawns.length].x;
    f.y = st.respawnY;
    f.grounded = 0;
    f.platform = -1;
    f.damage = 0;
    f.facing = f.x <= 0 ? 1 : -1;
    setAct(f, Act.Respawn);
    f.invuln = RESPAWN_FLOAT + 120;
    emit(s, EvType.Respawn, f.x, f.y, f.port);
  }
}

// ---- ground ----

function updateGround(s: GameState, f: FighterState, cur: number): void {
  const st = def(f).stats;
  const dx = dirX(cur);
  switch (f.act) {
    case Act.Idle:
    case Act.Walk:
    case Act.Dash:
    case Act.Run:
    case Act.Crouch:
      if (groundActions(s, f, cur)) return;
      groundMovement(s, f, cur, dx);
      return;
    case Act.JumpSquat:
      if (f.shAerial && f.actFrame < st.jumpSquat) return;
      // Specials / grab out of jump squat. With tap-jump (Up = Jump) Attack/Smash here cancel the jump into
      // up tilt / up smash, so up-attacks stay usable on keyboard.
      if (pressed(s, f, IN_SPECIAL) >= 0 || pressed(s, f, IN_GRAB) >= 0) {
        if (groundActions(s, f, cur, true)) return;
      }
      if (pressed(s, f, IN_SMASH) >= 0) {
        consume(s, f);
        startMove(s, f, Mv.USmash);
        return;
      }
      if (pressed(s, f, IN_ATTACK) >= 0) {
        consume(s, f);
        startMove(s, f, cur & IN_SMASH ? Mv.USmash : Mv.UTilt);
        return;
      }
      // Preserve a running take-off; only brake if the player lets go or reverses.
      if (dx === 0 || sign(f.vx) !== dx) groundFriction(f, st.traction);
      if (f.actFrame >= st.jumpSquat) {
        const sh = f.shAerial;
        const full = (cur & IN_JUMP) !== 0 && !sh;
        f.vy = full ? st.jumpV : st.hopV;
        f.vx = approach(f.vx, dx * st.airSpeed, st.airAccel);
        f.grounded = 0;
        f.platform = -1;
        setAct(f, Act.Air);
        emit(s, EvType.Jump, f.x, f.y);
        if (sh) {
          const dy = dirY(cur);
          let mv: number = Mv.NAir;
          if (dy < 0) mv = Mv.DAir;
          else if (dx !== 0) mv = dx === f.facing ? Mv.FAir : Mv.BAir;
          startMove(s, f, mv);
        }
      }
      return;
    case Act.Land:
      groundFriction(f, st.traction);
      if (f.actFrame >= f.landLag) {
        setAct(f, Act.Idle);
        groundActions(s, f, cur);
      }
      return;
    case Act.Shield:
      updateShield(s, f, cur);
      return;
    case Act.KiCharge:
      groundFriction(f, st.traction);
      if ((cur & (IN_GUARD | IN_SPECIAL)) !== (IN_GUARD | IN_SPECIAL) || f.ki >= KI_MAX) {
        setAct(f, cur & IN_GUARD ? Act.Shield : Act.Idle);
        return;
      }
      addKi(f, KI_CHARGE_RATE);
      return;
    case Act.ShieldStun:
      groundFriction(f, st.traction >> 1);
      return;
    case Act.Roll: {
      const dur = 26;
      if (f.actFrame >= 4 && f.actFrame <= 20) f.vx = f.facing * -m(0.105);
      else f.vx = 0;
      if (f.actFrame >= dur) {
        setAct(f, Act.Idle);
      }
      return;
    }
    case Act.SpotDodge:
      f.vx = 0;
      if (f.actFrame >= 22) setAct(f, Act.Idle);
      return;
    case Act.Hitstun:
      groundFriction(f, st.traction);
      return;
    case Act.Dizzy:
      groundFriction(f, st.traction);
      return;
    case Act.Attack: {
      const mv = def(f).moves[f.move];
      if (mv.chain && f.actFrame >= mv.chain.from && dirX(cur) === 0 && dirY(cur) === 0 && pressed(s, f, IN_ATTACK) >= 0) {
        consume(s, f);
        startMove(s, f, mv.chain.next);
        return;
      }
      if (tryCancel(s, f, cur)) return;
      if (mv.iasa && f.actFrame >= mv.iasa && groundActions(s, f, cur)) return;
      if (!hasMotionX(mv, f.actFrame)) groundFriction(f, mv.slide ? st.traction >> 1 : st.traction);
      return;
    }
    case Act.Air:
    case Act.Helpless:
    case Act.AirDodge:
      // Shouldn't be grounded in these; recover.
      setAct(f, Act.Idle);
      return;
  }
}

function hasMotionX(mv: MoveDef, frame: number): boolean {
  if (!mv.motion) return false;
  let active = false;
  for (const k of mv.motion) if (k.f <= frame && k.vx !== undefined) active = k.vx !== 0;
  return active;
}

function groundFriction(f: FighterState, t: number): void {
  if (f.vx > 0) f.vx = Math.max(0, f.vx - t);
  else if (f.vx < 0) f.vx = Math.min(0, f.vx + t);
}

function groundMovement(s: GameState, f: FighterState, cur: number, dx: number): void {
  const st = def(f).stats;
  const dy = dirY(cur);
  const versus = s.mode === Mode.Versus;

  // Drop through soft platforms
  const plats = stage(s).platforms;
  if (dy < 0 && f.platform > 0 && !plats[f.platform].solid && tappedWithin(s, f, IN_DOWN, 3)) {
    f.grounded = 0;
    f.platform = -1;
    f.drop = 12;
    f.y -= 1;
    setAct(f, Act.Air);
    return;
  }

  if (dy < 0 && dx === 0) {
    if (f.act !== Act.Crouch) setAct(f, Act.Crouch);
    groundFriction(f, st.traction * 2);
    return;
  }

  if (dx !== 0) {
    if (f.act === Act.Dash) {
      const dashDir = sign(f.vx) || f.facing;
      if (dx !== dashDir) {
        if (versus) {
          setAct(f, Act.Walk);
          return;
        }
        f.facing = dx;
        setAct(f, Act.Dash);
      }
      f.vx = approach(f.vx, dx * st.dash, Math.max(1, Math.trunc(st.dash / 3)));
      if (f.actFrame >= st.dashFrames) setAct(f, versus && dx !== f.facing ? Act.Walk : Act.Run);
      return;
    }
    if (f.act === Act.Run) {
      if (dx !== f.facing) {
        // Run turnaround: skid then turn
        if (!versus) f.facing = dx;
        f.vx = approach(f.vx, 0, st.traction * 2);
        setAct(f, Act.Walk);
        return;
      }
      f.vx = approach(f.vx, f.facing * st.run, st.traction * 2);
      return;
    }
    // Double tap -> dash (back-dash in Versus keeps facing)
    const bit = dx > 0 ? IN_RIGHT : IN_LEFT;
    if (tappedWithin(s, f, bit, 1) && isDoubleTap(s, f, bit)) {
      if (!versus) f.facing = dx;
      setAct(f, Act.Dash);
      f.vx = approach(f.vx, dx * st.dash, Math.max(1, Math.trunc(st.dash / 3)));
      return;
    }
    if (!versus) f.facing = dx;
    if (f.act !== Act.Walk) setAct(f, Act.Walk);
    if (!versus && f.actFrame >= AUTO_RUN && sign(f.vx) === dx) {
      setAct(f, Act.Run);
      f.vx = approach(f.vx, dx * st.run, st.traction * 2);
      return;
    }
    const target = dx * (versus && dx !== f.facing ? (st.walk * 3) >> 2 : st.walk);
    f.vx = approach(f.vx, target, Math.max(1, Math.trunc(st.walk / 3)));
    return;
  }
  if (f.act !== Act.Idle) setAct(f, Act.Idle);
  groundFriction(f, st.traction);
}

function isDoubleTap(s: GameState, f: FighterState, bit: number): boolean {
  // Current frame is a rising edge; look for a previous rising edge within DOUBLE_TAP frames.
  for (let k = 2; k < DOUBLE_TAP && k < INPUT_HISTORY - 1; k++) {
    const fr = s.frame - k;
    if (fr < 1) break;
    if (inp(f, fr) & bit && !(inp(f, fr - 1) & bit)) return true;
  }
  return false;
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

/** Versus block level of a hit. */
function hitLevel(a: FighterState, h: HitboxDef): 'mid' | 'low' | 'overhead' {
  if (h.level) return h.level;
  if (!a.grounded && a.act === Act.Attack && isAerial(a.move)) return 'overhead';
  if (a.act === Act.Attack && (a.move === Mv.DTilt || a.move === Mv.DSmash)) return 'low';
  return 'mid';
}

/** Burst: Guard + Special while in hitstun (1 ki bar; once per round in Versus). */
function tryBurst(s: GameState, f: FighterState, cur: number): boolean {
  if (!(cur & IN_GUARD) || pressed(s, f, IN_SPECIAL) < 0) return false;
  if (f.ki < KI_BAR || (s.mode === Mode.Versus && f.burstUsed)) return false;
  consume(s, f);
  f.ki -= KI_BAR;
  f.burstUsed = 1;
  f.kbx = f.kby = f.vx = f.vy = 0;
  f.hitstun = 0;
  startMove(s, f, Mv.Burst);
  f.ex = 1;
  emit(s, EvType.Burst, f.x, f.y + m(1), f.port);
  return true;
}

function isNormal(move: number): boolean {
  return move <= Mv.DAir || move === Mv.DashAttack || move === Mv.Jab2 || move === Mv.Jab3;
}
function isSpecial(move: number): boolean {
  return move >= Mv.NSpec && move <= Mv.DSpecEx;
}

/**
 * Cancels (fighting-game style): a normal that has hit can cancel into a special (or EX / super);
 * a special that has hit can cancel into the super.
 */
function tryCancel(s: GameState, f: FighterState, cur: number): boolean {
  if (f.act !== Act.Attack || f.move < 0) return false;
  let hit = 0;
  for (const g of f.hitGroups) hit |= g;
  if (!hit) return false;
  const bothPressed = f.ki >= KI_MAX && pressed(s, f, IN_SPECIAL) >= 0 && pressed(s, f, IN_ATTACK) >= 0;
  if (isNormal(f.move)) {
    if (bothPressed && trySuper(s, f)) {
      emit(s, EvType.Cancel, f.x, f.y, f.port);
      return true;
    }
    if (pressed(s, f, IN_SPECIAL) >= 0) {
      consume(s, f);
      const dx = dirX(cur);
      const dy = dirY(cur);
      if (dx !== 0 && dy === 0) f.facing = dx;
      startSpecial(s, f, dx, dy, (cur & IN_SMASH) !== 0);
      emit(s, EvType.Cancel, f.x, f.y, f.port);
      return true;
    }
  } else if (isSpecial(f.move) && bothPressed && trySuper(s, f)) {
    emit(s, EvType.Cancel, f.x, f.y, f.port);
    return true;
  }
  return false;
}

/** Ground action selection. Returns true if an action started. */
function groundActions(s: GameState, f: FighterState, cur: number, fromJumpSquat = false): boolean {
  const dx = dirX(cur);
  const dy = dirY(cur);
  if (trySuper(s, f)) return true;
  // Ki charge: hold Guard + Special on the ground
  if (cur & IN_GUARD && cur & IN_SPECIAL && !fromJumpSquat && f.ki < KI_MAX) {
    consume(s, f);
    setAct(f, Act.KiCharge);
    return true;
  }
  if (pressed(s, f, IN_SPECIAL) >= 0) {
    consume(s, f);
    if (dx !== 0 && dy === 0) f.facing = dx;
    startSpecial(s, f, dx, dy, (cur & IN_SMASH) !== 0);
    return true;
  }
  if (pressed(s, f, IN_GRAB) >= 0) {
    consume(s, f);
    startMove(s, f, Mv.Grab);
    return true;
  }
  if (fromJumpSquat) return false;
  // Short-hop aerial macro: Jump + Attack on the same frame (without Up, so W's tap-jump up tilt still works)
  const jp = pressed(s, f, IN_JUMP);
  const ap = pressed(s, f, IN_ATTACK);
  if (jp >= 0 && ap >= 0 && abs(jp - ap) <= 1 && !(cur & IN_UP)) {
    consume(s, f);
    setAct(f, Act.JumpSquat);
    f.shAerial = 1;
    return true;
  }
  const smashPress = pressed(s, f, IN_SMASH) >= 0;
  const atk = smashPress ? s.frame : pressed(s, f, IN_ATTACK);
  if (atk >= 0) {
    consume(s, f);
    const smash = smashPress || (cur & IN_SMASH) !== 0;
    if (!smash && (f.act === Act.Dash || f.act === Act.Run)) {
      startMove(s, f, Mv.DashAttack);
      return true;
    }
    if (dy > 0) startMove(s, f, smash ? Mv.USmash : Mv.UTilt);
    else if (dy < 0) startMove(s, f, smash ? Mv.DSmash : Mv.DTilt);
    else if (dx !== 0) {
      if (s.mode !== Mode.Versus) f.facing = dx;
      startMove(s, f, smash ? Mv.FSmash : Mv.FTilt);
    } else startMove(s, f, smash ? Mv.FSmash : Mv.Jab);
    return true;
  }
  if (pressed(s, f, IN_JUMP) >= 0) {
    consume(s, f);
    setAct(f, Act.JumpSquat);
    return true;
  }
  if (cur & IN_GUARD || pressed(s, f, IN_GUARD) >= 0) {
    consume(s, f);
    setAct(f, Act.Shield);
    emit(s, EvType.Dodge, f.x, f.y, f.port, 0);
    return true;
  }
  return false;
}

/**
 * Super = Attack + Special pressed together (within 3 frames) with a full ki meter.
 * With full ki, a lone Attack/Special press waits up to 2 frames for its partner
 * (returns true = "pending", so nothing else starts this frame).
 */
function trySuper(s: GameState, f: FighterState): boolean {
  if (f.ki < KI_MAX) return false;
  const sp = pressed(s, f, IN_SPECIAL);
  const at = pressed(s, f, IN_ATTACK);
  if (sp < 0 && at < 0) return false;
  if (sp < 0 || at < 0) {
    const first = sp >= 0 ? sp : at;
    return s.frame - first < 2;
  }
  if (abs(sp - at) > 3) return false;
  consume(s, f);
  f.ki -= KI_MAX;
  startMove(s, f, Mv.Super);
  f.ex = 2;
  s.freeze = 50;
  s.freezeOwner = f.port;
  emit(s, EvType.SuperStart, f.x, f.y, f.port);
  return true;
}

/** `ex` = Smash held: spend 1 ki bar for the EX version. */
function startSpecial(s: GameState, f: FighterState, dx: number, dy: number, ex: boolean): void {
  let mv: number = Mv.NSpec;
  if (dy > 0) mv = Mv.USpec;
  else if (dy < 0) mv = Mv.DSpec;
  else if (dx !== 0) mv = Mv.SSpec;
  if (ex && f.ki >= KI_BAR) {
    f.ki -= KI_BAR;
    startMove(s, f, mv + (Mv.NSpecEx - Mv.NSpec));
    f.ex = 1;
    return;
  }
  startMove(s, f, mv);
}

function startMove(s: GameState, f: FighterState, move: number): void {
  setAct(f, Act.Attack);
  f.move = move;
  f.actFrame = 1; // first frame of a move is frame 1 (and is simulated this tick)
  f.ex = 0;
  for (let i = 0; i < f.hitGroups.length; i++) f.hitGroups[i] = 0;
  const mv = def(f).moves[move];
  if (mv.hitboxes.length === 0 && !mv.projectile && !mv.throwRelease) return;
  if (move !== Mv.Pummel) emit(s, EvType.Whiff, f.x, f.y, f.port, move);
}

function updateShield(s: GameState, f: FighterState, cur: number): void {
  const st = def(f).stats;
  f.guardLow = s.mode === Mode.Versus && cur & IN_DOWN ? 1 : 0;
  groundFriction(f, st.traction);
  if (s.mode !== Mode.Versus) f.shieldHp -= 14;
  if (f.shieldHp <= 0) {
    shieldBreak(s, f);
    return;
  }
  if (trySuper(s, f)) return;
  if (cur & IN_SPECIAL && f.ki < KI_MAX) {
    consume(s, f);
    setAct(f, Act.KiCharge);
    return;
  }
  if (pressed(s, f, IN_JUMP) >= 0) {
    consume(s, f);
    setAct(f, Act.JumpSquat);
    return;
  }
  if (pressed(s, f, IN_GRAB) >= 0 || pressed(s, f, IN_ATTACK) >= 0) {
    consume(s, f);
    startMove(s, f, Mv.Grab);
    return;
  }
  if (f.actFrame > 2) {
    const r = tappedWithin(s, f, IN_RIGHT, 2);
    const l = tappedWithin(s, f, IN_LEFT, 2);
    const dn = s.mode !== Mode.Versus && tappedWithin(s, f, IN_DOWN, 2);
    if (r || l) {
      const dir = r ? 1 : -1;
      f.facing = -dir; // roll moves "backwards" relative to facing
      setAct(f, Act.Roll);
      f.invuln = 0;
      emit(s, EvType.Dodge, f.x, f.y, f.port, 1);
      return;
    }
    if (dn) {
      setAct(f, Act.SpotDodge);
      emit(s, EvType.Dodge, f.x, f.y, f.port, 1);
      return;
    }
  }
  if (!(cur & IN_GUARD) && f.actFrame >= 4) {
    setAct(f, Act.Land);
    f.landLag = 6;
  }
}

function shieldBreak(s: GameState, f: FighterState): void {
  f.shieldHp = 0;
  setAct(f, Act.Dizzy);
  f.vy = m(0.12);
  f.grounded = 0;
  f.platform = -1;
  emit(s, EvType.ShieldBreak, f.x, f.y, f.port);
}

// ---- air ----

function updateAirState(s: GameState, f: FighterState, cur: number): void {
  const st = def(f).stats;
  const dx = dirX(cur);
  switch (f.act) {
    case Act.Air:
      if (airActions(s, f, cur)) break;
      airDrift(f, dx, st.airSpeed);
      break;
    case Act.Helpless:
      airDrift(f, dx, (st.airSpeed * 3) >> 2);
      break;
    case Act.AirDodge:
      if (f.actFrame === 1) {
        const dy = dirY(cur);
        if (dx !== 0 || dy !== 0) {
          const ang = iatan2(dy, dx);
          f.vx = Math.trunc((icos(ang) * m(0.2)) / 10000);
          f.vy = Math.trunc((isin(ang) * m(0.2)) / 10000);
        } else {
          f.vy = Math.max(f.vy, 0) >> 1;
        }
      } else if (f.actFrame <= 16) {
        f.vx = Math.trunc((f.vx * 9) / 10);
        f.vy = Math.trunc((f.vy * 9) / 10);
      }
      if (f.actFrame >= 30) setAct(f, Act.Air);
      break;
    case Act.Hitstun:
    case Act.Dizzy:
      airDrift(f, f.act === Act.Hitstun && f.hitstun < 10 ? dx : 0, st.airSpeed);
      break;
    case Act.Attack: {
      const mv = def(f).moves[f.move];
      if (tryCancel(s, f, cur)) break;
      if (mv.iasa && f.actFrame >= mv.iasa && airActions(s, f, cur)) break;
      if (!hasMotionX(mv, f.actFrame)) airDrift(f, dx, st.airSpeed);
      break;
    }
    default:
      // Ground states that lost ground (walked off etc.)
      if (f.act === Act.Shield || f.act === Act.ShieldStun || f.act === Act.Idle || f.act === Act.Walk || f.act === Act.Run || f.act === Act.Dash || f.act === Act.Crouch || f.act === Act.Land || f.act === Act.Roll || f.act === Act.SpotDodge || f.act === Act.JumpSquat) {
        setAct(f, Act.Air);
      }
  }
  applyGravity(s, f, cur);
  tryLedgeGrab(s, f);
}

function airDrift(f: FighterState, dx: number, max: number): void {
  const st = def(f).stats;
  if (dx !== 0) {
    const target = dx * max;
    const excess = sign(f.vx) === dx && abs(f.vx) > max;
    f.vx = approach(f.vx, target, excess ? st.airFriction : st.airAccel);
  } else {
    f.vx = approach(f.vx, 0, st.airFriction);
  }
}

function applyGravity(s: GameState, f: FighterState, cur: number): void {
  const st = def(f).stats;
  if (f.act === Act.Attack) {
    const mv = def(f).moves[f.move];
    if (mv.gravity === false) return;
  }
  if (f.act === Act.AirDodge && f.actFrame <= 16) return;
  // Fast fall: tap down at or after the apex.
  if (f.vy <= 0 && !f.fastFall && f.act !== Act.Hitstun && tappedWithin(s, f, IN_DOWN, 2) && cur & IN_DOWN) {
    f.fastFall = 1;
    f.vy = -st.fastFall;
  }
  const maxFall = f.fastFall ? st.fastFall : st.fallSpeed;
  f.vy = Math.max(f.vy - st.gravity, -maxFall);
}

function airActions(s: GameState, f: FighterState, cur: number): boolean {
  const dx = dirX(cur);
  const dy = dirY(cur);
  if (trySuper(s, f)) return true;
  if (pressed(s, f, IN_SPECIAL) >= 0) {
    consume(s, f);
    if (dx !== 0 && dy === 0) f.facing = dx;
    startSpecial(s, f, dx, dy, (cur & IN_SMASH) !== 0);
    return true;
  }
  if (pressed(s, f, IN_ATTACK) >= 0 || pressed(s, f, IN_GRAB) >= 0 || pressed(s, f, IN_SMASH) >= 0) {
    consume(s, f);
    let mv: number = Mv.NAir;
    if (dy > 0) mv = Mv.UAir;
    else if (dy < 0) mv = Mv.DAir;
    else if (dx !== 0) mv = dx === f.facing ? Mv.FAir : Mv.BAir;
    startMove(s, f, mv);
    return true;
  }
  if (pressed(s, f, IN_JUMP) >= 0 && f.jumps > 0) {
    consume(s, f);
    f.jumps--;
    f.vy = def(f).stats.airJumpV;
    f.fastFall = 0;
    f.vx = approach(f.vx, dx * def(f).stats.airSpeed, def(f).stats.airAccel * 2);
    if (dx !== 0 && s.mode !== Mode.Versus) f.facing = dx;
    setAct(f, Act.Air);
    emit(s, EvType.Jump, f.x, f.y, 1);
    return true;
  }
  if (pressed(s, f, IN_GUARD) >= 0 && !f.airDodged) {
    consume(s, f);
    f.airDodged = 1;
    setAct(f, Act.AirDodge);
    emit(s, EvType.Dodge, f.x, f.y, f.port, 1);
    return true;
  }
  return false;
}

// ---- moves ----

function progressMove(s: GameState, f: FighterState, cur: number): void {
  const mv = def(f).moves[f.move];
  // Smash charge: hold Attack to pause on the charge frame.
  if (mv.charge && f.actFrame === mv.charge + 1 && cur & (IN_ATTACK | IN_SMASH) && f.charge < 60) {
    f.charge++;
    f.actFrame--;
  }
  const fr = f.actFrame;
  if (mv.motion) {
    for (const k of mv.motion) {
      if (k.f === fr) {
        if (k.vx !== undefined) f.vx = k.vx * f.facing;
        if (k.vy !== undefined) {
          f.vy = k.vy;
          if (k.vy > 0 && f.grounded) {
            f.grounded = 0;
            f.platform = -1;
          }
        }
      }
    }
  }
  if (mv.projectile && mv.projectile.f === fr) spawnProjectile(s, f, mv.projectile);
  if (mv.throwRelease && mv.throwRelease.f === fr) releaseThrow(s, f, mv);
  if (fr >= mv.length) {
    f.ex = 0;
    if (mv.helpless && !f.grounded) setAct(f, Act.Helpless);
    else setAct(f, f.grounded ? Act.Idle : Act.Air);
  }
}

function spawnProjectile(s: GameState, f: FighterState, p: ProjectileDef): void {
  const j = computeJoints(f, joints[f.port]);
  const [bx, by] = bonePoint(j, p.bone, p.ox, p.oy);
  const x = f.x + bx * f.facing;
  const y = f.y + by;
  s.projectiles.push({
    owner: f.port,
    char: f.char,
    move: f.move,
    x,
    y,
    vx: p.kind === ProjKind.Blast ? p.vx * f.facing : 0,
    vy: p.vy,
    facing: f.facing,
    life: p.life,
    len: 0,
    hits: p.hits,
    hitMask: 0,
    rehitTimer: 0,
    clash: 0,
    power: f.move === Mv.Super ? 100 : f.ex ? 130 : 100,
    dead: 0,
  });
  emit(s, p.kind === ProjKind.Beam ? EvType.Beam : EvType.Whiff, x, y, f.port, p.kind);
}

// ---- grabs ----

function updateGrabbing(s: GameState, f: FighterState, cur: number): void {
  const v = s.fighters[f.grab];
  groundFriction(f, def(f).stats.traction);
  if (!v || v.act !== Act.Grabbed) {
    f.grab = -1;
    setAct(f, Act.Idle);
    return;
  }
  f.grabTimer--;
  holdVictim(f, v);
  if (f.actFrame > 6) {
    const dx = dirX(cur);
    const dy = dirY(cur);
    let t = -1;
    if (dx === f.facing) t = Mv.FThrow;
    else if (dx === -f.facing) t = Mv.BThrow;
    else if (dy > 0) t = Mv.UThrow;
    else if (dy < 0) t = Mv.DThrow;
    if (t >= 0) {
      consume(s, f);
      setAct(f, Act.Attack);
      f.move = t;
      emit(s, EvType.Throw, f.x, f.y, f.port);
      return;
    }
    if (pressed(s, f, IN_ATTACK) >= 0 && f.grabTimer > 0) {
      consume(s, f);
      // Pummel: small damage, keeps the grab
      dealDamage(s, f, v, 2, 0);
      f.hitlag = v.hitlag = 3;
      emit(s, EvType.Hit, v.x, v.y + m(1), 0, v.port);
      f.actFrame = 1;
      return;
    }
  }
  if (f.grabTimer <= 0) {
    // Grab release
    f.grab = -1;
    v.grab = -1;
    setAct(f, Act.Idle);
    setAct(v, Act.Idle);
    f.vx = -f.facing * m(0.06);
    v.vx = f.facing * m(0.08);
  }
}

function holdVictim(f: FighterState, v: FighterState): void {
  const reach = Math.trunc((m(0.62) * def(f).stats.scale) / 1000);
  v.x = f.x + f.facing * reach;
  v.y = f.y;
  v.vx = v.vy = v.kbx = v.kby = 0;
  v.facing = -f.facing;
}

function updateGrabbed(s: GameState, f: FighterState): void {
  const g = s.fighters[f.grab];
  if (!g || (g.act !== Act.Grabbing && !(g.act === Act.Attack && g.grab === f.port))) {
    f.grab = -1;
    setAct(f, f.grounded ? Act.Idle : Act.Air);
    return;
  }
  // Throw escape: Grab or Attack within the tech window breaks a normal grab.
  if (f.throwTech > 0) {
    f.throwTech--;
    if ((pressed(s, f, IN_GRAB, 3) >= 0 || pressed(s, f, IN_ATTACK, 3) >= 0) && g.act === Act.Grabbing) {
      consume(s, f);
      g.grab = -1;
      f.grab = -1;
      setAct(g, Act.Land);
      g.landLag = 12;
      setAct(f, Act.Land);
      f.landLag = 12;
      g.vx = -g.facing * m(0.12);
      f.vx = -f.facing * m(0.12);
      f.throwTech = 0;
      emit(s, EvType.ThrowTech, (f.x + g.x) >> 1, f.y + m(1), f.port, g.port);
      return;
    }
  }
  // Mash to escape: any new button press shortens the holder's timer.
  const cur = inp(f, s.frame);
  const prev = inp(f, s.frame - 1);
  const newPress = cur & ~prev;
  if (newPress !== 0 && g.act === Act.Grabbing) g.grabTimer -= 4;
  if (g.act === Act.Attack) holdVictim(g, f);
}

function releaseThrow(s: GameState, f: FighterState, mv: MoveDef): void {
  const v = s.fighters[f.grab];
  f.grab = -1;
  if (!v || v.act !== Act.Grabbed) return;
  v.grab = -1;
  const t = mv.throwRelease!;
  const h: HitboxDef = {
    start: 0,
    end: 0,
    bone: 0,
    ox: 0,
    oy: 0,
    r: 0,
    dmg: t.dmg,
    bkb: t.bkb,
    kbg: t.kbg,
    angle: t.angle,
    group: 0,
    ki: t.ki,
    sfx: 1,
    kind: HitKind.Hit,
  };
  applyHit(s, f, v, h, 100, f.facing, v.x, v.y + m(0.9), true);
}

// ---- ledges ----

function tryLedgeGrab(s: GameState, f: FighterState): void {
  if (s.mode === Mode.Versus || f.ledgeCooldown > 0 || f.vy > 0) return;
  if (f.act === Act.Attack) {
    const mv = def(f).moves[f.move];
    if (!mv.ledgeFrom || f.actFrame < mv.ledgeFrom) return;
  } else if (f.act !== Act.Air && f.act !== Act.Helpless && f.act !== Act.AirDodge) return;
  const ledges = stage(s).ledges;
  const scale = def(f).stats.scale;
  for (let i = 0; i < ledges.length; i++) {
    const L = ledges[i];
    let occupant: FighterState | null = null;
    for (const o of s.fighters) if (o !== f && o.act === Act.LedgeHang && o.ledge === i) occupant = o;
    const outward = (f.x - L.x) * L.dir; // >0 = outside the stage
    const below = L.y - f.y;
    const h = Math.trunc((m(1.9) * scale) / 1000);
    if (outward > -m(0.25) && outward < m(0.8) && below > m(0.6) && below < h) {
      if (occupant) {
        // Ledge trump: the newcomer takes the ledge and pops the hanger off (no invulnerability for them)
        if (occupant.actFrame < 10) continue;
        setAct(occupant, Act.Air);
        occupant.ledge = -1;
        occupant.ledgeCooldown = 40;
        occupant.invuln = 0;
        occupant.vx = L.dir * m(0.06);
        occupant.vy = m(0.12);
        occupant.y -= m(0.3);
      }
      grabLedge(s, f, i);
      return;
    }
  }
}

function grabLedge(s: GameState, f: FighterState, i: number): void {
  const L = stage(s).ledges[i];
  setAct(f, Act.LedgeHang);
  f.ledge = i;
  f.x = L.x + L.dir * m(0.3);
  f.y = L.y;
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.facing = -L.dir;
  f.grounded = 0;
  f.platform = -1;
  f.fastFall = 0;
  f.jumps = def(f).stats.airJumps;
  f.airDodged = 0;
  f.invuln = Math.max(f.invuln, 30);
  emit(s, EvType.Ledge, f.x, f.y, f.port);
}

function updateLedge(s: GameState, f: FighterState, cur: number): void {
  const L = stage(s).ledges[f.ledge];
  f.vx = f.vy = 0;
  f.x = L.x + L.dir * m(0.3);
  f.y = L.y;
  if (f.actFrame > LEDGE_MAX) {
    dropLedge(f);
    return;
  }
  if (f.actFrame < 8) return;
  const dx = dirX(cur);
  const dy = dirY(cur);
  if (pressed(s, f, IN_JUMP) >= 0) {
    consume(s, f);
    f.ledge = -1;
    setAct(f, Act.Air);
    f.vy = def(f).stats.jumpV;
    f.x = L.x - L.dir * m(0.1);
    f.y = L.y + m(0.2);
    f.ledgeCooldown = 20;
    emit(s, EvType.Jump, f.x, f.y);
    return;
  }
  if (pressed(s, f, IN_ATTACK) >= 0) {
    consume(s, f);
    f.x = L.x - L.dir * m(0.45);
    f.grounded = 1;
    f.platform = 0;
    f.ledge = -1;
    startMove(s, f, Mv.LedgeAttack);
    return;
  }
  if (dx === -L.dir || dy > 0) {
    setAct(f, Act.LedgeGetup);
    f.x = L.x - L.dir * m(0.45);
    f.grounded = 1;
    f.platform = 0;
    f.invuln = Math.max(f.invuln, 14);
    return;
  }
  if (dy < 0 || dx === L.dir) dropLedge(f);
}

function dropLedge(f: FighterState): void {
  setAct(f, Act.Air);
  f.ledge = -1;
  f.ledgeCooldown = 30;
  f.y -= m(1.5);
  f.x += f.facing * -m(0.1);
}

// ---------------------------------------------------------------------------
// Movement & collision
// ---------------------------------------------------------------------------

function moveAndCollide(s: GameState, f: FighterState): void {
  const st = stage(s);
  const plats = st.platforms;
  const np = platformsActive(s);
  const prevY = f.y;
  f.x += f.vx + f.kbx;
  f.y += f.vy + f.kby;

  if (s.mode === Mode.Versus) {
    const lim = m(0.4);
    for (const side of [-1, 1]) {
      const wx = side < 0 ? st.wallL + lim : st.wallR - lim;
      if ((side < 0 && f.x < wx) || (side > 0 && f.x > wx)) {
        f.x = wx;
        const into = f.kbx * side > 0;
        if (into && f.act === Act.Hitstun && !f.wallBounced && abs(f.kbx) > m(0.12)) {
          // Wall bounce: once per combo — pops the victim back out for a follow-up
          f.wallBounced = 1;
          f.kbx = -Math.trunc((f.kbx * 45) / 100);
          f.kby = Math.max(f.kby, m(0.17));
          f.vy = 0;
          f.grounded = 0;
          f.platform = -1;
          f.hitstun += 16;
          emit(s, EvType.WallBounce, f.x, f.y + m(1), f.port);
        } else if (into) f.kbx = -f.kbx >> 2;
      }
    }
  }

  if (f.grounded) {
    const p = plats[f.platform] ?? plats[0];
    if (f.x < p.x1 || f.x > p.x2) {
      // Walked / slid off the edge
      f.grounded = 0;
      f.platform = -1;
      if (f.act === Act.Idle || f.act === Act.Walk || f.act === Act.Run || f.act === Act.Dash || f.act === Act.Crouch || f.act === Act.Land || f.act === Act.Shield) setAct(f, Act.Air);
      if (f.act === Act.Roll || f.act === Act.SpotDodge) setAct(f, Act.Air);
    } else {
      f.y = p.y;
      if (f.vy < 0) f.vy = 0;
      if (f.kby < 0) f.kby = 0;
    }
  } else {
    const fallingVy = f.vy + f.kby;
    if (fallingVy <= 0) {
      for (let i = 0; i < np; i++) {
        const p = plats[i];
        if (!p.solid && f.drop > 0) continue;
        if (!p.solid && (f.act === Act.Hitstun && f.kby < -m(0.05))) {
          // tumbling fast through soft platforms is allowed only while launched downward hard
        }
        if (prevY >= p.y && f.y <= p.y && f.x >= p.x1 && f.x <= p.x2) {
          land(s, f, i);
          break;
        }
      }
    }
    // Main stage block sides
    const p0 = plats[0];
    if (!f.grounded && f.y < p0.y && f.y > p0.bottom - m(1.8) && f.x > p0.x1 && f.x < p0.x2) {
      const nearEdge = f.x - p0.x1 < m(0.6) || p0.x2 - f.x < m(0.6);
      if (f.y > p0.bottom || nearEdge) {
        // inside the block: push to the nearest side
        if (f.x - p0.x1 < p0.x2 - f.x) f.x = p0.x1 - 1;
        else f.x = p0.x2 + 1;
        f.vx = 0;
        f.kbx = -f.kbx >> 1;
      } else if (f.vy + f.kby > 0 && f.y + m(1.6) > p0.bottom) {
        // head bonk on the underside
        f.y = p0.bottom - m(1.6);
        f.vy = 0;
        if (f.kby > 0) f.kby = -f.kby >> 1;
      }
    }
  }
}

function land(s: GameState, f: FighterState, plat: number): void {
  const p = stage(s).platforms[plat];
  const impact = f.vy + f.kby;
  f.y = p.y;
  f.grounded = 1;
  f.platform = plat;
  f.vy = 0;
  f.fastFall = 0;
  f.jumps = def(f).stats.airJumps;
  f.airDodged = 0;
  emit(s, EvType.Land, f.x, f.y, f.port);
  switch (f.act) {
    case Act.Attack: {
      const mv = def(f).moves[f.move];
      if (isAerial(f.move) || mv.endOnLand) {
        setAct(f, Act.Land);
        f.landLag = mv.landLag ?? 8;
        f.kby = 0;
      } else if (mv.helpless) {
        setAct(f, Act.Land);
        f.landLag = 14;
      }
      break;
    }
    case Act.Helpless:
      setAct(f, Act.Land);
      f.landLag = 14;
      break;
    case Act.AirDodge:
      setAct(f, Act.Land);
      f.landLag = 10;
      break;
    case Act.Hitstun:
      if (tappedWithin(s, f, IN_GUARD, 12) && (f.hitstun > 6 || impact < -m(0.18))) {
        // Tech: guard pressed just before landing — recover instantly (roll if holding a direction)
        const dx = dirX(inp(f, s.frame));
        f.kbx = f.kby = 0;
        f.hitstun = 0;
        f.combo = f.comboDamage = 0;
        setAct(f, Act.Land);
        f.landLag = 8;
        f.invuln = Math.max(f.invuln, 18);
        f.vx = dx * m(0.14);
        emit(s, EvType.Tech, f.x, f.y, f.port);
      } else if (impact < -m(0.18)) {
        // Hard landing while launched: knockdown (in Versus you're invulnerable while down, SF-style)
        f.kby = 0;
        f.kbx = f.kbx >> 1;
        setAct(f, Act.Land);
        f.landLag = 26;
        f.combo = 0;
        if (s.mode === Mode.Versus) f.invuln = Math.max(f.invuln, 28);
      } else {
        f.kby = 0;
      }
      break;
    case Act.Dizzy:
    case Act.Dead:
    case Act.Victory:
      break;
    default:
      setAct(f, Act.Land);
      f.landLag = 3;
      f.kby = 0;
  }
}

function pushApart(s: GameState): void {
  const fs = s.fighters;
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i];
      const b = fs[j];
      if (!a.grounded || !b.grounded || !alive(a) || !alive(b)) continue;
      if (a.act === Act.Grabbed || b.act === Act.Grabbed || a.act === Act.Grabbing || b.act === Act.Grabbing) continue;
      if (a.act === Act.Roll || b.act === Act.Roll) continue;
      const minD = Math.trunc((m(0.36) * (def(a).stats.scale + def(b).stats.scale)) / 1000);
      const dx = b.x - a.x;
      const ad = abs(dx);
      if (ad < minD) {
        const push = s.mode === Mode.Versus ? (minD - ad + 1) >> 1 : Math.min(m(0.03), (minD - ad) >> 1);
        const dir = dx === 0 ? (a.port < b.port ? 1 : -1) : sign(dx);
        a.x -= dir * push;
        b.x += dir * push;
      }
    }
  }
}

function autoFace(s: GameState): void {
  const [a, b] = s.fighters;
  if (!a || !b) return;
  for (const [f, o] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!f.grounded) continue;
    if (f.act === Act.Idle || f.act === Act.Walk || f.act === Act.Crouch || f.act === Act.Shield || f.act === Act.Land) {
      const want = o.x >= f.x ? 1 : -1;
      if (abs(o.x - f.x) > m(0.05)) f.facing = want;
    }
  }
}

// ---------------------------------------------------------------------------
// Projectiles & beam clash
// ---------------------------------------------------------------------------

function projDef(p: ProjectileState): ProjectileDef {
  return FIGHTERS[p.char].moves[p.move].projectile!;
}

function updateProjectiles(s: GameState): void {
  const st = stage(s);
  for (const p of s.projectiles) {
    if (p.dead || p.clash) continue;
    const d = projDef(p);
    const owner = s.fighters[p.owner];
    if (d.kind === ProjKind.Beam) {
      // A beam dies if its caster is interrupted
      if (owner.act !== Act.Attack || owner.move !== p.move) {
        p.dead = 1;
        continue;
      }
      p.len = Math.min(d.maxLen, p.len + d.vx);
    } else {
      p.x += p.vx;
      p.y += p.vy;
    }
    if (p.rehitTimer > 0) {
      p.rehitTimer--;
      if (p.rehitTimer === 0) p.hitMask = 0;
    }
    p.life--;
    if (p.life <= 0 || p.x < st.blast.left || p.x > st.blast.right) p.dead = 1;
  }
  // Projectile vs projectile
  const ps = s.projectiles;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.dead || a.clash) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const b = ps[j];
      if (b.dead || b.clash || a.owner === b.owner) continue;
      if (s.fighters[a.owner].team === s.fighters[b.owner].team) continue;
      const da = projDef(a);
      const db = projDef(b);
      if (da.kind === ProjKind.Beam && db.kind === ProjKind.Beam) {
        if (a.facing !== b.facing && abs(a.y - b.y) < da.r + db.r) {
          const ha = a.x + a.facing * a.len;
          const hb = b.x + b.facing * b.len;
          if ((ha - hb) * a.facing >= 0 && (a.x - b.x) * a.facing < 0) startClash(s, i, j, ha, hb);
        }
        continue;
      }
      if (projOverlap(a, da, b, db)) {
        if (da.kind === ProjKind.Blast) a.dead = 1;
        if (db.kind === ProjKind.Blast) b.dead = 1;
        emit(s, EvType.Hit, (a.x + b.x) >> 1, (a.y + b.y) >> 1, 0, -1);
      }
    }
  }
  // Compact
  let w = 0;
  for (let i = 0; i < ps.length; i++) if (!ps[i].dead) ps[w++] = ps[i];
  ps.length = w;
  // Fix clash indices after compaction
  if (s.clash.active) {
    s.clash.pa = ps.findIndex((p) => p.clash && p.owner === s.clash.a);
    s.clash.pb = ps.findIndex((p) => p.clash && p.owner === s.clash.b);
  }
}

function projOverlap(a: ProjectileState, da: ProjectileDef, b: ProjectileState, db: ProjectileDef): boolean {
  // Treat a beam as a segment, a blast as a point; compare to radii.
  const ax2 = da.kind === ProjKind.Beam ? a.x + a.facing * a.len : a.x;
  const bx2 = db.kind === ProjKind.Beam ? b.x + b.facing * b.len : b.x;
  const d2 = segSegDist2(a.x, a.y, ax2, a.y, b.x, b.y, bx2, b.y);
  const r = da.r + db.r;
  return d2 <= r * r;
}

function startClash(s: GameState, i: number, j: number, ha: number, hb: number): void {
  const a = s.projectiles[i];
  const b = s.projectiles[j];
  const c = s.clash;
  if (c.active) return;
  c.active = 1;
  c.a = a.owner;
  c.b = b.owner;
  c.pa = i;
  c.pb = j;
  c.pos = (ha + hb) >> 1;
  c.push = 0;
  c.timer = 240;
  c.mashA = c.mashB = 0;
  a.clash = b.clash = 1;
  for (const port of [a.owner, b.owner]) {
    const f = s.fighters[port];
    setAct(f, Act.Beam);
    f.vx = f.vy = 0;
  }
  emit(s, EvType.Clash, c.pos, a.y, a.owner, b.owner);
}

function updateClash(s: GameState): void {
  const c = s.clash;
  const fa = s.fighters[c.a];
  const fb = s.fighters[c.b];
  const pa = s.projectiles[c.pa];
  const pb = s.projectiles[c.pb];
  if (!pa || !pb) {
    endClash(s, -1);
    return;
  }
  const mashBits = IN_SPECIAL | IN_ATTACK;
  const pressA = inp(fa, s.frame) & ~inp(fa, s.frame - 1) & mashBits ? 1 : 0;
  const pressB = inp(fb, s.frame) & ~inp(fb, s.frame - 1) & mashBits ? 1 : 0;
  c.mashA += pressA;
  c.mashB += pressB;
  // Power bias from beam strength (super beats normal)
  const bias = Math.trunc((pa.power - pb.power) / 10) + Math.trunc((projDef(pa).r - projDef(pb).r) / 1000);
  c.push = clamp(c.push + (pressA - pressB) * 34 + bias, -1000, 1000);
  c.timer--;
  const center = (pa.x + pb.x) >> 1;
  const half = abs(pb.x - pa.x) >> 1;
  c.pos = center + Math.trunc((c.push * half) / 1000) * pa.facing;
  pa.len = abs(c.pos - pa.x);
  pb.len = abs(pb.x - c.pos);
  fa.vx = fa.vy = fb.vx = fb.vy = 0;
  if (c.push >= 1000 || (c.timer <= 0 && c.push > 0)) endClash(s, 0);
  else if (c.push <= -1000 || (c.timer <= 0 && c.push < 0)) endClash(s, 1);
  else if (c.timer <= 0) endClash(s, -1);
}

function endClash(s: GameState, winnerSide: number): void {
  const c = s.clash;
  const pa = s.projectiles[c.pa];
  const pb = s.projectiles[c.pb];
  const fa = s.fighters[c.a];
  const fb = s.fighters[c.b];
  const win = winnerSide === 0 ? pa : winnerSide === 1 ? pb : undefined;
  const lose = winnerSide === 0 ? pb : winnerSide === 1 ? pa : undefined;
  if (lose) lose.dead = 1;
  if (!win) {
    if (pa) pa.dead = 1;
    if (pb) pb.dead = 1;
  }
  for (const f of [fa, fb]) {
    const isWinner = (winnerSide === 0 && f === fa) || (winnerSide === 1 && f === fb);
    if (isWinner && win) {
      // Winner keeps firing: restore the move so the beam stays attached
      setAct(f, Act.Attack);
      f.move = win.move;
      f.actFrame = projDef(win).f + 1;
      win.clash = 0;
      win.life = 30;
      win.power = Math.max(win.power, 100) + 50;
      win.hitMask = 0;
    } else {
      setAct(f, f.grounded ? Act.Idle : Act.Air);
    }
  }
  emit(s, EvType.ClashEnd, c.pos, pa ? pa.y : 0, winnerSide === 0 ? c.a : winnerSide === 1 ? c.b : -1);
  s.clash = newClash();
  // Remove the dead ones immediately so indices stay sane
  s.projectiles = s.projectiles.filter((p) => !p.dead);
}

// ---------------------------------------------------------------------------
// Hit detection
// ---------------------------------------------------------------------------

interface PendingHit {
  a: FighterState;
  v: FighterState;
  h: HitboxDef;
  x: number;
  y: number;
}
const pending: PendingHit[] = [];

function isIntangible(s: GameState, f: FighterState): boolean {
  if (f.invuln > 0) return true;
  if (f.act === Act.Dead || f.act === Act.Respawn) return true;
  if (f.act === Act.Roll && f.actFrame >= 4 && f.actFrame <= 16) return true;
  if (f.act === Act.SpotDodge && f.actFrame >= 3 && f.actFrame <= 16) return true;
  if (f.act === Act.AirDodge && f.actFrame >= 3 && f.actFrame <= 18) return true;
  if (f.act === Act.LedgeGetup) return true;
  if (f.act === Act.Attack) {
    const mv = def(f).moves[f.move];
    if (mv.invuln && f.actFrame >= mv.invuln[0] && f.actFrame <= mv.invuln[1]) return true;
  }
  if (s.phase !== Phase.Fight) return true;
  return false;
}

function hasArmor(f: FighterState): boolean {
  if (f.act !== Act.Attack) return false;
  const mv = def(f).moves[f.move];
  return !!mv.armor && f.actFrame >= mv.armor[0] && f.actFrame <= mv.armor[1];
}

function sameTeam(s: GameState, a: FighterState, b: FighterState): boolean {
  return s.mode === Mode.Platform && a.team === b.team && a.port !== b.port;
}

function resolveHits(s: GameState): void {
  const fs = s.fighters;
  for (const f of fs) computeJoints(f, joints[f.port]);
  pending.length = 0;

  // Melee hitboxes
  for (const a of fs) {
    if (a.act !== Act.Attack || a.hitlag > 0) continue;
    const mv = def(a).moves[a.move];
    const fr = a.actFrame;
    const ja = joints[a.port];
    for (const h of mv.hitboxes) {
      if (fr < h.start || fr > h.end) continue;
      const [bx, by] = bonePoint(ja, h.bone, h.ox, h.oy);
      const hx = a.x + bx * a.facing;
      const hy = a.y + by;
      for (const v of fs) {
        if (v === a || sameTeam(s, a, v)) continue;
        if (a.hitGroups[h.group] & (1 << v.port)) continue;
        if (pending.some((p) => p.a === a && p.v === v)) continue;
        if (isIntangible(s, v)) continue;
        if (h.kind === HitKind.Grab) {
          if (!v.grounded || v.act === Act.Grabbed || v.act === Act.Grabbing) continue;
        }
        if (hitsFighter(v, hx, hy, h.r)) pending.push({ a, v, h, x: hx, y: hy });
      }
    }
  }
  for (const p of pending) {
    p.a.hitGroups[p.h.group] |= 1 << p.v.port;
  }
  // Apply (port order is deterministic)
  for (const p of pending) {
    if (p.h.kind === HitKind.Grab) {
      if (p.a.act !== Act.Attack || p.v.act === Act.Grabbed) continue;
      const cmd = def(p.a).moves[p.a.move].grabThrow;
      startGrab(s, p.a, p.v);
      if (cmd !== undefined) {
        // Command grab: go straight into the throw (cannot be teched)
        p.v.throwTech = 0;
        setAct(p.a, Act.Attack);
        p.a.move = cmd;
        p.a.actFrame = 1;
        emit(s, EvType.Throw, p.a.x, p.a.y, p.a.port);
      }
    } else {
      const power = p.a.move >= Mv.FSmash && p.a.move <= Mv.DSmash ? 100 + Math.trunc((p.a.charge * 2) / 3) : 100;
      applyHit(s, p.a, p.v, p.h, power, p.a.facing, p.x, p.y, false);
    }
  }

  // Projectiles
  for (const pr of s.projectiles) {
    if (pr.dead || pr.clash) continue;
    const d = projDef(pr);
    const owner = fs[pr.owner];
    for (const v of fs) {
      if (v.port === pr.owner || sameTeam(s, owner, v)) continue;
      if (pr.hitMask & (1 << v.port)) continue;
      if (isIntangible(s, v)) continue;
      let hit = false;
      let hx = pr.x;
      if (d.kind === ProjKind.Beam) {
        const x2 = pr.x + pr.facing * pr.len;
        hit = capsuleVsFighter(v, pr.x, pr.y, x2, pr.y, d.r);
        hx = clamp(v.x, Math.min(pr.x, x2), Math.max(pr.x, x2));
      } else hit = hitsFighter(v, pr.x, pr.y, d.r);
      if (!hit) continue;
      pr.hitMask |= 1 << v.port;
      if (d.rehit > 0) pr.rehitTimer = d.rehit;
      const h: HitboxDef = {
        start: 0,
        end: 0,
        bone: 0,
        ox: 0,
        oy: 0,
        r: d.r,
        dmg: d.dmg,
        bkb: d.bkb,
        kbg: d.kbg,
        angle: d.angle,
        group: 0,
        ki: d.ki,
        sfx: 3,
        kind: HitKind.Hit,
        hitlag: d.kind === ProjKind.Beam ? 50 : 80,
        // multi-hit beams: only the last hit launches
        fixedKb: pr.hits > 1 && d.hits > 1,
        hitstun: pr.hits > 1 && d.hits > 1 ? d.rehit + 6 : undefined,
      };
      if (h.fixedKb) {
        h.bkb = 20;
        h.kbg = 0;
      }
      applyHit(s, owner, v, h, pr.power, pr.facing, hx, pr.y, false, true);
      pr.hits--;
      if (pr.hits <= 0) pr.dead = 1;
      if (d.kind === ProjKind.Blast && pr.hits <= 0) break;
    }
  }
}

function hitsFighter(v: FighterState, x: number, y: number, r: number): boolean {
  return capsuleVsFighter(v, x, y, x, y, r);
}

function capsuleVsFighter(v: FighterState, x1: number, y1: number, x2: number, y2: number, r: number): boolean {
  const j = joints[v.port];
  for (const hc of HURTBOXES) {
    const ax = v.x + j.x[hc.a] * v.facing;
    const ay = v.y + j.y[hc.a];
    let bx: number;
    let by: number;
    if (hc.b >= 0) {
      bx = v.x + j.x[hc.b] * v.facing;
      by = v.y + j.y[hc.b];
    } else {
      const [px, py] = bonePoint(j, hc.a, hc.bx, hc.by);
      bx = v.x + px * v.facing;
      by = v.y + py;
    }
    const rr = r + Math.trunc((hc.r * def(v).stats.scale) / 1000);
    if (segSegDist2(x1, y1, x2, y2, ax, ay, bx, by) <= rr * rr) return true;
  }
  return false;
}

/** Squared distance between point and segment (integers). */
function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let cx = ax;
  let cy = ay;
  if (len2 > 0) {
    // t in [0, 1024]
    let t = Math.trunc((((px - ax) * abx + (py - ay) * aby) * 1024) / len2);
    t = clamp(t, 0, 1024);
    cx = ax + Math.trunc((abx * t) / 1024);
    cy = ay + Math.trunc((aby * t) / 1024);
  }
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function segSegDist2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  // Approximation good enough for gameplay: min of endpoint-to-segment distances,
  // plus an intersection test.
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointSegDist2(ax, ay, cx, cy, dx, dy),
    pointSegDist2(bx, by, cx, cy, dx, dy),
    pointSegDist2(cx, cy, ax, ay, bx, by),
    pointSegDist2(dx, dy, ax, ay, bx, by),
  );
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  if ((ax === bx && ay === by) || (cx === dx && cy === dy)) return false;
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

function startGrab(s: GameState, a: FighterState, v: FighterState): void {
  if (v.act === Act.Grabbing) releaseGrab(s, v);
  setAct(a, Act.Grabbing);
  a.move = Mv.Grab;
  a.grab = v.port;
  a.grabTimer = GRAB_HOLD + Math.trunc(v.damage / 20);
  setAct(v, Act.Grabbed);
  v.grab = a.port;
  v.throwTech = 8;
  holdVictim(a, v);
  emit(s, EvType.Grab, v.x, v.y + m(1), a.port, v.port);
}

function releaseGrab(s: GameState, holder: FighterState): void {
  const v = s.fighters[holder.grab];
  holder.grab = -1;
  if (v && v.act === Act.Grabbed) {
    v.grab = -1;
    setAct(v, Act.Air);
  }
}

function dealDamage(s: GameState, a: FighterState, v: FighterState, dmg: number, ki: number): number {
  let dealt = dmg;
  if (s.mode === Mode.Versus) {
    // Combo scaling: each hit in a combo does 10% less (min 30%).
    // Supers keep at least 75% damage so they're always worth the meter.
    const minScale = a.act === Act.Attack && a.move === Mv.Super ? 75 : 30;
    const scale = Math.max(minScale, 100 - v.combo * 10);
    dealt = Math.max(1, Math.trunc((dmg * VS_DMG_SCALE * scale) / 100));
    v.health = Math.max(0, v.health - dealt);
  } else {
    v.damage = Math.min(9999, v.damage + dmg * 10);
  }
  addKi(a, ki);
  addKi(v, Math.max(1, dmg));
  v.comboDamage += dmg;
  return dealt;
}

/** Smash-style knockback (returns ×1000 fixed). */
export function knockback(percentTenths: number, dmg: number, weight: number, bkb: number, kbg: number): number {
  const P = percentTenths;
  const D = dmg * 10;
  let t = P * 10 + Math.trunc((P * D) / 2); // (p/10 + p*d/20) * 1000
  t = Math.trunc((t * 280) / (weight + 100)); // * 200/(w+100) * 1.4
  t += 18000;
  t = Math.trunc((t * kbg) / 100);
  return t + bkb * 1000;
}

export function applyHit(
  s: GameState,
  a: FighterState,
  v: FighterState,
  h: HitboxDef,
  power: number,
  facing: number,
  hx: number,
  hy: number,
  isThrow: boolean,
  isProjectile = false,
): void {
  const vd = def(v);
  const pw = def(a).stats.power ?? 100;
  const dmg = Math.max(1, Math.trunc((h.dmg * power * a.dmgMul * v.defMul * pw) / 100000000));

  // Counter moves: absorb the hit and jump to the counter strike
  if (!isThrow && v.act === Act.Attack) {
    const cmv = vd.moves[v.move];
    if (cmv.counter && v.actFrame >= cmv.counter.from && v.actFrame <= cmv.counter.to) {
      v.actFrame = cmv.counter.jump;
      v.invuln = Math.max(v.invuln, 12);
      v.facing = hx >= v.x ? 1 : -1;
      if (!isProjectile) a.hitlag = 16;
      v.hitlag = 8;
      for (let i = 0; i < v.hitGroups.length; i++) v.hitGroups[i] = 0;
      addKi(v, 20);
      emit(s, EvType.Parry, hx, hy, v.port, a.port);
      return;
    }
  }

  // Parry: shield raised within the last 5 frames — no damage, attacker frozen and open to a punish
  if (!isThrow && v.act === Act.Shield && v.actFrame <= 5) {
    if (!isProjectile) a.hitlag = 22;
    v.hitlag = 4;
    v.actFrame = 6;
    v.invuln = Math.max(v.invuln, 8);
    addKi(v, 25);
    emit(s, EvType.Parry, hx, hy, v.port, a.port);
    return;
  }
  // Versus high/low: lows must be crouch-guarded, overheads stand-guarded (parries still beat both).
  let guarded = v.act === Act.Shield || v.act === Act.ShieldStun;
  if (guarded && !isThrow && s.mode === Mode.Versus && !isProjectile) {
    const lvl = hitLevel(a, h);
    if ((lvl === 'low' && !v.guardLow) || (lvl === 'overhead' && v.guardLow)) {
      guarded = false;
      emit(s, EvType.WrongGuard, hx, hy, a.port, v.port);
    }
  }
  // Shield / block
  if (!isThrow && guarded) {
    const sd = (dmg + (h.shield ?? 0)) * 100 * (s.mode === Mode.Versus ? 0 : 1);
    v.shieldHp -= sd;
    if (s.mode === Mode.Versus) v.health = Math.max(1, v.health - Math.trunc((dmg * VS_DMG_SCALE) / 8));
    const stun = Math.trunc((dmg * 8) / 10) + 3;
    setAct(v, Act.ShieldStun);
    v.hitstun = stun;
    v.vx = facing * m(0.03 + dmg * 0.004);
    const hl = Math.min(12, Math.trunc((dmg * 65) / 100) + 4);
    if (!isProjectile) a.hitlag = hl;
    v.hitlag = hl;
    addKi(v, 2);
    addKi(a, 2);
    if (!isProjectile && s.mode === Mode.Versus) a.vx = -facing * m(0.04);
    emit(s, EvType.Shield, hx, hy, v.port, dmg);
    if (v.shieldHp <= 0) shieldBreak(s, v);
    return;
  }

  // Counter hit (victim was starting up a move) / punish (victim was recovering from one)
  let bonusStun = 0;
  let finalDmg = dmg;
  if (!isThrow && v.act === Act.Attack && v.move >= 0) {
    const vm = vd.moves[v.move];
    let first = 999;
    let last = 0;
    for (const hb of vm.hitboxes) {
      if (hb.start < first) first = hb.start;
      if (hb.end > last) last = hb.end;
    }
    if (vm.projectile) {
      first = Math.min(first, vm.projectile.f);
      last = Math.max(last, vm.projectile.f);
    }
    if (first < 999 && v.actFrame < first) {
      finalDmg = Math.trunc((dmg * 120) / 100);
      bonusStun = 8;
      emit(s, EvType.CounterHit, hx, hy, a.port, v.port);
    } else if (last > 0 && v.actFrame > last) {
      bonusStun = 4;
      emit(s, EvType.Punish, hx, hy, a.port, v.port);
    }
  }
  if (!s.firstHit && s.phase === Phase.Fight) {
    s.firstHit = 1;
    emit(s, EvType.FirstHit, hx, hy, a.port);
  }
  dealDamage(s, a, v, finalDmg, h.ki);
  v.lastHitBy = a.port;
  v.combo++;

  // Hitlag
  const hlMul = h.hitlag ?? 100;
  // Shorter baseline freeze keeps light links flowing; heavy hits still scale up to 18f.
  const hitlag = Math.min(18, Math.trunc(((Math.trunc((dmg * 55) / 100) + 4) * hlMul) / 100));
  if (!isProjectile) a.hitlag = hitlag;
  v.hitlag = hitlag;

  if (hasArmor(v) && !isThrow) {
    emit(s, EvType.Hit, hx, hy, 1, v.port);
    return;
  }

  // Release any grab
  if (v.act === Act.Grabbing) releaseGrab(s, v);
  if (v.act === Act.LedgeHang) v.ledge = -1;

  // Knockback
  const pct = s.mode === Mode.Versus ? 450 : v.damage;
  let kb = h.fixedKb ? h.bkb * 1000 : knockback(pct, dmg, vd.stats.weight, h.bkb, h.kbg);
  if (s.mode === Mode.Versus) kb = Math.trunc((kb * 70) / 100);
  kb = Math.trunc((kb * v.kbMul) / 100);
  if (kb > 400000) kb = 400000;

  let ang = h.angle;
  if (ang === 361) ang = v.grounded && kb < 60000 ? 0 : 40;
  let world = facing > 0 ? ang : 180 - ang;
  // Grounded victims hit by downward angles just get pushed along the floor (or bounce up in Platform)
  world = normDeg(world);

  // DI: hold perpendicular to the launch to alter it by up to 15 degrees
  const vin = inp(v, s.frame);
  const ix = dirX(vin);
  const iy = dirY(vin);
  if ((ix !== 0 || iy !== 0) && kb > 30000 && !h.fixedKb) {
    const ia = iatan2(iy, ix);
    const cross = isin(ia - world); // >0 = input is counter-clockwise from launch
    world = normDeg(world + Math.trunc((cross * 15) / 10000));
  }

  let speed = Math.trunc((kb * LAUNCH_MUL) / 1000);
  let kbx = Math.trunc((icos(world) * speed) / 10000);
  let kby = Math.trunc((isin(world) * speed) / 10000);
  let versusStun = -1;
  if (s.mode === Mode.Versus && !isThrow && !h.fixedKb) {
    if (a.act === Act.Attack && a.move === Mv.UTilt && v.grounded) {
      // Launcher: straight up, long hitstun — jump after it for an air combo
      kbx = facing * m(0.015);
      kby = m(0.3);
      speed = kby;
      versusStun = 44;
      emit(s, EvType.Launch, hx, hy, a.port, v.port);
    } else if (!v.grounded && !a.grounded && a.act === Act.Attack && isAerial(a.move)) {
      // Air combos: aerials on airborne victims carry them instead of sending them away
      kbx = Math.trunc((kbx * 45) / 100) + facing * m(0.02);
      kby = Math.max(Math.trunc((kby * 45) / 100), m(0.07));
      versusStun = Math.max(18, 30 - v.combo * 2); // juggle decay
    }
  }
  if (v.grounded && kby < 0) {
    if (s.mode === Mode.Versus || kb < 80000) kby = 0;
    else kby = -Math.trunc((kby * 7) / 10); // spike on the ground: bounce
  }

  let hitstun = Math.trunc((kb * 4) / 10000);
  if (h.hitstun !== undefined && (s.mode === Mode.Versus || h.fixedKb)) hitstun = h.hitstun;
  if (versusStun >= 0 && (h.hitstun === undefined || versusStun > h.hitstun)) hitstun = versusStun;
  if (s.mode === Mode.Versus && v.combo > 6) hitstun = Math.max(8, hitstun - (v.combo - 6) * 2); // juggle decay
  if (hitstun < 6) hitstun = 6;
  hitstun += bonusStun;

  setAct(v, Act.Hitstun);
  {
    // Reaction height from where the hit landed on the body
    const rel = Math.trunc(((hy - v.y) * 1000) / vd.stats.scale);
    v.hitHeight = rel > m(1.3) ? 0 : rel < m(0.6) ? 2 : 1;
  }
  v.hitstun = hitstun;
  v.vx = 0;
  v.vy = 0;
  v.kbx = kbx;
  v.kby = kby;
  v.fastFall = 0;
  v.launchSpeed = speed;
  if (kby > 0) {
    v.grounded = 0;
    v.platform = -1;
    v.y += 1;
  }
  if (kbx !== 0) v.facing = kbx > 0 ? -1 : 1;
  speed = 0;
  void speed;

  const strength = kb < 50000 ? 0 : kb < 100000 ? 1 : kb < 150000 ? 2 : 3;
  emit(s, EvType.Hit, hx, hy, strength, v.port);

  if (s.mode === Mode.Versus && v.health <= 0) versusKO(s, a, v);
  void kbx;
  void kby;
}

// ---------------------------------------------------------------------------
// KOs, rounds, match end
// ---------------------------------------------------------------------------

function checkBlastZones(s: GameState): void {
  if (s.mode === Mode.Versus) return;
  const b = stage(s).blast;
  for (const f of s.fighters) {
    if (f.act === Act.Dead) continue;
    const out = f.x < b.left || f.x > b.right || f.y < b.bottom || (f.y > b.top && f.act === Act.Hitstun);
    if (!out) continue;
    emit(s, EvType.KO, clamp(f.x, b.left, b.right), clamp(f.y, b.bottom, b.top), f.port);
    if (f.lastHitBy >= 0 && f.lastHitBy !== f.port) s.fighters[f.lastHitBy].kos++;
    f.falls++;
    if (f.grab >= 0) {
      const o = s.fighters[f.grab];
      if (o) {
        o.grab = -1;
        if (o.act === Act.Grabbing || o.act === Act.Grabbed) setAct(o, Act.Idle);
      }
      f.grab = -1;
    }
    setAct(f, Act.Dead);
    f.vx = f.vy = f.kbx = f.kby = 0;
    f.hitlag = 0;
    f.respawnTimer = RESPAWN_WAIT;
    f.lastHitBy = -1;
    f.combo = 0;
    if (!s.training) f.stocks--;
    // Park off-screen until respawn
    f.y = b.top + m(5);
  }
}

function versusKO(s: GameState, a: FighterState, v: FighterState): void {
  if (s.phase !== Phase.Fight) return;
  v.hitstun = 999;
  s.phase = Phase.RoundEnd;
  s.phaseTimer = 0;
  s.roundWinner = a.port;
  s.roundWins[a.port]++;
  s.slowmo = 60;
  emit(s, EvType.RoundKO, v.x, v.y, a.port);
}

function timeUp(s: GameState): void {
  if (s.phase !== Phase.Fight) return;
  const [a, b] = s.fighters;
  s.phase = Phase.RoundEnd;
  s.phaseTimer = 0;
  let w = -1;
  const pa = Math.trunc((a.health * 1000) / a.maxHealth);
  const pb = Math.trunc((b.health * 1000) / b.maxHealth);
  if (pa > pb) w = 0;
  else if (pb > pa) w = 1;
  s.roundWinner = w;
  if (w >= 0) s.roundWins[w]++;
  emit(s, EvType.TimeUp, 0, 0, w);
}

function endRound(s: GameState): void {
  if (s.mode !== Mode.Versus) return;
  const best = Math.max(...s.roundWins);
  if (best >= s.roundsToWin || s.round >= s.roundsToWin * 4 + 1) {
    s.phase = Phase.MatchEnd;
    s.phaseTimer = 0;
    let w = -1;
    if (s.roundWins[0] > s.roundWins[1]) w = 0;
    else if (s.roundWins[1] > s.roundWins[0]) w = 1;
    s.winner = w;
    emit(s, EvType.MatchEnd, 0, 0, w);
    for (const f of s.fighters) if (f.port !== w && f.act !== Act.Dead) setAct(f, Act.Idle);
    return;
  }
  s.round++;
  resetRound(s);
}

function checkMatchState(s: GameState): void {
  if (s.mode === Mode.Versus || s.training) return;
  if (s.fighters.length < 2) return;
  const teamsAlive = new Set<number>();
  for (const f of s.fighters) if (f.stocks > 0) teamsAlive.add(f.team);
  if (teamsAlive.size <= 1) {
    s.phase = Phase.MatchEnd;
    s.phaseTimer = 0;
    s.slowmo = 0;
    let w = -1;
    for (const f of s.fighters) if (f.stocks > 0) {
      w = f.port;
      break;
    }
    s.winner = w;
    emit(s, EvType.MatchEnd, 0, 0, w);
  }
}

/** Debug/test helper: deterministic random number from the sim's PRNG. */
export function simRandom(s: GameState, n: number): number {
  const [v, ns] = rngU32(s.rng);
  s.rng = ns;
  return v % n;
}
