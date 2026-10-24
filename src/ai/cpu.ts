// CPU opponent: produces an input bitmask exactly like a human device would.
// Deterministic: decisions use hash32(frame, port, …), never Math.random, so CPUs can run on every peer later.
import { abs } from '../sim/fixed';
import { hash32 } from '../sim/rng';
import { FIGHTERS } from '../sim/fighters';
import { STAGES } from '../sim/stage';
import { Act, FighterState, GameState, Mode, Phase } from '../sim/state';
import { IN_ATTACK, IN_DOWN, IN_GRAB, IN_GUARD, IN_JUMP, IN_LEFT, IN_RIGHT, IN_SPECIAL, IN_UP } from '../sim/input';
import { Mv } from '../sim/defs';

export interface CpuMemory {
  prev: number;
  hold: number; // directional/guard bits held between decisions
  holdUntil: number;
  nextThink: number;
  runTap: number; // dash double-tap sequencing
  recoveredUp: number;
}

export function newCpuMemory(): CpuMemory {
  return { prev: 0, hold: 0, holdUntil: 0, nextThink: 0, runTap: 0, recoveredUp: 0 };
}

const M = 10000; // FX per metre

function rand(s: GameState, port: number, salt: number, n: number): number {
  return hash32(s.frame, port * 131 + salt, s.fighters[port].x) % n;
}

