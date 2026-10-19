# hands diff

hands diff is a browser trainer for League-style mechanics. You fight an endless run of
enemy waves while you practise positioning, orbwalking, dodging and aiming a champion's
kit. Play it at [handsdiff.com](https://handsdiff.com). The game explains its own
controls and rules.

The game is written in TypeScript on Phaser 3 and built with Vite. All the art is
original. The sprites are pixel maps in the source, and the game turns them into
textures when it boots.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck, then production build
npm test         # Playwright suites in headless Edge
npm run perf     # load-time benchmark
```

Without Edge, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.
`npm test` skips the mouse-speed suite unless you set `PW_POINTER_LOCK=1`, because that
suite takes a real pointer lock. On Windows the lock grabs your OS cursor even when the
browser is headless.

## Tuning

Gameplay numbers are in [src/config/balance.ts](src/config/balance.ts). Colours and
other presentation numbers are in [src/config/theme.ts](src/config/theme.ts). Each
champion keeps its own numbers in a `balance.ts` under [src/champions/](src/champions/).
You can change most values from the browser console while the game runs, for example
`__balance.ATTACK.range = 400`.

## Adding a mob

1. Add its config block to `balance.ts` and an entry in `ENEMIES` (`name`, `cost`,
   `unlockStage`, `weight`, `maxShare`, `pips`, ...).
2. Write its entity (`extends Enemy`) and its view, then add a line to `WaveDirector`'s
   `ARCHETYPES`.
3. Add its colour to `THEME.endScreen.sources` and its portrait to `EndScreen`'s
   `PORTRAITS`.

## Adding a champion

1. Create a folder `src/champions/<id>/` with `balance.ts`, `kit.ts`, `index.ts`,
   `motions.ts`, `art.ts` and a `README.md` that describes its kit.
2. Draw its ability icons in `src/game/art/sprites.ts` and add their keys to `TEX.icons`
   in `src/game/art/textures.ts`.
3. Add a line to `CHAMPIONS` in [src/champions/index.ts](src/champions/index.ts).
4. If it puts a status on enemies, apply the status with `enemy.applyStatus(id, now, ms)`
   and register its look with `registerStatusLook`.
5. Add a suite under `tests/e2e/`.

## Contributing

New champions are the contribution this project wants most. [CONTRIBUTING.md](CONTRIBUTING.md)
covers setup, the layout of the code, the rules it keeps, and what a pull request needs.

## License

MIT, for the code and the art alike. See [LICENSE](LICENSE).

hands diff isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot
Games or anyone officially involved in producing or managing Riot Games properties. Riot
Games, and all associated properties are trademarks or registered trademarks of Riot Games,
Inc. The MIT license covers this project's own work, not Riot's trademarks. The source
names the League champions its designs follow; the game itself uses its own names.
