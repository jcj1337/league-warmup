# hands diff — Study Guide

A guide to understanding this codebase well enough to explain it: what it does, how it is
built, why it is built that way, and where it could be better. Each topic starts in plain
words and then gives the technical version. The [Technical Report](TECHNICAL_REPORT.md) is
the detailed reference; this guide is the way in.

**How to use it:** read Parts 1–4 in order (the big picture, the vocabulary, the
architecture, Phaser). Parts 5–6 walk through the code paths. Parts 7–9 are what you'd
want ready in a technical conversation: patterns, trade-offs, improvements. Part 10 tests
you.

---

## Part 1 — The big picture

### In one sentence

A browser game that trains the hand skills of League of Legends (moving, attacking
between steps, dodging, aiming abilities) by throwing endless waves of enemies at you,
built in TypeScript on the Phaser engine with no physics engine and no server.

### In thirty seconds

You play a slime "champion" in a top-down arena. You right-click to move and attack, and
press Q/W/E/R for abilities. Enemies come in waves; clear a wave and the next arrives;
clear a stage's waves and you heal and move to a harder stage. It never ends until you
die. Your score rewards killing fast and taking no damage, never just surviving.
There are three champions, five enemy types and three difficulty modes.

### In two minutes (the technical pitch)

- **Stack:** TypeScript (strict), Phaser 3 for the loop, input and drawing, Vite for the
  build, Playwright for end-to-end tests, deployed as static files on Cloudflare.
- **No physics engine:** every rule is explicit math (distances, timers), which keeps the
  game deterministic and tunable.
- **A simulation that owns its own time:** every deadline uses a game clock that stops
  when you pause, so nothing ever fast-forwards on resume.
- **Strict separation of gameplay and visuals:** gameplay state changes first; drawing
  code only reads it. Animations can't affect the rules.
- **Data-driven content:** champions plug in through an interface, enemies through a
  registry, difficulty modes are just numbers. The engine never checks "which champion is
  this?"
- **Procedural waves:** after a hand-written intro, each wave is bought from a point
  budget by weighted random draws, seeded per run.
- **Tests:** 29 browser test suites drive the real game through handles exposed on
  `window`.

---

## Part 2 — Vocabulary you need first

| Term | Plain meaning | In this code |
| --- | --- | --- |
| **Game loop** | The game redraws ~60+ times a second; each redraw is a "frame". Every frame it updates the world a little, then draws it | Phaser calls `GameScene.update(time, delta)` each frame |
| **`delta` / `dt`** | How much time passed since the last frame | `dt = min(delta, 50) / 1000` seconds. Movement is `speed × dt`, so speed is the same at 30 or 300 fps |
| **Scene** | A self-contained "screen" or layer with its own objects and update | `GameScene` (the world) and `UIScene` (the HUD on top) |
| **State machine** | Something that is always in exactly one named state and moves between them on rules | The auto attack: `idle → windup → recovery → idle`. Every enemy AI is one too |
| **Deadline** | "This happens at time T" instead of "count down N" | `windupEndsAt = now + windupMs`; each frame asks `now >= windupEndsAt?` |
| **Simulation vs rendering** | The rules of the world vs the pictures of it | Entities and systems vs `view/` classes |
| **Pip** | One notch of enemy health. Every hit removes exactly one | `Enemy.takeHit()` |
| **Windup / recovery** | The start of an attack where you're stuck in place / the end where you can move again | `AttackSystem` |
| **Orbwalking** | Attack, then move during the recovery, then attack again | Possible because the cooldown starts at the *start* of the windup |
| **Telegraph** | A warning shape on the ground before an attack lands | Enemy zones in `HostileSpellSystem`; the Pursuer's red ring |
| **Kit** | A champion's set of abilities | A class implementing the `Kit` interface |
| **Registry** | A lookup table of "all the X that exist" | `CHAMPIONS`, `ENEMIES`, `MODES`, `ARCHETYPES` |

