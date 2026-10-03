# Warmup

A browser-based mechanical warm-up trainer for League-style ADC play. A run is an
endless gauntlet of enemy waves that grows until it overwhelms you — your score is the
stage you reach — built to drill four things at once: click-to-move positioning,
kiting/orbwalking, dodging non-homing projectiles, and aiming an Ezreal-flavoured ability kit.

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

The run is **endless**: it ends only when you die. Stages 1–5 are a hand-written intro
(single waves for 1–3, two waves for 4–5); every later stage is **generated**, three waves
each, forever. Each wave is a finite group of enemies that arrive one at a time, in a
shuffled order: the first at once, each later one a short gap after the previous (250ms
±⅓ at Stage 1, 133ms at Stage 10), on a random spot away from you. From about Stage 9
they arrive in **packs** (2, later more) that land together on one side of the arena.
Only so many can be on the field at once (8 at Stage 1, 17 at Stage 10, up to 40); the
rest wait for a slot. An arriving enemy holds its spot for 300ms — untargetable,
undamageable and inert — then joins the fight. Killed enemies stay dead — nothing
respawns mid-wave. When the last enemy of a wave dies and nobody is still due to
arrive, the arena clears (hostile shots still in the air fizzle), a short breather runs
— **400ms** between waves, **700ms** between stages — and the next wave spawns.
Clearing a stage's last wave moves you to Wave 1 of the next stage and **heals you to
full**: every stage starts from 100 HP, so the run ends at the first stage you can't
survive. You stay in control during the breather.

**Contact damage.** An active enemy whose body touches yours bumps you: basic 6, Pursuer
10, Magus 6 at Stage 1, scaled by `DIFFICULTY.contactDamage` (×1.88 at Stage 10, ×3.77 at
20). Each enemy can bump you at most once per 800ms (`CONTACT.cooldownMs`), on top of the
usual 250ms invulnerability after any hit. Enemies don't walk into you on purpose:
contact comes from pathing through the crowd or getting boxed in. Arriving enemies are
inert and never bump.

**Levels.** Kills give XP (basic 1, Pursuer 2, Magus 3); 10 XP reaches level 2, and each
later level needs 20% more, up to level 18. Each level gives **+5 ability haste** (Q / W
/ E cooldowns ÷ (1 + haste/100): ×0.69 at level 10, ×0.54 at 18; Flash is a summoner
and never changes) and **+6% attack speed** on the base auto cycle (700ms at level 1,
455ms at 10, 347ms at 18). From **level 9**, Q is ranked up and each Q hit removes 2
pips. The XP curve is calibrated so your level tracks the stage: about level 11
entering Stage 10, level 18 around Stage 17. The vitals plate shows `LV n` and a slim
gold XP bar; a level-up flashes a gold ring and `LEVEL n` over your slime. Tuned in
`LEVELS` and each mob's `xp` in [balance.ts](src/config/balance.ts).

Progression comes only from clearing enemies: elapsed time never advances a wave or a
stage. A strong player reaches the hard encounters sooner; a struggling player keeps
practising the easier ones for longer.

When you die, the end screen shows the stage and wave reached and your level (marked
**NEW BEST!** when it beats your logged runs on this growth setting and balance
version), waves cleared, run time, score, kills by type, hits landed and W mark procs, Q
accuracy, what killed you, the damage you took **in that final stage** by source, and
the raw mechanical metrics. `R` restarts at Stage 1 Wave 1.

**Score** rewards playing well, never time alive — kiting one enemy forever earns
nothing. Every award is × a stage multiplier (×1 at Stage 1, ×2 at Stage 5, ×3.25 at 10):
- **Kills:** 100 × the mob's multiplier (Pursuer ×2.25, Magus ×1.5).
- **Speed:** clearing a wave pays 50 per enemy in it when you finish within its **par
  time** — the time its enemies take to arrive plus 0.6s per health pip — sliding to
  nothing at twice par.
- **HP:** clearing a stage pays 10 per HP you have left (before the full heal), +50% if
  the stage cost you no damage at all (**flawless**).

Bonuses pop up over your slime (`+300 SPEED`, `+870 HP`, `+1500 FLAWLESS`), and the end
screen breaks your score down into kills, speed and HP. Tuned in `SCORE` in
[balance.ts](src/config/balance.ts).

