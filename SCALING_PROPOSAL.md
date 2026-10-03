# Endless Swarm Scaling Proposal

Status: **approved, building in phases** (see Phases). Written 2026-10-02, revised the
same day: lose to **swarms**, not to enemies with huge health; enemies get **somewhat
faster**; the **Pursuer gets a dash**; **basic enemies deal damage**. Settled: growth
1.15, basics spit from Stage 2, the dash unlocks at Stage 4, +25 HP per stage cleared.

## Summary

- **Endless run that always ends in death.** "Run complete" goes away, and your result is
  the stage you reached.
- **The number of enemies is what grows.** Wave size and the cap on enemies alive at once
  grow exponentially. Health stops growing at today's Stage 7 values. You lose when
  enemies arrive faster than you can kill them, the field fills up, and you get
  surrounded.
- **Everything else creeps up a little.** Enemies move somewhat faster, shoot somewhat
  faster projectiles, and hit somewhat harder. They always stay slower than you.
- **Every enemy can hurt you.** Basic enemies spit a slow, telegraphed glob. The
  Pursuer gains a telegraphed dash that closes distance.
- **Your power stops growing at Stage 10.** The enemies' never does, which guarantees the
  run ends.
- **New mobs plug in through one registry entry.** Scaling, spawn picks and the first
  appearance (where you meet the mob alone) come for free.

## The one formula

```
T(stage)   = 1.15 ^ (stage - 1)          threat level: +15% per stage, compounding
stat value = clamp(base × T ^ k,  min,  max)
```

- `base` is today's value from `balance.ts`.
- `k` is the stat's **elasticity**: how strongly it follows `T`. A negative `k` shrinks the
  stat (cooldowns, gaps between arrivals).
- `min` / `max` are hard floors and caps. These are where fairness is protected.

There are two tuning dials. To make the whole game harder or easier, change the growth
rate 1.15. To change one aspect, change that stat's `k`.

## What it produces

| Stage | 1 | 5 | 10 | 15 | 20 |
| --- | --- | --- | --- | --- | --- |
| Threat `T` | 1.0 | 1.8 | 3.5 | 7.1 | 14.2 |
| Enemies per wave | 4 | 7 | 14 | 28 | 57 |
| Max alive at once | 6 | 8 | 13 | 19 | 30 |
| Gap between arrivals | 300ms | 230ms | 160ms | 110ms | 80ms |
| Enemy move speed × | 1.0 | 1.06 | 1.13 | 1.22 | 1.30 |
| Pursuer speed (× yours) | 0.55 | 0.58 | 0.62 | 0.67 | 0.72 |
| Enemy projectile speed × | 1.0 | 1.09 | 1.21 | 1.34 | 1.49 |
| Enemy damage × | 1.0 | 1.12 | 1.29 | 1.48 | 1.70 |
| Basics winding up a spit at once | 2 | 3 | 4 | 5 | 8 |
| Pursuer dash cooldown | — | 4.5s | 3.9s | 3.4s | 2.9s |
| Fastest possible wave clear | 1s | 3s | 9s | 20s | 40s |

**Where the wall comes from.** With enemies capped around 3 health pips, your best kill
rate is about 1.4 enemies per second. That assumes a full passive and Q refunds landing,
about 4.3 pips/s. From roughly Stage 12, enemies arrive faster than that. The field fills
to its cap and stays full until the wave runs out of enemies to send. At Stage 15 that
means fighting about 19 enemies at once for 20 seconds, with a few of them shooting at
you at any moment.

Rough expectations: an average player dies around Stage 10–13, a strong one around
15–17, and almost nobody gets past 20.

## What scales

**Global, so every mob gets it for free, including future ones:**

| Stat | base | k | limit | Applied where |
| --- | --- | --- | --- | --- |
| Enemies per wave | 4 | 1.0 | — | wave generator |
| Max alive at once | 6 | 0.6 | max 30 | replaces `RUN.maxAliveEnemies` |
| Gap between arrivals | 300ms | −0.5 | min 60ms | replaces `RUN.spawn.staggerMs` |
| Enemy move speed × | 1 | 0.1 | Pursuer capped at 0.85 of yours | every mob's movement |
| Enemy projectile speed × | 1 | 0.15 | 650px/s absolute | basic spit, Magus orb, edge fire |
| Enemy damage × | 1 | 0.2 | — | centrally, on every hit you take |
| Attack tokens | 2 | 0.5 | max 10 | how many basics may wind up a spit at once (below) |
| Health pips | per mob | — | **stop at the Stage 7 values: basic 3, Pursuer 4, Magus 3** | at spawn |

