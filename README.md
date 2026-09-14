# Warmup — V0.1

A gray-box mechanical warm-up arena: click-to-move, kite/basic-attack targets, land a linear Q,
and dodge incoming projectiles for 60 seconds.

```bash
npm install
npm run dev      # opens http://localhost:5173
npm run build    # typecheck + production build
```

## Controls

| Input | Action |
| --- | --- |
| Right-click empty ground | Move order (cancels an uncommitted attack windup) |
| Right-click an enemy | Direct attack order: chase into range, stop, attack, keep attacking |
| `T` | Attack Move Click: same order as A + left-click, issued at the cursor |
| `A` then left-click | Attack Move toward that point; attacks the first enemy in range |
| `S` | Stop: freeze in place, drop all pending orders |
| `Q` | Quick-cast damage skillshot toward the cursor |
| `W` | Quick-cast mark skillshot — marks on contact, detonates on your next hit |
| `E` | Blink toward the cursor, then a homing bolt (prefers a W-marked enemy) |
| `F` | Flash: summoner blink, no damage |
| Left-click on a target | Direct attack order (convenience) |
| `Esc` | Back out of armed A-targeting, or open/close the pause menu |
| `R` / `Space` / button | Restart from the end screen |

The attack-range ring is **contextual**: it appears while `A` targeting is armed and
flashes briefly after `T`, rather than sitting on screen permanently. Change
`DEBUG.attackRangeDisplay` (or the pause menu) for `always` / `off`.

Q lives in the bottom-centre ability bar, with a radial cooldown sweep and a
countdown. The bar is laid out for N slots and re-centres itself, so W/E/R can be
added later without moving anything.

Keys live in `KEYBINDS` in [balance.ts](src/config/balance.ts); `InputController`
is the only thing that reads them.

## Where things live

- `src/config/balance.ts` — gameplay tuning: ranges, timings, damage, spawn rates.
- `src/config/theme.ts` — **the look**: palette, unit/projectile/arena/HUD styling.
- `src/game/scenes/GameScene.ts` — arena, input wiring, per-frame orchestration, round end.
- `src/game/scenes/UIScene.ts` — HUD + end screen (polls GameScene, so restarts never break it).
- `src/game/entities/` — `Player`, `Target`, `Projectile` (one straight-line missile class for both Q and enemy shots).
- `src/game/systems/` — `InputController` (keys/mouse -> commands), `AttackSystem`
  (windup / fire / recovery, chase, attack move), `KitingMetrics` (mechanical counters),
  `SkillshotSystem` (Q), `EnemyProjectileSystem` (dodge pressure),
  `DifficultyManager` (the ramp), `ScoreSystem`.

While playtesting, the live game is on `window.__warmup`:

```js
__warmup.scene.getScene('GameScene').getHudState()
__balance.ATTACK.range = 400   // most values apply on the next frame
```

## Attack cycle

```
attack command -> [ WINDUP ] -> RELEASE -> [ RECOVERY ] -> next attack
                   rooted,       missile    free to move
                   cancellable   spawns     (the orbwalk window)
                                    |
                                    +-> missile flies independently -> damage on impact
```

What you see maps 1:1 onto the state machine:

| State | HUD | Player looks like |
| --- | --- | --- |
| idle | `READY` | neutral blue circle |
| windup | `WINDUP` (amber) | golden charge ring contracts onto the body, player leans + stretches at the target, brightens toward white |
| release | — | charge ring lands, white ring snaps outward, cyan bolt leaves, recoil kick |
| recovery | `RECOVERY` (green) | neutral again, free to move |

The charge ring is the precise cancel cue: while it is still shrinking you can
cancel; the frame it reaches the body, the auto is gone.

## The kit

