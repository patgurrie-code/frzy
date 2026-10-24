// One bitmask per player per frame is the ONLY input to the simulation.

export const IN_LEFT = 1 << 0;
export const IN_RIGHT = 1 << 1;
export const IN_UP = 1 << 2;
export const IN_DOWN = 1 << 3;
export const IN_ATTACK = 1 << 4;
export const IN_SPECIAL = 1 << 5;
export const IN_JUMP = 1 << 6;
export const IN_GUARD = 1 << 7;
export const IN_GRAB = 1 << 8;

export const IN_ALL = (1 << 9) - 1;

export const INPUT_NAMES: Record<number, string> = {
  [IN_LEFT]: 'Left',
  [IN_RIGHT]: 'Right',
  [IN_UP]: 'Up',
  [IN_DOWN]: 'Down',
  [IN_ATTACK]: 'Attack',
  [IN_SPECIAL]: 'Special',
  [IN_JUMP]: 'Jump',
  [IN_GUARD]: 'Guard',
  [IN_GRAB]: 'Grab',
};

/** Length of the per-fighter input history ring kept in state (for taps, buffers, mashing). */
export const INPUT_HISTORY = 16;
