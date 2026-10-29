// CPU opponent: produces an input bitmask exactly like a human device would.
// Deterministic: decisions use hash32(frame, port, …), never Math.random, so CPUs can run on every peer later.
import { abs } from '../sim/fixed';
import { hash32 } from '../sim/rng';
import { FIGHTERS } from '../sim/fighters';
import { STAGES } from '../sim/stage';
import { Act, FighterState, GameState, Mode, Phase } from '../sim/state';
import { IN_ATTACK, IN_DOWN, IN_GRAB, IN_GUARD, IN_JUMP, IN_LEFT, IN_RIGHT, IN_SMASH, IN_SPECIAL, IN_UP } from '../sim/input';
import { Mv } from '../sim/defs';
import { GROUND_RANGES, AIR_RANGES, MAX_REACH } from './moveInfo';

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
  const edge = IN_ATTACK | IN_SPECIAL | IN_JUMP | IN_GRAB | IN_SMASH;
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
  if (me.act === Act.Grabbed) {
    if (me.throwTech > 0 && level >= 3 && rand(s, port, 30, 100) < level * 9) return mem.prev & IN_GRAB ? 0 : IN_GRAB;
    return s.frame % 3 === 0 ? IN_ATTACK | (s.frame % 6 ? IN_LEFT : IN_RIGHT) : 0;
  }
  // Burst out of long combos
  if (me.act === Act.Hitstun && me.hitlag === 0 && me.combo >= 3 && me.ki >= 100 && !(s.mode === Mode.Versus && me.burstUsed) && level >= 5) {
    if (rand(s, port, 31, 100) < level * 6) return mem.prev & IN_SPECIAL ? IN_GUARD : IN_GUARD | IN_SPECIAL;
  }
  if (me.act === Act.Respawn) return 0;

  const tgt = target(s, me);

  // Tech: tap Guard just before landing while launched
  if (me.act === Act.Hitstun && !me.grounded && me.vy + me.kby < 0 && me.y < M && me.y > -M && level >= 3) {
    if (rand(s, port, 20, 100) < level * 10) return mem.prev & IN_GUARD ? 0 : IN_GUARD;
  }

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
      // Below the stage top: aim just outside the ledge (never under the stage); above it: aim inward.
      const ledgeX = me.x < 0 ? p0.x1 - (M * 3) / 10 : p0.x2 + (M * 3) / 10;
      let dirIn = me.x < 0 ? IN_RIGHT : IN_LEFT;
      if (me.y < p0.y) {
        if (abs(me.x - ledgeX) < M / 5) dirIn = 0;
        else dirIn = ledgeX > me.x ? IN_RIGHT : IN_LEFT;
      }
      if (me.act === Act.Helpless || (me.act === Act.Attack && (me.move === Mv.USpec || me.move === Mv.USpecEx))) return dirIn;
      if (me.jumps > 0 && me.vy <= 0 && (me.y < p0.y + M || off)) return press(mem, dirIn | IN_JUMP);
      if (me.vy <= 0 && me.y < p0.y + M / 2) {
        const ex = me.ki >= 100 && level >= 6 ? IN_SMASH : 0;
        return press(mem, IN_UP | IN_SPECIAL | dirIn | ex);
      }
      return dirIn;
    }
  }

  if (!tgt) return 0;

  // Launcher follow-up (Versus): jump after a connected up tilt, then up-air near the victim
  if (s.mode === Mode.Versus && level >= 4) {
    if (me.act === Act.Attack && me.move === Mv.UTilt && me.hitGroups.some((g) => g !== 0) && me.actFrame > 10) return press(mem, IN_JUMP);
    if (!me.grounded && me.act === Act.Air && tgt && tgt.act === Act.Hitstun && !tgt.grounded && abs(tgt.x - me.x) < 1.4 * M) {
      return press(mem, (tgt.y > me.y + M / 2 ? IN_UP : 0) | IN_ATTACK);
    }
  }
  // Combos: keep pressing after a confirmed hit — jab chains, and special-cancel tilts / dash attacks
  if (me.act === Act.Attack && me.move >= 0 && level >= 3) {
    let hit = 0;
    for (const g of me.hitGroups) hit |= g;
    if (hit) {
      if ((me.move === Mv.Jab || me.move === Mv.Jab2) && rand(s, port, 21, 100) < 40 + level * 7) return press(mem, IN_ATTACK);
      const cancellable = me.move === Mv.FTilt || me.move === Mv.DTilt || me.move === Mv.UTilt || me.move === Mv.Jab3 || me.move === Mv.DashAttack;
      if (cancellable && level >= 5 && rand(s, port, 22, 100) < level * 8) {
        if (me.ki >= 300 && level >= 7) return press(mem, IN_ATTACK | IN_SPECIAL);
        const ex = me.ki >= 100 && level >= 6 ? IN_SMASH : 0;
        return press(mem, IN_SPECIAL | ex | (tgt.x > me.x ? IN_RIGHT : IN_LEFT));
      }
    }
  }

  // Parry: raise guard 1-3 frames before the opponent's first active frame (needs level, reads frame data)
  if (tgt.act === Act.Attack && tgt.move >= 0 && me.grounded && level >= 4) {
    const tm = FIGHTERS[tgt.char].moves[tgt.move];
    let first = 999;
    for (const hb of tm.hitboxes) first = Math.min(first, hb.start);
    const until = first - tgt.actFrame;
    const close = abs(tgt.x - me.x) < 2.6 * M && abs(tgt.y - me.y) < 2 * M;
    if (close && until >= 1 && until <= 3 && rand(s, port, 23, 100) < (level - 3) * 9) {
      mem.hold = IN_GUARD;
      mem.holdUntil = s.frame + 8;
      return mem.prev & IN_GUARD ? 0 : IN_GUARD;
    }
  }

  // Punish: opponent is recovering from a whiffed move within reach
  if (tgt.act === Act.Attack && tgt.move >= 0 && me.grounded && level >= 3 && (me.act === Act.Idle || me.act === Act.Walk || me.act === Act.Shield || me.act === Act.Run)) {
    const tm = FIGHTERS[tgt.char].moves[tgt.move];
    let last = 0;
    for (const hb of tm.hitboxes) last = Math.max(last, hb.end);
    const recovering = last > 0 && tgt.actFrame > last && tm.length - tgt.actFrame > 8;
    if (recovering && abs(tgt.x - me.x) < 2 * M && abs(tgt.y - me.y) < M && rand(s, port, 24, 100) < 30 + level * 7) {
      const dir = tgt.x > me.x ? IN_RIGHT : IN_LEFT;
      return press(mem, level >= 6 ? dir | IN_SMASH : IN_ATTACK);
    }
  }
  const dx = tgt.x - me.x;
  const dy = tgt.y - me.y;
  const adx = abs(dx);
  const facingTgt = (dx >= 0 ? 1 : -1) === me.facing;

  // Keep holding guard / direction until holdUntil
  if (s.frame < mem.holdUntil) return mem.hold;

  // Defence: shield when an opponent is attacking up close
  // Only guard what can still hit: hold until the move's last active frame (+ a small margin), not a fixed time,
  // so CPUs stop sitting in shield until it breaks.
  let activeLeft = -1;
  if (tgt.act === Act.Attack && tgt.move >= 0) {
    for (const hb of FIGHTERS[tgt.char].moves[tgt.move].hitboxes) activeLeft = Math.max(activeLeft, hb.end - tgt.actFrame);
    if (FIGHTERS[tgt.char].moves[tgt.move].projectile) activeLeft = Math.max(activeLeft, 6);
  }
  const threat = activeLeft >= 0 && adx < 2.4 * M && abs(dy) < 2 * M;
  if (threat && me.grounded && rand(s, port, 5, 100) < 4 + level * 4) {
    if (s.mode === Mode.Platform && me.shieldHp < 1800 && level >= 3) {
      // Shield nearly broken: back off instead of guarding again.
      mem.hold = dx > 0 ? IN_LEFT : IN_RIGHT;
      mem.holdUntil = s.frame + 8;
      return mem.hold;
    }
    const low = tgt.grounded && (tgt.move === Mv.DTilt || tgt.move === Mv.DSmash || tgt.move === Mv.DashAttack);
    const guessRight = rand(s, port, 32, 100) < 40 + level * 7;
    mem.hold = IN_GUARD | (s.mode === Mode.Versus && low === guessRight ? IN_DOWN : 0);
    mem.holdUntil = s.frame + Math.min(16, activeLeft + 3 + rand(s, port, 6, 4));
    return mem.hold;
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

  // Hurtbox slack: the opponent's body extends ~0.25 m towards us.
  const reach = MAX_REACH[me.char] + M / 4;
  void def;
  const actionable = me.act === Act.Idle || me.act === Act.Walk || me.act === Act.Run || me.act === Act.Dash || me.act === Act.Air || me.act === Act.Crouch;
  if (!actionable) return mem.prev & (IN_LEFT | IN_RIGHT);

  // In range: pick a move whose real hitbox range covers the opponent's position (precomputed from move data)
  if (adx < reach && abs(dy) < 2 * M) {
    const dirT = toward(tgt.x);
    const ranges = me.grounded ? GROUND_RANGES[me.char] : AIR_RANGES[me.char];
    const slack = M / 4;
    const relY = dy + M * 0.9; // aim at the opponent's torso
    const fits: { r: (typeof ranges)[number]; w: number }[] = [];
    for (const r of ranges) {
      const back = r.move === Mv.BAir;
      const fx = back ? -adx : adx;
      const facingOk = me.grounded || (back ? !facingTgt : facingTgt) || r.move === Mv.NAir || r.move === Mv.UAir || r.move === Mv.DAir;
      if (!facingOk) continue;
      if (fx < r.x1 - slack || fx > r.x2 + slack) continue;
      if (relY < r.y1 - slack || relY > r.y2 + slack) continue;
      const smash = r.move === Mv.FSmash || r.move === Mv.USmash || r.move === Mv.DSmash;
      if (smash && level < 3) continue;
      const pct = s.mode === Mode.Platform ? tgt.damage / 10 : 60;
      let w = ((r.dmg + 4) * 100) / (r.startup + 4);
      if (smash) w = (w * (40 + pct)) / 100;
      if (r.move === Mv.Grab) w = tgt.act === Act.Shield ? 400 : 40;
      fits.push({ r, w: Math.max(1, Math.round(w)) });
    }
    if (fits.length) {
      let total = 0;
      for (const f of fits) total += f.w;
      let pick = rand(s, port, 10, total);
      let chosen = fits[0].r;
      for (const f of fits) {
        if (pick < f.w) {
          chosen = f.r;
          break;
        }
        pick -= f.w;
      }
      if (me.grounded && !facingTgt && chosen.move !== Mv.FTilt && chosen.move !== Mv.FSmash) return dirT; // turn first
      switch (chosen.move) {
        case Mv.Jab:
          return press(mem, IN_ATTACK);
        case Mv.FTilt:
          return press(mem, dirT | IN_ATTACK);
        case Mv.UTilt:
          return press(mem, IN_UP | IN_ATTACK);
        case Mv.DTilt:
          return press(mem, IN_DOWN | IN_ATTACK);
        case Mv.FSmash:
          return press(mem, dirT | IN_SMASH);
        case Mv.USmash:
          return press(mem, IN_UP | IN_SMASH);
        case Mv.DSmash:
          return press(mem, IN_DOWN | IN_SMASH);
        case Mv.Grab:
          return press(mem, IN_GRAB);
        case Mv.NAir:
          return press(mem, IN_ATTACK);
        case Mv.FAir:
          return press(mem, (me.facing > 0 ? IN_RIGHT : IN_LEFT) | IN_ATTACK);
        case Mv.BAir:
          return press(mem, (me.facing > 0 ? IN_LEFT : IN_RIGHT) | IN_ATTACK);
        case Mv.UAir:
          return press(mem, IN_UP | IN_ATTACK);
        case Mv.DAir:
          return press(mem, IN_DOWN | IN_ATTACK);
      }
    }
    // Nothing reaches: step in (or jump if they're above)
    if (me.grounded && dy > M && rand(s, port, 9, 3) === 0) return press(mem, IN_UP | IN_JUMP);
    if (adx > M / 2) return dirT;
  }

  // Opponent above: jump toward
  if (dy > 1.6 * M && adx < 3 * M && me.grounded && rand(s, port, 12, 3) === 0) return press(mem, IN_JUMP | IN_UP | toward(tgt.x));

  // Far away with little ki: charge (Guard + Special held)
  if (adx > 6 * M && me.grounded && me.ki < 200 && level >= 4 && rand(s, port, 17, 100) < 30) {
    mem.hold = IN_GUARD | IN_SPECIAL;
    mem.holdUntil = s.frame + 20 + rand(s, port, 18, 40);
    return mem.hold;
  }
  // Mid range: projectiles sometimes
  if (adx > 4 * M && abs(dy) < M && me.grounded && rand(s, port, 13, 100) < 4 + level * 2) {
    if (me.ki >= 100 && rand(s, port, 14, 4) === 0) return press(mem, IN_SMASH | IN_SPECIAL);
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