**Run log.** Every finished run (not a mid-run restart) is saved in this browser's local
storage: stage, wave and level reached, run time, the growth setting and
`BALANCE_VERSION` it was played on, what dealt the killing blow, and the HP lost to each
source over the run and in the final stage (Pursuer, basic spit, Magus, edge fire, and
each mob's body contact). The end screen shows `KILLED BY`, `DAMAGE, FINAL STAGE` and a
summary of your runs on the current growth setting and balance version (count, median and
best stage, high score); runs from older balance versions are kept but left out. From the console:
`__runs.summary()`, `__runs.list()`, and `__runs.clear()` to delete the log. It lives in
[RunHistory.ts](src/game/RunHistory.ts); nothing leaves the machine.

Later stages are harder, not faster.

**The difficulty curve.** One threat level per stage, `T = 1.15^(stage − 1)` (+15% per
stage, compounding), drives every scaled number: `value = clamp(base × T^k, min, max)`.
The curves live in `DIFFICULTY` in [balance.ts](src/config/balance.ts); each mob's own
scaled stats live in its `scaling` block.

| | Stage 1 | Stage 5 | Stage 10 | Stage 20 | Limit |
| --- | --- | --- | --- | --- | --- |
| Wave budget (enemies per hand-written wave) | 6 | 10 | 17 | 57 | — |
| On the field at once | 8 | 11 | 17 | 39 | 40 |
| Gap between arrivals | 250ms | 189ms | 133ms | 66ms | 50ms |
| Pack size | 1 | 1 | 2 | 3 | 5 |
| Enemy move speed | ×1 | ×1.06 | ×1.13 | ×1.30 | Pursuer ≤ 0.85 of yours |
| Spit / orb speed | ×1 | ×1.09 | ×1.21 | ×1.49 | 650px/s |
| Enemy damage (swing, spit, Magus) | ×1 | ×1.22 | ×1.55 | ×2.53 | — |
| Contact damage | ×1 | ×1.32 | ×1.88 | ×3.77 | — |
| Basics winding up a spit at once | 2 | 3 | 4 | 8 | 10 |
| Spit / dash / swing cooldown, Magus spell gap (ms) | 3000 / 5000 / 1200 / 1400 | 2759 / 4471 / 1103 / 1184 | 2484 / 3888 / 994 / 960 | 2014 / 2940 / 806 / 700 | min 1500 / 2500 / 800 / 700 |

Telegraphs (spit, dash, swing and Magus timings) and the 300ms arrival window are never
scaled. Your kit grows with your **level** (above), never with the stage. Edge fire
follows its own ramp to Stage 10 (one shot every 4.5s, tightening to every 3s) and then
holds.

**Health pips** stay low: basics are **1 pip forever**; Pursuers 2 and the Magus 1, each
+1 from Stage 11 (3 and 2) and no more. Later stages get harder through numbers, speed
and damage — never through enemies that take forever to kill.

**Hand-written stages** keep their authored mix and grow it to the stage's budget, shared
out by largest remainder (`WaveDirector.rosterFor`). B = basic, P = Pursuer, M = Magus, S = Sovereign;
the authored mix is in brackets.

| Stage | Waves | Wave 1 | Wave 2 |
| --- | --- | --- | --- |
| 1 | 1 | 6B (3B) | — |
| 2 | 1 | 5B + 2P (3B + 1P) | — |
| 3 | 1 | 4B + 4P (2B + 2P) | — |
| 4 | 2 | 7B + 2P (3B + 1P) | 5B + 4P (3B + 2P) |
| 5 | 2 | 6B + 3P + 1M (2B + 1P + 1M) | 5B + 4P + 1S (2B + 2P + 1S) |

**Generated stages** buy each wave from its budget: mobs are drawn by weight among those
unlocked, each costing points (basic 1, Pursuer 1.5, Magus 3, Sovereign 3 — heavier mobs mean fewer
bodies) and held to its share of the budget and its per-wave cap (Magi: 1 per wave until
about Stage 17, then more). A mob's first stage fields exactly one of it in Wave 1, so you
meet it alone. Rosters are rolled once per run, so a wave never changes under you.

Tuning lives in [balance.ts](src/config/balance.ts): `RUN` (breathers, arrival window,
pack spacing), `DIFFICULTY` (the curve), `ENEMIES` (the mob registry: cost, unlock stage,
weight, share, per-wave cap, pips), `TARGETS` / `PURSUER` / `MAGUS` (behaviour and
per-mob scaling), `STAGES` (the hand-written intro), `ENDLESS` (waves per generated stage)
and `STAGE_RAMPS` (your base auto cycle and edge fire per stage).

### Adding a mob

1. Its config block in `balance.ts` (radius, speeds, attacks, an optional `scaling` block).
2. An `ENEMIES` entry: `name`, `cost`, `unlockStage`, `weight`, `maxShare`, optional
   `maxPerWave`, `pips`. Its id becomes a valid `EnemyArchetype` everywhere.
3. Its entity (`extends Enemy`) and view, and one line in `WaveDirector`'s `ARCHETYPES`
   saying how to build it.

Generated stages pick it up from its `unlockStage` on, its first wave fields it alone, the
chat announces it, and it gets the global speed, projectile and damage scaling for free.

The HUD shows `STAGE 7   WAVE 2 / 3   ENEMIES 2` along the top — no stage total (the run
is endless); the wave total is
the current stage's own wave count, and ENEMIES counts everything left in the wave,
including enemies still to arrive — the run time on the left, and `APM` on the right
(every key press and mouse-button press, bound or not — key auto-repeat and mouse movement
excluded — per minute over a rolling 30s window, divided
by at least 10s early on; informational only). A large "STAGE N" banner marks each new stage, a smaller "WAVE N" each later
wave, and "WAVE CLEAR" / "STAGE CLEAR" fills the breather.

A small system-message feed sits bottom-left, above the HP plate. A run opens with
"Welcome to qwer's Backyard!" and "Mission 1: Clear 1 wave."; each new stage is briefed as
a Mission using its wave count, followed by a red "New threat: …" line for anything that
stage introduces (the Pursuer and slime spit at Stage 2, the Pursuer dash at 4, the Magus
at 5, any later mob at its unlock stage), and clearing a stage's last wave posts "Mission N
complete!". Nothing else is announced. `Z` toggles
the feed between light (translucent) and dark (near-opaque) mode instantly; left-drag its
bottom border to move it anywhere on screen. Clicks on it never reach the game. Position
and mode survive restarts; messages start fresh.

## The kit

| | Cast time | Cooldown | Range | Projectile speed | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700→347ms\* | 260 | 1150 px/s (homing) | 1 |
| Q | 165ms | 3000ms† | 450 | 1250 px/s | 1 (2 from level 9) |
| W | 185ms | 6000ms† | 450 | 1000 px/s | 0 on contact, **+1 on detonation** |
| E | 210ms | 8000ms† | 310 blink / 380 bolt acquisition | 1050 px/s bolt | 1 |
| F | instant | 20000ms | 275 | — | — |

\* the auto cooldown is set by your level (700ms at level 1, +6% attack speed per level,
347ms at 18); the windup is a quarter of it, and both shrink further as the passive stacks.
† at level 1; ability haste (+5 per level) shortens Q / W / E to ×0.54 at level 18.

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
| Magus | tall slate slime in a brass crest and mask, rune tablets floating at its sides | same as basic | artillery caster with a Xerath-style kit (below); holds 360–480px from you, backs off at 60% of your speed, never moves while casting |
| Sovereign | indigo slime under a silver diadem, two dark orbs circling her head | 2 (3 from Stage 11) | sphere mage with a Syndra-style kit (below); holds 280–380px from you, at most one per wave, from Stage 5 |

Pips follow each mob's `ENEMIES` pip ramp (see above). Pursuers first appear in
Stage 2, the Magus and the Sovereign in Stage 5 (Waves 1 and 2). A Pursuer's swing only lands if you are still in reach when it
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
at a stunned player: it crouches for 450ms while its path — **locked** at the start —
glows red on the ground, then lunges 160px over 280ms, stopping early once you are in
reach. The dash deals no damage; it closes the gap so the normal 400ms swing becomes a
threat. Sidestep the strip and it lunges past you. Cooldown 5s from the start of a dash.

Spit cooldown, dash cooldown and projectile speed scale with the stage (see the curve
above). Tuned in `TARGETS.spit`, `PURSUER.dash` and `DIFFICULTY` in
[balance.ts](src/config/balance.ts).

### The Magus

One spell at a time, at least 1.4s apart. Every spell is a telegraph: a zone hits
only if you are inside it at the instant it lands. Like a real Xerath, it **aims where
you're heading**: where you'd be when the spell lands at your current velocity
(`MAGUS.aimLead`, 85% of the way). Running in a straight line walks you into it; change
direction or stop to dodge. Each cast also aims at a **random spot near** that point
(within 50px, or 20px for the Orb; `MAGUS.aimSpreadPx`), rolled once per cast so the
Lance line and the Eye reticle still show exactly where it will land.

| Spell | Telegraph | Hit |
| --- | --- | --- |
| Lance (Q) | rooted, it charges for 900ms while a dotted line tracks where you're heading; the line then **locks** as a red strip (60px wide) and lands 450ms later | 18 |
| Eye (W) | rooted for 400ms while a reticle tracks where you're heading; then a red circle (radius 95) goes down there, landing after 700ms | 10 on the edge; **18 + 40% slow for 1s** if your centre is in the white sweet spot (radius 32) |
| Orb (E) | a 300ms windup, then a visible white-gold orb (520px/s, 420px range) | 8 + a **stun** of 250ms (point-blank) to 750ms (full range) |
| Rite (R) | once per life, when it is the **last enemy left in the wave**: rooted, it calls three 70px circles onto you, 800ms apart | 15 each |

Inside 300px it answers with the Orb first. Otherwise it picks at random among the
spells whose reach covers you. Spells it has already placed still land if it dies;
a Lance still charging dies with it. Clearing the wave fizzles everything pending.
All of it is tuned in `MAGUS` in [balance.ts](src/config/balance.ts), including
`aimLead` (0 = it aims where you are now; 1 = exactly where you'll be).

### The Sovereign

A mid-range sphere mage. She builds a board of **Dark Spheres** that stay on the ground,
then uses them. Never stand **behind a sphere** on the line from her. **Killing her
deletes every sphere she has out.** One spell at a time, at least 1.2s apart; she aims
where you're heading (like the Magus) at a random spot within 40px.

| Spell | Telegraph | Hit |
| --- | --- | --- |
| Dark Sphere (Q) | a void-edged circle on where you're heading, landing after 600ms | 12; then a **Dark Sphere** sits there for 6s (at most 3 of hers at once, 4 from Stage 14, 5 from 19; a new one replaces her oldest) |
| Force of Will (W) | she lifts one of her spheres — or **one of her basic slimes** — within 280px over her head (300ms), then throws it at where you're heading: a circle that lands 500ms later | 12 + 30% slow for 1s. A thrown slime lands **live** where it hits, dazed for 400ms. Pop it in her hands and the throw fizzles |
| Scatter (E) | a short cone in front of her fills for 350ms; every sphere inside it shows the **exit line** it will fly along, outward from her through the sphere | cone 10; each flung sphere 8 + a **600ms stun** |

She casts Scatter when a sphere lines up with you, or when you're inside the cone. With
both ready, 60% of the time she plays **Q→E**: a sphere dropped between you and her, then
Scattered into you. The sphere landing on that line is your warning. Her spells use the
same red ground, edged in void lavender instead of the Magus's gold. Tuned in
`SOVEREIGN`. Pursuers became rarer when she joined (weight 1.5, at most half a wave).

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
more dividers, not a wider bar. An enemy's bar appears once it has lost a pip, so a big
swarm is not a wall of bars (`DEBUG.healthBars = 'always'` shows every bar); an arriving
enemy shows only a closing ring on its spot. Units lower on the
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
| Sovereign | indigo slime, silver diadem with a tall spike, pale lavender eyes, two dark orbs circling; casting, she draws up tall and the orbs spin fast |
| Dark Sphere | a near-black orb with a pale rim on the ground, gently pulsing; it flickers through its last second |
| Scatter | a red wedge from her edged in lavender, plus a red strip from each sphere it will fling |
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

- `src/config/balance.ts` — gameplay tuning: the run (`RUN`, `DIFFICULTY`, `ENEMIES`, `STAGES`, `ENDLESS`, `STAGE_RAMPS`), ranges, timings, damage, keybinds, debug flags.
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
