# Warmup

A browser-based mechanical warm-up trainer for League-style ADC play. A run is a
gauntlet of 10 stages of authored enemy waves — quick early stages, a four-wave final
stage — built to drill four things at once: click-to-move positioning, kiting/orbwalking, dodging non-homing
projectiles, and aiming an Ezreal-flavoured ability kit.

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

## The run

A run fights **10 stages** in a fixed arena, and stages differ in length: Stages 1–3
are a single wave each, 4–6 have two waves, 7–9 three, and Stage 10 is a four-wave
final gauntlet — 22 waves in all. Each wave spawns a finite, authored group of up to
four enemies, each in its own spot. Killed enemies stay dead — nothing respawns
mid-wave, and a three-enemy wave really does leave the fourth spot empty. When the last
enemy of a wave dies, the arena clears (hostile shots still in the air fizzle), a short
breather runs — **800ms** between waves, **1200ms** between stages — and the next wave
spawns. Clearing a stage's last wave moves you to Wave 1 of the next stage. You stay in
control during the breather.

Progression comes only from clearing enemies: elapsed time never advances a wave or a
stage. A strong player reaches the hard encounters sooner; a struggling player keeps
practising the easier ones for longer.

The run ends when you **die**, or when you clear **Stage 10's final wave** (run complete).
The end screen shows the outcome, the stage and wave reached, waves cleared, run time,
score, kills by type, Q accuracy and the raw mechanical metrics. `R` restarts at
Stage 1 Wave 1.

Later stages are harder, not faster. Each stage row sets:

- **Waves** — how many (one early, four at Stage 10) and each one's roster. Stage 1 is
  basic targets only; Pursuers join in Stage 2 and take a growing share of later waves,
  with mixed waves throughout.
- **Enemy HP** — 100% for Stages 1–3, then +5% per stage (135% at Stage 10).
- **Enemy fire** — edge projectiles go from the calm opening to full strength at Stage 10.
- **Your base attack speed** — the auto cycle shortens from 700ms (Stage 1) to 420ms
  (Stage 10). Time spent in a stage never speeds it up.

B = basic target, P = Pursuer.

| Stage | Waves | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Enemy HP | Base auto cycle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 3B | — | — | — | 100% | 700ms |
| 2 | 1 | 3B + 1P | — | — | — | 100% | 669ms |
| 3 | 1 | 2B + 2P | — | — | — | 100% | 638ms |
| 4 | 2 | 3B + 1P | 2B + 2P | — | — | 105% | 607ms |
| 5 | 2 | 2B + 2P | 1B + 3P | — | — | 110% | 576ms |
| 6 | 2 | 1B + 3P | 2B + 2P | — | — | 115% | 544ms |
| 7 | 3 | 2B + 2P | 1B + 3P | 1B + 3P | — | 120% | 513ms |
| 8 | 3 | 2B + 2P | 1B + 3P | 1B + 3P | — | 125% | 482ms |
| 9 | 3 | 1B + 3P | 2B + 2P | 1B + 3P | — | 130% | 451ms |
| 10 | 4 | 2B + 2P | 1B + 3P | 2B + 2P | 4P | 135% | 420ms |

All of it is tuned in one place: `RUN` (enemy cap, breathers) and `STAGES` (per-stage
waves, HP, attack speed, enemy fire) in [balance.ts](src/config/balance.ts). Add or
remove waves in a stage by editing its `waves` list.

The HUD shows `STAGE 7 / 10   WAVE 2 / 3   ENEMIES 2` along the top — the wave total is
the current stage's own wave count — and the run time on the left. A large "STAGE N" banner marks each new stage, a smaller "WAVE N" each later
wave, and "WAVE CLEAR" / "STAGE CLEAR" fills the breather.

## The kit

| | Cast time | Cooldown | Range | Projectile speed | Damage |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700→420ms\* | 260 | 1150 px/s (homing) | 12 |
| Q | 165ms | 3000ms | 450 | 1250 px/s | 30 |
| W | 185ms | 6000ms | 450 | 1000 px/s | 0 on contact, **45 on detonation** |
| E | 210ms | 8000ms | 364 blink / 380 bolt acquisition | 1050 px/s bolt | 38 |
| F | instant | 20000ms | 325 | — | — |

\* the auto cooldown is set by the current stage (700ms at Stage 1, 420ms at Stage 10);
the windup is a quarter of it, and both shrink further as the passive stacks.

**Cast windows.** Q/W/E commit for a short window anchored to the auto windup
(auto 175 ≈ Q 165 < W 185 < E 210). The aim (Q/W) or destination (E) is frozen at
keypress, so moving the mouse mid-cast cannot re-aim the spell. The player is rooted
for the window and other ability inputs are ignored. Move, attack-move and attack orders
(right- or left-clicking an enemy) are **buffered** — the latest one wins — and replay the
instant the cast resolves, so no auto starts mid-cast. `S` discards a buffered order.
Cooldowns start at cast *start*, so the window never extends them. Flash stays instant,
deliberately.

**Passive.** Any landed ability hit — Q, the W mark landing, or the E bolt — grants a
stack (max 5, +10% attack speed each) and refreshes a shared 6s timer. All stacks
expire together. A W *detonation* grants none (the stack came when the mark landed),
and Flash never does.

```
cooldownMs = stageBaseCooldown / (1 + stacks * 0.10)
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

HP is multiplied by the current stage's enemy HP value. Pursuers first appear in
Stage 2. A Pursuer's swing only lands if you are still in reach when it
resolves — walking or blinking out during the telegraph makes it miss.

## Pause & settings

`Esc` opens a centred pause menu. The whole simulation freezes: movement, attack
timers, cast windows, cooldowns, mark durations, projectiles, wave breathers and the run
clock. Nothing fast-forwards on resume.

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

- `src/config/balance.ts` — gameplay tuning: the run (`RUN`, `STAGES`), ranges, timings, damage, keybinds, debug flags.
- `src/config/theme.ts` — **the look**: palette, unit/projectile/arena/HUD/cast styling.
- `src/game/scenes/GameScene.ts` — arena, input wiring, per-frame orchestration, round lifecycle.
- `src/game/scenes/UIScene.ts` — HUD, ability bar, pause menu, end screen (polls GameScene).
- `src/game/entities/` — `Player`, `Enemy` (abstract base), `Target`, `Pursuer`, `Projectile`, `AutoAttackMissile`.
- `src/game/systems/` — `GameClock`, `InputController`, `AttackSystem`, `CastSystem`,
  `AbilityCooldowns`, `SkillshotSystem` (Q+W), `BlinkSystem` (E+Flash), `PassiveSystem`,
  `WaveDirector` (stages, waves, breathers), `EnemyProjectileSystem`, `ScoreSystem`, `KitingMetrics`.
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
