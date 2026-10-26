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
- `npm run dev` · `npm test` · `npm run build` · `npm run test:e2e` (builds + previews on :4173 and starts the relay).
- `npm run server` = online relay on :8787 (Node, `server/index.mjs`); Vite dev/preview proxy `/ws` to it.
- Playwright is pinned to 1.63.0 to match the pre-installed Chromium in the cloud container.
- Render static site: build `npm ci && npm run build`, publish `dist` (see `render.yaml`). `base: './'` in vite config.
- Cloudflare deploy (`wrangler.jsonc`): Worker `server/worker.ts` serves `dist` (ASSETS binding) AND the online relay at `/ws`
  via one Durable Object per room (`Room`, SQLite-backed class → works on the free plan). Build `npm ci && npm run build`,
  deploy `npx wrangler deploy`. Render static hosting has no WebSockets: there, run the Node relay elsewhere and build with
  `VITE_SIGNAL_URL=wss://your-relay` (client then connects to `${VITE_SIGNAL_URL}/ws?room=CODE`).

## Architecture (non-negotiable)
- `src/sim/` is a PURE deterministic module: no DOM, no three.js, no floats in state, no Math.sin/cos/random/sqrt, no Date.
  A test (`tests/sim.test.ts` "sim purity") greps for banned APIs.
- Fixed 60 Hz tick: `step(state, inputs[])` where inputs is one 10-bit mask per player (`src/sim/input.ts`:
  Left Right Up Down Attack Special Jump Guard Grab Smash).
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
- Controls are designed for ONE player on a laptop keyboard (default Keyboard 1, key store `fray.keys.v2`):
  WASD move, **W = jump (tap-jump, user decision: jump stays on Up)**, Space also jumps, J attack, I smash, K special,
  L / Left-Shift guard, U grab. Keyboard 2 (second local player): arrows (↑ jumps) , attack ' smash . special / guard ; grab.
- Sim input rules: Attack (+dir) = jab / tilts; **Smash button (+dir) = smash attacks** (Smash alone = forward smash; no more
  "tap direction" smash detection). Attack again during a jab = jab chain (Jab → Jab2 → Jab3 via `MoveDef.chain`).
  Holding a direction walks, then auto-runs after 9 frames (Platform only; Versus walks + double-tap dash/back-dash).
  Because Up also jumps: Attack / Smash pressed during jump-squat cancels the jump into up tilt / up smash (Smash-style).
  Specials/grab also work out of jump-squat. Full hop = Jump still held at the end of jump-squat.
- Ki: 0–300 (3 bars). Gain = hitbox ki on hit (attacker), damage taken (victim), Guard+Special held = **ki charge**
  (`Act.KiCharge`, +1/frame, vulnerable). **EX special = Special while Smash is held** (1 bar). Super = Attack+Special together
  (≤3 frames apart) with 3 bars; with a full meter a lone Attack/Special waits 2 frames for its partner.
  Super → 50-frame cinematic freeze (`state.freeze`), camera zoom in renderer.
- Move data features: `chain` (jab chains), `counter {from,to,jump}` (absorb a hit, jump to the counter strike),
  `grabThrow` (command grab: a grab box in a special goes straight into that throw, usually `Mv.CmdThrow`),
  `vanish` (render-only invisibility for teleports — always pair with `invuln`), `armor`, `invuln`, `charge`, `helpless`.
- Handicaps / boss modifiers live in FighterState (percent): `dmgMul`, `defMul`, `maxHealth`, `kiRegen` (per second), `kbMul`.
  Set via `MatchConfig.mods`. Versus `roundsToWin` (default 2) and `timeLimit` seconds (0 = untimed) are in MatchConfig/state.
