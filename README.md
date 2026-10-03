# Warmup

A browser-based mechanical warm-up trainer for League-style ADC play. A run is a
gauntlet of 10 stages of authored enemy waves — quick early stages, a four-wave final
stage — built to drill four things at once: click-to-move positioning, kiting/orbwalking, dodging non-homing
projectiles, and aiming an Ezreal-flavoured ability kit.

Top-down pixel-art slime skirmish on a dark, quiet volcanic waste. All art is original and
repo-owned: small hand-authored pixel maps rasterised to textures at boot and drawn at an
integer 3× scale. No audio, no backend, no accounts.

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
final gauntlet — 22 waves in all. Each wave is a finite group of enemies (its mix
authored, its size set by the difficulty curve below) that arrive one at a time, in a
shuffled order: the first at once, each later one a short gap after the previous
(300ms ±⅓ at Stage 1, 160ms at Stage 10), on a random spot away from you. Only so many
can be on the field at once (6 at Stage 1, 13 at Stage 10); the rest wait for a slot. An arriving
enemy holds its spot for 300ms — untargetable, undamageable and inert — then joins the
fight. Killed enemies stay dead — nothing respawns mid-wave. When the last enemy of a
wave dies and nobody is still due to arrive, the arena clears (hostile shots still in the air fizzle), a short
breather runs — **400ms** between waves, **700ms** between stages — and the next wave
spawns. Clearing a stage's last wave moves you to Wave 1 of the next stage and **heals
25 HP** (never past full). You stay in control during the breather.

Progression comes only from clearing enemies: elapsed time never advances a wave or a
stage. A strong player reaches the hard encounters sooner; a struggling player keeps
practising the easier ones for longer.

The run ends when you **die**, or when you clear **Stage 10's final wave** (run complete).
The end screen shows the outcome, the stage and wave reached, waves cleared, run time,
score, kills by type, hits landed and W mark procs, Q accuracy and the raw mechanical
metrics. `R` restarts at
Stage 1 Wave 1.

Later stages are harder, not faster.

**The difficulty curve.** One threat level per stage, `T = 1.15^(stage − 1)` (+15% per
stage, compounding), drives every scaled number: `value = clamp(base × T^k, min, max)`.
The curves live in `DIFFICULTY` in [balance.ts](src/config/balance.ts); each mob's own
scaled stats live in its `scaling` block.

| | Stage 1 | Stage 5 | Stage 10 | Limit |
| --- | --- | --- | --- | --- |
| Enemies per wave (at least the authored size) | 4 | 7 | 14 | — |
| On the field at once | 6 | 8 | 13 | 30 |
| Gap between arrivals | 300ms | 227ms | 160ms | 60ms |
| Enemy move speed | ×1 | ×1.06 | ×1.13 | Pursuer ≤ 0.85 of yours |
| Spit / orb speed | ×1 | ×1.09 | ×1.21 | 650px/s |
| Enemy damage (swing, spit, Magus) | ×1 | ×1.12 | ×1.29 | — |
| Basics winding up a spit at once | 2 | 3 | 4 | 10 |
| Spit / dash / swing cooldown, Magus spell gap (ms) | 3000 / 5000 / 1200 / 1400 | 2759 / 4471 / 1103 / 1184 | 2484 / 3888 / 994 / 960 | min 1500 / 2500 / 800 / 700 |

Telegraphs (spit, dash, swing and Magus timings) and the 300ms arrival window are never
scaled. Edge fire keeps its own per-stage ramp. Your kit never scales.

Each stage row sets:

- **Waves** — how many (one early, four at Stage 10) and each one's **mix**. Stage 1 is
  basic targets only; Pursuers join in Stage 2 and take a growing share of later waves,
  with mixed waves throughout. The Magus joins in Stage 5, at most one per wave (the
  curve allows more from about Stage 13). A wave keeps its mix and grows to the curve's
  size, shared out by largest remainder (`WaveDirector.rosterFor`).
