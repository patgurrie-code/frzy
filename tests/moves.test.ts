import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/sim/sim';
import { GameState, Mode, Phase, Act } from '../src/sim/state';
import { IN_ATTACK, IN_SMASH, IN_RIGHT, IN_GUARD, IN_SPECIAL, IN_JUMP, IN_UP, IN_LEFT } from '../src/sim/input';
import { Mv } from '../src/sim/defs';
import { FIGHTERS } from '../src/sim/fighters';

function game(chars: number[], mode = Mode.Platform, extra: Partial<Parameters<typeof createGame>[0]> = {}) {
  const g = createGame({ mode, stage: 0, chars, ...extra });
  while (g.phase !== Phase.Fight) step(g, g.fighters.map(() => 0));
  return g;
}
function hold(g: GameState, m: number[], n: number) {
  for (let i = 0; i < n; i++) step(g, m);
}

describe('controls', () => {
  it('Attack + direction = tilt, Smash + direction = smash', () => {
    const g = game([0, 1]);
    hold(g, [IN_RIGHT, 0], 1);
    hold(g, [IN_RIGHT | IN_ATTACK, 0], 1);
    expect(g.fighters[0].move).toBe(Mv.FTilt);
    const h = game([0, 1]);
    hold(h, [IN_RIGHT | IN_SMASH, 0], 1);
    expect(h.fighters[0].move).toBe(Mv.FSmash);
  });

  it('Smash alone = forward smash', () => {
    const g = game([0, 1]);
    hold(g, [IN_SMASH, 0], 1);
    expect(g.fighters[0].move).toBe(Mv.FSmash);
  });

  it('tap-jump: Up+Jump jumps; Attack during jump squat becomes up tilt', () => {
    const g = game([1, 0]); // Torval: 5-frame jump squat
    hold(g, [IN_UP | IN_JUMP, 0], 1);
    expect(g.fighters[0].act).toBe(Act.JumpSquat);
    hold(g, [IN_UP | IN_JUMP | IN_ATTACK, 0], 1);
    expect(g.fighters[0].move).toBe(Mv.UTilt);
    expect(g.fighters[0].grounded).toBe(1);
  });

  it('holding a direction breaks into a run in Platform mode', () => {
    const g = game([0, 1]);
    hold(g, [IN_LEFT, 0], 20);
    expect(g.fighters[0].act).toBe(Act.Run);
  });

  it('jab chains into Jab2 and Jab3', () => {
    const g = game([0, 1]);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      step(g, [i % 4 === 0 ? IN_ATTACK : 0, 0]);
      if (g.fighters[0].act === Act.Attack) seen.add(g.fighters[0].move);
    }
    expect(seen.has(Mv.Jab2)).toBe(true);
    expect(seen.has(Mv.Jab3)).toBe(true);
  });

  it('Guard + Special charges ki', () => {
    const g = game([0, 1]);
    hold(g, [IN_GUARD | IN_SPECIAL, 0], 60);
    expect(g.fighters[0].act).toBe(Act.KiCharge);
    expect(g.fighters[0].ki).toBeGreaterThanOrEqual(50);
  });

  it('Smash + Special spends a bar for an EX special', () => {
    const g = game([0, 1]);
    g.fighters[0].ki = 150;
    hold(g, [IN_SMASH | IN_SPECIAL, 0], 1);
    expect(g.fighters[0].move).toBe(Mv.NSpecEx);
    expect(g.fighters[0].ki).toBe(50);
  });
});

