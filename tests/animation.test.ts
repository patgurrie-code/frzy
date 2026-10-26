import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Mv } from '../src/sim/defs';
import { FIGHTERS } from '../src/sim/fighters';
import { samplePose } from '../src/sim/anim';
import { emptyPose } from '../src/sim/skeleton';

describe('animation polish', () => {
  it('a longer EX beam holds its firing pose and settles at the extended move end', () => {
    const base = FIGHTERS[0].moves[Mv.NSpec], ex = FIGHTERS[0].moves[Mv.NSpecEx];
    expect(ex.anim.length).toBe(ex.length);
    const a = emptyPose(), b = emptyPose();
    samplePose(base.anim, 24, a);
    samplePose(ex.anim, 24 + ex.length - base.length, b);
    expect(b).toEqual(a);
  });

  it('preserves every move active pose, hitbox, projectile/throw release and timing from b0c4adc', () => {
    // Signatures captured from origin/main before this pass. Include integer FK-driving poses on every
    // active tick, full hitbox/projectile/release definitions and move length (not just visual keys).
    const baseline = JSON.parse(readFileSync(new URL('./fixtures/active-poses-b0c4adc.json', import.meta.url), 'utf8'));
    const signatures = FIGHTERS.map(d => d.moves.map(m => {
      const pose = emptyPose(), frames = new Set<number>();
      for (const h of m.hitboxes) for (let f = h.start; f <= h.end; f++) frames.add(f);
      if (m.projectile) frames.add(m.projectile.f);
      if (m.throwRelease) frames.add(m.throwRelease.f);
      const samples = [...frames].sort((a, b) => a - b).map(f => {
        samplePose(m.anim, f, pose);
        return [f, ...pose.rot, pose.rootX, pose.rootY];
      });
      const text = JSON.stringify([m.length, m.hitboxes, m.projectile, m.throwRelease, samples]);
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      return hash >>> 0;
    }));
    expect(signatures).toEqual(baseline);
  });

  it('returns each normal move to stance without a discontinuous full spin', () => {
    for (const d of FIGHTERS) {
      const stance = emptyPose(); samplePose(d.anims.idle, 0, stance);
      for (const m of d.moves) {
        // EX variants can inherit an animation with a shorter length; sample its final pose.
        const end = emptyPose(); samplePose(m.anim, m.anim.length, end);
        for (let b = 0; b < end.rot.length; b++) {
          expect(((end.rot[b] - stance.rot[b]) % 360 + 360) % 360, `${d.id} ${m.name} bone ${b}`).toBe(0);
        }
        expect(end.rootX, `${d.id} ${m.name}`).toBe(stance.rootX);
        expect(end.rootY, `${d.id} ${m.name}`).toBe(stance.rootY);
      }
    }
  });

  it('closes locomotion loops and matches stride distance to each fighter', () => {
    for (const d of FIGHTERS) {
      for (const [a, speed, stride] of [[d.anims.walk, d.stats.walk, 1.6], [d.anims.run, d.stats.run, 2.2]] as const) {
        const first = a.keys[0], last = a.keys[a.keys.length - 1];
        expect(Array.from(first.rot), `${d.id} cycle seam`).toEqual(Array.from(last.rot));
        expect([first.rootX, first.rootY]).toEqual([last.rootX, last.rootY]);
        expect(Math.abs(a.length * speed / 10000 - stride * d.stats.scale / 1000)).toBeLessThanOrEqual(speed / 10000);
        for (let k = 1; k < a.keys.length; k++) expect(a.keys[k].f).toBeGreaterThan(a.keys[k - 1].f);
      }
    }
  });
});