- Defence/combo systems: **parry** = shield raised ≤5 frames before a hit (no damage, attacker +22 hitlag, victim +25 ki);
  **tech** = Guard tapped ≤12 frames before landing in hitstun (instant recovery, 18f invuln, roll with a direction);
  **cancels** = a normal that has hit can cancel into a special/EX/super, a special that has hit into the super (`tryCancel`);
  **counter hit** (hit during opponent's startup: +20% dmg, +8 hitstun) and **punish** (during recovery: +4 hitstun);
  knockdowns on hard landings in both modes (Versus: invulnerable while down). Events: Parry, Tech, CounterHit, Punish,
  FirstHit, Cancel → HUD callouts + SFX.
- Versus depth: **high/low** — Guard+Down = crouch guard (`guardLow`); `HitboxDef.level` 'low' must be crouch-blocked,
  'overhead' stand-blocked (defaults: aerials vs grounded = overhead, DTilt/DSmash = low; marked: Kestrel/Vesha dash attacks
  low, Torval DTilt low, Brakka Jab3 + Sera DSpec overhead). Projectiles/parries ignore levels. In Versus, Down in shield =
  crouch guard (no spot dodge). **Throw escape**: Grab/Attack within 8 frames of a normal grab (`throwTech`); command grabs
  can't be escaped. **Wall bounce**: once per combo when hitstun knockback ≥0.12 m/f hits a wall (`wallBounced`).
  **Launcher**: Versus UTilt on a grounded victim → straight-up launch, 44f hitstun (every UTilt has a forward chest-height
  launcher hitbox so it reaches at Versus spacing). **Air combos**: aerial on airborne victim → carried (45% kb, 18–30f
  hitstun) with juggle decay after 6 hits. **Burst** (`Mv.Burst`, `burstMove()` in common.ts): Guard+Special in hitstun,
  1 bar, once per round in Versus, invulnerable shockwave. Events: WrongGuard, ThrowTech, WallBounce, Burst, Launch.
- Balance knob: `FighterStats.power` (% damage dealt). Current: Torval 96, Sera 112, Vesha 118 (weight 78), Brakka 86.
- Beam clash: two opposing beams' heads cross → both casters locked, mash Attack/Special; push ±1000; winner's beam continues with
  +50% power, loser's beam vanishes.
- Shield (Guard on ground): Smash-style HP, roll (tap left/right), spot dodge (tap down), grab (Attack/Grab), jump OOS.
  Air dodge (Guard in air, directional, once per airtime).
- Grabs: Grab button; throws by direction; Attack = pummel; victim mashes to escape.
- Shield options: Attack/Grab = grab, Jump = jump, Special = ki charge (specials out of shield were removed for that).
- Training: F1 hitbox/hurtbox view, F2 frame-step (pause + advance one frame per press), F3 resume, F4 reset damage
  (the only place outside `step()` that writes state — offline training only). Infinite stocks and ki. P2 = CPU "Dummy" (level 0).
- Stage collision: the main stage is a solid block; within 0.6 m of its edge the underside pushes you out sideways (so
  recoveries slide up the wall to the ledge) instead of bonking.
- CPU levels 1–9 (think rate, shield chance, smash/EX usage). Recovery aims just outside the ledge while below stage level.
- Menus: attract mode (two CPUs, `quiet: true` match) runs behind the menus. Last setup saved in localStorage.

## Fighters (src/sim/fighters/, roster order = FIGHTERS index; append only)
Every fighter has the full list: Jab→Jab2→Jab3, 3 tilts, 3 smashes, 5 aerials, 4 specials + 4 EX, grab, pummel, 4 throws,
CmdThrow, super, dash attack, ledge attack (`Mv` enum in defs.ts; appended moves keep old indices valid).
- 0 KESTREL `brawler.ts`: fast brawler (84). Ki Dart / Blitz Elbow / Rising Comet / Counter Stance (real counter).
  Super "Hundred Comet Barrage". EX neutral special is a short beam (so it can clash).
- 1 TORVAL `blaster.ts`: heavy ki-blaster (112). Storm Beam / Orb Volley / Ki Rocket / Aegis Burst (armour). Super "Cataclysm Cannon".
- 2 SERA `lancer.ts`: spear knight (98), longest reach (spear tip = RightHand offset (0,-1.45)). Javelin / Lancer Charge /
  Vaulting Spiral / Pinning Strike (spike). Super "Thousand Lances". Placeholder: spear + cape + long hair.
- 3 VESHA `shade.ts`: shadow ninja (72), fastest, 3 jumps total, reverse-grip twin blades. Shadow Kunai / Phase Step (teleport,
  `vanish`) / Shade Ascent (teleport up) / Mirror Veil (counter). Super "Eclipse: Thousand Cuts".
- 4 BRAKKA `titan.ts`: giant grappler (135), armour on many moves. Boulder Toss / Avalanche Grab (command grab → Mountain
  Driver) / Rising Bull (armoured) / Seismic Stomp. Super "Titanfall".
- CPU attack choice uses `src/ai/moveInfo.ts`: every move's real hitbox range (FK at active frames) + startup + damage,
  precomputed per fighter; the CPU only picks moves that reach the opponent (weighted by damage/speed). New fighters work
  automatically.
- Short-hop aerial macro: Jump + Attack on the same frame (without Up) = short hop + aerial (`shAerial`). Ledge trump:
  grabbing an occupied ledge pops the hanger off without invulnerability. Platform HUD has a combo counter.
- Easing (`anim.ts`): each key's `ease` shapes the segment that starts at it (Linear / Snap = ease-out cubic / Smooth =
  smoothstep), integer maths in the sim. `MoveBuilder.move` auto-assigns: the segment arriving at the first active frame =
  Snap, wind-ups and recoveries = Smooth (override per key with `ease`). Loops default to Smooth.
