# hands diff verification map

This directory is the maintained source for verifying what a player of hands diff sees and
does. Read this index, then the matching feature file, before writing a journey for
`hd.mjs run` (see [../SKILL.md](../SKILL.md)).

## Baseline preconditions

- `node .claude/skills/verify-handsdiff/scripts/hd.mjs serve` printed `READY http://127.0.0.1:5180/ ...`.
- `node .claude/skills/verify-handsdiff/scripts/hd.mjs doctor` printed `DOCTOR OK`.
- Every `run` uses a fresh browser context: an empty profile (Magic Boy, Normal, default keys,
  Damage Numbers ON, Pause on Focus Loss ON, Mouse Speed 1.0, empty run log).
- The viewport is 1280×720, and all coordinates are game coordinates (the 1280×720 arena).
- Never drive an instance this harness did not start (not the user's `localhost:5173`).

## Driving conventions

- Start each journey with `hd.open()`, which lands on the start screen with the round held at
  time 0.
- Leave the start screen with `hd.startRun()` (a real click) unless the feature *is* the start
  screen.
- Locate controls with `hd.tile`, `hd.modeButton`, `hd.button`, `hd.settingRow` and
  `hd.bindRow`, then pass the result to `hd.click` / `hd.move`. Never hard-code coordinates
  for UI that has a locator.
- Wait on conditions (`hd.waitFor`) or game time (`hd.waitGame`). Use wall-clock `hd.wait`
  only for hover tooltips.
- Set preconditions with `hd.stage(label, fn)` only, such as parking an enemy or dropping HP.
  The behaviour under test is driven by real input.
- Persistence is proven with `hd.reload()`, which keeps the context's localStorage.

## Proof and skip reporting

- Capture the action and the resulting state: a `hd.shot` or a `hd.check` on `hd.game()`
  before and after.
- Check the side effect through a second view: `__profile.data`, `__keybinds.all()`,
  `__runs.list()`, the ability bar, or the screen after a reload.
- Open the PNGs for anything visual. State can be right while the drawing is wrong.
- Quote the evidence folder (`.verify/runs/<stamp>-<name>/`) and its verdict line in your
  report.
- If an entry point can't be reached, report the attempted step and the unmet precondition.
  Never report it as verified through a different entry point.
- Never weaken a check to get a pass. A failing check is a finding.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behaviour, then exactly
four H2s in this order:

1. `Sub-features`: short IDs, one line each.
2. `How to get to it (user POV)`: every entry point a player has.
3. `Driving it with hd`: starts with `Preconditions:`, then labelled bullets pairing each user
   action with the exact `hd` call and the observable result.
4. `Gotchas`: traps that waste or invalidate a run.

## Features

| Feature | Covers | Status |
| --- | --- | --- |
| [Start screen](./start-screen.md) | title card, champion and difficulty pickers (hover, click, arrows), saved picks, start on release | **proven 2026-10-18** by `journeys/start-screen.mjs` (18/18, both start entry points) |
| [Pause menu](./pause-menu.md) | Esc pause and freeze, Resume / Restart Round / Return to Select, settings rows, key rebinding with swaps and reset | recipe, not yet driven |
| [Combat controls](./combat-controls.md) | right-click move, stop, attack orders, A-click and T attack move, Flash | recipe, not yet driven |
| [Champion kits](./champion-kits.md) | Q / W / E / R per champion (Magic Boy, Snake Lady, Axe Man), cooldowns, kit counters | recipe, not yet driven |
| [Run and end screen](./run-and-end-screen.md) | HUD progress, wave clear, death, the end screen, Play Again, Return to Select, run log | recipe, not yet driven |

When you first drive a "recipe" feature, fix whatever in its file turned out wrong, then
change its status to proven, with the date and the journey's check count.
