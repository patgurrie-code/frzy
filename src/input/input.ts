// Input devices -> per-frame bitmasks. Keyboard sets are remappable (persisted in localStorage).
import { IN_ATTACK, IN_DOWN, IN_GRAB, IN_GUARD, IN_JUMP, IN_LEFT, IN_RIGHT, IN_SPECIAL, IN_UP } from '../sim/input';

export const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'attack', 'special', 'guard', 'grab'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_BITS: Record<Action, number> = {
  up: IN_UP,
  down: IN_DOWN,
  left: IN_LEFT,
  right: IN_RIGHT,
  jump: IN_JUMP,
  attack: IN_ATTACK,
  special: IN_SPECIAL,
  guard: IN_GUARD,
  grab: IN_GRAB,
};

export type KeySet = Record<Action, string[]>;

export const DEFAULT_KEYS: KeySet[] = [
  {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['KeyW'],
    attack: ['KeyF'],
    special: ['KeyG'],
    guard: ['KeyH'],
    grab: ['KeyT'],
  },
  {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['ArrowUp'],
    attack: ['Comma'],
    special: ['Period'],
    guard: ['Slash'],
    grab: ['Semicolon'],
  },
];

const STORE_KEY = 'fray.keys.v1';

function clone(k: KeySet[]): KeySet[] {
  return k.map((s) => Object.fromEntries(ACTIONS.map((a) => [a, [...s[a]]])) as KeySet);
}

export function loadKeySets(): KeySet[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as KeySet[];
      if (Array.isArray(parsed) && parsed.length === 2 && ACTIONS.every((a) => Array.isArray(parsed[0][a]))) return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return clone(DEFAULT_KEYS);
}

export function saveKeySets(k: KeySet[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(k));
  } catch {
    /* ignore */
  }
}

export function resetKeySets(): KeySet[] {
  const k = clone(DEFAULT_KEYS);
  saveKeySets(k);
  return k;
}

/** Device ids: 'kb0' | 'kb1' | 'pad0'..'pad3' | 'cpu' | 'off'. */
export type DeviceId = string;

export class InputManager {
  readonly down = new Set<string>();
  keySets: KeySet[] = loadKeySets();
  /** Called for every keydown (used by the key-test and remap screens). */
  onKey: ((code: string, down: boolean) => void) | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (isGameKey(e.code, this.keySets) || e.code.startsWith('F') && /^F\d+$/.test(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.onKey?.(e.code, true);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.onKey?.(e.code, false);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  keyboardMask(set: number): number {
    const ks = this.keySets[set];
    if (!ks) return 0;
    let m = 0;
    for (const a of ACTIONS) for (const code of ks[a]) if (this.down.has(code)) m |= ACTION_BITS[a];
    return m;
  }

  gamepadMask(index: number): number {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads[index];
    if (!p || !p.connected) return 0;
    const b = (i: number) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5);
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    const dz = 0.45;
    let m = 0;
    if (ax < -dz || b(14)) m |= IN_LEFT;
    if (ax > dz || b(15)) m |= IN_RIGHT;
    if (ay < -dz || b(12)) m |= IN_UP;
    if (ay > dz || b(13)) m |= IN_DOWN;
    // Standard mapping (Xbox layout): A attack, B special, X/Y jump, LB/LT guard, RB/RT grab.
    if (b(0)) m |= IN_ATTACK;
    if (b(1)) m |= IN_SPECIAL;
    if (b(2) || b(3)) m |= IN_JUMP;
    if (b(4) || b(6)) m |= IN_GUARD;
    if (b(5) || b(7)) m |= IN_GRAB;
    // Right stick = smash attacks shortcut (direction + attack)
    const rx = p.axes[2] ?? 0;
    const ry = p.axes[3] ?? 0;
    if (Math.abs(rx) > 0.6 || Math.abs(ry) > 0.6) {
      m &= ~(IN_LEFT | IN_RIGHT | IN_UP | IN_DOWN);
      if (rx < -0.6) m |= IN_LEFT;
      else if (rx > 0.6) m |= IN_RIGHT;
      else if (ry < -0.6) m |= IN_UP;
      else m |= IN_DOWN;
      m |= IN_ATTACK;
    }
    return m;
  }

  maskFor(device: DeviceId): number {
    if (device === 'kb0') return this.keyboardMask(0);
    if (device === 'kb1') return this.keyboardMask(1);
    if (device.startsWith('pad')) return this.gamepadMask(Number(device.slice(3)));
    return 0;
  }

  connectedPads(): number[] {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: number[] = [];
    for (let i = 0; i < pads.length; i++) if (pads[i]?.connected) out.push(i);
    return out;
  }
}

function isGameKey(code: string, sets: KeySet[]): boolean {
  if (code === 'Space' || code.startsWith('Arrow') || code === 'Slash' || code === 'Quote') return true;
  return sets.some((s) => ACTIONS.some((a) => s[a].includes(code)));
}

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ControlLeft: 'LCtrl',
    ControlRight: 'RCtrl',
    AltLeft: 'LAlt',
    AltRight: 'RAlt',
    Enter: 'Enter',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}
