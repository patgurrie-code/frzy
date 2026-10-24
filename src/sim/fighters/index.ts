import type { FighterDef } from '../defs';
import { KESTREL } from './brawler';
import { TORVAL } from './blaster';

/** Roster, indexed by FighterState.char. Append new fighters at the end (indices are saved in state). */
export const FIGHTERS: readonly FighterDef[] = [KESTREL, TORVAL];