**Per mob, declared by the mob:**

| Mob | Stat | k | limit |
| --- | --- | --- | --- |
| Basic | spit cooldown | −0.15 | min 1500 |
| Pursuer | dash cooldown | −0.2 | min 2500 |
| | swing cooldown | −0.15 | min 800 |
| Magus | spell gap | −0.3 | min 700 |
| | max per wave | 0.3 | max 3 |

**What does not scale:**
- Telegraphs (spit windup, dash windup, swing windup, Magus timings). Speed is allowed to
  creep up; the warning before an attack is not allowed to shrink.
- The 300ms arrival window. You always see where an enemy is about to appear.
- Your kit. Base attack speed stops at 420ms from Stage 10, and abilities never scale.
- **Edge fire** follows its current ramp up to Stage 10 and then holds, apart from
  projectile speed. Past that point the swarm is the pressure, and more random fire
  would only add noise.

## New: basic enemies spit

Basic enemies already hover 150–230px from you, inside your attack range, and sidestep.
A short-range spit suits that: a crowd of them turns into projectiles from every
direction, which is the dodging drill the game already teaches.

| | Value |
| --- | --- |
| Telegraph | 350ms: the slime squashes down, its mouth glows, and a short aim tick appears on the ground |
| Projectile | a small, dark-red slime glob, smaller and darker than the orange edge fireballs; radius 6, 280px/s (scaled), range 400 |
| Aim | at your position when it fires, never re-aimed (same rule as edge fire) |
| Damage | 5 (scaled) |
| Cooldown | 3000ms per basic (scaled), with ±20% jitter so a group never fires in unison |
| Tokens | a basic needs an **attack token** to start its windup. Only `tokens(T)` basics may be winding up at once (2 at Stage 1, 8 at Stage 20). |

**Why tokens.** Without them, 25 basics would make the screen a bullet hell. Tokens are a
standard trick in action games (crowds take turns attacking). Fire stays readable, yet
grows as the swarm grows. A token is held only during the windup, so slow globs already
in flight don't block new ones.

## New: Pursuer dash

A telegraphed gap-closer. It is not a separate damage source: it closes distance so that
the normal swing, with its unchanged 400ms telegraph, becomes a threat.

| | Value |
| --- | --- |
| When | ready, 110–240px from you (outside swing reach), and you are not stunned |
| Telegraph | 350ms, rooted: it crouches, and a red strip on the ground shows the **locked** path, in the same language as other telegraphs |
| Dash | 170px in 140ms along the locked direction. It stops early if it reaches swing range. |
| After | normal behaviour: if you're in reach and its swing is ready, the 400ms swing begins |
| Cooldown | 5000ms (scaled, min 2500) |
| Counterplay | sidestep the locked strip, stay out of 240px, or Flash/E away from the landing point |

It forces the classic ADC read: track the gap-closer's cooldown and position around it,
instead of simply walking away forever.

## Wave generation

Waves are generated from a **budget**, so adding a mob never means rewriting a stage table:

1. Stages have 1, 1, 1, 2, 2, 2, 3, 3, 3 waves for Stages 1–9, then 3 per stage from
   Stage 10 on.
2. A wave's size comes from the curve. Mobs are drawn by **weight** among those
   unlocked, respecting each mob's `maxShare` and `maxPerWave`.
3. **Packs.** Enemies arrive in small packs (pack size `T^0.4`, so 1 at Stage 1 and 3 at
   Stage 15) at nearby spots on one side of the arena. That feels like a swarm, and it
   gives you a direction to kite away from.
4. **First appearance.** The first wave of a mob's `unlockStage` contains exactly one of
   it, and the chat posts "New threat: Magus".
5. **Hand-written intro.** `STAGES` remains as an optional override table. I'd keep
   Stages 1–5 hand-written so the intro stays deliberate.

## Adding a mob

As built: a config block, one `ENEMIES` entry, the entity + view, and one line in
`WaveDirector`'s `ARCHETYPES`:

```ts
// balance.ts
export const ENEMIES = {
  pursuer: {
    name: 'Pursuer',     // "New threat: Pursuer." in the chat
    cost: 1.5,           // budget points per body (heavier mobs = fewer bodies)
    unlockStage: 2,      // first stage; Wave 1 of a generated unlock stage fields exactly one
    weight: 2,           // pick chance among unlocked mobs
    maxShare: 0.6,       // most of a wave's budget it may take
    pips: { start: 2, every: 3, max: 4 },
  },
};
// Its own scaled stats live in its config block:
//   PURSUER.scaling = { dashCooldownMs: { k: -0.2, min: 2500 }, attackCooldownMs: { k: -0.15, min: 800 } }
```

