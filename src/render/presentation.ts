// Stateful presentation only. Never writes simulation snapshots.
import { samplePoseF } from '../sim/anim';
import { FighterDef } from '../sim/defs';
import { FX } from '../sim/fixed';
import { AnimRef, fighterAnim } from '../sim/pose';
import { BONE_COUNT } from '../sim/skeleton';
import { Act, FighterState, Phase } from '../sim/state';

export const damping = (rate: number, dt: number) => -Math.expm1(-rate * Math.max(0, dt));

export class PoseBlend {
  readonly rot = new Float32Array(BONE_COUNT);
  readonly root = new Float32Array(2);
  private fromRot = new Float32Array(BONE_COUNT);
  private fromRoot = new Float32Array(2);
  private previousRot = new Float32Array(BONE_COUNT);
  private previousRoot = new Float32Array(2);
  private ref: AnimRef;
  private prevRef: AnimRef;
  private clip = '';
  private age = 0;
  private duration = 0;
  private lastFrame = -1;

  constructor(def: FighterDef) {
    this.ref = { anim: def.anims.idle, frame: 0, clip: '' };
    this.prevRef = { ...this.ref };
  }

  sample(p: FighterState, f: FighterState, def: FighterDef, alpha: number, dt: number,
    phase: number, timer: number, prevTimer: number, reset = false): AnimRef {
    fighterAnim(f, def, this.ref);
    fighterAnim(p, def, this.prevRef);
    if (phase === Phase.Intro && f.act === Act.Idle && def.anims.intro) {
      this.ref.anim = this.prevRef.anim = def.anims.intro;
      this.ref.clip = this.prevRef.clip = 'intro';
      this.ref.frame = timer;
      this.prevRef.frame = prevTimer;
    }
    const same = this.ref.clip === this.prevRef.clip && this.ref.anim === this.prevRef.anim;
    // Actual sampled clocks, rather than actFrame - 1: charge, grabs, freezes and hitlag can hold a pose.
    // Gait clocks run backwards on back-walks; looping clips may interpolate in either direction.
    const frame = same && (this.ref.frame >= this.prevRef.frame || this.ref.anim.loop)
      ? this.prevRef.frame + (this.ref.frame - this.prevRef.frame) * alpha : this.ref.frame;
    samplePoseF(this.ref.anim, Math.max(0, frame), this.rot, this.root);
    const changed = this.clip !== this.ref.clip || f.actFrame < this.lastFrame;
    if (reset || !this.clip) {
      this.duration = 0;
    } else if (changed) {
      this.fromRot.set(this.previousRot);
      this.fromRoot.set(this.previousRoot);
      this.age = 0;
      this.duration = f.act === Act.Attack ? 3 / 60 : f.act === Act.Hitstun ? 2 / 60 : 6 / 60;
      // Never hide a fast move's first active frame behind a locomotion transition.
      if (f.act === Act.Attack && f.move >= 0) {
        const move = def.moves[f.move];
        let first = move.projectile?.f ?? move.length;
        for (const h of move.hitboxes) first = Math.min(first, h.start);
        this.duration = Math.min(this.duration, Math.max(0, first - f.actFrame) / 60);
      }
    }
    if (this.duration > 0) {
      this.age = Math.min(this.duration, this.age + Math.max(0, dt));
      const t = this.age / this.duration;
      const w = t * t * (3 - 2 * t);
      for (let b = 0; b < BONE_COUNT; b++) {
        // Wrap only across clips: within a clip authored full turns must remain full turns.
        const delta = ((this.rot[b] - this.fromRot[b] + 180) % 360 + 360) % 360 - 180;
        this.rot[b] = this.fromRot[b] + delta * w;
      }
      for (let b = 0; b < 2; b++) this.root[b] = this.fromRoot[b] + (this.root[b] - this.fromRoot[b]) * w;
      if (this.age === this.duration) this.duration = 0;
    }
    this.previousRot.set(this.rot);
    this.previousRoot.set(this.root);
    this.clip = this.ref.clip;
    this.lastFrame = f.actFrame;
    this.ref.frame = frame;
    return this.ref;
  }
}

export class VisualPosition {
  x = 0;
  y = 0;
  private frame = -1;
  private endX = 0;
  private endY = 0;
  private offsetX = 0;
  private offsetY = 0;

  sample(p: FighterState, f: FighterState, frame: number, alpha: number, dt: number, reset: boolean): void {
    if (reset) this.offsetX = this.offsetY = 0;
    else if (this.frame >= 0 && (frame < this.frame ||
      (frame === this.frame && (f.x !== this.endX || f.y !== this.endY)) ||
      (frame === this.frame + 1 && (p.x !== this.endX || p.y !== this.endY)))) {
      const dx = (this.endX - (frame === this.frame + 1 ? p.x : f.x)) / FX;
      const dy = (this.endY - (frame === this.frame + 1 ? p.y : f.y)) / FX;
      // Small corrections ease away; real teleports/respawns must never sweep across the arena.
      if (Math.hypot(dx, dy) <= 0.5) { this.offsetX += dx; this.offsetY += dy; }
      else this.offsetX = this.offsetY = 0;
    }
    const decay = 1 - damping(24, dt);
    this.offsetX *= decay;
    this.offsetY *= decay;
    this.x = (p.x + (f.x - p.x) * alpha) / FX + this.offsetX;
    this.y = (p.y + (f.y - p.y) * alpha) / FX + this.offsetY;
    this.frame = frame;
    this.endX = f.x;
    this.endY = f.y;
  }
}
