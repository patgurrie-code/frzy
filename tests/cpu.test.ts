import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/sim/sim';
import { checksum, Mode, Phase, Act } from '../src/sim/state';
import { cpuInput, newCpuMemory } from '../src/ai/cpu';

function cpuMatch(mode: Mode, chars: number[], frames: number, level = 6) {
  const g = createGame({ mode, stage: 0, chars, seed: 5 });
  const mem = chars.map(() => newCpuMemory());
  for (let i = 0; i < frames && g.phase !== Phase.MatchEnd; i++) step(g, chars.map((_, p) => cpuInput(g, p, level, mem[p])));
  return g;
}

describe('cpu', () => {
  it('is deterministic', () => {
    const a = cpuMatch(Mode.Platform, [0, 1, 0, 1], 3000);
    const b = cpuMatch(Mode.Platform, [0, 1, 0, 1], 3000);
    expect(checksum(a)).toBe(checksum(b));
  });

  it('fights: damage is dealt in platform and versus', () => {
    const p = cpuMatch(Mode.Platform, [0, 1], 3600);
    expect(p.fighters.some((f) => f.damage > 0 || f.falls > 0)).toBe(true);
    const v = cpuMatch(Mode.Versus, [1, 0], 3600);
    expect(v.fighters.some((f) => f.health < 1000) || v.roundWins.some((w) => w > 0)).toBe(true);
  });

  it('a platform match between CPUs eventually ends', () => {
    const g = cpuMatch(Mode.Platform, [0, 1], 60 * 60 * 8, 9);
    expect(g.phase).toBe(Phase.MatchEnd);
  });

  it('recovers to the stage from offstage', () => {
    for (const char of [0, 1]) {
      const g = createGame({ mode: Mode.Platform, stage: 0, chars: [char, 0] });
      while (g.phase !== Phase.Fight) step(g, [0, 0]);
      const f = g.fighters[0];
      f.x = 75000; // 1 m past the right edge
      f.y = -5000;
      f.grounded = 0;
      f.platform = -1;
      f.act = Act.Air;
      const mem = newCpuMemory();
      let back = false;
      for (let i = 0; i < 300; i++) {
        step(g, [cpuInput(g, 0, 7, mem), 0]);
        if (f.act === Act.LedgeHang || (f.grounded && f.platform >= 0)) back = true;
      }
      expect(back, `fighter ${char} recovered`).toBe(true);
      expect(f.stocks).toBe(3);
    }
  });

  it('level 0 is a dummy', () => {
    const g = createGame({ mode: Mode.Platform, stage: 0, chars: [0, 1] });
    expect(cpuInput(g, 0, 0, newCpuMemory())).toBe(0);
  });
});