- **Enemy pips** — how many hits each enemy takes: basic 1 / 2 / 3 pips across Stages
  1–3 / 4–6 / 7–10 (capped at 3), Pursuer always one more (2 / 3 / 4), Magus the same as
  basic.
- **Authored sizes** run 3–4 enemies early, 4–5 mid, 5–6 late, with late waves swinging
  between basic-heavy crowds and Pursuer-heavy brawls; the curve grows them from there.
- **Enemy fire** — edge projectiles are an occasional positioning check, one shot at a
  time: every 4.5s at Stage 1, tightening to every 3s by Stage 10.
- **Your base attack speed** — the auto cycle shortens from 700ms (Stage 1) to 420ms
  (Stage 10). Time spent in a stage never speeds it up.

B = basic target, P = Pursuer, M = Magus. Each cell is what the wave **fields**; the
authored mix it grew from is in brackets.

| Stage | Waves | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Pips (B / P / M) | Base auto cycle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4B (3B) | — | — | — | 1 / 2 / 1 | 700ms |
| 2 | 1 | 4B + 1P (3B + 1P) | — | — | — | 1 / 2 / 1 | 669ms |
| 3 | 1 | 3B + 2P (2B + 2P) | — | — | — | 1 / 2 / 1 | 638ms |
| 4 | 2 | 5B + 1P (3B + 1P) | 4B + 2P (3B + 2P) | — | — | 2 / 3 / 2 | 607ms |
| 5 | 2 | 4B + 2P + 1M (2B + 1P + 1M) | 3B + 4P (2B + 3P) | — | — | 2 / 3 / 2 | 576ms |
| 6 | 2 | 6B + 2P (4B + 1P) | 4B + 3P + 1M (2B + 2P + 1M) | — | — | 2 / 3 / 2 | 544ms |
| 7 | 3 | 6B + 2P + 1M (3B + 1P + 1M) | 4B + 5P (2B + 3P) | 5B + 3P + 1M (3B + 2P + 1M) | — | 3 / 4 / 3 | 513ms |
| 8 | 3 | 4B + 7P (2B + 3P) | 8B + 2P + 1M (4B + 1P + 1M) | 5B + 5P + 1M (2B + 3P + 1M) | — | 3 / 4 / 3 | 482ms |
| 9 | 3 | 7B + 4P + 1M (3B + 2P + 1M) | 5B + 7P (2B + 3P) | 5B + 6P + 1M (2B + 3P + 1M) | — | 3 / 4 / 3 | 451ms |
| 10 | 4 | 11B + 2P + 1M (4B + 1P + 1M) | 7B + 7P (3B + 3P) | 11B + 2P + 1M (4B + 1P + 1M) | 6B + 7P + 1M (2B + 3P + 1M) | 3 / 4 / 3 | 420ms |

All of it is tuned in one place: `RUN` (breathers, arrival window), `DIFFICULTY` (the
curve), `TARGETS` / `PURSUER` / `MAGUS` (enemy behaviour and per-mob scaling) and `STAGES`
(per-stage wave mixes, `enemyPips`, attack speed, enemy fire) in [balance.ts](src/config/balance.ts). Add or
remove waves in a stage by editing its `waves` list.

The HUD shows `STAGE 7 / 10   WAVE 2 / 3   ENEMIES 2` along the top — the wave total is
the current stage's own wave count, and ENEMIES counts everything left in the wave,
including enemies still to arrive — the run time on the left, and `APM` on the right
(every key press and mouse-button press, bound or not — key auto-repeat and mouse movement
excluded — per minute over a rolling 30s window, divided
by at least 10s early on; informational only). A large "STAGE N" banner marks each new stage, a smaller "WAVE N" each later
wave, and "WAVE CLEAR" / "STAGE CLEAR" fills the breather.

