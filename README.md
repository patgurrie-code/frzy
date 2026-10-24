# FRAY

An original browser fighting game: Smash-style **Platform** brawls for 1–4 players and a Street Fighter / Dragon Ball-style
**Versus** 1v1 mode, on one deterministic simulation (ready for rollback netcode).

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # browser smoke tests (Playwright; builds + previews on :4173)
npm run build      # production build in dist/
```

## Modes
**Story** (FRAY: Emberfall — prologue + 7 chapters with cutscenes and bosses) · **Platform** (1–4 players, stocks) ·
**Versus** (1v1, best of 3) · **Training** (hitboxes, frame step).

Fighters: KESTREL (brawler), TORVAL (ki-blaster), SERA (spear knight), VESHA (shadow ninja), BRAKKA (giant grappler).

## Controls (remappable in Settings → Controls; check ghosting in Settings → Key test)
| | Move | Jump | Attack | Smash | Special | Guard | Grab |
|---|---|---|---|---|---|---|---|
| P1 (single player) | WASD | W / Space | J | I | K | L / L-Shift | U |
| P2 (same keyboard) | Arrows | ↑ | , | ' | . | / | ; |

- Hold a direction to walk, keep holding to run (Platform); double-tap to dash.
- Attack = jab (tap ×3 for a combo) or tilts with a direction. Smash + direction = smash attack (hold to charge).
- Special + direction = 4 specials. **Smash + Special** = EX special (1 ki bar). **Guard + Special** (hold) = charge ki.
  **Attack + Special** together with 3 bars = SUPER. Mash Attack/Special in a beam clash.
- Guard on the ground = shield (tap ←/→ roll, ↓ spot-dodge, Attack = grab); in the air = air dodge.
- Gamepads (standard mapping): stick/d-pad (up = jump), A attack, Y smash, B special, X jump, LB/LT guard, RB/RT grab,
  right stick = smash in a direction.
- Esc pause (shows the controls) · Training: F1 hitboxes, F2 frame-step, F3 resume, F4 reset damage · ` FPS counter.

## Deploy
- **Cloudflare Workers/Pages:** build `npm ci && npm run build`, deploy `npx wrangler deploy` (uses `wrangler.jsonc`, serves `dist`).
- **Render static site:** `render.yaml` included (build `npm ci && npm run build`, publish `dist`).

## Custom fighter models
Drop an auto-rigged GLB (Mixamo skeleton, e.g. from Meshy/Tripo + Mixamo) at `public/fighters/<id>/model.glb`
(`kestrel`, `torval`, `sera`, `vesha`, `brakka`). It replaces the placeholder automatically; clips named `idle`, `walk`, `run`, `move:FSmash`, … override
the code poses. Hitboxes stay on the code skeleton, so gameplay doesn't change.
