// Stage geometry (FX units). Platform 0 is always the solid main platform.
import { m } from './fixed';

export interface PlatformDef {
  x1: number;
  x2: number;
  y: number; // top surface
  solid: boolean; // solid = cannot pass through from below / drop through
  /** Main stage block bottom (solid only). */
  bottom: number;
}

export interface LedgeDef {
  x: number;
  y: number;
  dir: number; // -1 = left ledge (fighter hangs on the left side, facing +X), 1 = right
}

export interface StageDef {
  id: string;
  name: string;
  platforms: PlatformDef[];
  ledges: LedgeDef[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** Versus walls (x). */
  wallL: number;
  wallR: number;
  spawns: { x: number; y: number }[];
  respawnY: number;
  camBounds: { left: number; right: number; top: number; bottom: number };
  /** Render hints. */
  sky: [number, number];
  ground: number;
  accent: number;
}

const HALF = m(6.5);

export const STAGES: StageDef[] = [
  {
    id: 'skyforge',
    name: 'Skyforge Ruins',
    platforms: [
      { x1: -HALF, x2: HALF, y: 0, solid: true, bottom: m(-2.2) },
      { x1: m(-4.6), x2: m(-1.4), y: m(2.6), solid: false, bottom: 0 },
      { x1: m(1.4), x2: m(4.6), y: m(2.6), solid: false, bottom: 0 },
    ],
    ledges: [
      { x: -HALF, y: 0, dir: -1 },
      { x: HALF, y: 0, dir: 1 },
    ],
    blast: { left: m(-15), right: m(15), top: m(12), bottom: m(-8) },
    wallL: -HALF,
    wallR: HALF,
    spawns: [
      { x: m(-3), y: 0 },
      { x: m(3), y: 0 },
      { x: m(-1), y: 0 },
      { x: m(1), y: 0 },
    ],
    respawnY: m(5),
    camBounds: { left: m(-12), right: m(12), top: m(9), bottom: m(-5) },
    sky: [0x2a3a6e, 0xf2a65a],
    ground: 0x6b6f7d,
    accent: 0x58e0c0,
  },
];