The entity resolves its scaled stats once, at spawn, from the stage it spawned on.
Movement speed, projectile speed and damage multipliers are applied centrally, so a new
mob gets those without declaring anything.

## Player side

- **Attack speed:** the base cycle runs 700 → 420ms across Stages 1–10, as today, then
  holds.
- **HP:** heal **+25 HP (capped at 100) on each stage clear.** Then each death comes from
  the stage you're on rather than from damage piled up over earlier stages, which keeps
  the curve tunable.
- **HUD / end screen:** `STAGE 14` (no "/ 10"). The end screen shows the stage and wave
  reached plus a **personal best**, kept in local storage.
- **Readability with 30 enemies:** health bars show only on damaged enemies.

## Architecture

| Piece | Change |
| --- | --- |
| `balance.ts` | `DIFFICULTY` block (growth, global curves, tokens) and `ENEMIES` registry; `STAGES` becomes optional overrides; `RUN.maxAliveEnemies` / `staggerMs` / `enemyFire` replaced by curves |
| `systems/Difficulty.ts` (new) | `threat(stage)`, `curve(...)`, `resolveStats(archetype, stage)`. Pure functions. |
| `systems/WaveGenerator.ts` (new) | Budget → roster in packs, with weights, shares, caps and first appearances |
| `systems/AttackTokens.ts` (new) | Take / return a token, with a pool size from the curve |
| `WaveDirector` | Endless (no `'complete'` phase); overrides first, otherwise the generator |
| `Target` (basic) | Spit state machine: hover → windup (with token) → fire. Reuses `HostileSpellSystem` for its projectiles, so globs fizzle on wave clear like everything else. |
| `Pursuer` | New `dash` state between chase and windup |
| `Enemy` + mobs | `stats` resolved at spawn; global move-speed multiplier applied centrally |
| `GameScene` | Damage multiplier applied in one place; heal on stage clear |
| UI / chat | Stage without a total, personal best, "New threat" message, bars only on damaged enemies |
| Tests | `waves` (endless), `pressure` (size bands, arrival gaps), `mobs` (pips, basic now attacks), `hud` (stage text) need updating. New `difficulty.spec.ts` covers curves, caps, tokens, packs and first appearances. |

## Phases

Each phase ships on its own and is playable.

**Phase 1 — every enemy can hurt you.** *(done)* Basic spit with attack tokens
(from Stage 2) and the Pursuer dash (from Stage 4), added to the current 10-stage game
with no scaling yet. Unlock stages and all numbers live in `TARGETS.spit`,
`PURSUER.dash` and `RUN.attackTokens`.

**Phase 2 — the curve.** *(done)* `Difficulty.ts` with `T(stage)` and the global curves
(enemy count, max alive at once, arrival gap, move speed, projectile speed, damage,
attack tokens), plus per-mob scaled stats (`enemy.stats`), applied to the
hand-written stage table. Health pips stop growing at the Stage 7 values. Also +25 HP
on each stage clear.

**Phase 3 — endless.** *(done)* `ENEMIES` registry, wave generator with packs and first
appearances, Stages 1–5 kept hand-written, no "run complete", stage shown without a
total, personal best, "New threat" chat message, health bars only on damaged enemies.

**Phase 4 — more, weaker enemies, and contact damage.** *(proposed, below)*

## Phase 4 — more, weaker enemies, and contact damage

Feedback after playing Phase 3: still a little slow, and a 3-pip basic at Stage 7 is a
chore to kill, not fun. The fix: trade health for numbers, and make the swarm's bodies
dangerous in themselves.

### 4a. Trade health for numbers

Health pips step up every **10** stages instead of every 3, and stop lower. Wave budgets,
the cap on enemies alive at once and the arrival rate all rise to fill the field with
more of them.

| | Today | Proposed |
| --- | --- | --- |
| Basic pips | 1 → 2 (S4) → 3 (S7) | **1 until Stage 10**, then 2 (max) |
| Pursuer pips | 2 → 3 → 4 | **2 until Stage 10**, then 3 (max) |
| Magus pips | 1 → 2 → 3 | **1 until Stage 10**, then 2 (max) |
| Wave budget `waveSize` | 4 × T | **6 × T** |
| Max alive at once `maxAlive` | 6 × T^0.6, max 30 | **8 × T^0.6, max 40** |
| Arrival gap `arrivalGapMs` | 300 × T^−0.5, min 60 | **250 × T^−0.5, min 50** |

What that means in play:

