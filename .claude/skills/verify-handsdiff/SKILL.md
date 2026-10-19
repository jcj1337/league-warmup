---
name: verify-handsdiff
description: Launch and drive hands diff (this repo's Phaser browser game) in a headless Edge to prove a behaviour works, with screenshots, state snapshots and a pass/fail transcript as evidence. Use after changing gameplay, the start screen, the pause menu, the HUD or the end screen, or whenever asked to run, check, screenshot or verify the game as a player sees it, rather than only via `npm test`.
---

# Verify hands diff

hands diff is a single-page canvas game: Phaser 3 draws everything into one `<canvas>`, so there
are no DOM elements, ARIA roles or CSS selectors to drive. The stable handles are the console
globals the game exposes (`window.__warmup`, `__profile`, `__runs`, `__keybinds`, `__settings`,
`__champions`, `__balance`) and the scene objects behind them. The Playwright suites in
`tests/e2e/` read the same objects. This skill wraps them in one harness, `hd.mjs`. It owns a
Vite dev server and drives *journeys*: small modules that play the game with real mouse and
keyboard input, check what happened and save the evidence.

All commands run from the repo root. They work the same in PowerShell and Git Bash.

```
node .claude/skills/verify-handsdiff/scripts/hd.mjs serve                 # launch (idempotent)
node .claude/skills/verify-handsdiff/scripts/hd.mjs doctor                # is it worth driving?
node .claude/skills/verify-handsdiff/scripts/hd.mjs run <journey.mjs>     # drive + capture evidence
node .claude/skills/verify-handsdiff/scripts/hd.mjs runs                  # past verdicts
node .claude/skills/verify-handsdiff/scripts/hd.mjs stop                  # teardown (evidence kept)
```

Flags: `--port N` (default 5180) on every command; `--headed` and `--channel chromium` on `run`.
`hd.mjs` resolves the repo from its own location, so the working directory only matters for
the journey path you pass.

## Launch

1. `npm install` once if `node_modules/` is missing. There is no backend, database, seed data or
   auth. All saved state is one browser localStorage key (`warmup.profile.v1`), and every
   `run` gets a fresh browser context, so each journey starts from an empty profile.
2. `node .claude/skills/verify-handsdiff/scripts/hd.mjs serve`

`serve` spawns `node node_modules/vite/bin/vite.js --port 5180 --strictPort --host 127.0.0.1`
detached, with `VITE_NO_OPEN=1` so no tab opens on the user's desktop. It records the pid in
`.verify/server-5180.json` and logs to `.verify/server-5180.log`. It waits for the dev index
page, then boots the game in a throwaway headless Edge until both scenes exist and the start
screen is up. **Ready is the line `READY http://127.0.0.1:5180/ pid=<pid> boot=<ms> champions=... modes=...`**
and exit code 0. Anything else exits non-zero with the reason and the log tail. That first
browser boot also warms Vite's dependency optimiser, so a journey never hits the "new
dependencies optimized, reloading" page reload. Expect about 5s.

Running `serve` again while our server is alive prints `READY ... (already serving ...)` and
reuses it. If another process holds the port, `serve` exits 2 naming that pid. Pick another
`--port`; never kill it.

**Isolation.** Port 5180 on 127.0.0.1 never collides with the user's own `npm run dev` or
`npm test` (both use `localhost:5173`). localStorage is per origin, so nothing here touches
the user's saved profile. Two instances run side by side with different ports
(`serve --port 5181`, then `--port 5181` on every later command). Each has its own state file.
Never point the harness at :5173: it only ever drives the URL in its own state file.

## Doctor

`node .claude/skills/verify-handsdiff/scripts/hd.mjs doctor` is read-only and prints one
`OK`/`FAIL` row per check, then `DOCTOR OK` (exit 0) or `DOCTOR FAIL` (exit 1):

| Row | What it proves |
| --- | --- |
| `repo`, `deps` | the right checkout (`package.json` name `warmup`) with vite and @playwright/test installed |
| `server file`, `process` | our state file exists, and its pid is alive and its command line is our vite on this port (guards against pid reuse) |
| `port owner` | the port's listener pid is that pid, not some other server |
| `http` | `/` answers 200 with title `hands diff by qwer` and the dev client (`/@vite/client`, `/src/main.ts`), not a `dist/` build |
| `build` | HEAD now (and at serve time if it moved) plus the count of uncommitted paths. Vite serves the live working tree, so uncommitted edits are what you drive |
| `game boots` | a fresh Edge reaches the start screen with the round held, lists champion and mode ids, and sees 0 page errors |

Run it first whenever anything looks off. A `FAIL` on `process` or `port owner` means
`stop`, then `serve`. A `FAIL` on `game boots` with page errors is a real bug in the working
tree. Report it; don't drive around it.

## Drive

A journey is an ES module. Put scratch journeys in `.verify/journeys/` (git-ignored) or the
session scratchpad. It needs no imports: it receives `hd` and drives `hd.page`, a Playwright
Page, through the helpers below.

```js
export const name = 'my-check';              // names the evidence folder (default: file name)
export default async function (hd) {
  hd.step('1. what this part proves');
  await hd.open();                            // fresh page -> start screen (round held at 0)
  await hd.click(await hd.tile('axeman'));    // a real click on the real tile
  await hd.startRun();                        // a real click on the card; waits for the clock
  await hd.rclick(300, 220);                  // move order
  await hd.waitGame(500);                     // 500ms of GAME time
  const g = await hd.game();
  hd.check(g.player.x < 500, 'right-click moves the player', g.player);
  await hd.shot('moved');                     // NN-moved.png + NN-moved.json (state)
}
```

Shipped, proven journeys: `journeys/look.mjs` (open and screenshot the start screen) and
`journeys/start-screen.mjs` (the full start-screen recipe). Copy one as a template.

**Coordinates are game coordinates**, i.e. the 1280×720 arena. The harness maps them onto the
canvas, so locator results pass straight into input helpers.

| Helper | Does |
| --- | --- |
| `open()` / `reload()` | load `/` and wait until both scenes exist and the start screen is visible, plus two frames |
| `startRun(key?)` | leave the start screen as a player: click empty card space at (1100,650), or press-and-release `key`. Returns true once the clock passes 100ms |
| `move(x,y)`, `click(x,y,{button,hold})`, `rclick(x,y)` | mouse input. Each also takes a `{x,y}` from a locator. `hold` = ms between press and release |
| `press(key,{hold})`, `down(key)`, `up(key)` | keyboard (Playwright key names: `'q'`, `'Escape'`, `'ArrowRight'`, `'CapsLock'`) |
| `waitFor(fn, arg, {timeout, label})` | poll `fn(arg)` in the page until truthy. Never throws: logs `WAIT`/`TIMEOUT` and returns a boolean. `fn` must be self-contained (it is sent as source) |
| `waitGame(ms)` | wait for `ms` of game time (the clock freezes while paused) |
| `wait(ms)` | wall-clock wait, only for hover tooltips and similar UI settling |
| `tile(championId)`, `modeButton(modeId)` | the start screen's champion tile / difficulty button |
| `button(screen, label)` | a text button by exact label on `'pause'`, `'end'` or `'start'` |
| `settingRow(label)`, `bindRow(action)` | a pause-menu setting value / key row |
| `game()` | snapshot: `awaiting`, `paused`, `startScreen`/`pauseMenu`/`endScreen` visibility, `clockMs`, `hud` (`getHudState()`), `player`, `attack`, `enemies[]`, `kit` (`kit.stats()`), `result`, `profile`, `mouseSpeed` |
| `startScreen()`, `pauseMenu()`, `endScreen()`, `abilityBar()` | what each screen shows, as text |
| `read(fn, arg)` | any other read from the page |
| `stage(label, fn, arg)` | change state through the console handles to set up a precondition. Logged as `STAGE` |
| `step(title)`, `check(ok, label, detail)`, `note(msg)` | transcript structure. A failed `check` logs `FAIL` with `detail` as JSON |
| `shot(name)`, `save(name, data)` | evidence files, numbered in order |

The per-feature recipes, with handles, expected values and traps, are in
[features/README.md](features/README.md). Read the matching feature file before you write a
journey. When a feature lists several entry points, a proof covers each one. One convenient
path is not the whole feature.

## Evidence

Each `run` writes `.verify/runs/<YYYYMMDD-HHMMSS>-<name>/`:

- `transcript.txt`: every `ACT`, `STAGE`, `WAIT`/`TIMEOUT`, `PASS`/`FAIL`, `SHOT` line with
  timestamps.
- `NN-<name>.png` + `NN-<name>.json`: the screen and the full `game()` state at that moment.
- `console.txt`: every browser console line and page error.
- `journey.mjs`: a copy of exactly what was driven.
- `summary.json`: verdict, counts, URL, channel, commit, uncommitted path count and times.

The verdict is `PASS` only with at least one passing check, no failed check and no page error.
`run` exits 0 on `PASS`, 1 on `FAIL` and 2 when there is no server. `hd.mjs runs` lists past
verdicts. `.verify/.gitignore` (`*`) keeps it all out of git without touching the repo's
`.gitignore`.

Proof standards:

- **The action under test is real input.** Use `click`/`rclick`/`press`/`move` on located
  controls. Never call the method the input would reach (`startRun()`, `pickChampion()`,
  `Keybinds.set()`, `restartRound()`): that proves the method, not the feature.
- **`stage()` sets preconditions only.** Examples: park an enemy, drop HP to 1, jump to a stage.
  Every staged write shows in the transcript, and a proof that staged its own outcome is not
  a proof.
- **Capture before and after.** Take a `shot` (or `check` on `game()`) before the action and
  after it, not just the final screen.
- **Verify side effects through a second view.** A pick or setting is saved when it survives
  `hd.reload()`, which keeps the same context and localStorage, and shows in `__profile.data`.
  A finished run is logged when `read(() => window.__runs.list())` grows. The HUD reflects a
  rebind when `abilityBar()` changes.
- **Look at the PNGs** for anything visual. A state field can be right while the drawing is
  wrong.
- No mocks: there is no external system. The only stub is the pointer-lock block below.

## Cleanup

`node .claude/skills/verify-handsdiff/scripts/hd.mjs stop` (plus `--port N` for each extra
instance). It kills only the pid in our state file, after re-checking that pid's command line
is our vite on that port. On Windows it uses `taskkill /PID <pid> /T /F`, which also takes
vite's esbuild child. It never kills by process name. It deletes the state file and server
log, warns if anything else still holds the port, and **keeps `.verify/runs/`**. Each `run`
closes its own browser, so after `stop` nothing from this skill is left running. Run `stop`
after failed attempts too. To discard old evidence, delete the specific
`.verify/runs/<folder>`, and only when asked.

## Helpers

`scripts/hd.mjs` is the whole harness: Node 18+ (fetch), using the repo's own
`@playwright/test`. Invoke it with `node` as shown above. It is self-documenting: run it with
no arguments for usage.

## Gotchas

- **Pointer lock is blocked on purpose.** Mouse Speed ≠ 1.0 makes the game take a pointer
  lock, which on Windows grabs the user's real OS cursor even headless (see CLAUDE.md:
  `mouse-speed.spec.ts` is skipped for this reason). Every run stubs
  `Element.prototype.requestPointerLock` to reject. The transcript notes any blocked request.
  Mouse Speed's lock behaviour is therefore out of scope here. Never drag the Mouse Speed
  slider expecting a lock.
- **Frame rate is not 60.** Headless Edge can tick at 300+ fps. Wait on game time
  (`waitGame`) or a condition (`waitFor`), never on frame counts, and give thresholds in px/s
  or ms.
- **Picks rebuild the round.** A champion or mode pick restarts GameScene (`hud.round` bumps).
  Wait for `getHudState().champion`/`.mode` to match before the next action.
- **The pause menu shows a frame after the game pauses** and hides a frame after it resumes.
  Wait on `pauseMenu().visible`, not `game().paused`.
- **Don't run journeys during `npm test`.** Two real-time games compete for CPU, and the
  timing-sensitive suites flake.
- **`--headed`** opens a visible window. If it loses focus, Pause on Focus Loss (on by
  default) pauses the run. Headless is the default for that reason.
- **Real waves are random.** Spawn points and drift vary per run, so a journey that needs an
  enemy at a spot must `stage()` it (the smoke suite parks enemies the same way) and should
  click empty ground for move orders. A right-click on an enemy is an attack order.
