# Start screen

A page load opens on a title card over the first round, held at time 0. On the card the
player picks a champion (tiles, or Left / Right) and a difficulty (buttons, or Up / Down);
hovering either shows a tooltip; both picks save to the profile and rebuild the held round
without starting it. A click anywhere else, or any other key, starts the run on its
release, so that click or key is never also a move order or a cast.

## Sub-features

- `card-held`: a fresh page shows exactly `hands diff`, `DESIGNED BY QWER`, `TOP 50`, `CHOOSE YOUR CHAMPION`, `CLICK OR PRESS ANY KEY`, with the clock at 0.
- `champion-tooltip`: hovering a tile shows that champion's notes. Hovering picks nothing.
- `champion-pick`: clicking a tile frames it, saves it and rebuilds the held round as that champion.
- `champion-arrows`: Left / Right step through the tiles (wrapping) without starting.
- `mode-tooltip`: hovering a difficulty lists what it changes against Normal.
- `mode-pick`: clicking Easy / Normal / Hard, or Up / Down, picks and saves the mode.
- `picks-saved`: both picks survive a reload.
- `start-on-release`: a click on the card or any non-arrow key starts the run on release, never casting or moving.
- `return-to-select`: Return to Select (pause menu or end screen) brings the card back with a fresh held round (driven in [pause-menu](./pause-menu.md) and [run-and-end-screen](./run-and-end-screen.md)).

## How to get to it (user POV)

- Load the page. The card is the first thing shown.
- Choose Return to Select in the pause menu (`Esc`) or on the end screen.
- Restarts (`R` on the end screen, Restart Round) skip the card on purpose.

## Driving it with hd

Preconditions:

- `DOCTOR OK` on the harness port, and a fresh context (each `run` has one).
- The proven journey is `journeys/start-screen.mjs`. Run it as is, or copy it.

- **Card held.** `await hd.open()`, then `hd.game()` and `hd.startScreen()`. Expect `awaiting: true`, `clockMs: 0`, `startScreen.texts` being exactly the five strings above, and `champion: 'magicboy'`, `mode: 'normal'`. Take `hd.shot('card')`.
- **Champion tooltip.** For each id in `Object.keys(window.__champions)`, call `hd.move(await hd.tile(id))` then `hd.wait(100)`. `hd.startScreen().championTip[0]` equals `window.__champions[id].name`, with more lines after it. `hd.move(640, 690)` clears it to `null`, and `champion` is still `'magicboy'`.
- **Champion pick.** `hd.click(await hd.tile('snakelady'))`, then `hd.waitFor` until `getHudState().champion === 'snakelady' && isAwaitingStart`. `startScreen().champion` and `game().profile.champion` are `'snakelady'`, and `clockMs` is `0`.
- **Champion arrows.** `hd.press('ArrowRight')` frames the next id (`axeman` after `snakelady`), and `hd.press('ArrowLeft')` steps back. The run stays held throughout.
- **Mode tooltip and pick.** `hd.move(await hd.modeButton('hard'))` gives `modeTip[0] === 'Hard'` while `mode` stays `'normal'`. `hd.click(await hd.modeButton('hard'))` rebuilds with `getHudState().mode === 'hard'`. `hd.press('ArrowUp')` gives `'normal'` and `hd.press('ArrowDown')` gives `'hard'`. `game().profile.mode` follows each step.
- **Picks saved.** `await hd.reload()`. `startScreen()` shows `champion: 'snakelady'`, `mode: 'hard'`, the held round's `hud.champion`/`hud.mode` match, and `clockMs` is `0`.
- **Start on release (key).** `hd.move(900, 360)`, `hd.down('q')`, `hd.wait(150)`: still `awaiting`, and `hud.abilityCooldowns.q.remaining === 0`. `hd.up('q')`, then `hd.waitFor` the clock past 200ms: `startScreen: false`, Q still on 0 cooldown, `castingAbility: null`, and `read(() => window.__warmup.scene.getScene('UIScene').difficultyText.text) === 'HARD'`. Take `hd.shot('playing')`.
- **Start on release (click).** In a separate `hd.open()`: `const before = (await hd.game()).player`, then `hd.rclick(1100, 600)`. The run starts (`awaiting: false`, clock running), and the player has not moved from `before` (under 2px, `moving: false`). The card's click is not a move order.

## Gotchas

- A pick restarts GameScene (`hud.round` bumps). Wait for `getHudState().champion`/`.mode` to match before the next input, or the next press lands mid-rebuild.
- The arrow keys never start the run. Any other key does, on its *release*. `hd.press` releases at once, so use `down`/`up` to observe the held state.
- Tooltips follow the pointer. Move off the row (`hd.move(640, 690)`) before asserting they're gone.
- The card's text list is pinned by `tests/e2e/start.spec.ts`. If that suite's expectation changes, update this file and `journeys/start-screen.mjs` together.
- On a touch-only device the prompt reads `NEEDS A MOUSE AND KEYBOARD`. Headless Edge reports a fine pointer, so expect `CLICK OR PRESS ANY KEY`.
