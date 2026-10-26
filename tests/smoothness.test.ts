import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGame, step, applyHit } from '../src/sim/sim';
import { Act, Mode, Phase, saveState, checksum } from '../src/sim/state';
import { FIGHTERS } from '../src/sim/fighters';
import { IN_ATTACK, IN_GUARD, IN_JUMP, IN_LEFT, IN_RIGHT } from '../src/sim/input';
import { InputManager } from '../src/input/input';

function game(char = 0) {
  const s = createGame({ mode: Mode.Platform, stage: 0, chars: [char], seed: 42 });
  while (s.phase !== Phase.Fight) step(s, [0]);
  s.fighters[0].x = 0;
  return s;
}

describe('movement smoothness', () => {
  for (let char = 0; char < FIGHTERS.length; char++) {
    it(`${FIGHTERS[char].id}: ramps into run, brakes through turnaround and carries jump momentum`, () => {
      const s = game(char), f = s.fighters[0], stats = FIGHTERS[char].stats;
      let prev = 0;
      for (let i = 0; i < 18; i++) {
        step(s, [IN_RIGHT]);
        expect(f.vx).toBeGreaterThanOrEqual(prev);
        expect(f.vx - prev).toBeLessThanOrEqual(Math.max(Math.trunc(stats.walk / 3), stats.traction * 2));
        prev = f.vx;
      }
      expect(f.act).toBe(Act.Run);
      expect(f.vx).toBe(stats.run);
      const saved = saveState(s);
      step(s, [IN_LEFT]);
      expect(f.vx).toBeGreaterThan(0);
      expect(f.vx).toBe(stats.run - stats.traction * 2);
      const j = saved.fighters[0];
      step(saved, [IN_RIGHT | IN_JUMP]);
      for (let i = 0; i < stats.jumpSquat; i++) step(saved, [IN_RIGHT | IN_JUMP]);
      expect(j.grounded).toBe(0);
      expect(j.vx).toBeGreaterThan(stats.airSpeed);
      expect(j.vy).toBe(stats.jumpV);
      const before = j.vx;
      step(saved, [IN_RIGHT]);
      expect(j.vx).toBe(before - stats.airFriction);
      step(saved, [IN_JUMP]);
      expect(j.vx).toBeGreaterThan(0); // neutral air jump no longer kills all forward movement
    });
  }

  it('short hop and full hop remain distinct across the roster', () => {
    for (let c = 0; c < FIGHTERS.length; c++) {
      const a = game(c), b = game(c), st = FIGHTERS[c].stats;
      step(a, [IN_JUMP]); step(b, [IN_JUMP]);
      for (let i = 0; i < st.jumpSquat; i++) { step(a, [0]); step(b, [IN_JUMP]); }
      expect(a.fighters[0].vy).toBe(st.hopV);
      expect(b.fighters[0].vy).toBe(st.jumpV);
    }
  });
});

describe('recovery buffering', () => {
  for (const [label, button, expected] of [['attack', IN_ATTACK, Act.Attack], ['jump', IN_JUMP, Act.JumpSquat], ['guard', IN_GUARD, Act.Shield]] as const) {
    for (const recovery of [Act.Land, Act.Hitstun, Act.ShieldStun]) {
      it(`${label} tap 7f before recovery from ${recovery} is accepted once`, () => {
        const s = game(), f = s.fighters[0];
        f.act = recovery; f.actFrame = 0; f.landLag = 7; f.hitstun = 7;
        step(s, [button]);
        for (let i = 0; i < 6; i++) step(s, [0]);
        expect(f.act).toBe(expected);
        expect(f.consumed).toBe(s.frame);
        const copy = saveState(s);
        for (let i = 0; i < 90; i++) { step(s, [0]); step(copy, [0]); }
        expect(checksum(s)).toBe(checksum(copy));
        expect(f.act).not.toBe(Act.Attack);
      });
    }
  }
  it('expires an old tap instead of performing a surprise action after long lag', () => {
    const s = game(), f = s.fighters[0];
    f.act = Act.Land; f.landLag = 12; f.actFrame = 0;
    step(s, [IN_ATTACK]);
    for (let i = 0; i < 12; i++) step(s, [0]);
    expect(f.act).toBe(Act.Idle);
  });
});

afterEach(() => vi.unstubAllGlobals());
it('keyboard latches short taps until consumed and clears them on blur', () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const target = new EventTarget();
  const input = new InputManager(target as unknown as Window);
  const key = (type: string) => target.dispatchEvent(Object.assign(new Event(type), { code: 'KeyJ' }));
  key('keydown'); key('keyup');
  expect(input.keyboardMask(0) & IN_ATTACK).toBe(IN_ATTACK);
  expect(input.keyboardMask(0) & IN_ATTACK).toBe(IN_ATTACK); // unscheduled/stalled tick retains it
  input.endFrame();
  expect(input.keyboardMask(0)).toBe(0);
  key('keydown'); target.dispatchEvent(new Event('blur'));
  expect(input.keyboardMask(0)).toBe(0);
});

it('light hits release sooner while heavy hits retain a longer impact freeze', () => {
  const lags: number[] = [];
  for (const dmg of [3, 10, 23]) {
    const s = createGame({ mode: Mode.Versus, stage: 0, chars: [0, 1] });
    s.phase = Phase.Fight;
    const [a, v] = s.fighters;
    applyHit(s, a, v, { ...FIGHTERS[0].moves[0].hitboxes[0], dmg }, 100, 1, v.x, 10000, false);
    lags.push(v.hitlag);
    expect(v.hitlag).toBe(a.hitlag);
    expect(v.hitstun).toBeGreaterThan(0);
  }
  expect(lags).toEqual([5, 9, 16]);
});