| | Cast time | Cooldown | Range | Speed | Damage |
| --- | --- | --- | --- | --- | --- |
| Q | instant | 3000ms | 450 | 1250 px/s | 30 |
| W | **250ms** | 6000ms | 450 | 1000 px/s | 0 on contact, **45 on detonation** |
| E | **250ms** | 8000ms | 364 blink / 455 bolt acquisition | 1050 px/s bolt | 38 |
| F | instant | 20000ms | 325 | instant | — |

**Cast windows.** W and E commit: the aim (W) / destination (E) is frozen at
keypress, the player is rooted for the window, and other ability inputs are
ignored until it resolves. Move and attack-move orders issued mid-cast are
**buffered** and replay the instant the cast lands. Cooldowns start at cast
*start*, so the window never extends them. Q and Flash stay instant by design.

**Passive.** Any landed ability hit — Q, the W mark landing, or the E bolt —
grants a stack (max 5, +10% attack speed each) and refreshes the shared 6s
timer. A W *detonation* grants none (the stack came when the mark landed), and
Flash never does.

```
cooldownMs = rampCooldown / (1 + stacks * 0.10)
```

**Cooldown refund.** A landed Q takes 750ms off the *remaining* cooldown of
Q, W and E — never Flash, and never by restarting a cooldown.

**W combo.** W marks on contact and deals nothing. The mark detonates for 45 the
next time that enemy is hit by an auto, Q or the E bolt, and lapses harmlessly
after 4s. E's bolt prefers a marked target, so W → E cashes the mark in.

## Attack speed scaling

The attack cycle shortens over the round, on its own ramp (separate from the
enemy-projectile ramp, so the arena can stay calm while your hands speed up):

```
cooldown = lerp(baseCooldownMs, minCooldownMs, (elapsed / attackSpeedRampSeconds) ^ attackSpeedCurve)
windup   = max(minWindupMs, cooldown * windupPercent)
```

Because the windup is a RATIO of the live cooldown, the animation, the cancel
window and the cycle all shrink together — `AS 1.43/s` in the HUD panel shows
the current rate. `ATTACK.attackSpeedScaling = false` pins it at base speed.

The animation is a pure read of `AttackSystem.windupProgress` — visuals never
drive timing, so replacing the animation cannot break orbwalking. Missile travel
time never gates the next attack; the cooldown runs from windup start.

### Reading the field

Friend and foe differ by SHAPE, not just colour, so they stay legible at speed:

| Thing | Look |
| --- | --- |
| You | blue dart — the point is the facing indicator |
| Enemies | red hexagons, slowly rotating, dark rim |
| Your auto attack | thin cyan bolt + streak, homes to its target |
| Your Q | narrow green bolt, finite 450px range, stops on the first enemy |
| Pursuer (from stage 4) | large orange arrowhead that walks you down and swings in melee |
| Enemy shot (dodge!) | fat amber circle, heavy dark rim, pulsing core |
| Move order | pip that collapses inward at the destination |
| Attack-move order | crosshair that blooms outward |
| Current target | rotating green brackets (amber while out of range) |

There is deliberately **no line drawn from the player to anything** — facing,
targeting and destination are all communicated by markers and the hull's
orientation instead.

`windup + recovery == ATTACK.cooldownMs`. A ground move order or Stop during the
windup cancels the attack (no damage, cooldown refunded); after it fires, nothing
undoes the damage and the cooldown keeps running. Attack orders — right-clicking
an enemy, A-click, T — do NOT cancel a swing in progress, so spamming T while
kiting never starves your autos.

Orbwalk loop: `T` (or `A` + click) -> auto fires -> right-click away -> repeat.

## Attack range

`attackReach(targetRadius, playerRadius)` in [balance.ts](src/config/balance.ts)
is the single source of truth: the player's center to the EDGE of the target's
hitbox (League's model). The drawn ring uses the same function, so its radius is
exactly the locus of attackable target centers — a target center inside the ring
is attackable. Set `ATTACK.rangeFromPlayerEdge = true` for edge-to-edge instead.