---

## Part 3 — The architecture

### The layers, simply

Think of the program as four layers, where each one only talks *down* or *sideways* in
a controlled way:

```
┌──────────────────────────────────────────────────────────────────┐
│  CONFIG (pure numbers)                                           │
│  balance.ts: arena, enemies, waves, modes, difficulty, score     │
│  theme.ts: colours, sizes, effect timings                        │
│  champions/<id>/balance.ts: each champion's numbers              │
└──────────────────────────────────────────────────────────────────┘
            ▲ read by everything below
┌──────────────────────────────────────────────────────────────────┐
│  GAMEPLAY (the rules — decides what happens)                     │
│  Run (clock, events, state) · Combat (every hit goes through it)  │
│  Systems: attacks, casts, cooldowns, projectiles, waves, score … │
│  Entities: Player, Enemy + five mob types                        │
│  Champion kits: what Q/W/E/R do                                  │
└──────────────────────────────────────────────────────────────────┘
            │ state is READ by ↓ (never written back)
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION (draws what happened)                              │
│  view/*: PlayerView, EnemyView, Fx, RunFeedback …                │
│  ui/*: ability bar, pause menu, end screen, chat                 │
│  art/*: pixel sprites, font, cosmetics                           │
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│  PLATFORM                                                        │
│  Phaser (loop, input, drawing) · Profile (localStorage)          │
└──────────────────────────────────────────────────────────────────┘
```

### Who owns what

| Thing | Owner | Why it matters |
| --- | --- | --- |
| Time | `Run.clock` (a `GameClock`) | Pausing = not advancing it |
| "Can the game move right now?" | `Run` (`isActive`) | One answer to one question |
| The player's position, HP, root | `Player` | Attacks and casts *ask* it to root/unroot |
| The auto-attack cycle | `AttackSystem` | Nothing else starts or cancels an auto |
| Ability timing | `CastSystem` + `AbilityCooldowns` | The engine's job, the same for every champion |
| What an ability *does* | The champion's `Kit` | The champion's job |
| What happens when anything is hit | `Combat` | Score, XP and wave progress can't disagree |
| Which enemies exist, and wave progress | `WaveDirector` | The only place enemies are created |
| What the screen shows | views and `UIScene` | They read; they never decide |
| Everything saved | `Profile` | One document, one save path |

### The five rules (and why each exists)

1. **One clock.** *Plain:* the game has its own stopwatch that pauses with the menu.
   *Why:* if you use the computer's clock, pausing for 10 seconds would make every timer
   that "should have" fired during those 10 seconds fire at once when you resume.

2. **Gameplay decides, views read.** *Plain:* the rules happen first; the pictures follow.
   *Why:* if an animation ending is what triggered damage, a dropped frame or a retimed
   animation would change the game. Here the animation is just a picture of a timer.

3. **Pips, not damage.** *Plain:* every hit takes one notch off an enemy. *Why:* it makes
   enemies readable ("a Pursuer is two hits") and keeps later stages hard through numbers
   and speed rather than enemies that take forever to kill.

4. **One funnel.** *Plain:* every hit is reported to one place. *Why:* score, XP, kill
   counts and "is the wave cleared?" all hang off the same call, so they can never drift
   apart.

5. **Data, not switches.** *Plain:* the engine never asks "is this Magic Boy?". *Why:* a
   new champion or enemy is added by writing a new file and a registry line, not by
   editing the engine in ten places.

---

## Part 4 — How Phaser is used

### What Phaser is

Phaser is a JavaScript game framework. It gives you a game loop, "scenes", input events,
and ways to draw images, text and shapes on a canvas (with WebGL when available). It also
ships physics engines, an asset loader, animations and timers, **most of which this project
deliberately doesn't use.**

### What this project uses Phaser for

