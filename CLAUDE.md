# Warmup (qwer's backyard)

A browser mechanics trainer for League-style play: Phaser 3 + TypeScript (strict), Vite,
no physics engine, no backend. The README is the player-facing and tuning reference;
this file is for working on the code.

## Commands

- `npm run dev` — Vite on :5173 (auto-opens a tab unless `VITE_NO_OPEN=1`).
- `npm run typecheck` — `tsc --noEmit` for src and tests. Run it before any test run.
- `npm test` — the Playwright suites in `tests/e2e/`, one at a time in headless Edge
  (~5 min). They start their own Vite server on :5173 or reuse one.
- `npx playwright test <name>` — one suite (`kit`, `waves`, `cassiopeia`, ...).
- **Never run `mouse-speed.spec.ts` on a machine someone is using**: it takes a real
  pointer lock, which on Windows grabs the OS cursor even headless. It is skipped
  unless `PW_POINTER_LOCK=1`.

## Where things are

- `src/config/balance.ts` — the world: arena, enemies (`ENEMIES` registry + per-mob
  blocks), waves, difficulty, score, Flash, keybind defaults, `DEBUG`, `LEVELS` (XP curve).
  Mutable on purpose: `__balance.ATTACK.range = 400` from the console applies live.
- `src/config/theme.ts` — every colour and presentation number. Palette at the top.
- `src/champions/` — playable champions. `types.ts` is the contract (a `Champion` has
  stats, auto pacing, level perks, body art and a slot definition per ability; its `Kit`
  decides what a slot does when its cast resolves). `index.ts` is the registry. One
  folder per champion: `balance.ts`, `art.ts`, `kit.ts`, `index.ts`, `README.md`.
  The engine never switches on a champion id; see "Adding a champion" in the README.
- `src/game/scenes/GameScene.ts` — Phaser glue: builds the systems, `update()` order,
  input commands, `castSlot` (aim resolution from a slot's targeting), HUD snapshot.
  `Run.ts` owns the round lifecycle, clock, events and result; `systems/Combat.ts` is
  the hit funnel (every pip and every HP lost passes through it once).
- `src/game/RunEvents.ts` — kill, hit, waveCleared, stageCleared, playerHit, levelUp.
  Gameplay emits; `view/RunFeedback.ts` (kill gold, popups, hit shake) and kits listen.
  Nothing listens back into gameplay.
- `src/game/systems/` — engine systems. `WaveDirector` (the run), `AttackSystem`
  (orbwalk cycle), `CastSystem` (cast windows), `AbilityCooldowns`, `BlinkSystem`
  (blink geometry + Flash), `PlayerProjectileSystem`, `PlayerZoneSystem` (player ground
  spells), `HostileSpellSystem` (enemy spells), `Progression` (levels).
- `src/game/entities/` — `Player`, `Enemy` (lifecycle, pips, statuses, slows, stun,
  heading) and the mobs. `src/game/view/` draws; views only read entity state.
- `src/game/art/` — hand-authored pixel sprites (`sprites.ts`), the pixel font, and
  `look.ts`, which composes a champion's body with cosmetics (`src/cosmetics/`).
- `src/profile/Profile.ts` — everything saved, one localStorage key, with migrations.
  `Keybinds`, `MouseSpeed`, `Settings`, `RunHistory` are views over it.
- `src/game/scenes/UIScene.ts` — HUD, start screen (champion row), pause menu, end screen.
- `docs/proposals/` — design proposals with their status line; `docs/TECHNICAL_REPORT.md`
  is historical (predates the endless run, champions and most mobs).

## Rules the code keeps

- Every gameplay deadline is on the `GameClock` (`run.clock`), never wall time, so a
  pause freezes everything and nothing fast-forwards on resume.
- Enemy health is pips: `takeHit()` removes exactly one. There are no damage amounts on
  the enemy side; player damage is HP.
- Gameplay state flips first; views and effects read it afterwards and never feed back.
- Console handles (`__warmup`, `__balance`, `__ezreal`, `__cassiopeia`, `__profile`,
  `__runs`, `__keybinds`, `__settings`) are what the suites drive too.

## Tests

The suites are characterization scripts: one long sequential scenario per area,
`pass` / `fail` lines with soft assertions, and they reach into the scene
(`window.__warmup.scene.getScene('GameScene').director`, `.kit`, `.attacks`, ...).
Renaming an internal means updating them. `startSuite(page, testInfo, settleMs,
{ champion })` boots the game past the start screen; `waitForGame` is the handle for
"the simulation has advanced". The headless browser can tick at 300+ fps, so never
assume a frame is ~16ms: thresholds go in px/s or ms, not per call.

## Working notes

- Commit messages describe behaviour; keep each phase of work its own commit with
  the suites green.
- Adding a mob: README "Adding a mob". Adding a champion: README "Adding a champion".
- Planned next: a Cuphead-style death screen, sound cues, then cosmetics with a
  currency from score (`docs/proposals/ARCHITECTURE_PROPOSAL.md`, Cosmetics).
