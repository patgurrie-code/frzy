# FRAY — project guide for Claude Code

Original browser fighting game: Smash-style Platform mode (1–4 players) + Street Fighter / Dragon Ball-style
Versus mode (1v1). Everything (names, characters, designs) must be original.

Read NOTES.md first for current status / next steps. Commit + push after every working step.

## Agent rules (shared by Claude Code and OpenAI Codex)
- CLAUDE.md (Claude Code) and AGENTS.md (OpenAI Codex) hold the SAME rules. Everything after the first line must be
  identical — `tests/agents.test.ts` fails if they drift. When you change one, change the other in the same commit.
- Both agents log their work in NOTES.md (what's done, what's next, with the agent name + date on each log entry), so any
  session can "continue from NOTES.md". Update it before stopping; work in small steps (usage limits).
- Don't stop to ask the user questions: make sensible calls and record them here under the relevant section.

## Stack & commands
- Vite + TypeScript + three.js; Vitest (unit, `tests/`), Playwright (browser smoke, `e2e/`).
- `npm run dev` · `npm test` · `npm run build` · `npm run test:e2e` (builds + previews on :4173).
- Playwright is pinned to 1.63.0 to match the pre-installed Chromium in the cloud container.
- Render static site: build `npm ci && npm run build`, publish `dist` (see `render.yaml`). `base: './'` in vite config.
- Future: Node WebSocket signalling/relay server in `/server` (Render, Singapore).

## Architecture (non-negotiable)
- `src/sim/` is a PURE deterministic module: no DOM, no three.js, no floats in state, no Math.sin/cos/random/sqrt, no Date.
  A test (`tests/sim.test.ts` "sim purity") greps for banned APIs.
- Fixed 60 Hz tick: `step(state, inputs[])` where inputs is one 9-bit mask per player (`src/sim/input.ts`).
- Units: integers, `FX = 10000` per metre. Angles are integer degrees. Trig via committed LUT `trigTable.ts`
  (regenerate with `node scripts/gen-trig.mjs`). `isqrt`, `iatan2` are integer.
- Divisions use `Math.trunc(a / b)` (deterministic: IEEE division of integers + truncation).
- PRNG: mulberry32 in `state.rng` (rolls back with state). CPU uses stateless `hash32`.
- `GameState` is plain data (numbers/arrays/objects). `saveState`/`loadState` (fast structural copy), `checksum` (FNV-1a over
  every number in key order). Tests assert all numbers are integers and JSON round-trips are lossless.
- Static data (fighters/moves/stages) lives in defs, referenced from state by index — never stored in state.
  Append new fighters to `FIGHTERS` (index is saved in state).
- `state.events` = output events of the last tick (sounds/sparks/banners). Deterministic; renderer consumes them.
  With rollback, the renderer must de-dup by frame (todo when netcode lands).
- Renderer (`src/render/`) only reads state; it keeps a copy of the previous state for interpolation. Never mutates sim state.
- CPU (`src/ai/`) is a pure function (state, port, level, memory) → input mask, same interface as humans.

## Skeleton / animation / hitboxes
- Humanoid skeleton with Mixamo bone names (`src/sim/skeleton.ts`, `mixamorig:` prefix omitted in code).
- Sim does 2D FK in the gameplay plane (side view, facing +X, rotation about Z, positive = counter-clockwise,
  i.e. arm +90 = pointing forward, spine + = lean back, leg + = kick forward, knee bends negative).
  Rest pose: standing, arms hanging down. Z depth of limbs is render-only.
- Animations are sparse keyframes (`KeySpec`) compiled to dense Int16 arrays (`anim.ts`). Sim samples with integer
  lerp; renderer samples the same data with floats.
- Hitboxes: bone + offset + radius + active frames. Hurtboxes: capsules between bones (`HURTBOXES`), scaled per fighter.
- GLB plan: `public/fighters/<id>/model.glb` (Mixamo skeleton). Renderer will retarget the sim pose onto GLB bones
  (rotate each bone so its rest direction matches the placeholder bone direction), and if the GLB has a clip named like
  the pose clip key (`idle`, `walk`, `move:FSmash`, … see `pose.ts`), the clip drives visuals instead. Hitboxes ALWAYS come
  from the code pose → zero gameplay change when models swap.

## Gameplay decisions
- Knockback: Smash formula (`knockback()` in sim.ts) ×1000 fixed; launch speed = kb·39 FX/frame; decays 66 FX/f² separately
  from self-velocity (kbx/kby); hitstun = kb·0.4. DI: ±15° by holding perpendicular.
- Versus: health 1000, damage ×7 with 10%/hit combo scaling (min 30%), percent fixed at 45% for knockback, ×0.7 knockback,
  walls at stage edges, no floating platforms, auto-face, guard blocks all directions with chip (1/8), shield never breaks.
  Draw on time-out awards nobody; match capped at 9 rounds.
- Platform: 3 stocks default, blast zones, ledge hang (30f invuln, 300f max), respawn platform (invuln).
- Controls (keyboard): one press = walk, double-tap = dash/run. Direction tapped ≤6 frames before Attack = smash, else tilt.
  Tap-jump: W/Up are bound to both Up and Jump by default (remove Jump from W in settings to disable).
  Attack in jump-squat = up smash. Specials/grab work out of jump-squat.
- Ki: 0–300 (3 bars). Gain = hitbox ki on hit (attacker), damage taken (victim). EX special = Special while holding Guard (1 bar).
  Super = Attack+Special together (≤3 frames apart) with 3 bars; with a full meter, a lone Attack/Special waits 2 frames for
  its partner. Super → 50-frame cinematic freeze (`state.freeze`), camera zoom in renderer.
- Beam clash: two opposing beams' heads cross → both casters locked, mash Attack/Special; push ±1000; winner's beam continues with
  +50% power, loser's beam vanishes.
- Shield (Guard on ground): Smash-style HP, roll (tap left/right), spot dodge (tap down), grab (Attack/Grab), jump OOS.
  Air dodge (Guard in air, directional, once per airtime).
- Grabs: Grab button; throws by direction; Attack = pummel; victim mashes to escape.
- Training: F1 hitbox/hurtbox view, F2 frame-step (pause + advance one frame per press), F3 resume, F4 reset damage
  (the only place outside `step()` that writes state — offline training only). Infinite stocks and ki. P2 = CPU "Dummy" (level 0).
- Stage collision: the main stage is a solid block; within 0.6 m of its edge the underside pushes you out sideways (so
  recoveries slide up the wall to the ledge) instead of bonking.
- CPU levels 1–9 (think rate, shield chance, smash/EX usage). Recovery aims just outside the ledge while below stage level.
- Menus: attract mode (two CPUs, `quiet: true` match) runs behind the menus. Last setup saved in localStorage.

## Fighters
- KESTREL (index 0): fast brawler, light (84), quick frames, Ki Dart / Blitz Elbow / Rising Comet / Counter Stance,
  super "Hundred Comet Barrage" (rush). EX neutral special is a short beam (so it can clash).
- TORVAL (index 1): heavy ki-blaster (112), Storm Beam / Orb Volley / Ki Rocket / Aegis Burst (armour), super "Cataclysm Cannon".

## Performance
- Pixel ratio capped at 1.5, blob shadows (no shadow maps), toon material + inverted-hull outlines, DOM HUD.