| Need | Phaser piece | Example |
| --- | --- | --- |
| The loop | `Phaser.Game`, `Scene.update()` | `GameScene.update` runs once a frame |
| Layering the HUD over the world | two scenes running at once | `scene: [GameScene, UIScene]` |
| Fitting any window | `Scale.FIT` | 1280×720 world letterboxed |
| Mouse and keys | the input plugin | `scene.input.on('pointerdown', …)` |
| Sprites | `GameObjects.Image` | slime bodies, projectiles, particles |
| Shapes drawn every frame | `GameObjects.Graphics` | rings, telegraphs, health bars |
| Text | `GameObjects.BitmapText` | HUD in a generated pixel font |
| Turning generated pixels into images | texture manager, `textures.addCanvas` | every sprite |
| A bit of polish | tweens, camera shake | the level-up pop, the hit shake |
| Small maths | `Phaser.Math` | `Clamp`, `Distance`, `Angle.Wrap` |

### What it does *not* use, and why

| Not used | Why not |
| --- | --- |
| Arcade / Matter physics | Every rule is a precise timing or distance; explicit math is easier to tune and test than a physics solver |
| The asset loader | There are no image files: all art is generated from text at startup |
| Phaser animations and timer events | They run on Phaser's clock, which doesn't stop with the game's pause. Animations are picked from gameplay progress instead |
| Tweens for anything that matters | Same reason: tweens are wall-clock. They're used only for pure decoration and are paused with the game |
| A moving camera | The arena is exactly one screen |

**The one-line summary for an interview:** "Phaser is the platform layer: loop, input,
drawing. The game's rules are plain TypeScript classes that don't depend on Phaser's
timing at all, which is why pause and testing are simple."

### The two scenes, and why the HUD polls

```
                 ┌──────────────────────────────┐
  page load ───► │ GameScene  (one ROUND)       │ ◄── scene.restart() rebuilds it:
                 │ player, enemies, systems     │     restart, champion pick, mode pick
                 └──────────────┬───────────────┘
                                │ getHudState()   (a plain object, every frame)
                                ▼
                 ┌──────────────────────────────┐
  page load ───► │ UIScene    (whole PAGE)      │ ◄── built once, never restarted
                 │ HUD, menus, start card       │
                 └──────────────────────────────┘
```

When you restart, GameScene throws away every object and builds new ones. If the HUD had
subscribed to events on the old objects, it would be listening to things that no longer
exist. Instead, the HUD asks for a fresh snapshot every frame (`getHudState()`), which can
never be stale. A `round` counter in the snapshot tells the HUD a new round began.

### A sprite's journey, from text to screen

1. **Authored as text** in `art/sprites.ts`: rows of characters plus a palette.
   ```ts
   { rows: ['..mm..', '.mLLm.'], pal: { m: 0x2b4a8c, L: 0xffffff } }
   ```
2. **Rasterised once** by `spriteToCanvas`: each character becomes one pixel in an
   `ImageData` on an off-screen canvas. Typos throw an error at load.
3. **Registered as a texture** with `textures.addCanvas(key, canvas)`. Textures belong to
   the game, not the scene, so they survive restarts.
4. **Composed** for the player: `art/look.ts` stacks a hat onto the champion's body and
   applies a skin palette, producing new textures per champion + look.
5. **Drawn** as a `Phaser.GameObjects.Image` at 3× scale with `pixelArt: true` (no
   blurring), positioned from the gameplay `x, y` but rounded to whole pixels.
6. **Animated** by swapping the image's texture and scaling/offsetting it, based on how
   far through a windup the *gameplay* timer is.

Every key is in one table (`TEX`), so real image files could replace the generated ones
key-for-key later.

---

## Part 5 — Walkthroughs

Follow these with the code open. They are the best way to make the architecture concrete.

### 5.1 Booting

1. `index.html` loads `src/main.ts` (bundled by Vite).
2. `main.ts` creates `new Phaser.Game({...})` with both scenes, blocks the right-click
   menu, and puts handles like `__warmup` and `__balance` on `window`.
