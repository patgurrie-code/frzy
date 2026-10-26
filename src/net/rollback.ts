// Rollback netcode session (GGPO-style) for 2 players. Transport-agnostic: give it a `send` function and feed it
// received messages with `receive`. Uses only the deterministic sim (createGame/step/saveState/loadState/checksum).
//
// Frame numbering: step() increments state.frame and then consumes the inputs for that frame.
// snapshots[F] = state after frame F was simulated (state.frame === F).
import { createGame, step, MatchConfig } from '../sim/sim';
import { GameState, SimEvent, saveState, loadState, checksum } from '../sim/state';

export type NetMsg =
  | { t: 'in'; from: number; inputs: number[]; ack: number; cur: number }
  | { t: 'sum'; f: number; sum: number }
  | { t: 'ping'; id: number }
  | { t: 'pong'; id: number };

export interface RollbackOpts {
  delay?: number; // input delay in frames
  maxRollback?: number; // max frames we may run ahead of confirmed remote input
  checksumEvery?: number;
}

export interface AdvanceResult {
  advanced: boolean;
  events: SimEvent[];
  rolledBack: number; // frames re-simulated this call
}

const HISTORY = 64;

export class RollbackSession {
  state: GameState;
  readonly delay: number;
  readonly maxRollback: number;
  private checksumEvery: number;
  private local = new Map<number, number>();
  private remote = new Map<number, number>();
  private predicted = new Map<number, number>(); // remote input used when frame was simulated
  private snapshots = new Map<number, GameState>();
  private lastRemote = 0; // highest contiguous confirmed remote frame
  private peerAck = 0; // highest local frame the peer has confirmed
  private peerCur = 0; // peer's current frame (from its last packet)
  private rollbackFrom = Infinity;
  private nextSum: number;
  private mySums = new Map<number, number>();
  private peerSums = new Map<number, number>();
  desync = -1; // frame of the first detected desync
  private lastScheduled: number; // last frame whose local input has been decided
  /** Full log of local inputs by frame (never pruned; replays / debugging). */
  readonly inputLog: number[] = [];
  stats = { rollbacks: 0, maxRollbackDepth: 0, stalls: 0 };

  constructor(
    cfg: MatchConfig,
    readonly localPort: number,
    private send: (m: NetMsg) => void,
    o: RollbackOpts = {},
  ) {
    this.state = createGame(cfg);
    this.delay = o.delay ?? 2;
    this.maxRollback = o.maxRollback ?? 8;
    this.checksumEvery = o.checksumEvery ?? 60;
    this.nextSum = this.checksumEvery;
    this.snapshots.set(0, saveState(this.state));
    // The first `delay` frames have no real input from anyone.
    for (let f = 1; f <= this.delay; f++) {
      this.local.set(f, 0);
      this.remote.set(f, 0);
    }
    this.lastRemote = this.delay;
    this.lastScheduled = this.delay;
  }

  /** Corrected preceding snapshot for render interpolation after re-simulation. Read only. */
  get previousState(): GameState {
    return this.snapshots.get(this.state.frame - 1) ?? this.state;
  }

  get remotePort(): number {
    return 1 - this.localPort;
  }

  get frame(): number {
    return this.state.frame;
  }

  /** How many frames we are ahead of the peer (positive = we should slow down a little). */
  get frameAdvantage(): number {
    return this.state.frame - this.peerCur;
  }

  get confirmedFrame(): number {
    return this.lastRemote;
  }

  private remoteFor(f: number): number {
    const r = this.remote.get(f);
    if (r !== undefined) return r;
    return this.remote.get(this.lastRemote) ?? 0; // predict: repeat the last confirmed input
  }

  private inputsFor(f: number, record: boolean): number[] {
    const l = this.local.get(f) ?? 0;
    const r = this.remoteFor(f);
    if (record && !this.remote.has(f)) this.predicted.set(f, r);
    else if (record) this.predicted.delete(f);
    const ins = [0, 0];
    ins[this.localPort] = l;
    ins[this.remotePort] = r;
    return ins;
  }

  /** Can we simulate another frame without exceeding the rollback window? */
  canAdvance(): boolean {
    return this.state.frame + 1 - this.lastRemote <= this.maxRollback;
  }