A small system-message feed sits bottom-left, above the HP plate. A run opens with
"Welcome to qwer's Backyard!" and "Mission 1: Clear 1 wave."; each new stage is briefed as
a Mission using its configured wave count (the last is the "Final mission"), and clearing
a stage's last wave posts "Mission N complete!". Nothing else is announced. `Z` toggles
the feed between light (translucent) and dark (near-opaque) mode instantly; left-drag its
bottom border to move it anywhere on screen. Clicks on it never reach the game. Position
and mode survive restarts; messages start fresh.

## The kit

| | Cast time | Cooldown | Range | Projectile speed | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700→420ms\* | 260 | 1150 px/s (homing) | 1 |
| Q | 165ms | 3000ms | 450 | 1250 px/s | 1 |
| W | 185ms | 6000ms | 450 | 1000 px/s | 0 on contact, **+1 on detonation** |
| E | 210ms | 8000ms | 310 blink / 380 bolt acquisition | 1050 px/s bolt | 1 |
| F | instant | 20000ms | 275 | — | — |

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

**W combo.** W marks on contact and removes no pips. The next auto, Q or E bolt hit on
that enemy removes its own pip plus one more from the detonation (W → Q = 2 pips); an
unused mark lapses harmlessly after 4s.
E's bolt prefers a marked target, so W → E cashes the mark in.

## Attack cycle

```
attack command -> [ WINDUP ] -> RELEASE -> [ RECOVERY ] -> next attack
                   rooted,       missile    free to move
                   cancellable   spawns     (the orbwalk window)
                                    |
                                    +-> missile flies independently -> 1 pip on impact
```

| State | Player looks like |
| --- | --- |
| idle | slime breathes gently |
| windup | gold dotted ring contracts onto the body; the slime hunkers down, narrows its eyes and leans at the target |
| release | ring lands, slime pops up, flash + sparks at its edge, cyan bolt leaves, recoil kick |
| recovery | neutral again, free to move |

`windup + recovery == cooldownMs`. A ground move order or `S` during the windup
cancels the attack (no hit, cooldown refunded). Attack orders — right-clicking an
enemy, A-click, T — do **not** cancel a swing in progress. After release nothing
undoes the hit.

Orbwalk loop: `T` (or `A` + click) → auto fires → right-click away → repeat.

## Enemies

| | Look | Pips | Behaviour |
| --- | --- | --- | --- |
| Basic target | red slime with glowing eyes and a fanged snarl | 1 / 2 / 3 | always aggroed: walks toward you, then hovers 150–230px away inside your attack range, sidestepping around you. From Stage 2 it **spits** (below) |
| Pursuer | larger purple slime with devil horns | basic + 1 | walks you down at 55% of your speed; melee swing for **25** (a quarter of your HP) after a 400ms telegraph. From Stage 4 it **dashes** (below) |
| Magus | tall slate slime in a brass crest and mask, rune tablets floating at its sides | same as basic | artillery caster with a Xerath-style kit (below); holds 360–480px from you, backs off at 50% of your speed, never moves while casting |

Pips come from the current stage's `enemyPips` row. Pursuers first appear in
Stage 2, the Magus in Stage 5. A Pursuer's swing only lands if you are still in reach when it
resolves — walking or blinking out during the telegraph makes it miss. A Pursuer
never starts a swing while you are stunned.

### Basic spit and Pursuer dash

**Spit** (basics, Stage 2+). Rooted for 350ms (hunkered, mouth glowing, a short red
aim tick on the ground), then a small dark-red glob at where you are *at that
instant*; it never re-aims. 5 damage, 280px/s, range 400, every ~3s per basic
(±20%, so a group never fires in unison). A basic needs one of the **attack tokens**
(`DIFFICULTY.attackTokens`: 2 at Stage 1, 4 at Stage 10) to start its windup, so only
that many are ever winding up at once and a crowd takes turns. A basic killed
mid-windup frees its token.

