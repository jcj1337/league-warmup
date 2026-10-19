# Combat controls

The engine's controls are shared by every champion. Right-click ground to move. Right-click
(or left-click) an enemy to chase it and auto-attack, rooted through each windup. `A` then
left-click, or `T` alone, issues an attack move. `S` stops. `F` is Flash, a 190px blink
toward the cursor on a 20s cooldown.

## Sub-features

- `move`: right-click empty ground moves the player there. A new order overrides the old one, and the player stops at the destination.
- `stop`: `S` freezes the player in place and drops every order.
- `attack-order`: right-click or left-click an enemy. The player chases into range, the windup roots them, the auto lands (the enemy loses a pip, score rises), then they repeat.
- `attack-move-a`: `A` arms targeting (the range ring shows). A left-click attack-moves there. `Esc` disarms without opening the pause menu.
- `attack-move-t`: `T` issues the same order at the cursor with no second click. It acquires an enemy in range at once, or walks toward the cursor.
- `flash`: `F` blinks toward the cursor, at most 190px, and starts a 20s cooldown.
- `no-context-menu`: right-click never opens the browser menu.

## How to get to it (user POV)

- During any run, as any champion. The keys are the defaults, unless rebound in the pause menu.

## Driving it with hd

Preconditions:

- `DOCTOR OK`. `await hd.open()`, then `await hd.startRun()` (Magic Boy, Normal, Stage 1).
- Make the enemies predictable. Stage all arrivals, then park them on the right edge so click points stay clear:
  `hd.stage('arrive all, park at the right edge', () => { const g = window.__warmup.scene.getScene('GameScene'); g.director.arriveAllNow(); g.director.enemies.forEach((e, i) => { e.x = 1180; e.y = 120 + i * 80; e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Infinity; }); })`.
  Release them later with `e.nextPlanAt = 0`.

- **Move.** `const a = (await hd.game()).player`, `hd.rclick(300, 220)`, then `hd.waitGame(500)`. The player is more than 80px from `a` and `moving: true`. Then `hd.rclick(1000, 600)`, `hd.waitGame(200)`, `hd.rclick(200, 380)`, and wait for `!player.isMoving`. The player ends near (200,380), not (1000,600).
- **Stop.** `hd.rclick(1000, 360)`, `hd.waitGame(150)`, then `hd.press('s')`. `moving: false`, and the position is unchanged across a further `hd.waitGame(300)`.
- **Attack order.** Take an enemy from `(await hd.game()).enemies` and note its `hp` and `hud.score`. `hd.rclick(enemy)`, then `hd.waitFor(() => window.__warmup.scene.getScene('GameScene').attacks.state === 'windup')`. `player.rooted` is true during the windup. Within `hd.waitGame(1500)` that enemy's `hp` is lower (or it is gone) and `hud.score` is higher. Repeat with `hd.click(enemy)` (left) for the convenience path.
- **A-click.** `hd.press('a')`: `hud.attackMovePending === true`. Take `hd.shot('a-armed')`: the dotted range ring is visible. `hd.click(400, 500)` (left, empty ground): pending goes false and the player moves toward the point. Again with `hd.press('a')`, then `hd.press('Escape')`: pending false, `pauseMenu: false`, `paused: false`.
- **T.** Walk the player within range of a parked enemy (`hd.rclick` near it, then wait). `hd.move(enemy)` and `hd.press('t')`: `attacks.state` reaches `'windup'`, and `attackMovePending` stays false. With no enemy in range, `hd.press('t')` makes the player walk toward the cursor (`moving: true`).
- **Flash.** Note `p = (await hd.game()).player`. `hd.move(p.x + 300, p.y)`, then `hd.press('f')`. The player is now about 190px further right (±5), `hud.abilityCooldowns.flash.remaining` is between 19000 and 20000, and a second `hd.press('f')` does nothing. Take `hd.shot('flash')`.
- **No context menu.** Read only: `hd.read(() => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); window.__warmup.canvas.dispatchEvent(ev); return ev.defaultPrevented; })` returns `true`.

## Gotchas

- A right-click that lands on an enemy is an attack order, not a move. Pick empty ground, as smoke.spec.ts does by checking every enemy's distance.
- The chat panel (bottom left, `ui.chat.contains(x, y, 80)`) swallows clicks. An enemy under it can't be clicked.
- Enemies keep shooting while you test. Edge fire and spit can interrupt nothing, but they lower `hp`. Park them, or keep sections short.
- Arriving enemies hold their spot for 300ms, untargetable. Click them only after `arriveAllNow()` has had a frame.
- Flash is capped at 190px. A cursor closer than that blinks to the cursor, so aim more than 190px away to measure the cap.
- Never assume 16ms frames. Measure movement over `waitGame` and thresholds in px.
