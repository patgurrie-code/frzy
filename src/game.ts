// Match controller: fixed 60 Hz sim stepping, input collection, rendering, HUD, audio, training tools.
import { createGame, step, MatchConfig, FighterMods } from './sim/sim';
import type { FighterLook } from './sim/defs';
import { GameState, Mode, Phase, saveState, checksum } from './sim/state';
import { GameRenderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Sfx } from './audio/sfx';
import { InputManager, DeviceId } from './input/input';
import { cpuInput, newCpuMemory, CpuMemory } from './ai/cpu';

export const TICK = 1000 / 60;

export interface PlayerSetup {
  device: DeviceId; // 'kb0' | 'kb1' | 'padN' | 'cpu'
  cpuLevel: number;
  char: number;
  label: string;
  /** Display-name override (story bosses, e.g. "HOLLOW REN"). Render/HUD only. */
  name?: string;
  /** Colour/style override on the placeholder model. Render only. */
  look?: Partial<FighterLook>;
  /** Gameplay modifiers (go into the sim, deterministic). */
  mods?: FighterMods;
}

export interface MatchSetup {
  mode: Mode;
  training: boolean;
  stocks: number;
  players: PlayerSetup[];
  /** Attract mode: no HUD, no sound. */
  quiet?: boolean;
  /** Versus: rounds to win (default 2) and seconds per round (default 99, 0 = untimed). */
  roundsToWin?: number;
  timeLimit?: number;
  /** Story: freeze CPU inputs (backdrop scenes) */
  idle?: boolean;
}

export class Match {
  state: GameState;
  private prev: GameState;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private cpuMem: CpuMemory[];
  paused = false;
  stepping = false;
  private stepRequests = 0;
  private endTimer = 0;
  onEnd: ((s: GameState) => void) | null = null;
  onPause: (() => void) | null = null;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    readonly setup: MatchSetup,
    private renderer: GameRenderer,
    private hud: Hud,
    private sfx: Sfx,
    private input: InputManager,
  ) {
    const cfg: MatchConfig = {
      mode: setup.mode,
      stage: 0,
      chars: setup.players.map((p) => p.char),
      stocks: setup.stocks,
      seed: (Date.now() & 0x7fffffff) >>> 0,
      training: setup.training,
      roundsToWin: setup.roundsToWin,
      timeLimit: setup.timeLimit,
      mods: setup.players.map((p) => p.mods),
    };
    this.state = createGame(cfg);
    this.prev = saveState(this.state);
    this.cpuMem = setup.players.map(() => newCpuMemory());
    renderer.setup(this.state, setup.players.map((p) => p.look));
    if (!setup.quiet) hud.setup(this.state, setup.players.map((p) => p.label), setup.players.map((p) => p.name), setup.players.map((p) => p.look));
    window.addEventListener('keydown', this.onKey);
    if (!setup.quiet) (window as unknown as { __fray: unknown }).__fray = this;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.setup.quiet) return;
    if (e.code === 'Escape') {
      if (this.state.phase !== Phase.MatchEnd) this.togglePause();
      return;
    }
    if (!this.setup.training) return;
    if (e.code === 'F1') {
      e.preventDefault();
      this.renderer.showBoxes = !this.renderer.showBoxes;
    } else if (e.code === 'F2') {
      e.preventDefault();
      this.stepping = true;
      this.stepRequests++;
    } else if (e.code === 'F3') {
      e.preventDefault();
      this.stepping = false;
    } else if (e.code === 'F4') {
      e.preventDefault();
      // Reset damage: done between frames by the training tool (outside the sim's tick; allowed only offline).
      for (const f of this.state.fighters) f.damage = 0;
    }
  };

  togglePause(): void {
    this.paused = !this.paused;
    this.onPause?.();
  }

  start(): void {
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    if (!this.setup.quiet) this.hud.clear();
  }

  private gatherInputs(): number[] {
    if (this.setup.idle) return this.setup.players.map(() => 0);
    return this.setup.players.map((p, i) =>
      p.device === 'cpu' ? cpuInput(this.state, i, p.cpuLevel, this.cpuMem[i]) : this.input.maskFor(p.device),
    );
  }

  private tick(): void {
    this.prev = saveState(this.state);
    step(this.state, this.gatherInputs());
    this.input.endFrame();
    const ev = this.state.events;
    if (ev.length) {
      this.renderer.onEvents(ev);
      if (!this.setup.quiet) {
        this.hud.onEvents(this.state, ev);
        this.sfx.play(ev);
      }
    }
  }

  private frame(t: number): void {
    let dt = t - this.last;
    this.last = t;
    if (dt > 250) dt = 250;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsAcc);
      this.fpsAcc = this.fpsFrames = 0;
    }
    let alpha = 1;
    if (!this.paused) {
      if (this.stepping) {
        while (this.stepRequests > 0) {
          this.tick();
          this.stepRequests--;
        }
        this.acc = 0;
      } else {
        this.acc += dt;
        let n = 0;
        while (this.acc >= TICK && n < 5) {
          this.tick();
          this.acc -= TICK;
          n++;
        }
        if (n === 5) this.acc = 0;
        alpha = this.acc / TICK;
      }
    }
    this.renderer.render(this.prev, this.state, alpha, this.paused ? 0 : dt / 1000);
    if (this.setup.quiet) return;
    this.hud.update(this.state, dt / TICK);
    this.hud.setTraining(this.setup.training, this.state, { stepping: this.stepping, boxes: this.renderer.showBoxes });

    if (this.state.phase === Phase.MatchEnd && !this.setup.training) {
      this.endTimer += dt;
      if (this.endTimer > 3500 && this.onEnd) {
        const cb = this.onEnd;
        this.onEnd = null;
        cb(this.state);
      }
    }
  }

  checksum(): number {
    return checksum(this.state);
  }
}
