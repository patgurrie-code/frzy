# NOTES — status & next steps

Shared log for Claude Code and OpenAI Codex. Add a dated entry per session under "Log".

## Log
- 2026-10-26 (OpenAI Codex), step 3: appended follow-through/overshoot/settle tails to the full move roster without
  changing active integer poses or timings; regression fixture captures origin/main b0c4adc signatures. Each fighter's
  jab has 1f arm anticipation. Locomotion cycles retimed per speed/scale; walk arm swing, progressive jump squash,
  apex extension and landing dip/settle. PROTOCOL 2 → 3 (animation affects hurtboxes). Light/medium/heavy normal
  hitlag now 5/9/16f for 3/10/23 damage, vs 6/11/19f; knockback/hitstun/stun/recovery timing retained.
  Pooled ribbon vectors, reduced repeated Dangle matrix traversals, batched static stage/background meshes by material.
  Final review caught extended EX beam animations settling before their longer cast ended; makeEx now extends
  the firing hold/recovery tail with the move duration. Active/release samples remain locked to the baseline.
  Validation: 82 unit tests, TypeScript, production build and all 6 e2e tests pass (incl. two-browser online checksums).
  Visual check: neutral training scene renders correctly in system Chromium 154, 1280×720, pixel ratio 1.
  Performance procedure: scripts/measure-render.mjs, production preview, 15 warm-up + 75 measured rAF intervals;
  software ANGLE/SwiftShader, one browser at a time. Baseline b0c4adc: 7.36 fps, median 125.9 ms, p95 329.9 ms,
  211–217 draws, 55,720–57,544 triangles. Final: 7.58 fps, median 125.4 ms, p95 216.7 ms, 180–183 draws,
  56,740–57,652 triangles. ~34 fewer peak draws (~16%); fps difference is too noisy to claim a speedup.
  Slightly more triangles are submitted because merged background meshes cull as a batch. No integrated-GPU 60 fps claim.
  Next: user playtest of new movement/hitlag; tune special-specific poses, dynamic foot planting and imported GLB clip
  transitions (no real GLBs in this repo to validate); profile actual integrated GPU and four-player stress scenes.
  Work is split into three commits. Automatic review initially blocked push as unverified-origin code egress.
  Before retrying, GitHub connector verified origin matches the public patgurrie-code/frzy repository, owned by the
  connected account patgurrie-code, with admin/push permission; the pasted request explicitly asks for commit + push.
  Retry was also rejected: automatic review still requires explicit publication approval. Requested approval for
  origin HEAD:codex/fray-smoothness. No remote writes have occurred; all implementation is committed locally.
- 2026-10-26 (OpenAI Codex), step 2: 8f recovery buffer, buffered Guard taps, smoother walk/dash/run/turnaround,
  momentum through take-off/air jumps and gradual excess-speed air drift. PROTOCOL 1 → 2. Online stalls retain
  keyboard latches; render previous state now comes from corrected rollback history. Blur clears stale latches.
  Validation: 77 unit tests, TypeScript and all 6 browser tests pass (including online checksums).
  Frame-step smoke test waits for its queued step instead of assuming 200 ms on a loaded software GPU.
  Next: locomotion and recovery keyframes, isolated browser measurements.
- 2026-10-26 (OpenAI Codex), step 1: read architecture, sim, fighter data, renderer, input/CPU, UI/story and tests.
  Added render-only pose crossfades and actual-clock interpolation (fixes hitlag/charge/grab sampling), bounded small
  correction smoothing, respawn resets, exponential facing/aura/particle damping; removed Dangle/camera hot-path
  vector/quaternion allocations. Projectiles/beam lengths interpolate too. Local font subsets avoid blocked remote
  font requests; explicit empty favicon avoids missing-asset errors. Playwright supports an executable-path override. Next: deterministic movement/buffering and authored recovery/locomotion polish.
  Initial shell fetch was blocked; network-enabled fetch revealed PR #5 (7 newer commits). Fast-forwarded to b0c4adc
  and reread online/rollback, updated gameplay/AI and new tests before continuing.
  Validation: 60 unit tests, TypeScript, production build and all 6 e2e tests pass with system Chromium.
  Push blocked by automatic approval review despite the pasted request asking for commit + push; no remote writes made.
- 2026-10-24 (Claude Code): sim core, fighters, rules, tests; AGENTS.md added (kept in sync with CLAUDE.md by a test).
  GitHub push returned 403 (Claude GitHub App lacks access to the repo) — commits are local until access is fixed.
- 2026-10-24 (Claude Code): Milestone 1 complete — renderer, input/remap/key test, gamepads, CPU, HUDs, menus, SFX, training,
  Playwright smoke tests. Short key taps are latched for one sim frame (InputManager.endFrame). Supers keep ≥75% damage
  under combo scaling. Verified visually in headless Chromium (title, select, versus, platform, training F1, clash, super).
- 2026-10-24 (Claude Code): PR #1 merged. Milestone 2 base: single-player controls (Smash button, J/K/L/U/I, tap-jump kept on W
  per user), auto-run, jab chains, ki charge, counters, command grabs, handicaps; 3 new fighters (SERA, VESHA, BRAKKA);
  story mode base "FRAY: EMBERFALL" (prologue + 7 chapters, 2 bosses). 41 unit + 5 e2e tests passing.
  User plans to flesh out story/design with Codex — see "Story mode" in AGENTS.md.
- 2026-10-25 (Claude Code): PR #2 merged. User asked to prioritise CHARACTER DESIGN and GAMEPLAY (not stages/music/modes).
  Done: procedural character art overhaul (kit + per-fighter designs, swinging cloth/hair, rim light, 3/4 view, flame aura,
  hit flash, swoosh trails), animation personality (idle rhythm, victory poses, ninja run, knockdown), parry / tech /
  cancels / counter-hit / punish with callouts, impact FX, smarter CPU (combos, parries from frame data, techs, punishes),
  balance power stat. 44 unit + 5 e2e tests passing.