**Dash** (Pursuers, Stage 4+). From 110–240px away (outside its swing reach), never
at a stunned player: it crouches for 350ms while its path — **locked** at the start —
glows red on the ground, then lunges 170px in 140ms, stopping early once you are in
reach. The dash deals no damage; it closes the gap so the normal 400ms swing becomes a
threat. Sidestep the strip and it lunges past you. Cooldown 5s from the start of a dash.

Spit cooldown, dash cooldown and projectile speed scale with the stage (see the curve
above). Tuned in `TARGETS.spit`, `PURSUER.dash` and `DIFFICULTY` in
[balance.ts](src/config/balance.ts).

### The Magus

One spell at a time, at least 1.4s apart. Every spell is a telegraph: a zone hits
only if you are inside it at the instant it lands.

| Spell | Telegraph | Hit |
| --- | --- | --- |
| Lance (Q) | rooted, it charges for 900ms while a dotted line tracks you; the line then **locks** as a red strip and lands 450ms later | 18 |
| Eye (W) | a red circle placed on you, landing after 700ms | 10 on the edge; **18 + 40% slow for 1s** if your centre is in the white sweet spot |
| Orb (E) | a 300ms windup, then a visible white-gold orb | 8 + a **stun** of 250ms (point-blank) to 750ms (full range) |
| Rite (R) | once per life, when it is the **last enemy left in the wave**: rooted, it calls three 70px circles onto you, 800ms apart | 15 each |

Inside 300px it answers with the Orb first. Otherwise it picks at random among the
spells whose reach covers you. Spells it has already placed still land if it dies;
a Lance still charging dies with it. Clearing the wave fizzles everything pending.
All of it is tuned in `MAGUS` in [balance.ts](src/config/balance.ts), including
`aimLeadMs` (0 = it aims where you are; raise it to make it lead your movement).

**Stunned** means: no movement, no autos, no Q/W/E, and no Flash. An uncommitted
auto windup is cancelled and a Q/W/E cast window is interrupted, both with their
cooldowns refunded. Move / attack / attack-move orders issued while stunned are
held (latest wins) and replay the instant it ends; `S` discards a held order. Your
current move or attack order resumes afterwards.

## Pause & settings

`Esc` opens a centred pause menu. The whole simulation freezes: movement, attack
timers, cast windows, cooldowns, mark durations, projectiles, wave breathers and the run
clock. Nothing fast-forwards on resume.

The menu has Resume, Restart Round, and two settings that write straight into the
`DEBUG` config: **Attack Range Indicator** (contextual / always / off) and **Damage
Numbers** (the "-1" pip-loss pops). It also lists the full control reference.

## Reading the field

Friend and foe differ by silhouette, not just colour. Every unit has a shadow and a
compact health bar under its feet — a green bar for you, and for enemies a fixed-width
red bar split into one equal segment per pip (`[███|███|   ]`), so tougher enemies get
more dividers, not a wider bar; an arriving enemy shows only a closing ring on its spot. Units lower on the
screen draw in front. The ground is low-contrast ash with a few cracks and dim ember
seams; the handful of basalt rocks and dead shrubs are decoration only — no collision —
stay out of the HUD strips and always draw beneath combatants.

