# Contributing

New champions are the contribution this project wants most. Mobs, fixes and tuning are
welcome too. This page takes you from a fresh clone to a pull request.

## Setup

You need Node 20.19 or newer, and Microsoft Edge to run the tests.

```bash
npm install
npm run dev
```

`npm run dev` opens the game at http://localhost:5173 and reloads it when you save. While
it runs, the browser console has handles into the live game. `__balance` holds the
gameplay numbers; `__magicBoy`, `__snakeLady` and `__axeMan` hold each champion's; and
`__warmup` is the Phaser game itself. Most values you change there apply on the next frame,
which is the fastest way to tune.

## How the code is laid out

- `src/champions/`: one folder per playable champion. `types.ts` is the contract every
  champion fills in.
- `src/config/balance.ts`: gameplay numbers (enemies, waves, difficulty, modes).
  `src/config/theme.ts` holds colours and presentation.
- `src/game/systems/`: the engine (attacks, casts, cooldowns, projectiles, waves).
- `src/game/entities/`: the player and the mobs. `src/game/view/` draws them.
- `src/game/art/`: every sprite, written as a text pixel map in `sprites.ts`.
- `tests/e2e/`: one Playwright suite per area of the game.

[CLAUDE.md](CLAUDE.md) has a fuller map. It's written for AI coding assistants, but it's
accurate and reads fine for people.

## Adding a champion

Copy the existing champion closest to yours:

- **Magic Boy** (`magicboy`): a marksman with a poke, a mark, a blink and a global wave.
- **Snake Lady** (`snakelady`): a venom mage who casts between slow autos.
- **Axe Man** (`axeman`): an auto-attacker who has to catch the axes he throws.

Then:

1. Give the folder your champion's id, and set `id` and `name` in its `index.ts`.
2. Put every number in `balance.ts`. `kit.ts` decides what each slot does when its cast
   resolves. `index.ts` defines each slot (icon, cast style, motion). `motions.ts` is what
   the body does on each auto and cast, and `art.ts` is the body's pixel art.
3. Draw the ability icons in `src/game/art/sprites.ts` and add their keys to `TEX.icons`
   in `src/game/art/textures.ts`.
4. Add the champion to `CHAMPIONS` in `src/champions/index.ts`. That puts it on the start
   screen.
5. If it puts a status on enemies, apply the status with `enemy.applyStatus(id, now, ms)`
   and register its look with `registerStatusLook`.
6. Write the folder's `README.md`: a table of the kit, then the rules a League player
   wouldn't guess. The existing champions' READMEs show the format.
7. Add a suite at `tests/e2e/<id>.spec.ts`. `axeman.spec.ts` is a good one to copy.

In the game, every champion has its own name: Magic Boy, not Ezreal. Comments and READMEs
can say which League champion a design follows, and the existing code does.

## Adding a mob

Follow "Adding a mob" in the [README](README.md). Read a mob's registry entry through
`enemyEntry(id, mode)`, not `ENEMIES[id]`, so difficulty modes can override it.

## Rules the code keeps

These hold everywhere in the code, and new code needs to keep them.

- **Time comes from the game clock.** Every gameplay deadline uses `run.clock`, never
  `Date.now()` or `setTimeout`, so pausing freezes everything.
- **Enemies have pips, not health.** `takeHit()` removes exactly one pip. Only the player
  has HP.
- **Gameplay first, views after.** Gameplay changes state, and views and effects read it
  afterwards. They never change it.
- **Enemies aim with a cursor.** A mob aims at its `aim` point, which chases the player at a
  set speed, never at the player's exact position.
- **The engine never asks which champion or mode it is.** Champions plug in through their
  kit, and a difficulty mode is only a set of numbers.
- **Phaser is trimmed.** `src/phaser.js` lists the parts of Phaser the game ships. Anything
  not listed there (text, particles, ...) fails at runtime until you add it.

## Tests

```bash
npm run typecheck            # always first
npm test                     # every suite, about 6 minutes
npx playwright test axeman   # one suite
```

The suites drive the real game in headless Edge. Without Edge, run
`npx playwright install chromium` and set `PW_CHANNEL=chromium`.

- **Leave `PW_POINTER_LOCK` unset on a machine you're using.** The mouse-speed suite takes a
  real pointer lock, which grabs your OS cursor even when the browser is headless. The
  suite is skipped unless you set it.
- **Don't save files in the project while the suites run.** The dev server reloads the
  game, and the suite that's running fails.
- **Write thresholds in ms or px/s, never per frame.** The headless browser can run at
  300+ fps.
- **Run `npm run perf` if you change dependencies, `src/phaser.js`, `vite.config.ts` or
  art built at boot.** It times how long the production build takes to load, and fails if
  the bundle or the load goes over budget.

If you use Claude Code, the repo includes a `verify-handsdiff` skill that plays the game
and takes screenshots to check a change the way a player would see it.

## Pull requests

- One change per pull request: a champion, a mob, a fix.
- `npm run typecheck` and `npm test` pass.
- Commit messages say what changed in the game ("Axe Man's E slows for 2s"), not what
  changed in the code.
- For anything visible, include a screenshot or a short clip.
- For balance changes, say what felt wrong and what the new numbers fix.

## License

The project is MIT licensed (see [LICENSE](LICENSE)). By opening a pull request, you agree
that your contribution is licensed under it too.
