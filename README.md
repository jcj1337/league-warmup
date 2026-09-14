# Warmup

A browser-based mechanical warm-up trainer for League-style ADC play. One 60-second
round in a fixed arena, built to drill four things at once: click-to-move
positioning, kiting/orbwalking, dodging non-homing projectiles, and aiming an
Ezreal-flavoured ability kit.

Gray-box by design: every visual is procedural Phaser geometry. No art, no audio,
no backend, no accounts.

```bash
npm install
npm run dev      # opens http://localhost:5173
npm run build    # typecheck + production build
npm test         # browser regression suite
```

### Tests

`npm test` runs the Playwright suites in [tests/e2e/](tests/e2e/) against the real game. It
starts the Vite dev server on port 5173 by itself (or reuses one you already have running)
and runs the suites one at a time in headless Microsoft Edge. Variants: `npm run test:headed`
(watch it play), `npm run test:debug` (Playwright inspector), `npm run test:report` (last HTML
report). Without Edge, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.

## Controls

| Input | Action |
| --- | --- |
| Right-click empty ground | Move order (cancels an uncommitted attack windup) |
| Right-click an enemy | Direct attack order: chase into range, stop, attack, repeat |
| `T` | Attack Move Click — the same order as A + left-click, issued at the cursor |
| `A` then left-click | Attack Move toward that point |
| Left-click an enemy | Direct attack order (convenience) |
| `Q` | Damage skillshot toward the cursor |
| `W` | Mark skillshot — marks on contact, detonates on your next hit |
| `E` | Blink toward the cursor, then a homing bolt |
| `F` | Flash: instant summoner blink, no damage |
| `S` | Stop: freeze in place, drop all orders |
| `Esc` | Back out of armed A-targeting, else open/close the pause menu |
| `R` / `Space` | Restart from the end screen |

Keys live in `KEYBINDS` in [balance.ts](src/config/balance.ts); `InputController` is
the only thing that reads them.

## The round

60 seconds. Four enemies are alive at any time; killing one starts a respawn timer
and its replacement's archetype is re-rolled against the current difficulty. The
round ends on the timer (survived) or at 0 HP (defeated), then the end screen shows
score, kills by type, Q accuracy and the raw mechanical metrics. `R` restarts.

Two independent difficulty ramps run during the round:

- **Enemy pressure** — flat for the first 22s, then curves up to full strength at
  54s. Drives projectile spawn rate, speed, size, damage and volley size, plus
  enemy HP and which archetypes spawn.
- **Your attack speed** — climbs from the first second toward its cap at 45s.

A **stage countdown** ("STAGE 4 IN 3…") appears before each difficulty step, then a
brief "STAGE N" banner.

## The kit

| | Cast time | Cooldown | Range | Projectile speed | Damage |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700→420ms\* | 260 | 1150 px/s (homing) | 12 |
| Q | 165ms | 3000ms | 450 | 1250 px/s | 30 |
| W | 185ms | 6000ms | 450 | 1000 px/s | 0 on contact, **45 on detonation** |
| E | 210ms | 8000ms | 364 blink / 455 bolt acquisition | 1050 px/s bolt | 38 |
| F | instant | 20000ms | 325 | — | — |

\* the auto windup and cooldown shrink as attack speed ramps and as the passive stacks.

**Cast windows.** Q/W/E commit for a short window anchored to the auto windup
(auto 175 ≈ Q 165 < W 185 < E 210). The aim (Q/W) or destination (E) is frozen at
keypress, so moving the mouse mid-cast cannot re-aim the spell. The player is rooted
for the window and other ability inputs are ignored. Move, attack-move and attack orders
(right- or left-clicking an enemy) are **buffered** — the latest one wins — and replay the
instant the cast resolves, so no auto starts mid-cast. `S` discards a buffered order. Cooldowns start at cast
*start*, so the window never extends them. Flash stays instant, deliberately.

**Passive.** Any landed ability hit — Q, the W mark landing, or the E bolt — grants a
stack (max 5, +10% attack speed each) and refreshes a shared 6s timer. All stacks
expire together. A W *detonation* grants none (the stack came when the mark landed),
and Flash never does.

```
cooldownMs = rampCooldown / (1 + stacks * 0.10)
```

**Cooldown refund.** A landed Q takes 750ms off the *remaining* cooldown of Q, W and
E — never Flash, and never by restarting a cooldown.

**W combo.** W marks on contact and deals nothing. The mark detonates for 45 the next
time that enemy is hit by an auto, Q or the E bolt, and lapses harmlessly after 4s.
E's bolt prefers a marked target, so W → E cashes the mark in.

## Attack cycle

