import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/sim/sim';
import { GameState, Mode, Phase, Act, EvType } from '../src/sim/state';
import { IN_ATTACK, IN_GUARD, IN_DOWN, IN_GRAB, IN_SPECIAL, IN_LEFT, IN_RIGHT, IN_SMASH } from '../src/sim/input';
import { Mv } from '../src/sim/defs';

function vs(chars = [0, 1]) {
  const g = createGame({ mode: Mode.Versus, stage: 0, chars });
  while (g.phase !== Phase.Fight) step(g, [0, 0]);
  return g;
}
function hold(g: GameState, m: number[], n: number) {
  for (let i = 0; i < n; i++) step(g, m);
}
function sawEvent(g: GameState, m: number[], n: number, type: number) {
  let seen = false;
  for (let i = 0; i < n; i++) {
    step(g, m);
    if (g.events.some((e) => e.type === type)) seen = true;
  }
  return seen;
}
function face(g: GameState, gap = 7000) {
  g.fighters[0].x = 0;
  g.fighters[1].x = gap;
  g.fighters[0].facing = 1;
  g.fighters[1].facing = -1;
}

describe('versus: high / low blocking', () => {
  it('a low hits a standing guard but is blocked by a crouching guard', () => {
    let g = vs();
    face(g);
    hold(g, [0, IN_GUARD], 10); // standing guard (past the parry window)
    hold(g, [IN_DOWN | IN_ATTACK, IN_GUARD], 1);
    expect(sawEvent(g, [0, IN_GUARD], 20, EvType.WrongGuard)).toBe(true);
    expect(g.fighters[1].health).toBeLessThan(1000);

    g = vs();
    face(g);
    hold(g, [0, IN_GUARD | IN_DOWN], 10);
    expect(g.fighters[1].guardLow).toBe(1);
    hold(g, [IN_DOWN | IN_ATTACK, IN_GUARD | IN_DOWN], 1);
    hold(g, [0, IN_GUARD | IN_DOWN], 20);
    expect(g.fighters[1].health).toBeGreaterThan(985); // chip only
  });

  it('a mid is blocked by both guards', () => {
    const g = vs();
    face(g);
    hold(g, [0, IN_GUARD | IN_DOWN], 10);
    hold(g, [IN_ATTACK, IN_GUARD | IN_DOWN], 1);
    hold(g, [0, IN_GUARD | IN_DOWN], 20);
    expect(g.fighters[1].health).toBeGreaterThan(985);
  });
});

describe('versus: throws, walls, launchers, burst', () => {
  it('pressing Grab right after being grabbed escapes the throw', () => {
    const g = vs();
    face(g, 6000);
    hold(g, [IN_GRAB, 0], 1);
    let grabbed = false;
    for (let i = 0; i < 12 && !grabbed; i++) {
      step(g, [0, 0]);
      grabbed = g.fighters[1].act === Act.Grabbed;
    }
    expect(grabbed).toBe(true);
    expect(sawEvent(g, [0, IN_GRAB], 3, EvType.ThrowTech)).toBe(true);
    expect(g.fighters[1].act).not.toBe(Act.Grabbed);
  });

  it('a strong hit into the wall bounces once', () => {
    const g = vs();
    g.fighters[0].x = 40000;
    g.fighters[1].x = 50000;
    g.fighters[0].facing = 1;
    hold(g, [IN_RIGHT | IN_SMASH, 0], 1);
    expect(sawEvent(g, [0, 0], 90, EvType.WallBounce)).toBe(true);
  });

  it('up tilt launches straight up for an air combo', () => {
    const g = vs();
    face(g, 3500);
    // Up tilt = Attack with Up held (not a fresh Up press, which would jump)
    g.fighters[0].inputs.fill(4);
    hold(g, [4 | IN_ATTACK, 0], 1);
    expect(g.fighters[0].move).toBe(Mv.UTilt);
    expect(sawEvent(g, [4, 0], 20, EvType.Launch)).toBe(true);
    hold(g, [0, 0], 15);
    expect(g.fighters[1].y).toBeGreaterThan(10000);
  });

  it('burst breaks a combo once per round and costs a ki bar', () => {
    const g = vs();
    face(g, 6000);
    g.fighters[1].ki = 150;
    hold(g, [IN_ATTACK, 0], 1);
    let burst = false;
    for (let i = 0; i < 30 && !burst; i++) {
      step(g, [0, IN_GUARD | (i % 2 ? IN_SPECIAL : 0)]);
      burst = g.fighters[1].move === Mv.Burst;
    }
    expect(burst).toBe(true);
    expect(g.fighters[1].ki).toBeLessThan(70);
    expect(g.fighters[1].burstUsed).toBe(1);
    hold(g, [0, 0], 30);
    expect(g.fighters[0].act === Act.Hitstun || g.fighters[0].x < 0).toBe(true);
    void IN_LEFT;
  });
});