3. `GameScene.create()` runs: makes a new `Run` that is **awaiting start**, generates art,
   reads the champion and mode from the profile, builds the player, the `WaveDirector`
   (which queues Wave 1), `Combat`, the kit, every system, and the `InputController`.
4. `UIScene.create()` runs once: HUD, menus, start card, `CursorLock`.
5. Every frame, `GameScene.update()` returns immediately because the run isn't active.
   The world is visible but frozen at time 0.
6. You click; on the **release**, `startRun()` flips the run to active. Next frame, time
   starts.

### 5.2 One frame

```
clamp dt → advance the clock → read "now"
player status (stun/slow) → kit timers → cooldowns → cast windows
attacks decide (fire, recover, acquire, start windups)
visuals read the attack and cast state
player moves and redraws
wave director: breather over? arrivals; every enemy's AI
player projectiles, edge fire, enemy spells
effects
dead? end the round
```

The key idea: **decide, then draw, then move.** If you draw before deciding, the picture
is one frame behind the rules.

### 5.3 Right-clicking an enemy (an auto attack)

1. `InputController.onPointerDown` sees a right-click, finds the enemy under the cursor
   with `targetAt` (distance ≤ radius + 10px).
2. Calls `commandAttackTarget(enemy)` → `issueOrder(...)` → `AttackSystem.commandAttack`.
3. Next frames: out of range, so `chaseToward` walks you to just inside range.
4. In range and idle: `beginWindup` sets **two** deadlines (`windupEndsAt`,
   `cycleEndsAt`) and roots you.
5. At `windupEndsAt`: `fireAttack` → state `recovery`, root released, an
   `AutoAttackMissile` spawns. *Damage is now committed.*
6. The missile homes in. On arrival: `target.takeHit()` (one pip) → `Combat.hit`.
7. At `cycleEndsAt`: back to `idle`, and the next windup starts.

### 5.4 Orbwalking

Between step 5 and step 7 above you are free. Right-click the ground: a **move** order.
`onMoveOrder` only cancels a *windup*; in recovery it just hands movement back to you.
Then press T (attack-move) and the next windup starts as soon as the cycle allows. The
whole trick is that `cycleEndsAt` was set at the *start* of the windup, so moving during
recovery costs you nothing.

If you move during the **windup** instead, the attack is cancelled, nothing fires, and
the cooldown is refunded (`cycleEndsAt = 0`).

### 5.5 Pressing Q

1. `InputController` maps the physical key through `Keybinds` to `abilityQ` and calls
   `castSlot('q', cursorX, cursorY)`.
2. `GameScene.castSlot` checks: can act (not casting, not stunned)? off cooldown? Resolves
   the **aim** from the slot's `targeting` (for Q: toward the cursor).
3. Cancels an uncommitted auto (Q isn't `quick`), asks the kit to `commit` the aim (it's
   frozen now), starts the cooldown, starts the **cast window** in `CastSystem` (you're
   rooted for ~165ms).
4. Orders you give during the window are buffered (latest wins).
5. When the window ends: unroot → `kit.cast('q', aim)` → Magic Boy's kit fires a
   projectile through `PlayerProjectileSystem` → then the buffered order replays.
6. The projectile hits: the kit calls `takeHit()` and `combat.hit()`, adds a passive
   stack, and shaves 750ms off every ability cooldown.

### 5.6 Flash in the middle of a cast