```
attack command -> [ WINDUP ] -> RELEASE -> [ RECOVERY ] -> next attack
                   rooted,       missile    free to move
                   cancellable   spawns     (the orbwalk window)
                                    |
                                    +-> missile flies independently -> damage on impact
```

| State | HUD | Player looks like |
| --- | --- | --- |
| idle | `READY` | neutral blue dart |
| windup | `WINDUP` (amber) | golden charge ring contracts onto the body, leans at the target |
| release | — | ring lands, white burst snaps out, cyan bolt leaves, recoil kick |
| recovery | `RECOVERY` (green) | neutral again, free to move |

`windup + recovery == cooldownMs`. A ground move order or `S` during the windup
cancels the attack (no damage, cooldown refunded). Attack orders — right-clicking an
enemy, A-click, T — do **not** cancel a swing in progress. After release nothing
undoes the damage.

Orbwalk loop: `T` (or `A` + click) → auto fires → right-click away → repeat.

## Enemies

| | Look | HP | Behaviour |
| --- | --- | --- | --- |
| Basic target | compact red hexagon | 24 (2 autos) | drifts slowly, never attacks |
| Pursuer | large orange arrowhead | 60 (2.5×) | walks you down at 55% of your speed, melee swing with a 400ms telegraph |

Pursuers start appearing at difficulty 4 (~38s in) and grow to a 50% share by
difficulty 8. Enemy HP scales +5% per difficulty level after D3, capped at ×1.5.
A Pursuer's swing only lands if you are still in reach when it resolves — walking or
blinking out during the telegraph makes it miss.

## Pause & settings

`Esc` opens a centred pause menu. The whole simulation freezes: movement, attack
timers, cast windows, cooldowns, mark durations, projectiles, respawns, difficulty
and the round clock. Nothing fast-forwards on resume.

The menu has Resume, Restart Round, and three settings that write straight into the
`DEBUG` config: **Attack Range Indicator** (contextual / always / off), **Damage
Numbers**, **Debug Metrics**. It also lists the full control reference.

## Reading the field

Friend and foe differ by SHAPE, not just colour:

| Thing | Look |
| --- | --- |
| You | blue dart — the point is the facing indicator |
| Basic target | red hexagon, slowly rotating |
| Pursuer | large orange arrowhead, points at you |
| W-marked enemy | violet ring with orbiting ticks |
| Your auto | thin cyan bolt + streak, homes |
| Your Q | narrow green bolt, finite range, stops on the first enemy |
| Your W | fat violet orb |
| Your E bolt | hot-pink homing bolt |
| Flash | pale gold starburst |
| Enemy shot (dodge!) | fat amber circle, heavy dark rim, pulsing core |
| Move order | pip that collapses inward |
| Attack-move order | crosshair that blooms outward |
| Current attack target | rotating green brackets (amber while out of range) |

There is deliberately **no line drawn from the player to anything** — facing,
targeting and destination are communicated by markers and hull orientation. The
attack-range ring is contextual: it appears while `A` targeting is armed and flashes
briefly after `T`.

## Where things live

- `src/config/balance.ts` — gameplay tuning: ranges, timings, damage, spawn rates, keybinds, debug flags.
- `src/config/theme.ts` — **the look**: palette, unit/projectile/arena/HUD/cast styling.
- `src/game/scenes/GameScene.ts` — arena, input wiring, per-frame orchestration, round lifecycle.
- `src/game/scenes/UIScene.ts` — HUD, ability bar, pause menu, end screen (polls GameScene).
- `src/game/entities/` — `Player`, `Enemy` (abstract base), `Target`, `Pursuer`, `Projectile`, `AutoAttackMissile`.
- `src/game/systems/` — `GameClock`, `InputController`, `AttackSystem`, `CastSystem`,
  `AbilityCooldowns`, `SkillshotSystem` (Q+W), `BlinkSystem` (E+Flash), `PassiveSystem`,
  `EnemyDirector`, `EnemyProjectileSystem`, `DifficultyManager`, `ScoreSystem`, `KitingMetrics`.
- `src/game/ui/` — `AbilityBar`, `PassiveDisplay`, `PauseMenu`.

See [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) for how the systems actually work.

While playtesting, from the browser console:

```js
__warmup.scene.getScene('GameScene').getHudState()
__balance.ATTACK.range = 400          // most values apply on the next frame
__balance.BLINK_E.castTimeMs = 150    // retune a cast window live
```

## Attack range

`attackReach(targetRadius, playerRadius)` in [balance.ts](src/config/balance.ts) is the
single source of truth: the player's centre to the EDGE of the target's hitbox
(League's model). The drawn ring uses the same function, so a target centre inside the
ring is attackable. Set `ATTACK.rangeFromPlayerEdge = true` for edge-to-edge.