- Hit reactions: `hitHigh/hitMid/hitLow` chosen from where the hit landed (`FighterState.hitHeight`); tumble when launched.
- `intro` anim per fighter (render-only, played during the Intro phase).
- Animation personality: `stateAnims(mb, heavy, style)` (idlePeriod, bob, ninjaRun); each fighter overrides `victory`.
  `knockdown` anim is used for Land with landLag ≥ 20.

## Character art (src/render/)
- `kit.ts`: modelling toolkit. Parts (limb/box/sphere/cone/cyl/lathe) are authored in bone-local space, then merged per
  (bone, material) + one inflated-hull outline per bone → ~2 draw calls per bone. `Dangle` = render-only secondary-motion
  chain (scarves, capes, hair, coat panels): follows gravity, motion drag and a character-space bias, keeps parent twist.
- `designs.ts`: one hand-authored design per fighter id (`kestrel`, `torval`, `sera`, `vesha`, `brakka`; `generic` fallback)
  on a shared sculpted `body()` (lathe torso, tapered muscled limbs, face with eyes/brows/nose/mouth, fists, shoes).
  Colours ALWAYS come from `FighterLook` so story bosses can recolour any design. New fighter → add a design function.
- `toon.ts`: toon materials; characters use a fresnel rim light (`toonMat(color, emissive, rim)`); stage uses rim 0.
- `fighterModel.ts`: builds bones + design, clones materials per model (`setFlash` = white hit flash / super glow),
  flame-shader ki aura (`auraU` uniforms). Renderer turns models 0.42 rad toward the camera (3/4 view, render only).
