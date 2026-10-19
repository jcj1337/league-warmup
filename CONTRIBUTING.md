# Contributing

New champions are the most useful contribution. Mobs, fixes and tuning changes are welcome
too.

## Setup

You need Node 20.19 or newer, and Microsoft Edge to run the tests.

```bash
npm install
npm run dev
```

`npm run dev` opens the game at http://localhost:5173 and reloads it when you save. While
it runs, the browser console has handles into the live game. `__balance` holds the
gameplay numbers, and `__magicBoy`, `__snakeLady` and `__axeMan` hold each champion's
numbers. `__warmup` is the Phaser game itself. Most values you change there apply on the
next frame, so you can tune without reloading.

## How the code is laid out

- `src/champions/` has one folder per playable champion. Every champion fills in the
  contract in `types.ts`.
- `src/config/balance.ts` holds the gameplay numbers for enemies, waves, difficulty and
  modes. `src/config/theme.ts` holds colours and presentation numbers.
- `src/game/systems/` is the engine. It runs attacks, casts, cooldowns, projectiles and
  waves.
- `src/game/entities/` has the player and the enemies, and `src/game/view/` draws them.
- `src/game/art/sprites.ts` has every sprite, written as a text pixel map.
- `tests/e2e/` has one Playwright suite per area of the game.

[CLAUDE.md](CLAUDE.md) has a fuller map, written for AI coding assistants.

## Adding a champion

Start from a copy of the existing champion closest to yours.

| Folder | Champion | Plays as |
| --- | --- | --- |
| `magicboy` | Magic Boy | a marksman with a poke, a mark, a blink and a global wave |
| `snakelady` | Snake Lady | a venom mage who casts between slow autos |
| `axeman` | Axe Man | an auto-attacker who has to catch the axes he throws |

Then follow these steps.

1. Rename the folder to your champion's id, and set `id` and `name` in its `index.ts`.
2. Put every number in `balance.ts`. `kit.ts` decides what each slot does when its cast
   resolves. `index.ts` defines each slot's icon, cast style and motion. `motions.ts` sets
   what the body does on each auto and cast, and `art.ts` holds the body's pixel art.
3. Draw the ability icons in `src/game/art/sprites.ts` and add their keys to `TEX.icons`
   in `src/game/art/textures.ts`.
4. Add the champion to `CHAMPIONS` in `src/champions/index.ts`. The start screen then
   lists it.
5. If the champion puts a status on enemies, apply the status with
   `enemy.applyStatus(id, now, ms)` and register its look with `registerStatusLook`.
6. Write the folder's `README.md`. Start with a table of the kit, then explain the rules a
   League player wouldn't guess. The existing champions' READMEs show the format.
7. Add a suite at `tests/e2e/<id>.spec.ts`. `axeman.spec.ts` is a good one to copy.

In the game, every champion has its own name, such as Magic Boy instead of Ezreal.
Comments and READMEs can name the League champion a design follows, as the existing code
does.

## Adding a mob

Follow "Adding a mob" in the [README](README.md). Read the new enemy's registry entry with
`enemyEntry(id, mode)`, not `ENEMIES[id]`, so that difficulty modes can override it.

## Rules the code keeps

New code needs to keep these rules.

- **Time comes from the game clock.** Every gameplay deadline uses `run.clock`, never
  `Date.now()` or `setTimeout`, so pausing freezes everything.
- **Enemies have pips, not health.** `takeHit()` removes exactly one pip. Only the player
  has HP.
- **Gameplay changes state first.** Views and effects read that state afterwards and never
  change it.
- **Enemies aim at a cursor of their own.** An enemy aims at its `aim` point, which moves
  toward the player at `DIFFICULTY.aimSpeed`. No enemy aims straight at the player's
  position.
- **No engine code checks for a champion or a mode.** Each champion's behaviour lives in
  its kit, and a difficulty mode is only a set of numbers that the engine reads.
- **Phaser is trimmed.** `src/phaser.js` lists the parts of Phaser that the game ships.
  Any Phaser feature missing from that list, such as text or particles, fails at runtime
  until you add it.

## Tests

```bash
npm run typecheck            # always first
npm test                     # every suite, about 6 minutes
npx playwright test axeman   # one suite
```

The suites play the real game in headless Edge. Without Edge, run
`npx playwright install chromium` and set `PW_CHANNEL=chromium`.

- **Leave `PW_POINTER_LOCK` unset on a machine you're using.** The mouse-speed suite takes
  a real pointer lock, which grabs your OS cursor even when the browser is headless.
  `npm test` skips that suite unless you set the variable.
- **Don't save files in the project while the suites run.** A save makes the dev server
  reload the game, and the running suite fails.
- **Write thresholds in ms or px/s, never per frame.** The headless browser can run at
  more than 300 fps.
- **Run `npm run perf` if you change dependencies, `src/phaser.js`, `vite.config.ts` or
  the art built at boot.** It times how long the production build takes to load, and it
  fails if the bundle or the load time goes over budget.

If you use Claude Code, the repo includes a `verify-handsdiff` skill. It plays the game in
a browser and takes screenshots, so you can check a change as a player would see it.

## Pull requests

- Keep each pull request to one change, such as one champion, one mob or one fix.
- Make sure `npm run typecheck` and `npm test` pass.
- Write commit messages that say what changed in the game, such as "Axe Man's E slows for
  2s", not what changed in the code.
- For any visible change, include a screenshot or a short clip.
- For a balance change, say what felt wrong and what the new numbers fix.

## License

The project uses the MIT license, in [LICENSE](LICENSE). By opening a pull request, you
agree to license your contribution under it too.