function target(s: GameState, me: FighterState): FighterState | null {
  let best: FighterState | null = null;
  let bd = Infinity;
  for (const o of s.fighters) {
    if (o === me || o.act === Act.Dead) continue;
    if (s.mode === Mode.Platform && o.team === me.team) continue;
    const d = abs(o.x - me.x) + abs(o.y - me.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Release buttons that were held last frame so the next press registers as a rising edge. */
function press(mem: CpuMemory, want: number): number {
  const edge = IN_ATTACK | IN_SPECIAL | IN_JUMP | IN_GRAB;
  const conflict = want & mem.prev & edge;
  return want & ~conflict;
}

/** level 0 = training dummy (no input), 1..9 = increasingly strong. */
export function cpuInput(s: GameState, port: number, level: number, mem: CpuMemory): number {
  if (level <= 0) return 0;
  const out = think(s, port, Math.max(1, Math.min(9, level)), mem);
  mem.prev = out;
  return out;
}

function think(s: GameState, port: number, level: number, mem: CpuMemory): number {
  const me = s.fighters[port];
  if (!me || s.phase !== Phase.Fight || me.act === Act.Dead) return 0;
  const st = STAGES[s.stage];
  const p0 = st.platforms[0];
  const def = FIGHTERS[me.char];
  const toward = (x: number) => (x > me.x ? IN_RIGHT : IN_LEFT);

  // Beam clash: mash
  if (me.act === Act.Beam) {
    const rate = 10 - level; // frames between presses
    return s.frame % Math.max(2, rate) === 0 ? IN_SPECIAL : 0;
  }
  // Grabbed: mash
  if (me.act === Act.Grabbed) return s.frame % 3 === 0 ? IN_ATTACK | (s.frame % 6 ? IN_LEFT : IN_RIGHT) : 0;
  if (me.act === Act.Respawn) return 0;

  const tgt = target(s, me);

  // Holding someone: throw toward the nearest blast zone (or up when at high percent)
  if (me.act === Act.Grabbing && tgt) {
    if (me.actFrame < 10) return 0;
    const edgeDir = me.x < 0 ? IN_LEFT : IN_RIGHT;
    if (s.mode === Mode.Platform && tgt.damage > 1000 && rand(s, port, 1, 2) === 0) return IN_UP;
    return rand(s, port, 2, 3) === 0 ? IN_DOWN : edgeDir;
  }

  // Ledge: get up or jump
  if (me.act === Act.LedgeHang) {
    if (me.actFrame < 12 + rand(s, port, 3, 30)) return 0;
    const r = rand(s, port, 4, 3);
    const inward = st.ledges[me.ledge]?.dir === -1 ? IN_RIGHT : IN_LEFT;
    return r === 0 ? press(mem, IN_JUMP) : r === 1 ? press(mem, IN_ATTACK) : inward;
  }

  // Recovery (Platform): get back to the stage
  if (s.mode === Mode.Platform && !me.grounded) {
    const off = me.x < p0.x1 - M / 4 || me.x > p0.x2 + M / 4;
    const below = me.y < p0.y - M / 2;
    if (off || below) {
      if (me.act === Act.Hitstun && me.hitstun > 0) return 0;
      const dirIn = me.x < 0 ? IN_RIGHT : IN_LEFT;
      if (me.act === Act.Helpless || (me.act === Act.Attack && (me.move === Mv.USpec || me.move === Mv.USpecEx))) return dirIn;
      if (me.jumps > 0 && me.vy <= 0 && (me.y < p0.y + M || off)) return press(mem, dirIn | IN_JUMP);
      if (me.vy <= 0 && me.y < p0.y + M / 2) {
        const ex = me.ki >= 100 && level >= 6 ? IN_GUARD : 0;
        return press(mem, IN_UP | IN_SPECIAL | dirIn | ex);
      }
      return dirIn;
    }
  }

  if (!tgt) return 0;
  const dx = tgt.x - me.x;
  const dy = tgt.y - me.y;
  const adx = abs(dx);
  const facingTgt = (dx >= 0 ? 1 : -1) === me.facing;

  // Keep holding guard / direction until holdUntil
  if (s.frame < mem.holdUntil) return mem.hold;

  // Defence: shield when an opponent is attacking up close
  const threat = tgt.act === Act.Attack && adx < 2.4 * M && abs(dy) < 2 * M;
  if (threat && me.grounded && rand(s, port, 5, 100) < 6 + level * 7) {
    mem.hold = IN_GUARD;
    mem.holdUntil = s.frame + 10 + rand(s, port, 6, 12);
    return IN_GUARD;
  }
  // Out of shield: grab back or let go
  if (me.act === Act.Shield) {
    if (adx < 1.2 * M && rand(s, port, 7, 3) === 0) return press(mem, IN_GUARD | IN_GRAB);
    return 0;
  }

  // Think rate depends on level
  if (s.frame < mem.nextThink) return mem.prev & (IN_LEFT | IN_RIGHT | IN_DOWN);
  mem.nextThink = s.frame + Math.max(1, 14 - level - (level >> 1));

  // Super when close with full meter
  if (me.ki >= 300 && adx < 3 * M && abs(dy) < M && rand(s, port, 8, 4) === 0) return press(mem, IN_ATTACK | IN_SPECIAL);

  const reach = (def.id === 'torval' ? 1.5 : 1.25) * M;
  const actionable = me.act === Act.Idle || me.act === Act.Walk || me.act === Act.Run || me.act === Act.Dash || me.act === Act.Air || me.act === Act.Crouch;
  if (!actionable) return mem.prev & (IN_LEFT | IN_RIGHT);

  // In range: attack
  if (adx < reach && abs(dy) < 1.2 * M) {
    const dirT = toward(tgt.x);
    if (!me.grounded) {
      if (dy > M / 2) return press(mem, IN_UP | IN_ATTACK);
      if (dy < -M / 2) return press(mem, IN_DOWN | IN_ATTACK);
      return press(mem, (facingTgt ? 0 : 0) | (rand(s, port, 9, 2) ? dirT : 0) | IN_ATTACK);
    }
    const r = rand(s, port, 10, 100);
    const pct = s.mode === Mode.Platform ? tgt.damage / 10 : 60;
    if (r < 12) return press(mem, IN_GRAB);
    if (r < 22 + pct / 6 && level >= 3) {
      // smash: direction pressed on the same frame as attack (a tap)
      const d = rand(s, port, 11, 3);
      return press(mem, (d === 0 ? IN_UP : d === 1 ? IN_DOWN : dirT) | IN_ATTACK);
    }
    if (r < 50) return press(mem, IN_ATTACK);
    if (r < 62) return press(mem, IN_DOWN | IN_ATTACK);
    if (r < 72 && dy > 0) return press(mem, IN_UP | IN_JUMP);
    if (!facingTgt) return dirT;
    return press(mem, (mem.prev & dirT) | IN_ATTACK);
  }

  // Opponent above: jump toward
  if (dy > 1.6 * M && adx < 3 * M && me.grounded && rand(s, port, 12, 3) === 0) return press(mem, IN_JUMP | IN_UP | toward(tgt.x));

  // Mid range: projectiles sometimes
  if (adx > 4 * M && abs(dy) < M && me.grounded && rand(s, port, 13, 100) < 4 + level * 2) {
    if (me.ki >= 100 && rand(s, port, 14, 4) === 0) return press(mem, IN_GUARD | IN_SPECIAL);
    return press(mem, IN_SPECIAL);
  }
  if (adx > 2 * M && adx < 4 * M && me.grounded && rand(s, port, 15, 100) < level * 2) return press(mem, toward(tgt.x) | IN_SPECIAL);

  // Approach (run when far: double-tap)
  const dirT = toward(tgt.x);
  // Don't walk off the stage chasing someone offstage
  if (s.mode === Mode.Platform && me.grounded) {
    const nextX = me.x + (dirT === IN_RIGHT ? M : -M);
    if (nextX < p0.x1 + M / 2 || nextX > p0.x2 - M / 2) {
      if (tgt.y > me.y - M && rand(s, port, 16, 4) === 0) return press(mem, IN_JUMP | IN_UP);
      return 0;
    }
  }
  if (adx > 4 * M && me.grounded && me.act !== Act.Run && me.act !== Act.Dash) {
    mem.runTap = (mem.runTap + 1) % 3;
    if (mem.runTap === 1) return 0; // release, then press again next think = double tap
    mem.nextThink = s.frame + 2;
    return dirT;
  }
  return dirT;
}
