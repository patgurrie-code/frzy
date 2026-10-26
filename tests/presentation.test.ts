import { describe, it, expect } from 'vitest';
import { PoseBlend, VisualPosition, damping } from '../src/render/presentation';
import { FIGHTERS } from '../src/sim/fighters';
import { newFighterState, Act, Phase } from '../src/sim/state';
import { samplePoseF } from '../src/sim/anim';
import { BONE_COUNT } from '../src/sim/skeleton';

describe('render presentation', () => {
  it('interpolates the actual animation clock even on the first/last hitlag tick', () => {
    const p = newFighterState(0, 0, 0);
    const f = { ...p, actFrame: 12, hitlag: 1 };
    p.actFrame = 11;
    const pose = new PoseBlend(FIGHTERS[0]);
    const before = JSON.stringify([p, f]);
    pose.sample(p, f, FIGHTERS[0], 0.5, 1 / 60, Phase.Fight, 0, 0);
    const rot = new Float32Array(BONE_COUNT), root = new Float32Array(2);
    samplePoseF(FIGHTERS[0].anims.idle, 11.5, rot, root);
    expect(pose.rot).toEqual(rot);
    f.hitlag = 0; p.actFrame = f.actFrame;
    pose.sample(p, f, FIGHTERS[0], 0, 0, Phase.Fight, 0, 0);
    samplePoseF(FIGHTERS[0].anims.idle, 12, rot, root);
    expect(pose.rot).toEqual(rot);
    f.hitlag = 1; p.actFrame = 11;
    expect(JSON.stringify([p, f])).toBe(before);
  });

  it('crossfades a state change from the displayed pose and reaches the new pose', () => {
    const f = newFighterState(0, 0, 0), p = { ...f };
    const pose = new PoseBlend(FIGHTERS[0]);
    pose.sample(p, f, FIGHTERS[0], 1, 0, Phase.Fight, 0, 0);
    const start = pose.rot.slice();
    f.act = Act.Crouch;
    pose.sample(p, f, FIGHTERS[0], 1, 0, Phase.Fight, 0, 0);
    expect(pose.rot).toEqual(start);
    pose.sample(f, f, FIGHTERS[0], 1, 0.1, Phase.Fight, 0, 0);
    expect(pose.rot).not.toEqual(start);
  });

  it('smooths a small correction but resets a respawn', () => {
    const p = newFighterState(0, 0, 0), f = { ...p };
    const v = new VisualPosition();
    v.sample(p, f, 1, 1, 0, false);
    f.x = 1000;
    v.sample(p, f, 1, 1, 0, false);
    expect(v.x).toBeCloseTo(0);
    v.sample(f, f, 1, 1, 0.1, false);
    expect(v.x).toBeGreaterThan(0.09);
    f.x = 50000;
    v.sample(f, f, 2, 1, 0, true);
    expect(v.x).toBe(5);
  });

  it('damping has the same response at 30, 60 and 144 Hz', () => {
    const response = (hz: number) => {
      let v = 0;
      for (let i = 0; i < hz; i++) v += (1 - v) * damping(6, 1 / hz);
      return v;
    };
    expect(response(30)).toBeCloseTo(response(144), 12);
    expect(response(60)).toBeCloseTo(response(144), 12);
  });
});
