# Run and end screen

A run is an endless series of stages, each a few waves of enemies. The HUD shows stage, wave,
enemies left, time, score, HP, level and the mode tag. Clearing a wave starts the next after a
short breather, and clearing a stage heals to full. The run ends only on death. The end
screen then says DEFEATED, with the stage reached, what killed you, the HP lost per source and
your progress against your best. It offers Play Again (`R` / `Space`) and Return to Select.
Every finished run is logged per champion and mode.

## Sub-features

- `hud-progress`: the HUD's stage / wave / enemies match the run (`getHudState()`). The mode tag names the mode.
- `wave-clear`: killing every enemy of a wave clears the arena and starts the next wave or stage after the breather. Time alone never advances the run.
- `death`: the player at 0 HP ends the run as `defeated`. `getRoundResult()` is set and the end screen shows.
- `end-screen`: title `DEFEATED`, then a taunt and the facts as plain lines: `STAGE REACHED`, `DIFFICULTY`, `TIME`, `SLAIN BY`, `LOST THIS STAGE`, `SCORE`, `SCORE FROM`, `KILLS`, `KILLS BY TYPE`, the kit's rows and `YOUR BEST`. A new best appends `NEW BEST` to the `STAGE REACHED` line, and the drawn screen frames the card in gold.
- `play-again`: `R`, `Space` or the `PLAY AGAIN  [R]` button starts a fresh run at Stage 1 Wave 1, 100 HP, with no start card.
- `end-select`: `RETURN TO SELECT` on the end screen brings back the held start card.
- `run-log`: each finished run is added to `__runs.list()`, and the best is kept per champion and mode.

## How to get to it (user POV)

- Play a run until you die. The end screen is the only way a run ends.
- From the end screen: `R`, `Space`, or either button.

## Driving it with hd

Preconditions:

- `DOCTOR OK`. `await hd.open()`, then `await hd.startRun()`. Note `const runsBefore = (await hd.read(() => window.__runs.list())).length` (0 in a fresh context).

- **HUD progress.** `(await hd.game()).hud` shows `stage: 1`, `wave: 1`, `enemiesRemaining > 0` and `mode: 'normal'`. `read(() => window.__warmup.scene.getScene('UIScene').difficultyText.text) === 'NORMAL'`. After `hd.waitGame(5000)` with no kills, it is still Stage 1 Wave 1.
- **Wave clear by play.** Stage `director.arriveAllNow()`. Then, for each enemy in `game().enemies`, `hd.rclick(enemy)` and `hd.waitFor` until it is gone (Stage 1 basics die in a few autos). Once `enemiesRemaining` reaches 0, `hud.wavePhase` becomes `'intermission'` (the breather), then `hud.stage === 2` (Normal's Stage 1 has one wave), and `hud.hp === hud.maxHp`. Take `hd.shot('stage-2')`.
- **Death.** Stage `hd.stage('hp to 1', () => { const g = window.__warmup.scene.getScene('GameScene'); g.player.hp = 1; g.player.lastHitAt = -Infinity; })`. Release parked enemies if you parked any, stand still, and `hd.waitFor(() => window.__warmup.scene.getScene('GameScene').getRoundResult() !== null, null, { timeout: 20000 })`. A real enemy hit kills. `game().result.outcome === 'defeated'` and `endScreen: true`.
- **End screen.** `hd.endScreen()`: `title === 'DEFEATED'`. `lines` match `/^STAGE REACHED\s+1 /`, `/^DIFFICULTY\s+NORMAL/`, `/^SLAIN BY\s+\S/` and `/^YOUR BEST\s+STAGE 1/`. A fresh profile's first run has `NEW BEST` on the `STAGE REACHED` line. Labels are padded to 16 characters (`row()` in `src/game/ui/EndScreen.ts`). Take `hd.shot('end-screen')` and look at it: the plain lines don't cover the drawn portrait, damage bars or progress track.
- **Run log.** `read(() => window.__runs.list()).length === runsBefore + 1`. The newest entry has the `stage`, `champion` and `mode` just played.
- **Play again.** `hd.press('r')`, then wait for `getRoundResult() === null`. `hud.hp === 100`, `stage === 1`, `wave === 1`, `endScreen: false` and `awaiting: false`. Repeat a death and use `hd.press('Space')`, then once more using `hd.click(await hd.button('end', 'PLAY AGAIN  [R]'))`.
- **Return to Select.** After another death, `hd.click(await hd.button('end', 'RETURN TO SELECT'), { hold: 120 })`. Expect `startScreen: true`, `awaiting: true` and `clockMs: 0`.

## Gotchas

- Death by live fire is random. At Stage 1 on Normal, a 1-HP player usually dies within seconds, but it can take longer. If the 20s wait times out, report that, then stage the lethal hit with `hd.stage('lethal edge-fire hit', () => window.__warmup.scene.getScene('GameScene').onPlayerHit(5, 'edgeFire'))`. Say that the death itself was staged. The end screen is still real.
- Reaching a deep stage by play takes minutes. To verify late-stage end-screen content, stage the stage index (`g.director.stageIndex = n - 1` before the death, as `endless.spec.ts` does) and label it.
- `PLAY AGAIN  [R]` has **two** spaces before `[R]`. `hd.button` matches labels exactly.
- `R` restarts only on the end screen. During play, `R` is the ultimate.
- Return to Select acts on press. Hold the click (`{ hold: 120 }`) so the release lands on the card without starting the run.
- Each run's best is per champion and mode. A fresh context has no history, so `NEW BEST` is expected on the first death only.
