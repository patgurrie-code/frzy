// Tiny synthesized WebAudio sound effects (no asset files).
import { EvType, SimEvent } from '../sim/state';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.5;

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, gain: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  hit(strength: number): void {
    this.burst(0.08 + strength * 0.05, 1800 - strength * 300, 0.5 + strength * 0.15, 0.8);
    this.tone(180 - strength * 30, 0.1 + strength * 0.06, 'square', 0.25 + strength * 0.08, 50);
    if (strength >= 3) this.burst(0.5, 400, 0.6, 0.5, 'lowpass', 0.02);
  }

  ui(kind: 'move' | 'select' | 'back' = 'move'): void {
    if (kind === 'move') this.tone(660, 0.05, 'square', 0.08);
    else if (kind === 'select') {
      this.tone(520, 0.06, 'square', 0.1);
      this.tone(880, 0.1, 'square', 0.1, undefined, 0.05);
    } else this.tone(300, 0.08, 'square', 0.1, 200);
  }

  play(events: SimEvent[]): void {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case EvType.Hit:
          this.hit(e.a);
          break;
        case EvType.Shield:
          this.tone(900, 0.08, 'triangle', 0.2, 600);
          this.burst(0.05, 3000, 0.2, 2);
          break;
        case EvType.Whiff:
          this.burst(0.09, e.b === 1 ? 700 : 2500, 0.12, 1.5, 'bandpass');
          break;
        case EvType.Jump:
          this.tone(e.a === 1 ? 380 : 260, 0.1, 'triangle', 0.12, e.a === 1 ? 700 : 520);
          break;
        case EvType.Land:
          this.burst(0.05, 300, 0.12, 1, 'lowpass');
          break;
        case EvType.KO:
          this.burst(0.9, 600, 0.8, 0.4, 'lowpass');
          this.tone(120, 0.8, 'sawtooth', 0.3, 30);
          break;
        case EvType.Grab:
          this.tone(200, 0.06, 'square', 0.15, 160);
          break;
        case EvType.Throw:
          this.burst(0.15, 900, 0.2, 1);
          break;
        case EvType.Beam:
          this.tone(e.b === 1 ? 140 : 500, e.b === 1 ? 0.7 : 0.2, 'sawtooth', 0.15, e.b === 1 ? 90 : 900);
          if (e.b === 1) this.burst(0.7, 1200, 0.25, 0.7);
          break;
        case EvType.Clash:
          this.tone(90, 1.2, 'sawtooth', 0.3, 60);
          this.burst(1.2, 900, 0.35, 0.5);
          break;
        case EvType.ClashEnd:
          this.burst(0.8, 500, 0.7, 0.5, 'lowpass');
          break;
        case EvType.SuperStart:
          this.tone(200, 0.6, 'sawtooth', 0.2, 1200);
          this.tone(1600, 0.4, 'sine', 0.15, undefined, 0.2);
          break;
        case EvType.RoundStart:
          this.tone(440, 0.15, 'square', 0.15);
          break;
        case EvType.Fight:
          this.tone(660, 0.12, 'square', 0.18);
          this.tone(990, 0.3, 'square', 0.18, undefined, 0.1);
          break;
        case EvType.RoundKO:
        case EvType.MatchEnd:
          this.tone(330, 0.5, 'sawtooth', 0.25, 110);
          this.burst(0.6, 500, 0.5, 0.5, 'lowpass');
          break;
        case EvType.TimeUp:
          this.tone(800, 0.4, 'square', 0.18, 400);
          break;
        case EvType.Ledge:
          this.tone(500, 0.04, 'square', 0.08);
          break;
        case EvType.ShieldBreak:
          this.tone(1200, 0.6, 'square', 0.2, 100);
          break;
        case EvType.Dodge:
          if (e.b === 1) this.burst(0.12, 4000, 0.1, 1, 'highpass');
          break;
        case EvType.Respawn:
          this.tone(700, 0.3, 'sine', 0.12, 1400);
          break;
      }
    }
  }
}
