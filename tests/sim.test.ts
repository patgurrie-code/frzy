import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createGame, step, knockback, MatchConfig } from '../src/sim/sim';
import { checksum, saveState, loadState, GameState, Mode, Phase, Act } from '../src/sim/state';
import { hash32 } from '../src/sim/rng';
import { IN_ALL, IN_ATTACK, IN_JUMP, IN_LEFT, IN_RIGHT, IN_UP, IN_SPECIAL, IN_GUARD } from '../src/sim/input';
import { FIGHTERS } from '../src/sim/fighters';
import { MOVE_COUNT, Mv } from '../src/sim/defs';
import { isin, icos, iatan2, isqrt } from '../src/sim/fixed';

/** Deterministic pseudo-random input stream that holds buttons for a few frames like a human. */
function inputsFor(frame: number, port: number, seed: number): number {
  const block = Math.floor(frame / 7);
  return hash32(block, port, seed) & IN_ALL;
}

function run(cfg: MatchConfig, frames: number, seed = 1, s?: GameState): GameState {
  const g = s ?? createGame(cfg);
  for (let i = 0; i < frames; i++) {
    const f = g.frame;
    step(g, g.fighters.map((_, p) => inputsFor(f, p, seed)));
  }
  return g;
}

const platform4: MatchConfig = { mode: Mode.Platform, stage: 0, chars: [0, 1, 1, 0], seed: 99 };
const versus: MatchConfig = { mode: Mode.Versus, stage: 0, chars: [1, 0], seed: 7 };