| Stage | 1 | 5 | 7 | 10 | 12 | 15 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Budget (≈ bodies) today → proposed | 4 → 6 | 7 → 10 | 9 → 14 | 14 → 21 | 19 → 28 | 28 → 42 | 57 → 85 |
| On the field at once | 6 → 8 | 8 → 11 | 10 → 13 | 13 → 17 | 15 → 20 | 19 → 26 | 30 → 39 |
| Basic / Pursuer pips | 1/2 → 1/2 | 2/3 → 1/2 | 3/4 → **1/2** | 3/4 → **1/2** | 3/4 → 2/3 | 3/4 → 2/3 | 3/4 → 2/3 |

**Stage 7 Wave 1, today:** 6 basics + 2 Pursuers + 1 Magus = 9 bodies, 29 pips.
**Proposed:** 10 basics + 3 Pursuers + 1 Magus = 14 bodies, **17 pips**. That's about 55%
more bodies but 40% fewer hits to clear. Most autos kill something, so it feels like
mowing down a swarm rather than chipping at a few tanks.

The basic's spit tokens already scale with the stage (not with the body count), so
doubling the basics doesn't double the fire.

### 4b. Contact damage

An enemy whose body touches yours hurts you.

| | Value |
| --- | --- |
| Touching | an **active** enemy whose circle overlaps yours (arriving enemies are inert, as today) |
| Damage | per mob, a new `contactDamage` in `ENEMIES`: basic **4**, Pursuer **8**, Magus **4**; new mobs declare their own |
| Ramp | its own curve, `DIFFICULTY.contactDamage` (k **0.35**), steeper than other damage (k 0.2) as you asked: ×1.34 at Stage 7, ×1.55 at 10, ×2.0 at 15, ×2.5 at 20 (basic touch 4 → 6 → 8 → 10) |
| Rate | each enemy can bump you at most once per **800ms**; the existing 250ms invulnerability after any hit still applies, so a crowd can't shred you in one frame |
| Feedback | a small spark where the bodies touch, plus the usual hit flash; the run log records it separately (`basic contact`, `pursuer contact`) from spit and swings |

**When it happens.** Basics hover 150–230px away and Pursuers stop at swing range, so
nothing walks into you on purpose. Contact comes from walking into or through the
swarm, packs landing around you, or getting boxed in. The lesson is "don't path through
the crowd". You can still walk through it, at a price; making enemies actually block
your movement remains a possible later step.

### Side effects to know about

- **W loses value against 1-pip basics.** The mark's bonus pip needs a second hit, and a
  1-pip enemy dies on the first. W stays strong against Pursuers and the Magus.
- **Q stops at the first enemy.** Against a swarm of 1-pip enemies, making Q pierce
  (keep flying after a kill) would feel great, but it's a kit change, so it's an open
  question rather than part of this phase.
- **The run log groups runs by growth setting only,** and Phase 4 changes balance
  without touching growth. I'd add a `balanceVersion` tag (bumped on any tuning change)
  so the median isn't mixed with pre-Phase-4 runs. The alternative is `__runs.clear()`.

### Build order

1. **4a**: config only (pip ramps, three curve bases) plus updating the tests that pin
   them. Playable right away.
2. **4b**: contact checks in the director's frame, per-enemy cooldown, `contactDamage`
   in the registry, its curve, the spark, the run-log source.
3. **`balanceVersion`** on the run log.

### Questions for Phase 4

1. **Q pierce** on kills: yes, no, or later?
2. **Contact numbers:** basic 4 / Pursuer 8 / Magus 4 at Stage 1 with k 0.35. Harsher or
   gentler?
3. **Basic pips past Stage 10:** 2 (proposed), or keep basics at 1 forever and let only
   numbers grow?

## Open questions

1. **Growth rate:** 1.15 puts the wall around Stage 15–18. Revisit after playtesting
   Phase 2: 1.2 for a faster run, 1.12 for a longer one.

## Risks

- **Screen noise.** 30 enemies, spits, Magus zones and edge fire together. Tokens, the
  Magus cap, freezing edge fire after Stage 10 and hiding full health bars are all there
  to contain it, but it needs a playtest at Stage 15+.
- **Basics change identity.** Today they are harmless clutter for practising target
  selection. With a spit they become a damage source from Stage 1 (see open question 2).
- **Dash vs. kiting.** A dash every 3–5s from several Pursuers at once could make late
  stages feel like dodge spam rather than kiting. The cooldown floor and the 110–240px
  trigger window are the dials.
- **Tests assume a finite run.** The suites assume the run completes at Stage 10, so
  those parts need rewriting, not small edits.
