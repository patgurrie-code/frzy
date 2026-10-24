// Deterministic integer maths for the simulation.
// All positions/velocities are integers in FX units: 1 world metre = FX.
// Angles are integer degrees. Trig values are scaled by TRIG (10000).
import { SIN_Q } from './trigTable';

export const FX = 10000;
export const TRIG = 10000;

/** Metres (literal, authored in data) -> fixed integer. Only use with constants at load time. */
export function m(v: number): number {
  return Math.round(v * FX);
}

/** Truncating integer division (deterministic, rounds toward zero). */
export function idiv(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** Fixed multiply: a * b / FX, truncated. */
export function fmul(a: number, b: number): number {
  return Math.trunc((a * b) / FX);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

export function abs(v: number): number {
  return v < 0 ? -v : v;
}

/** Normalise integer degrees to 0..359. */
export function normDeg(d: number): number {
  d %= 360;
  return d < 0 ? d + 360 : d;
}

/** sin(deg) * TRIG, deg integer. */
export function isin(deg: number): number {
  const d = normDeg(deg);
  if (d <= 90) return SIN_Q[d];
  if (d <= 180) return SIN_Q[180 - d];
  if (d <= 270) return -SIN_Q[d - 180];
  return -SIN_Q[360 - d];
}

/** cos(deg) * TRIG. */
export function icos(deg: number): number {
  return isin(deg + 90);
}

/** Integer square root (floor). Deterministic for non-negative safe integers. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  // Newton iteration on integers; start from a power-of-two upper bound.
  let x = 1;
  while (x * x <= n) x *= 2;
  let y = Math.trunc((x + Math.trunc(n / x)) / 2);
  while (y < x) {
    x = y;
    y = Math.trunc((x + Math.trunc(n / x)) / 2);
  }
  return x;
}

/** Integer atan2 in degrees (0..359), via binary search on the sine table. */
export function iatan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = abs(x);
  const ay = abs(y);
  // angle in first quadrant: find d with tan(d) ~ ay/ax, i.e. sin(d)*ax ~ cos(d)*ay
  let lo = 0;
  let hi = 90;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isin(mid) * ax < icos(mid) * ay) lo = mid + 1;
    else hi = mid;
  }
  const a = lo;
  if (x >= 0 && y >= 0) return a;
  if (x < 0 && y >= 0) return 180 - a;
  if (x < 0 && y < 0) return 180 + a;
  return normDeg(360 - a);
}

/** Lerp integers: a + (b-a)*num/den, truncated. */
export function ilerp(a: number, b: number, num: number, den: number): number {
  if (den <= 0) return b;
  return a + Math.trunc(((b - a) * num) / den);
}
