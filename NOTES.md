# NOTES — status & next steps

Shared log for Claude Code and OpenAI Codex. Add a dated entry per session under "Log".

## Log
- 2026-10-24 (Claude Code): sim core, fighters, rules, tests; AGENTS.md added (kept in sync with CLAUDE.md by a test).
  GitHub push returned 403 (Claude GitHub App lacks access to the repo) — commits are local until access is fixed.
- 2026-10-24 (Claude Code): Milestone 1 complete — renderer, input/remap/key test, gamepads, CPU, HUDs, menus, SFX, training,
  Playwright smoke tests. Short key taps are latched for one sim frame (InputManager.endFrame). Supers keep ≥75% damage
  under combo scaling. Verified visually in headless Chromium (title, select, versus, platform, training F1, clash, super).
- 2026-10-24 (Claude Code): PR #1 merged. Milestone 2 base: single-player controls (Smash button, J/K/L/U/I, tap-jump kept on W
  per user), auto-run, jab chains, ki charge, counters, command grabs, handicaps; 3 new fighters (SERA, VESHA, BRAKKA);
  story mode base "FRAY: EMBERFALL" (prologue + 7 chapters, 2 bosses). 41 unit + 5 e2e tests passing.
  User plans to flesh out story/design with Codex — see "Story mode" in AGENTS.md.

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
- Balance is rough: in CPU-vs-CPU round robins BRAKKA wins most, VESHA least. Needs a tuning pass (frame data, kb values).
- Story portraits are CSS placeholder busts; story has one stage only and no music. Locked chapter cards show the hero.
- Story fights always use Keyboard 1 for the player (no device picker yet).
- Placeholder poses are approximate (feet can float/clip slightly). Tune per move when real models arrive.
- CPUs break their shields too often (holding too long); level differences are modest.
- Bundle is ~700 kB (three.js); could code-split later.
- Performance target (60 fps integrated GPU) not yet measured on real hardware — headless runs use SwiftShader.

## Next (candidates)
1. Story polish (user + Codex): art/portraits, more scenes, branching choices, story-specific stages, music, unlock rewards
   ("A new challenger approaches" after chapters), arcade ladders per fighter.
2. Balance/tuning pass with hitbox view; per-move SFX/VFX variety; tech on landing; ledge trump.
3. Real hardware perf pass (draw-call count, merge static stage meshes, instanced outlines if needed).
4. Fighters 6–8 + 4 stages with hazards; transformations.
5. Online: `/server` WebSocket signalling (Render Singapore), WebRTC data channels, rollback (2f delay, 8f rollback),
   event de-dup by frame in renderer, desync checksums.
6. Single player extras: World Tour, unlocks, levels, saves with export codes.
