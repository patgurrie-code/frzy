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

## Controls (remappable in Settings → Controls; check ghosting in Settings → Key test)
| | Move | Jump | Attack | Special | Guard | Grab |
|---|---|---|---|---|---|---|
| P1 | WASD | W | F | G | H | T |
| P2 | Arrows | ↑ | , | . | / | ; |

- Double-tap a direction to dash/run. Direction + Attack together = smash attack; hold the direction first = tilt.
- Guard on the ground = shield (tap ←/→ roll, ↓ spot-dodge, Attack = grab); in the air = air dodge.
- Special + Guard = EX special (1 ki bar). Attack + Special together with 3 bars = super. Mash Attack/Special in a beam clash.
- Gamepads (standard mapping): stick/d-pad, A attack, B special, X/Y jump, LB/LT guard, RB/RT grab, right stick = smash.
- Esc pause · Training: F1 hitboxes, F2 frame-step, F3 resume, F4 reset damage · ` (backquote) FPS counter.

## Deploy (Render static site)
`render.yaml` is included — in Render choose **New → Blueprint** and point it at this repo, or create a **Static Site** with
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

## Custom fighter models
Drop an auto-rigged GLB (Mixamo skeleton, e.g. from Meshy/Tripo + Mixamo) at `public/fighters/<id>/model.glb`
(`kestrel`, `torval`). It replaces the placeholder automatically; clips named `idle`, `walk`, `run`, `move:FSmash`, … override
the code poses. Hitboxes stay on the code skeleton, so gameplay doesn't change.