Flash is allowed mid-cast. The cast remembers where you stood when it began (`fromX,
fromY`). When it resolves, the aim is shifted by however far you moved, so the spell fires
from your new spot in the same direction (League's "W-Flash"). A slot marked `anchored`
(Magic Boy's R) ignores the move and fires from where it began.

### 5.7 A kill that clears a wave

1. Any hit's `takeHit()` returns `true` (killed) → `Combat.kill(target)`.
2. `Combat.kill` adds score, tells the director, emits `'kill'`, adds XP (maybe emits
   `'levelUp'`).
3. `WaveDirector.onEnemyKilled`: nothing pending, spawning or alive? Then report the wave
   cleared (and the stage, if last), switch to `intermission`, set the breather deadline.
4. Same frame, later: edge fire and enemy spells see `isWaveActive == false` and clear
   themselves, so nothing can hit you during the breather.
5. `RunFeedback` (listening to events) pops the gold and bonus numbers. `UIScene` sees
   `wavePhase` change in its snapshot and shows "WAVE CLEAR".
6. When the clock passes the deadline, `advance()` → `spawnWave()` for the next wave.

### 5.8 Pausing

Escape → `togglePause` → `setPaused(true)`. `Run.isActive` becomes false, so the next
`update()` returns at the very first line: the clock doesn't advance, so no deadline moves
closer. Tweens are paused too. Input stops at `acceptsGameplayInput()`, so a click on a
menu button can't also move you. Resume, and every timer has exactly the time it had.

### 5.9 Dying

The player's HP reaches 0 → at the end of the frame `endRound()` cancels attacks, casts
and pending input, then `Run.finish(summary)` builds the `RoundResult`, compares it with
logged runs to decide "NEW BEST", and saves it. `UIScene` sees `getRoundResult() !== null`
and shows the end screen. R or Play Again → `scene.restart()` → a fresh round.

---

## Part 6 — The subsystems, one by one

Each has: **what it is**, **how it works**, **the interesting bit**.

### Input — `InputController`, `Keybinds`, `CursorLock`
- *What:* turns physical keys and clicks into commands.
- *How:* looks up `event.code` (the physical key, so layouts and Shift don't matter) in
  the bindings and calls a method on the `CommandHandler` interface that GameScene
  implements.
- *Interesting:* A+click and T call the *same* command, so they can't behave differently.
  Mouse Speed is implemented by taking a pointer lock, tracking a virtual cursor and
  rewriting mouse events before Phaser sees them.

### The auto attack — `AttackSystem`
- *What:* the `idle → windup → recovery` state machine plus targeting and chasing.
- *How:* deadlines set at windup start; a move order in the windup cancels and refunds.
- *Interesting:* attack speed is a **multiplier** (`cycle = base / multiplier`), so each
  extra stack is worth a little less in absolute terms, like real attack speed. The windup
  is 25% of the cycle with a 90ms floor so it never becomes unreadable.

### Abilities — `CastSystem`, `AbilityCooldowns`, `Progression`
- *What:* when abilities happen and how long they're unavailable.
- *How:* one pending cast with a deadline; one table of `readyAt` times; levels add
  "ability haste" (`cooldown × 100 / (100 + haste)`).
- *Interesting:* `reduce()` only ever pulls a cooldown *closer* (clamped), which makes
  "a hit refunds part of every cooldown" a single safe call.

### Champions — the `Champion` / `Kit` contract
- *What:* how a champion plugs in.
- *How:* a `Champion` object describes stats, art and each slot (how it's aimed, cast time,
  cooldown). `createKit(ctx)` returns a `Kit` that implements `cast(slot, aim)` and a few
  hooks. The kit only gets a narrow `KitContext` (clock, player, enemies, projectiles,
  blink, combat…).
- *Interesting:* each champion uses a different hook. Magic Boy listens to hit events
  (his W mark), Snake Lady places ground zones and poison, Axe Man changes his own autos
  (`autoShot`) and re-presses R to recall (`recast`).

### Combat and events — `Combat`, `RunEvents`, `RunFeedback`
- *What:* the place every hit goes, and the announcements it makes.
- *How:* `Combat.hit/kill/playerHit` update score, XP, the wave, the damage log, then
  `emit` typed events. `RunFeedback` listens and draws coins, popups and shakes.
- *Interesting:* the event map is a TypeScript interface, so `emit('kill', …)` is
  type-checked against what `on('kill', …)` listeners expect.

### Enemies — `Enemy`, `Caster`, five mobs
- *What:* the base class gives every mob a lifecycle (`spawning → active → dead`), pips,
  statuses, slows, stuns, contact damage and an **aim cursor**.
- *How:* each mob subclass implements `updateAi()` as a state machine on clock deadlines.
- *Interesting:* enemies never aim at you directly. They aim at their own cursor, which
  chases you at a capped speed. That is what makes a blink actually dodge things, and it
  makes difficulty tunable (Hard's cursor is 25% faster).

### Waves — `WaveDirector`
- *What:* creates every enemy and decides when waves and stages advance.
- *How:* early stages scale a hand-written mix; later stages **buy** a roster from a point
  budget by weighted random draws (cost, weight, share cap, per-wave cap, debut rules,
  capstones), seeded per run and cached.
- *Interesting:* only kills advance the game. A wave clears the instant its last enemy
  dies with none still due to arrive.

### Difficulty — `Difficulty.ts`, `MODES`
- *What:* how hard each stage is, and the three modes.
- *How:* one formula, `clamp(base × 1.15^((stage−1)×k), min, max)`, for every scaled
  number. Modes are bags of multipliers and registry overrides.
- *Interesting:* telegraph durations are never scaled, so every attack stays possible to
  react to; difficulty comes from count, speed and damage.

### Score and saving — `ScoreSystem`, `RunHistory`, `Profile`
- *What:* points, the run log and everything saved.
- *How:* awards from kills, wave speed, HP left, stage clears; the profile is one JSON
  document in `localStorage` with validation and migrations.
- *Interesting:* runs are tagged with `BALANCE_VERSION`, so a balance change doesn't make
  old high scores unbeatable or meaningless.

### Drawing — views, `Fx`, motions
- *What:* everything you see.
- *How:* each entity has a view that reads its state each frame. `Fx` reuses a pool of
  particle/ring/popup objects. A champion's body motion is keyframes sampled from the real
  windup progress.
- *Interesting:* because motion is sampled from *progress* (0→1), it automatically speeds
  up when attack speed goes up, with no animation changes.

---

## Part 7 — Design patterns in this codebase

Being able to name these, and point at the file, is useful in any technical discussion.

| Pattern | Where | What it buys |
| --- | --- | --- |
| **State machine** | `AttackSystem`, `Run`, every enemy AI, `Enemy` lifecycle | Behaviour is a small set of named states with explicit transitions; easy to reason about and test |
| **Strategy / plugin via interface** | `Kit`, `Champion` | New champions without touching the engine |
| **Registry / data-driven design** | `CHAMPIONS`, `ENEMIES`, `MODES`, `ARCHETYPES` | Content is configuration |
| **Command pattern** | `CommandHandler`; orders wrapped as closures and buffered (`issueOrder`) | Input is decoupled from gameplay; an order can be held and replayed later |
| **Observer / event bus** | `RunEvents` | Presentation reacts to gameplay without gameplay knowing about it |
| **Polling a snapshot** | `getHudState()` read by `UIScene` | A UI that survives the world being rebuilt |
| **Dependency injection** (by constructor) | systems take callbacks and interfaces (`AttackPacing`, `EnemyFirePressure`, `KitContext`) | Each class depends on the narrow thing it needs, not on `GameScene` |
| **Single source of truth** | `attackReach()` for both the hit test and the drawn ring; `AbilityCooldowns` for every slot and the HUD | The picture and the rule can't disagree |
| **Reference counting** | `Player.root()` / `releaseRoot()` | Two systems can hold the player still without fighting |
| **Object pooling** | `Fx` | No garbage spikes from hundreds of particles |
| **Seeded PRNG** | `mulberry32` for waves and decoration | Reproducible waves within a run; visuals can't shift gameplay randomness |
| **Schema versioning + migration** | `Profile` | Saved data survives code changes |
| **Fail fast on bad config** | `validateConfig()`, sprite rasteriser, motion frame check | Authoring mistakes crash at load, not mid-game |

---

## Part 8 — How it's tested

- **What:** 29 Playwright suites that open the real game in headless Microsoft Edge.
- **How:** each suite is one long scenario ("characterization script") that pokes the game
  through the `window.__…` handles (move the player, spawn a wave, read
  `scene.attacks.state`), and logs `pass`/`fail` lines. `fail` is soft: the run continues
  and the test fails at the end, so one bug doesn't hide the next.
- **Why this style:** the interesting behaviour is timing in a running game. Testing the
  real thing end to end catches integration bugs that unit tests on isolated classes
  would miss.
- **Timing discipline:** headless browsers can run at 300+ fps, so tests wait on **game
  time** (`clock.now`) and use px/s and ms thresholds, never "N frames".
- **Cost:** about 5 minutes, one suite at a time; renaming an internal means updating the
  suites that reach into it.

---

## Part 9 — Trade-offs and what you'd improve

Good answers to "what would you do differently?" come straight from here.

### Deliberate trade-offs

| Choice | Benefit | Cost |
| --- | --- | --- |
| No physics engine | Exact, tunable, deterministic rules | Hand-written collision; no swept tests, so very fast shots could pass through a target on a stuttering frame |
| Discrete collision, 50ms dt clamp | Simple, and a long frame can't teleport anything | The game slows down rather than catching up under heavy lag |
| HUD polls instead of subscribing | Survives restarts with zero wiring | Builds a snapshot object every frame (cheap at this size) |
| End-to-end tests over unit tests | Tests real behaviour and timing | Slow (~5 min), and coupled to internal names |
| Generated pixel art | No asset pipeline, everything in git as text | Art is authored character by character |
| `localStorage` only | No backend, nothing to run or secure | Data is per-browser; anyone can edit it (so currency may only ever buy cosmetics) |

### Known issues worth fixing (from the Technical Report, §22)

1. `Enemy.spawnId` is meant to stop a missile from hitting "a different life" of an enemy,
   but it's never assigned. It works anyway because each wave creates new objects and
   missiles check `target.active`. Fix: assign it on spawn, or delete it.
2. The event bus is described as one-way, but Magic Boy's mark detonates from a `'hit'`
   listener. Safe with one gameplay listener; fragile with two.
3. Some dead config (`stopsOnFirstHit`) and dead API (`AttackSystem.hasFired`).
4. Projectiles freeze in mid-air under the end screen.
5. Global 250ms invulnerability after a hit can silently eat a second, simultaneous hit.

### Ideas for the future

- Sound cues as a `RunEvents` listener (planned next).
- A cosmetic currency earned from score (the profile already has `currency`, `unlocked`,
  `equipped`).
- Swept collision for fast projectiles.
- A headless "sim only" mode for fast unit tests of the rules, since gameplay barely
  depends on Phaser.

---

## Part 10 — Check yourself

Try each before opening the answer.

<details><summary>1. Why doesn't the game use Phaser's own clock for gameplay timers?</summary>

Phaser's clock keeps running while the game is paused. Every gameplay deadline is a
timestamp; with a wall clock, every timer that "should" have fired during a pause would
fire at once on resume. The `GameClock` only advances on frames the simulation runs, so a
pause freezes everything exactly.
</details>

<details><summary>2. What single line makes orbwalking possible?</summary>

`cycleEndsAt = nowMs + cooldownMs` set in `beginWindup`, i.e. the cooldown starts when the
windup **starts**. Firing doesn't extend the cycle, so the recovery is free movement.
</details>

<details><summary>3. A player moves during an auto's windup. What happens? During its recovery?</summary>

Windup: `cancelWindup()`: no missile, root released, cooldown refunded (`cycleEndsAt = 0`).
Recovery: nothing is undone; the missile already left. The move just takes over.
</details>

<details><summary>4. Why does UIScene poll GameScene instead of listening to events?</summary>

GameScene is rebuilt on every restart, so any objects the HUD subscribed to would be
replaced. A snapshot read every frame can't go stale; a `round` counter tells the HUD when
a new round started.
</details>

<details><summary>5. How would you add a new enemy type?</summary>

Its config block in `balance.ts`, an `ENEMIES` registry entry (cost, unlock stage, weight,
pips…), an `Enemy` subclass with `updateAi()` and a view, and one line in `WaveDirector`'s
`ARCHETYPES`. Generated stages pick it up automatically from its unlock stage.
</details>

<details><summary>6. How does a champion's ability get from a key press to an effect?</summary>

`InputController` → `castSlot` → checks (can act, cooldown, aim from `targeting`) → kit
`commit` freezes the aim → cooldown starts → `CastSystem` window (rooted) → on resolve,
`kit.cast(slot, aim)` does the effect → the buffered order replays.
</details>

<details><summary>7. What is a "pip", and why use them?</summary>

One notch of enemy health; every hit removes exactly one. Enemies are readable ("two
hits"), and difficulty scales through numbers and speed instead of bloated health.
</details>

<details><summary>8. Why can Flash dodge an enemy spell here?</summary>

Enemies aim at their own cursor, which chases you at a capped speed. A blink moves you
faster than the cursor can follow, so for a moment the enemy is aiming where you were.
</details>

<details><summary>9. Where does a kill get scored, and why only there?</summary>

`Combat.kill`. Every kill from every source passes through it, so score, kill counts, XP
and the wave's "is it cleared?" check happen exactly once and can't disagree.
</details>

<details><summary>10. How are later waves generated, and why are they the same if you check twice?</summary>

A point budget (`waveSize`) buys mobs by weighted random draw among unlocked mobs whose
cost fits, under share and per-wave caps, with debut and capstone rules. The RNG is
seeded per run and per wave, and results are cached, so a wave never changes once rolled.
</details>

<details><summary>11. What does Phaser actually do in this project?</summary>

The game loop, two scenes, input events, drawing (images, graphics, bitmap text),
textures from generated canvases, scaling to the window, a few decorative tweens and a
camera shake. Not physics, loading, animations or gameplay timing.
</details>

<details><summary>12. How do tests know the game has "advanced enough"?</summary>

They wait on game time (`clock.now >= settleMs`) through `waitForGame`, not on wall-clock
sleeps, because frame rates differ wildly between machines and headless runs.
</details>

---

## Glossary

| Term | Meaning |
| --- | --- |
| **Arena** | The 1280×720 play area; also the screen |
| **Archetype** | An enemy type id (`basic`, `pursuer`, `magus`, `sovereign`, `bulwark`) |
| **Attack-move** | Walk toward a point, attacking anything in range on the way (A+click or T) |
| **Attack token** | A turn ticket basic slimes must hold to spit, so crowds take turns |
| **Breather / intermission** | The short pause between waves (400ms) or stages (700ms) |
| **Capstone** | A mob that closes every stage's last wave (the Bulwark) |
| **Cast window** | The short rooted moment between pressing an ability and it happening |
| **Contact damage** | Damage from an enemy's body touching yours |
| **Edge fire** | Fireballs from the arena edges that belong to the wave, not to an enemy |
| **Haste** | Ability haste: shortens cooldowns by `100 / (100 + haste)` |
| **i-frames** | 250ms after a hit during which you can't be hit again |
| **Kit** | A champion's abilities, as a class |
| **Mode** | Easy / Normal / Hard: a set of multipliers and overrides |
| **Par** | The target clear time for a wave's speed bonus |
| **Pip** | One hit's worth of enemy health |
| **Recovery** | The free-to-move part of the auto cycle after the shot leaves |
| **Root** | Being held in place (windup, cast); counted, not a flag |
| **Stage / wave** | A stage is a group of waves; clearing its last wave heals you and moves on |
| **Telegraph** | The warning drawn before an attack lands |
| **Windup** | The rooted, cancellable start of an attack |
