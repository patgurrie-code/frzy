// Precomputed attack ranges for the CPU: for every fighter/move, the box (relative to the fighter's feet, facing +X)
// covered by its active hitboxes, plus startup and damage. Computed once with the sim's own FK, so the CPU only
// throws out moves that can actually connect at the current spacing.
import { FIGHTERS } from '../sim/fighters';
import { Mv, MoveDef } from '../sim/defs';
import { samplePose } from '../sim/anim';
import { emptyPose, makeJoints, solveFK, bonePoint } from '../sim/skeleton';

export interface MoveRange {
  move: number;
  x1: number; // FX, forward distance range
  x2: number;
  y1: number; // FX, height range
  y2: number;
  startup: number;
  dmg: number;
}

function rangeOf(mv: MoveDef, scale: number, move: number): MoveRange | null {
  const pose = emptyPose();
  const j = makeJoints();
  let x1 = Infinity;
  let x2 = -Infinity;
  let y1 = Infinity;
  let y2 = -Infinity;
  let startup = 999;
  let dmg = 0;
  for (const h of mv.hitboxes) {
    if (h.kind !== 0 && move !== Mv.Grab) continue;
    startup = Math.min(startup, h.start);
    dmg = Math.max(dmg, h.dmg);
    for (let f = h.start; f <= h.end; f++) {
      samplePose(mv.anim, f, pose);
      solveFK(pose, scale, j);
      const [px, py] = bonePoint(j, h.bone, h.ox, h.oy);
      // Root motion during the move shifts the hitbox forward (approximate with summed motion keys).
      let drift = 0;
      if (mv.motion) for (const k of mv.motion) if (k.vx !== undefined && k.f <= f) drift += k.vx * Math.max(0, Math.min(f, h.end) - k.f);
      x1 = Math.min(x1, px + drift - h.r);
      x2 = Math.max(x2, px + drift + h.r);
      y1 = Math.min(y1, py - h.r);
      y2 = Math.max(y2, py + h.r);
    }
  }
  if (startup === 999) return null;
  return { move, x1, x2, y1, y2, startup, dmg };
}

const GROUND = [Mv.Jab, Mv.FTilt, Mv.UTilt, Mv.DTilt, Mv.FSmash, Mv.USmash, Mv.DSmash, Mv.Grab];
const AIR = [Mv.NAir, Mv.FAir, Mv.BAir, Mv.UAir, Mv.DAir];

export const GROUND_RANGES: MoveRange[][] = FIGHTERS.map((d) =>
  GROUND.map((mv) => rangeOf(d.moves[mv], d.stats.scale, mv)).filter((r): r is MoveRange => !!r),
);
export const AIR_RANGES: MoveRange[][] = FIGHTERS.map((d) =>
  AIR.map((mv) => rangeOf(d.moves[mv], d.stats.scale, mv)).filter((r): r is MoveRange => !!r),
);
/** Furthest forward reach of any grounded move (FX). */
export const MAX_REACH: number[] = GROUND_RANGES.map((list) => Math.max(...list.map((r) => r.x2)));