- Expressions: `body()` builds face groups (normal / hurt / shout / blink); renderer picks one per state with random blinks.
- Torso twist (render-only, `applyPose`): Spine2/Hips/Head rotate about Y from arm/leg extension so strikes read in 3D.
- Renderer FX: directional hit sparks + streak particles along the launch angle, dust puffs (land/jump/dodge/tech), camera
  punch-in on hits, swoosh ribbons following the first active hitbox, hit flash. FPS overlay (` key) shows draw calls.
- GLB models still replace the procedural design via `glbLoader.ts` (it hides non-bone children of the bones).

## Online (src/net/, src/ui/online.ts, server/)
- 1v1 only for now (2 laptops, keyboard 1 each). Rollback session `RollbackSession` (`src/net/rollback.ts`): input delay 2,
  max rollback 8 (stalls beyond), predicts the remote input by repeating the last confirmed one, re-simulates silently on a
  misprediction (events only from first-time frames = event de-dup), redundant input packets (all unacked, ≤30) so loss is
  harmless, checksum of confirmed frames every 60 → `desync` frame. Never sends inputs that aren't decided yet (a bug that
  caused desyncs under stalls — see tests). Time sync: Match skips every 3rd tick while `frameAdvantage > delay+1`.
- `NetLink` (`src/net/link.ts`): WebSocket to `/ws?room=CODE` for signalling + reliable lobby messages; WebRTC data channel
  (unordered, no retransmit; STUN only) for inputs, falling back to relaying fast messages over the WebSocket. Ping via
  `_png/_pog`. Relay protocol in `server/rooms.mjs` (joined/peer/left/full; everything else relayed to the other slot).
- Lobby (`OnlineLobby`): create room (5-char code, invite link `?room=CODE` auto-joins), fighter pick, host picks rules
  (Versus best of 3 / Platform 3 stocks) and sends {t:'start', seed, mode, chars, stocks}; rematch when both ask;
  disconnect → back to the lobby. Protocol version `PROTOCOL` in online.ts — bump on any sim/data change that affects
  determinism so mismatched builds refuse to play. Online can't pause (Esc menu, game keeps running).
- Tests: `tests/rollback.test.ts` (two sessions over a simulated lossy/jittery link must match each other AND an offline
  replay), `e2e/online.spec.ts` (two browser contexts through the real relay; compares checksums).
- Mirror matches: later duplicates of a fighter get an auto alternate palette (channel rotation) in every mode.

## Story mode ("FRAY: EMBERFALL")
- Content is DATA in `src/story/story.ts`: `SPEAKERS` (cast; bosses = existing fighter + `look` override + `mods`),
  `CHAPTERS` → scenes: `title`, `narration`, `dialogue` (`stage` = two speakers idling on stage behind the text), `fight`
  (player/opponent speaker keys, CPU level, Mode, objective text, roundsToWin, timeLimit, stocks, playerMods/opponentMods,
  taunts, defeat line). Test `tests/story.test.ts` validates references.
- Presentation/flow in `src/ui/story.ts` (chapter select with lock/complete, title cards, narration, typewriter dialogue with
  CSS "bust" portraits, VS splash, defeat → retry / easier CPU, chapter complete → unlock next). Progress in localStorage
  `fray.story.v1` ({done: chapterIds}). Esc skips cutscenes to the next fight.
- Plot: the Ember Moon shattered 12 years ago; shards made the Shardborn. Hierarch Malvek runs THE FRAY tournament and harvests
  champions to rebuild the moon. Kestrel hunts for his brother Ren (now HOLLOW REN). Allies: Vesha (Malvek's ex-assassin),
  Brakka (clan shard-heart stolen), Sera (last knight of the Dawn Lance), Torval (ex-champion/enforcer turned ally).
  Prologue + chapters 1–7, final boss HIERARCH MALVEK (Torval moveset, gold look, 2200 HP, untimed).
- `main.ts` hosts story: backdrops are quiet idle matches (`MatchSetup.idle`), fights are normal matches whose end returns to
  the story; pausing → Quit returns to chapter select. Match/HUD/renderer accept per-player `name` and `look` overrides.

## Performance
- Pixel ratio capped at 1.5, blob shadows (no shadow maps), toon material + inverted-hull outlines, DOM HUD.

## Smoothness decisions (Codex, 2026-10-26)
- Presentation keeps per-fighter pose history: 6f state crossfades, 3f attack fades capped at first active frame,
  2f hit reactions; sample actual previous/current clip clocks (including charge/grab/hitlag), never extrapolate.
- Small corrected snapshot positions (≤0.5 m) decay visually at 24/s; teleports, respawns and match setup reset history.
- Camera/facing/aura/particle damping uses elapsed seconds. Dangle scratch vectors/quaternions are reused,
  speed capped at 20 m/s and displacement >2 m discards drag. Pixel ratio remains capped at 1.5.
- Start from fetched origin/main; online rollback tests and two-browser relay checks are required for sim changes.
- Fonts use local Latin WOFF2 subsets (OFL licenses in public/fonts); Playwright can use an installed Chromium via
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when the pinned browser is unavailable.