function assertIntegers(v: unknown, path = 'state'): void {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`${path} is not an integer: ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => assertIntegers(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertIntegers(x, `${path}.${k}`);
}

describe('determinism', () => {
  it('same inputs twice give identical checksums (platform, 4 players)', () => {
    const a = run(platform4, 3000);
    const b = run(platform4, 3000);
    expect(checksum(a)).toBe(checksum(b));
    expect(a).toEqual(b);
  });

  it('same inputs twice give identical checksums (versus)', () => {
    const a = run(versus, 4000, 3);
    const b = run(versus, 4000, 3);
    expect(checksum(a)).toBe(checksum(b));
  });

  it('different inputs diverge', () => {
    const a = run(versus, 600, 3);
    const b = run(versus, 600, 4);
    expect(checksum(a)).not.toBe(checksum(b));
  });

  it('save -> run 10 frames -> load -> rerun gives identical state', () => {
    for (const cfg of [platform4, versus]) {
      const g = run(cfg, 700, 5);
      const snap = saveState(g);
      const snapSum = checksum(snap);
      run(cfg, 10, 5, g);
      const after = checksum(g);
      const afterState = saveState(g);
      const restored = loadState(snap);
      expect(checksum(restored)).toBe(snapSum);
      run(cfg, 10, 5, restored);
      expect(checksum(restored)).toBe(after);
      expect(restored).toEqual(afterState);
      // The snapshot itself must not have been mutated by running the restored copy
      expect(checksum(snap)).toBe(snapSum);
    }
  });

  it('state only contains integers', () => {
    assertIntegers(run(platform4, 2000, 11));
    assertIntegers(run(versus, 2000, 12));
  });

  it('state survives a JSON round trip unchanged', () => {
    const g = run(platform4, 900, 13);
    const copy = JSON.parse(JSON.stringify(g)) as GameState;
    expect(checksum(copy)).toBe(checksum(g));
    run(platform4, 100, 13, g);
    run(platform4, 100, 13, copy);
    expect(checksum(copy)).toBe(checksum(g));
  });
});

describe('sim purity', () => {
  const banned = [/Math\.(sin|cos|tan|atan2?|random|sqrt|pow|exp|log)\b/, /\bDate\b/, /performance\./, /\bdocument\./, /\bwindow\./, /from 'three'/];
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
  }
  it('src/sim uses no floating-point trig, randomness, time or DOM', () => {
    for (const f of files(join(__dirname, '../src/sim'))) {
      const src = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      for (const re of banned) {
        // anim.ts has a float sampler for the renderer only; it doesn't use banned APIs either.
        expect(re.test(src), `${f} matches ${re}`).toBe(false);
      }
    }
  });
});

describe('fixed-point maths', () => {
  it('trig table is sane', () => {
    expect(isin(0)).toBe(0);
    expect(isin(90)).toBe(10000);
    expect(isin(270)).toBe(-10000);
    expect(icos(180)).toBe(-10000);
    expect(isin(-30)).toBe(-5000);
  });
  it('atan2 and sqrt', () => {
    expect(iatan2(0, 1)).toBe(0);
    expect(iatan2(1, 0)).toBe(90);
    expect(iatan2(0, -1)).toBe(180);
    expect(iatan2(-1, 0)).toBe(270);
    expect(iatan2(1, 1)).toBe(45);
    expect(isqrt(144)).toBe(12);
    expect(isqrt(145)).toBe(12);
    expect(isqrt(1e10)).toBe(100000);
  });
});

describe('fighter data', () => {
  it('every fighter has the full move list', () => {
    for (const f of FIGHTERS) {
      expect(f.moves.length).toBe(MOVE_COUNT);
      for (let i = 0; i < MOVE_COUNT; i++) {
        const mv = f.moves[i];
        expect(mv, `${f.id} move ${i}`).toBeDefined();
        expect(mv.length).toBeGreaterThan(0);
        for (const h of mv.hitboxes) {
          expect(h.start).toBeGreaterThanOrEqual(1);
          expect(h.end).toBeLessThanOrEqual(mv.length);
          expect(h.group).toBeLessThan(8);
        }
      }
      expect(f.moves[Mv.Super].kiCost).toBe(300);
      expect(f.moves[Mv.NSpecEx].kiCost).toBe(100);
      for (const t of [Mv.FThrow, Mv.BThrow, Mv.UThrow, Mv.DThrow]) expect(f.moves[t].throwRelease).toBeDefined();
    }
  });
  it('brawler is faster and lighter than the blaster', () => {
    const [k, t] = FIGHTERS;
    expect(k.stats.run).toBeGreaterThan(t.stats.run);
    expect(k.stats.weight).toBeLessThan(t.stats.weight);
    expect(k.moves[Mv.Jab].hitboxes[0].start).toBeLessThan(t.moves[Mv.Jab].hitboxes[0].start);
  });
});

describe('knockback', () => {
  it('scales with percent and inversely with weight', () => {
    const low = knockback(0, 10, 100, 30, 100);
    const high = knockback(1000, 10, 100, 30, 100);
    expect(high).toBeGreaterThan(low);
    const light = knockback(800, 10, 80, 30, 100);
    const heavy = knockback(800, 10, 120, 30, 100);
    expect(light).toBeGreaterThan(heavy);
  });
});

function hold(g: GameState, masks: number[], frames: number) {
  for (let i = 0; i < frames; i++) step(g, masks);
}

function toFight(g: GameState) {
  while (g.phase !== Phase.Fight) step(g, g.fighters.map(() => 0));
}

describe('gameplay', () => {
  it('jumps leave the ground and land again', () => {
    const g = createGame({ mode: Mode.Platform, stage: 0, chars: [0, 1] });
    toFight(g);
    hold(g, [IN_JUMP | IN_UP, 0], 1);
    hold(g, [0, 0], 10);
    expect(g.fighters[0].grounded).toBe(0);
    expect(g.fighters[0].y).toBeGreaterThan(0);
    hold(g, [0, 0], 120);
    expect(g.fighters[0].grounded).toBe(1);
  });

  it('walking off the stage and falling costs a stock', () => {
    const g = createGame({ mode: Mode.Platform, stage: 0, chars: [0, 1] });
    toFight(g);
    hold(g, [IN_LEFT, 0], 600);
    expect(g.fighters[0].stocks).toBeLessThan(3);
  });

  it('a jab damages a nearby opponent', () => {
    const g = createGame({ mode: Mode.Platform, stage: 0, chars: [0, 1] });
    toFight(g);
    g.fighters[0].x = 0;
    g.fighters[1].x = 6000;
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, 0], 30);
    expect(g.fighters[1].damage).toBeGreaterThan(0);
    expect(g.fighters[0].ki).toBeGreaterThan(0);
  });

  it('shield blocks damage', () => {
    const g = createGame({ mode: Mode.Platform, stage: 0, chars: [0, 1] });
    toFight(g);
    g.fighters[0].x = 0;
    g.fighters[1].x = 6000;
    hold(g, [0, IN_GUARD], 3);
    hold(g, [IN_ATTACK, IN_GUARD], 1);
    hold(g, [0, IN_GUARD], 20);
    expect(g.fighters[1].damage).toBe(0);
  });

  it('ki super triggers the cinematic freeze', () => {
    const g = createGame({ mode: Mode.Versus, stage: 0, chars: [0, 1] });
    toFight(g);
    g.fighters[0].ki = 300;
    hold(g, [IN_ATTACK | IN_SPECIAL, 0], 1);
    expect(g.freeze).toBeGreaterThan(0);
    expect(g.fighters[0].move).toBe(Mv.Super);
    expect(g.fighters[0].ki).toBe(0);
  });

  it('versus: time up ends the round and best of 3 ends the match', () => {
    const g = createGame(versus);
    let rounds = 0;
    let guard = 0;
    while (g.phase !== Phase.MatchEnd && guard++ < 80000) {
      const before = g.round;
      step(g, [0, 0]);
      if (g.round !== before) rounds++;
    }
    // Draws by time (no damage) never award rounds, so the match runs to the round cap.
    expect(g.phase).toBe(Phase.MatchEnd);
    expect(rounds).toBeGreaterThan(0);
  });

  it('versus: health reaching zero awards the round', () => {
    const g = createGame(versus);
    toFight(g);
    g.fighters[1].health = 1;
    g.fighters[0].x = 0;
    g.fighters[1].x = 7000;
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, 0], 30);
    expect(g.roundWins[0]).toBe(1);
    expect(g.phase).toBe(Phase.RoundEnd);
  });

  it('walls keep fighters on screen in versus', () => {
    const g = createGame(versus);
    toFight(g);
    hold(g, [IN_LEFT, IN_RIGHT], 600);
    expect(g.fighters[0].act).not.toBe(Act.Dead);
    expect(g.fighters[0].x).toBeGreaterThan(-70000);
    expect(g.fighters[1].x).toBeLessThan(70000);
  });

  it('beams clash when two blasters fire at each other', () => {
    const g = createGame({ mode: Mode.Versus, stage: 0, chars: [1, 1] });
    toFight(g);
    g.fighters[0].x = -40000;
    g.fighters[1].x = 40000;
    hold(g, [0, 0], 2);
    hold(g, [IN_SPECIAL, IN_SPECIAL], 1);
    let clashed = false;
    for (let i = 0; i < 60; i++) {
      step(g, [0, 0]);
      if (g.clash.active) clashed = true;
    }
    expect(clashed).toBe(true);
    // Player 1 mashes, player 2 doesn't -> player 1 wins
    for (let i = 0; i < 300 && g.clash.active; i++) step(g, [i % 2 ? IN_SPECIAL : 0, 0]);
    expect(g.clash.active).toBe(0);
    expect(g.fighters[1].health).toBeLessThan(1000);
  });
});
