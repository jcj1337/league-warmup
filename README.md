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
| `Q` | Quick-cast the skillshot toward the cursor — fires instantly, no click |
| Left-click on a target | Direct attack order (convenience) |
| `Esc` | Cancel a pending A / Q targeting mode |
| `R` / `Space` / button | Restart from the end screen |

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