| Thing | Look |
| --- | --- |
| You | friendly blue slime with a smile; its face turns toward where you move or aim |
| Basic target | red slime, same family: angry brows, glowing yellow eyes, fangs |
| Basic spit | hunkers down with a glowing mouth and a short dotted red aim tick; the glob is a small dark-red blob, smaller and darker than the orange fireballs |
| Pursuer | bigger horned purple slime; rears up with white-hot eyes, flashes `!` and warms the ground red across its reach during the telegraph, then slams flat |
| Pursuer dash | crouches low with white-hot eyes while a red strip shows its locked path, then lunges trailing purple afterimages |
| Magus | tall slate slime, brass crest and mask with burning eye slits, two brass rune tablets bobbing at its sides; casting, it draws up tall, the tablets rise and flare, and energy gathers over its crest |
| Magus zones | red ground edged in gold dots: a strip filling from the Magus outward (Lance), a disc with a ring closing inward and a white sweet spot (Eye / Rite) |
| Magus orb | white-gold crackling spark with a gold trail |
| Stunned / slowed | gold stars circling over your head / a gold dotted ring at your feet |
| W-marked enemy | violet rune bobbing overhead + magenta dotted ring at its feet (blinks as it lapses) |
| Your auto | small cyan bolt with a short trail, homes |
| Your Q | sharp teal bolt, finite range, stops on the first enemy |
| Your W | violet/magenta orb with a heavy trail |
| Your E bolt | pink/blue arcane bolt |
| Flash | gold starburst at both ends |
| Enemy shot (dodge!) | orange-red fireball (bigger at later stages) |
| Move order | cream diamond that collapses inward |
| Attack-move order | red crosshair that blooms outward |
| Current attack target | pixel corner brackets, green (amber while out of range) |

There is deliberately **no line drawn from the player to anything** — facing,
targeting and destination are communicated by markers and sprite facing. The attack-range ring (dotted) is contextual: it appears while `A` targeting
is armed and flashes briefly after `T`.

## Where things live

- `src/config/balance.ts` — gameplay tuning: the run (`RUN`, `STAGES`), ranges, timings, damage, keybinds, debug flags.
- `src/config/theme.ts` — **the look**: `PALETTE` (raw colours) and `THEME` (sprite scale, depth bands, effect timings, HUD styling). Nothing in it affects gameplay.
- `src/game/art/` — original pixel sprites as text pixel maps (`sprites.ts`), the 5×7 HUD font (`glyphs.ts`, `font.ts`), and `textures.ts`, which rasterises them once and owns every texture key. Real PNG art can later replace a sprite key-for-key.
- `src/game/view/` — the read-only view layer: `PlayerView`, `EnemyView` / `PursuerView`, `MagusView`, `HostileSpellView` (Magus zones), `ProjectileView` + `projectileArt`, `Fx` (pooled particles, dotted rings, damage numbers), `PixelBar` (health bars), `Battlefield` (painted ground + props) and `pixelDraw` helpers.
- `src/game/scenes/GameScene.ts` — input wiring, per-frame orchestration, round lifecycle.
- `src/game/scenes/UIScene.ts` — HUD, ability bar, pause menu, end screen (polls GameScene).
- `src/game/entities/` — `Player` (incl. stun / slow status), `Enemy` (abstract base), `Target`, `Pursuer`, `Magus`, `Projectile`, `AutoAttackMissile`.
- `src/game/systems/` — `GameClock`, `Difficulty` (the curve), `InputController`, `AttackSystem`, `CastSystem`, `AttackTokens` (enemy turn-taking),
  `AbilityCooldowns`, `SkillshotSystem` (Q+W), `BlinkSystem` (E+Flash), `PassiveSystem`,
  `WaveDirector` (stages, waves, breathers), `EnemyProjectileSystem`, `HostileSpellSystem`
  (Magus zones and orbs, basic spit), `ScoreSystem`, `KitingMetrics`.
- `src/game/ui/` — `AbilityBar`, `PassiveDisplay`, `PauseMenu`.

See [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) for how the systems actually work.

While playtesting, from the browser console:

```js
__warmup.scene.getScene('GameScene').getHudState()
__balance.ATTACK.range = 400          // most values apply on the next frame
__balance.BLINK_E.castTimeMs = 150    // retune a cast window live
__theme.player.attack.windupLeanPx    // presentation values (read-only look config)
```

## Attack range

`attackReach(targetRadius, playerRadius)` in [balance.ts](src/config/balance.ts) is the
single source of truth: the player's centre to the EDGE of the target's hitbox
(League's model). The drawn ring uses the same function, so a target centre inside the
ring is attackable. Set `ATTACK.rangeFromPlayerEdge = true` for edge-to-edge.
