// Which animation (and frame) a fighter is showing. Shared by sim (hurtboxes/hitboxes)
// and renderer (display), so what you see is what hits.
import type { Anim } from './anim';
import type { FighterDef } from './defs';
import { Act, FighterState } from './state';

export interface AnimRef {
  anim: Anim;
  frame: number;
  /** Named clip key for GLB overrides (e.g. "idle", "move:FSmash"). */
  clip: string;
}

const MOVE_CLIP_NAMES = [
  'Jab', 'FTilt', 'UTilt', 'DTilt', 'FSmash', 'USmash', 'DSmash', 'NAir', 'FAir', 'BAir', 'UAir', 'DAir',
  'NSpec', 'SSpec', 'USpec', 'DSpec', 'NSpecEx', 'SSpecEx', 'USpecEx', 'DSpecEx', 'Grab', 'Pummel',
  'FThrow', 'BThrow', 'UThrow', 'DThrow', 'Super', 'DashAttack', 'LedgeAttack', 'Jab2', 'Jab3', 'CmdThrow', 'Burst',
];

export function moveClipName(move: number): string {
  return MOVE_CLIP_NAMES[move] ?? 'Jab';
}

export function fighterAnim(f: FighterState, d: FighterDef, out: AnimRef): AnimRef {
  const a = d.anims;
  let anim = a.idle;
  let frame = f.actFrame;
  let clip = 'idle';
  switch (f.act) {
    case Act.Idle:
      break;
    case Act.Walk:
      anim = a.walk;
      clip = 'walk';
      break;
    case Act.Dash:
      anim = a.dash;
      clip = 'dash';
      break;
    case Act.Run:
      anim = a.run;
      clip = 'run';
      break;
    case Act.Crouch:
      anim = a.crouch;
      clip = 'crouch';
      break;
    case Act.JumpSquat:
      anim = a.jumpSquat;
      clip = 'jumpSquat';
      break;
    case Act.Air:
      if (f.vy > 0 && f.actFrame < 30) {
        anim = a.jump;
        clip = 'jump';
      } else {
        anim = a.fall;
        clip = 'fall';
      }
      break;
    case Act.Land:
      if (f.landLag >= 20) {
        anim = a.knockdown;
        clip = 'knockdown';
      } else {
        anim = a.land;
        clip = 'land';
      }
      break;
    case Act.Attack:
    case Act.Grabbing:
      if (f.move >= 0) {
        anim = d.moves[f.move].anim;
        clip = 'move:' + moveClipName(f.move);
        if (f.act === Act.Grabbing) frame = 10;
      }
      break;
    case Act.Shield:
    case Act.ShieldStun:
      anim = f.guardLow ? a.crouchGuard : a.shield;
      clip = f.guardLow ? 'crouchGuard' : 'shield';
      break;
    case Act.Roll:
    case Act.SpotDodge:
      anim = a.roll;
      clip = 'roll';
      break;
    case Act.AirDodge:
      anim = a.airDodge;
      clip = 'airDodge';
      break;
    case Act.Hitstun:
      if (f.launchSpeed > 1600 && f.grounded === 0) {
        anim = a.tumble;
        clip = 'tumble';
      } else {
        anim = f.hitHeight === 0 ? a.hitHigh : f.hitHeight === 2 ? a.hitLow : a.hitMid;
        clip = f.hitHeight === 0 ? 'hitHigh' : f.hitHeight === 2 ? 'hitLow' : 'hitMid';
      }
      break;
    case Act.Helpless:
      anim = a.helpless;
      clip = 'helpless';
      break;
    case Act.LedgeHang:
      anim = a.ledge;
      clip = 'ledge';
      break;
    case Act.LedgeGetup:
      anim = a.getup;
      clip = 'getup';
      break;
    case Act.Grabbed:
      anim = a.grabbed;
      clip = 'grabbed';
      break;
    case Act.Dizzy:
      anim = a.dizzy;
      clip = 'dizzy';
      break;
    case Act.Dead:
      anim = a.ko;
      clip = 'ko';
      break;
    case Act.Respawn:
      anim = a.idle;
      break;
    case Act.Beam:
      anim = a.beam;
      clip = 'beam';
      break;
    case Act.Victory:
      anim = a.victory;
      clip = 'victory';
      break;
    case Act.KiCharge:
      anim = a.charge;
      clip = 'charge';
      break;
  }
  out.anim = anim;
  out.frame = frame;
  out.clip = clip;
  return out;
}
