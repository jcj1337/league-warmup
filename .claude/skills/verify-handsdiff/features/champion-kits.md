# Champion kits

Each champion's Q / W / E / R does something different, aimed at the cursor: Magic Boy's
skillshots and blink, Snake Lady's poison zones and fang, Axe Man's catchable axes. A cast
roots the player through its cast window, starts the slot's cooldown, and moves the
champion's counters, which `kit.stats()` exposes without the harness needing to know who is
playing. Each champion's README (`src/champions/<id>/README.md`) has the full table of
ranges, cast times and cooldowns.

## Sub-features

- `magicboy-q`: a linear bolt toward the cursor that stops on the first enemy (−1 pip) and dies at 450px.
- `magicboy-w`, `magicboy-e`, `magicboy-r`: a mark cashed in by the next pip (`markProcs`), a 225px blink plus a bolt, and a global piercing wave (2 pips to the first enemy, 1 to each after).
- `snakelady-q`, `snakelady-w`: ground spells at the cursor (Q within 275, W within 250) that poison (`poisonTicks`).
- `snakelady-e`: a fang at the enemy under the cursor within 250 (`fangs`), 2 pips on a poisoned one (`fangsOnPoisoned`).
- `snakelady-r`: an 80° cone that stuns enemies facing her (`gazeStuns`).
- `axeman-q`: readies a spinning axe (`kit.held`). The next auto throws it for 2 pips (`axesThrown`), and it lands near him. Walking onto it catches it (`axesCaught`) and resets W.
- `axeman-e`, `axeman-r`: a short throw that shoves (`eHits`), and axes down a line and back, recalled by pressing R again (`rHits`).
- `cooldowns`: every cast sets `hud.abilityCooldowns.<slot>.remaining > 0`, and a press on cooldown is a no-op.

## How to get to it (user POV)

- Pick the champion on the start screen (tile click or arrows), start the run, and press Q / W / E / R with the cursor where the spell should go.

## Driving it with hd

Preconditions:

- `DOCTOR OK`. `await hd.open()`, `hd.click(await hd.tile('<id>'))`, then wait for `getHudState().champion === '<id>'`, then `await hd.startRun()`.
- One deterministic target. Stage it and log it:
  `hd.stage('player mid-arena, one frozen 9999-pip target 200px right, rest parked', () => { const g = window.__warmup.scene.getScene('GameScene'); g.director.arriveAllNow(); g.attacks.cancel(); g.player.x = 640; g.player.y = 360; g.player.stop(); const [t, ...rest] = g.director.enemies; t.x = 840; t.y = 360; t.hp = 9999; t.goalX = t.x; t.goalY = t.y; t.nextPlanAt = Infinity; rest.forEach((e, i) => { e.x = 1180; e.y = 120 + i * 80; e.goalX = e.x; e.goalY = e.y; e.nextPlanAt = Infinity; }); })`.
  Read the counters with `(await hd.game()).kit`, and the target's pips with `(await hd.game()).enemies`.

- **Magic Boy Q.** `hd.move(840, 360)` then `hd.press('q')`. `hd.waitFor(() => { const g = window.__warmup.scene.getScene('GameScene'); return g.kit.qFired >= 1 && g.projectiles.missilesInFlight === 0; })`. `kit.qHit === 1`, the target is at 9998, and `hud.abilityCooldowns.q.remaining > 0`. A second `hd.press('q')` leaves `qFired` at 1. Take `hd.shot('q-hit')`.
- **Magic Boy R.** `hd.move(840, 360)` then `hd.press('r')`. The player is rooted about 1s (`hud.castingAbility === 'r'`), then `kit.rFired === 1` and `kit.rHits >= 1`.
- **Snake Lady Q / E.** With the target 200px away (inside 275), `hd.move(840, 360)` then `hd.press('q')`. After `hd.waitGame(1500)`, `kit.poisonTicks > 0` and the target lost pips. Then, cursor still on the target, `hd.press('e')`: `kit.fangs === 1` and `kit.fangsOnPoisoned === 1`.
- **Snake Lady W.** `hd.move(840, 360)` then `hd.press('w')`. `hud.abilityCooldowns.w.remaining > 0`, and `kit.poisonTicks` grows while the target stands in the clouds.
- **Axe Man Q → throw → catch.** `hd.press('q')`: `read(() => window.__warmup.scene.getScene('GameScene').kit.held) === 1`. `hd.rclick(840, 360)` (attack order): `kit.axesThrown === 1` and the target lost 2 pips. Read the landing spot with `read(() => window.__warmup.scene.getScene('GameScene').kit.drops.map((d) => ({ x: d.x, y: d.y, state: d.state })))`, then `hd.rclick(drop)` before it lands. `kit.axesCaught === 1`, and `hud.abilityCooldowns.w.remaining === 0`.
- **Axe Man E / R.** `hd.move(840, 360)` then `hd.press('e')`: `kit.eHits === 1`, and the target moved off its spot (shove). `hd.press('r')`, then `hd.press('r')` again mid-flight: `kit.rHits >= 1` and the axes come back early.

## Gotchas

- Cast windows root the player, and other ability presses during a window are ignored (Flash still works). Wait for `hud.castingAbility === null` before the next cast.
- Snake Lady's E needs the enemy **under** the cursor, not just near it. Her Q and W are clamped to their range, so a cursor beyond 275 / 250 lands short.
- Snake Lady's R stuns only enemies whose heading faces her. A frozen staged target may not face her. See `tests/e2e/snakelady.spec.ts` for how that suite sets the heading, and stage the same, labelled.
- Axe Man's Q and W are `quick`: they never cancel an auto. With both hands full, Q does nothing and is not spent.
- Ability haste shortens cooldowns per level. Compare cooldowns to `hud.abilityCooldowns.<slot>.total`, not to the README's level-1 numbers.
- The suites `kit.spec.ts`, `snakelady.spec.ts` and `axeman.spec.ts` hold the exact numbers. When a recipe here disagrees with them, the suite is the reference.
