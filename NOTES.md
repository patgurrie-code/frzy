# NOTES — status & next steps

Shared log for Claude Code and OpenAI Codex. Add a dated entry per session under "Log".

## Log
- 2026-10-24 (Claude Code): sim core, fighters, rules, tests; AGENTS.md added (kept in sync with CLAUDE.md by a test).
  GitHub push returned 403 (Claude GitHub App lacks access to the repo) — commits are local until access is fixed.

## Done
- Repo setup: Vite + TS + three + Vitest + Playwright, render.yaml.
- Deterministic sim (`src/sim/`): fixed-point maths, LUT trig, PRNG, input bitmasks, save/load/checksum.
- Skeleton FK, keyframed animations, bone hitboxes/hurtboxes.
- Stage "Skyforge Ruins": main platform, 2 soft platforms, ledges, blast zones, Versus walls.
- Fighters KESTREL (brawler) + TORVAL (blaster), full move lists (jab, 3 tilts, 3 smashes, 5 aerials, 4 specials + 4 EX,
  grab/pummel/4 throws, super, dash attack, ledge attack).
- Platform + Versus rules, ki, supers, beam clash, shields/rolls/dodges, grabs, ledges, DI, hitlag.
- Unit tests: determinism, save/load/rerun, integer-only state, purity grep, gameplay checks.

## Next (Milestone 1 remaining)
1. Renderer (three.js): placeholder fighters from primitives on the skeleton, toon + outline, stage, camera.
2. Input layer (keyboard sets, remap, gamepad), game loop, menus, HUDs (Platform + Versus), banners.
3. CPU opponent.
4. Game feel: sparks, shake, WebAudio SFX. Training F1/F2.
5. Playwright smoke test. Update NOTES with run/deploy instructions.