- 2026-10-25 (Claude Code): PR #3 merged. Did (1) animation pass: eased keyframes, render torso twist, hit reactions by
  height, facial expressions + blinks, intro poses; (2) Versus depth: high/low/overhead blocking, throw escapes, wall
  bounces, launchers + air combos (juggle decay), burst; CPU uses all of them. 50 unit + 5 e2e tests passing.
- 2026-10-26 (Claude Code): PR #4 merged. ONLINE 1v1 added: rollback netcode, WebRTC P2P with relay fallback, Cloudflare
  Worker + Durable Object relay (same deploy as the game) and a Node relay, lobby with room codes / invite links / rematch.
  Gameplay: CPU move choice from real hitbox ranges (Sera fixed), short-hop aerial macro, ledge trump, Platform combo
  counter, Brakka power 86. CPU round robin now 6–10 wins each. 56 unit + 6 e2e tests (incl. two-browser online) passing.

## Done (character & gameplay pass)
- See AGENTS.md "Character art" and "Gameplay decisions → Defence/combo systems".

## Done (Milestone 2 base)
- Controls rework for one player (see AGENTS.md "Gameplay decisions"); pause + select screens show a controls sheet.
- New mechanics: Smash input bit, jab chains, ki charge, counters, command grabs, vanish teleports, per-fighter modifiers,
  configurable rounds-to-win / time limit.
- Fighters 2–4: SERA, VESHA, BRAKKA (full move lists, new placeholder props).
- Story mode base with chapter select, cutscenes, VS splash, boss fights, progress saving.

## Done (Milestone 1)
- Repo setup: Vite + TS + three + Vitest + Playwright, `render.yaml`, README with run/deploy steps.
- Deterministic sim (`src/sim/`): fixed-point maths, LUT trig, PRNG, input bitmasks, save/load/checksum.
- Skeleton FK (Mixamo names), keyframed animations, bone hitboxes / capsule hurtboxes.
- Stage "Skyforge Ruins": main platform, 2 soft platforms, ledges, blast zones, Versus walls.
- Fighters KESTREL (brawler) + TORVAL (blaster): jab, 3 tilts, 3 smashes, 5 aerials, 4 specials + 4 EX, grab/pummel/4 throws,
  super (cinematic), dash attack, ledge attack.
- Platform + Versus rules, ki, supers, beam clash, shield/roll/spot-dodge/air dodge, grabs, ledges, DI, hitlag, fast fall.
- Renderer: toon placeholder fighters + outlines on the skeleton, stage, interpolation, camera fit/zoom, super zoom, shake,
  sparks, projectiles/beams, blob shadows, F1 hitbox/hurtbox overlay. GLB loader with retargeting + clip override (untested
  without a real model).
- Input: two keyboard sets (remappable, persisted), gamepads, key-test screen.
- CPU (levels 1–9 + dummy): approach, attack in range, shield, grab/throw, projectiles, supers, recover to ledge, mash clashes.
- HUDs: Platform cards (%, stocks, ki); Versus top bars meeting at the timer, round pips, ki meters at the bottom, combo counter,
  ROUND/FIGHT/K.O./TIME/GAME banners. Menus: title, mode, character select (1–4 slots), settings, pause, results.
- WebAudio synthesized SFX. Training mode F1–F4.
- Tests: 27 unit tests (determinism, save/load rerun, integer-only, purity grep, gameplay, CPU), 4 Playwright smoke tests.

## Known issues / ideas
- Balance: CPU round robin (level 6, versus+platform): Kestrel 7, Torval 6, Sera 8, Vesha 9, Brakka 10.
- Online: no TURN server (strict NATs fall back to the WebSocket relay — works, slightly higher latency). Online is 1v1 only;
  4-player / 2×2 online, spectators, ranked and reconnect-after-drop are not done. Not yet tested across real internet.
- Every move now has a shared recovery/overshoot/settle tail; all jabs gain anticipation. Active attack trajectories
  remain the original data. Per-special hand-tuned anticipation/follow-through and true foot-lock IK remain open.
- Story portraits are CSS placeholder busts; story has one stage only and no music. Locked chapter cards show the hero.
- Story fights always use Keyboard 1 for the player (no device picker yet).
- Placeholder poses are approximate (feet can float/clip slightly). Tune per move when real models arrive.
- CPUs break their shields too often (holding too long); level differences are modest.
- Bundle is ~700 kB (three.js); could code-split later.
- Performance target (60 fps integrated GPU) not yet measured on real hardware — headless runs use SwiftShader.

## Next (candidates)
0. Remaining from the agreed plan: (3) real GLB models via the loader, (4) playtest-driven tuning rounds with the user.
   Character polish still open: hand-tuned keyframes per move (easing helped but poses are still simple), alt costumes,
   head tracking, single skinned mesh instead of rigid parts.
1. Story polish (user + Codex): art/portraits, more scenes, branching choices, story-specific stages, music, unlock rewards
   ("A new challenger approaches" after chapters), arcade ladders per fighter.
2. Balance/tuning pass with hitbox view; per-move SFX/VFX variety; tech on landing; ledge trump.
3. Real hardware perf pass (draw-call count, merge static stage meshes, instanced outlines if needed).
4. Fighters 6–8 + 4 stages with hazards; transformations.
5. Online next: 2×2 / 4-player rollback, reconnect, input delay setting, spectators, region info.
6. Single player extras: World Tour, unlocks, levels, saves with export codes.
