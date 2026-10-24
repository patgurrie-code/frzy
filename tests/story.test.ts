import { describe, expect, it } from 'vitest';
import { CHAPTERS, SPEAKERS } from '../src/story/story';
import { FIGHTERS } from '../src/sim/fighters';

describe('story data', () => {
  it('chapters have unique ids and every scene references known speakers/fighters', () => {
    const ids = new Set<string>();
    for (const ch of CHAPTERS) {
      expect(ids.has(ch.id)).toBe(false);
      ids.add(ch.id);
      expect(SPEAKERS[ch.hero], ch.id).toBeDefined();
      expect(ch.scenes.length).toBeGreaterThan(0);
      for (const sc of ch.scenes) {
        if (sc.kind === 'dialogue') {
          for (const l of sc.lines) expect(SPEAKERS[l.who], `${ch.id}: ${l.who}`).toBeDefined();
          if (sc.stage) for (const k of sc.stage) expect(SPEAKERS[k]?.fighter, `${ch.id} stage ${k}`).toBeDefined();
        }
        if (sc.kind === 'fight') {
          for (const k of [sc.player, sc.opponent]) {
            const f = SPEAKERS[k]?.fighter;
            expect(f, `${ch.id} fighter ${k}`).toBeDefined();
            expect(FIGHTERS[f!]).toBeDefined();
          }
          expect(sc.level).toBeGreaterThanOrEqual(1);
          expect(sc.level).toBeLessThanOrEqual(9);
        }
      }
    }
  });
  it('every chapter has at least one fight', () => {
    for (const ch of CHAPTERS) expect(ch.scenes.some((s) => s.kind === 'fight'), ch.id).toBe(true);
  });
});
