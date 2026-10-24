// Seeded PRNG (mulberry32). State lives in GameState.rng so it rolls back with everything else.

export function nextRng(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

/** Returns [value in 0..2^32-1, newState]. */
export function rngU32(state: number): [number, number] {
  const s = nextRng(state);
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, s];
}

/** Stateless hash of a few integers (for CPU decisions etc. outside the sim). */
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}
