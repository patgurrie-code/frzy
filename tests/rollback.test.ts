import { describe, expect, it } from 'vitest';
import { RollbackSession, NetMsg } from '../src/net/rollback';
import { createGame, step, MatchConfig } from '../src/sim/sim';
import { checksum, Mode } from '../src/sim/state';
import { hash32 } from '../src/sim/rng';
import { IN_ALL } from '../src/sim/input';

/** Simulated unreliable link: latency + jitter (frames) + loss, may reorder. */
class Link {
  private q: { at: number; m: NetMsg }[] = [];
  constructor(private latency: number, private jitter: number, private loss: number, private seed: number) {}
  send(now: number, m: NetMsg) {
    const h = hash32(now, this.seed, this.q.length);
    if ((h % 1000) / 1000 < this.loss) return;
    const j = this.jitter ? (h >> 10) % (this.jitter + 1) : 0;
    this.q.push({ at: now + this.latency + j, m: JSON.parse(JSON.stringify(m)) });
  }
  deliver(now: number, to: RollbackSession) {
    const due = this.q.filter((x) => x.at <= now);
    this.q = this.q.filter((x) => x.at > now);
    for (const d of due) to.receive(d.m);
  }
}

function humanish(frame: number, port: number, seed: number) {
  return hash32(Math.floor(frame / 9), port, seed) & IN_ALL;
}

function play(cfg: MatchConfig, ticks: number, latency: number, jitter: number, loss: number) {
  let now = 0;
  const ab = new Link(latency, jitter, loss, 1);
  const ba = new Link(latency, jitter, loss, 2);
  const A: RollbackSession = new RollbackSession(cfg, 0, (m) => ab.send(now, m));
  const B: RollbackSession = new RollbackSession(cfg, 1, (m) => ba.send(now, m));
  for (; now < ticks; now++) {
    ab.deliver(now, B);
    ba.deliver(now, A);
    A.advance(humanish(now, 0, 5));
    B.advance(humanish(now, 1, 6));
  }
  // Settle: keep ticking with no input until both have confirmed a common frame.
  for (let k = 0; k < 200; k++, now++) {
    ab.deliver(now, B);
    ba.deliver(now, A);
    A.advance(0);
    B.advance(0);
  }
  return { A, B };
}

function offlineReplay(cfg: MatchConfig, A: RollbackSession, B: RollbackSession, upTo: number) {
  const g = createGame(cfg);
  for (let f = 1; f <= upTo; f++) step(g, [A.localInputAt(f), B.localInputAt(f)]);
  return checksum(g);
}

describe('rollback netcode', () => {
  const versus: MatchConfig = { mode: Mode.Versus, stage: 0, chars: [0, 1], seed: 42 };
  const platform: MatchConfig = { mode: Mode.Platform, stage: 0, chars: [3, 4], seed: 7 };

  for (const [name, lat, jit, loss] of [
    ['LAN', 1, 0, 0],
    ['typical (5f ± 2, 3% loss)', 5, 2, 0.03],
    ['bad (8f ± 4, 10% loss)', 8, 4, 0.1],
  ] as const) {
    it(`both peers end identical and match an offline replay — ${name}`, () => {
      for (const cfg of [versus, platform]) {
        const { A, B } = play(cfg, 1500, lat, jit, loss);
        const f = Math.min(A.confirmedFrame, B.confirmedFrame, A.frame, B.frame) - 1;
        expect(f).toBeGreaterThan(1400);
        const ca = A.checksumAt(f);
        const cb = B.checksumAt(f);
        expect(ca).toBeDefined();
        expect(ca).toBe(cb);
        expect(ca).toBe(offlineReplay(cfg, A, B, f));
        expect(A.desync).toBe(-1);
        expect(B.desync).toBe(-1);
      }
    });
  }

  it('actually rolls back under latency and never exceeds the rollback window', () => {
    const { A } = play(versus, 600, 6, 3, 0.05);
    expect(A.stats.rollbacks).toBeGreaterThan(0);
    expect(A.stats.maxRollbackDepth).toBeLessThanOrEqual(A.maxRollback + 1);
  });
});