  /**
   * Call once per 60 Hz tick with the local player's current input mask.
   * Returns events of newly simulated frames only (re-simulated frames are silent).
   */
  advance(localInput: number): AdvanceResult {
    const res: AdvanceResult = { advanced: false, events: [], rolledBack: 0 };
    // 1. Roll back if a confirmed remote input contradicted a prediction.
    if (this.rollbackFrom <= this.state.frame) {
      const from = this.rollbackFrom;
      const base = this.snapshots.get(from - 1);
      if (base) {
        const target = this.state.frame;
        this.state = loadState(base);
        for (let f = from; f <= target; f++) {
          step(this.state, this.inputsFor(f, true));
          this.snapshots.set(f, saveState(this.state));
        }
        res.rolledBack = target - from + 1;
        this.stats.rollbacks++;
        this.stats.maxRollbackDepth = Math.max(this.stats.maxRollbackDepth, res.rolledBack);
      }
    }
    this.rollbackFrom = Infinity;

    // 2. Stall if we're too far ahead of what the peer has told us.
    if (!this.canAdvance()) {
      this.stats.stalls++;
      this.sendInputs();
      return res;
    }

    // 3. Schedule this tick's local input `delay` frames in the future and send it.
    const F = this.state.frame + 1;
    this.local.set(F + this.delay, localInput | 0);
    this.inputLog[F + this.delay] = localInput | 0;
    this.lastScheduled = F + this.delay;
    this.sendInputs();

    // 4. Simulate the next frame (predicting the remote input if needed).
    step(this.state, this.inputsFor(F, true));
    this.snapshots.set(F, saveState(this.state));
    res.advanced = true;
    res.events = this.state.events.map((e) => ({ ...e }));

    // 5. Desync detection on confirmed frames + history pruning.
    this.checkSums();
    for (const k of this.snapshots.keys()) if (k < F - HISTORY) this.snapshots.delete(k);
    for (const k of this.local.keys()) if (k < this.peerAck - HISTORY) this.local.delete(k);
    for (const k of this.remote.keys()) if (k < this.lastRemote - HISTORY) this.remote.delete(k);
    for (const k of this.predicted.keys()) if (k < F - HISTORY) this.predicted.delete(k);
    return res;
  }

  private sendInputs(): void {
    // Redundantly send every unacknowledged local input (capped) so packet loss doesn't matter.
    // Only ever send inputs that have actually been decided (never guess our own future input).
    const last = this.lastScheduled;
    const from = Math.max(this.peerAck + 1, last - 30, 1);
    const inputs: number[] = [];
    for (let f = from; f <= last; f++) inputs.push(this.local.get(f) ?? 0);
    this.send({ t: 'in', from, inputs, ack: this.lastRemote, cur: this.state.frame });
  }

  private checkSums(): void {
    while (this.nextSum <= this.lastRemote && this.nextSum <= this.state.frame && this.rollbackFrom > this.nextSum) {
      const snap = this.snapshots.get(this.nextSum);
      if (snap) {
        const sum = checksum(snap);
        this.mySums.set(this.nextSum, sum);
        this.send({ t: 'sum', f: this.nextSum, sum });
        this.compareSum(this.nextSum);
      }
      this.nextSum += this.checksumEvery;
    }
  }

  private compareSum(f: number): void {
    const a = this.mySums.get(f);
    const b = this.peerSums.get(f);
    if (a !== undefined && b !== undefined && a !== b && this.desync < 0) this.desync = f;
  }

  /** Checksum of the state after frame f (if still in history). */
  checksumAt(f: number): number | undefined {
    const s = this.snapshots.get(f);
    return s ? checksum(s) : undefined;
  }

  /** Local input scheduled for frame f (tests / replays). */
  localInputAt(f: number): number {
    return this.inputLog[f] ?? 0;
  }

  receive(m: NetMsg): void {
    switch (m.t) {
      case 'in': {
        this.peerAck = Math.max(this.peerAck, m.ack);
        this.peerCur = Math.max(this.peerCur, m.cur);
        for (let i = 0; i < m.inputs.length; i++) {
          const f = m.from + i;
          if (this.remote.has(f) || f <= 0) continue;
          const v = m.inputs[i] | 0;
          this.remote.set(f, v);
          const used = this.predicted.get(f);
          if (f <= this.state.frame && used !== undefined && used !== v) this.rollbackFrom = Math.min(this.rollbackFrom, f);
        }
        while (this.remote.has(this.lastRemote + 1)) this.lastRemote++;
        break;
      }
      case 'sum':
        this.peerSums.set(m.f, m.sum);
        this.compareSum(m.f);
        break;
      case 'ping':
        this.send({ t: 'pong', id: m.id });
        break;
      case 'pong':
        break;
    }
  }
}