describe('special mechanics', () => {
  it('a counter absorbs a hit and strikes back', () => {
    const g = game([1, 0]); // P2 = Kestrel with Counter Stance
    g.fighters[0].x = 0;
    g.fighters[1].x = 9000;
    g.fighters[1].facing = -1;
    hold(g, [0, IN_SPECIAL | 8 /* IN_DOWN */], 1);
    expect(g.fighters[1].move).toBe(Mv.DSpec);
    hold(g, [0, 0], 4);
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, 0], 40);
    expect(g.fighters[1].damage).toBe(0);
    expect(g.fighters[0].damage).toBeGreaterThan(0);
  });

  it("Brakka's side special is a command grab into a throw", () => {
    const g = game([4, 0]);
    g.fighters[0].x = 0;
    g.fighters[1].x = 15000;
    hold(g, [IN_RIGHT | IN_SPECIAL, 0], 1);
    let thrown = false;
    for (let i = 0; i < 80; i++) {
      step(g, [0, 0]);
      if (g.fighters[0].move === Mv.CmdThrow) thrown = true;
    }
    expect(thrown).toBe(true);
    expect(g.fighters[1].damage).toBeGreaterThanOrEqual(150);
  });

  it('modifiers change health, damage and ki regen', () => {
    const g = game([0, 1], Mode.Versus, { mods: [undefined, { health: 2000, def: 50, kiRegen: 30 }] });
    expect(g.fighters[1].health).toBe(2000);
    g.fighters[0].x = 0;
    g.fighters[1].x = 7000;
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, 0], 120);
    expect(g.fighters[1].health).toBeGreaterThan(2000 - 15);
    expect(g.fighters[1].ki).toBeGreaterThan(30);
  });

  it('one-round untimed versus', () => {
    const g = game([0, 1], Mode.Versus, { roundsToWin: 1, timeLimit: 0 });
    hold(g, [0, 0], 7000);
    expect(g.phase).toBe(Phase.Fight); // never times out
    g.fighters[1].health = 1;
    g.fighters[0].x = 0;
    g.fighters[1].x = 7000;
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, 0], 600);
    expect(g.phase).toBe(Phase.MatchEnd);
    expect(g.winner).toBe(0);
  });

  it('every fighter has jab chains and a command throw slot', () => {
    for (const f of FIGHTERS) {
      expect(f.moves[Mv.Jab].chain?.next, f.id).toBe(Mv.Jab2);
      expect(f.moves[Mv.CmdThrow].throwRelease, f.id).toBeDefined();
    }
  });
});

describe('defence & combo systems', () => {
  it('parry: guarding just before a hit takes no damage and freezes the attacker', () => {
    const g = game([0, 1]);
    g.fighters[0].x = 0;
    g.fighters[1].x = 6000;
    hold(g, [IN_ATTACK, 0], 1);
    hold(g, [0, IN_GUARD], 1); // shield goes up right before the jab's active frames
    let parried = false;
    for (let i = 0; i < 20; i++) {
      step(g, [0, IN_GUARD]);
      if (g.events.some((e) => e.type === 21 /* EvType.Parry */)) parried = true;
    }
    expect(parried).toBe(true);
    expect(g.fighters[1].damage).toBe(0);
  });

  it('a normal that hits can be cancelled into a special', () => {
    const g = game([0, 1]);
    g.fighters[0].x = 0;
    g.fighters[1].x = 6000;
    hold(g, [IN_ATTACK, 0], 1);
    let cancelled = false;
    for (let i = 0; i < 12; i++) {
      step(g, [i === 5 ? IN_SPECIAL : 0, 0]);
      if (g.fighters[0].move === Mv.NSpec) cancelled = true;
    }
    expect(cancelled).toBe(true);
  });

  it('tech: guard before landing from a launch recovers instantly', () => {
    const g = game([0, 1]);
    const f = g.fighters[1];
    f.x = 0;
    f.y = 4000;
    f.grounded = 0;
    f.platform = -1;
    f.act = Act.Hitstun;
    f.hitstun = 40;
    f.vy = -3000;
    hold(g, [0, IN_GUARD], 1);
    hold(g, [0, 0], 3);
    expect(f.act === Act.Land || f.act === Act.Idle).toBe(true);
    expect(f.invuln).toBeGreaterThan(0);
  });
});

describe('platform extras', () => {
  it('Jump + Attack together = short-hop aerial', () => {
    const g = game([0, 1]);
    hold(g, [IN_JUMP | IN_ATTACK, 0], 1);
    hold(g, [0, 0], 6);
    expect(g.fighters[0].grounded).toBe(0);
    expect(g.fighters[0].move).toBe(Mv.NAir);
  });

  it('ledge trump: grabbing an occupied ledge pops the hanger off', () => {
    const g = game([0, 1]);
    const [a, b] = g.fighters;
    // b hangs on the right ledge
    b.x = 68000;
    b.y = -12000;
    b.grounded = 0;
    b.platform = -1;
    b.act = Act.Air;
    b.vy = -100;
    hold(g, [0, 0], 2);
    expect(b.act).toBe(Act.LedgeHang);
    hold(g, [0, 0], 15);
    a.x = 69000;
    a.y = -11000;
    a.grounded = 0;
    a.platform = -1;
    a.act = Act.Air;
    a.vy = -100;
    hold(g, [0, 0], 2);
    expect(a.act).toBe(Act.LedgeHang);
    expect(b.act).not.toBe(Act.LedgeHang);
  });
});
