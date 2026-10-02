# Magus (Xerath-style Artillery Enemy) Proposal

Status: **implemented** 2026-10-02 (see the README's Enemies section). The open questions
were settled as: a real stun; an interrupted cast refunds its cooldown; `aimLeadMs` ships at
0 (tunable live); edge fire unchanged on Magus waves; the Rite stays on "last enemy
standing"; and a Pursuer can't start a swing on a stunned player. One change from the text
below: the Orb is also in the random pool at range (not only inside 300px), so long-range
stuns actually happen.

## Summary

Add a third enemy archetype, the **Magus**: a fragile long-range caster that stays far away and
lays down telegraphed ground zones, the way Xerath does. The two existing enemies already drill
"don't stand still" (Pursuer) and "dodge one straight shot" (edge fireballs). The Magus drills
the next skill up: **reading a telegraph, dodging at the right moment, and deciding when to walk
through its zones to kill it.**

It borrows Xerath's *kit*, not his look or name. The art stays an original slime like the rest
of the cast.

## Xerath's kit, and what we keep

| Xerath | What it does in League | Magus version | Kept / changed |
| --- | --- | --- | --- |
| Passive: Mana Surge | Autos restore mana | — | **Dropped.** Mana means nothing for an AI; cooldowns do the same job. |
| Q: Arcanopulse | Charge up to 1.5s: range grows to 1400, Xerath slows by up to 50%. Then a long line hits after a short delay. | **Lance**: a fixed-length line telegraph that **tracks you while charging**, then **locks**. It hits 450ms after the lock. | Mostly kept. Root instead of slow while charging, which reads more clearly. Range does not grow with charge time. |
| W: Eye of Destruction | Circle that hits after a delay. The centre deals extra damage and slows harder. | **Eye**: a circle placed on you, hits after 700ms. Edge: damage. Centre: more damage plus a slow. | Kept, including the sweet spot. |
| E: Shocking Orb | Skillshot that stuns the first enemy hit. Longer travel means a longer stun. | **Orb**: slow, visible projectile. Stun scales with distance travelled (250–750ms). | Kept. **This adds player CC to the game for the first time** (see below). |
| R: Rite of the Arcane | Anchors in place, then fires 3/4/5 delayed long-range circles. | **Rite**: once per life, when the Magus is the **last enemy left in the wave**, it roots itself and fires 3 circles at you, one after another. | Kept, as the end-of-wave moment. |

## Behaviour

**Spacing.** It keeps 360–480px from you. Your auto reach is about 260 and your Q range is 450,
so it sits just outside your autos and at the edge of your Q. When you walk at it, it backs
off at **50% of your speed**, so you can always catch it. It never moves while casting or
charging. Those windows are when you close the gap.

**Casting.** One spell at a time, with at least **1400ms** between cast starts (the
*spell gap*), so its zones never stack on top of each other. On each decision it picks the
first ready ability:

1. **Rite**, if it is the last enemy alive and nothing is still due to arrive
2. **Orb**, if you are within 300px. This is its self-defence: a point-blank Orb gives the
   shortest stun.
3. **Lance** / **Eye**, choosing between them at random

**Aim.** It aims at your position at the moment of commit: the Lance at its lock, the Eye
when placed, the Orb when fired. Optionally, a `leadFraction` ramp per stage (0 early, up to
~0.3 late) makes it aim slightly ahead of your movement. That is how real Xerath players
land skillshots, and it is what turns "keep moving" into "change direction."

**Death.** A Magus that dies mid-charge cancels the spell. Zones already placed and an Orb
already in flight still resolve. On wave clear, every hostile spell fizzles, the same rule
that already applies to edge fireballs.

## Starting numbers

All of these would go in a new `MAGUS` block in `balance.ts`. Damage is flat, not scaled per
stage, the same as `PURSUER.attackDamage`.

| | Telegraph | Size | Damage | Cooldown | Notes |
| --- | --- | --- | --- | --- | --- |
| Lance | 900ms charge (tracks), then 450ms locked | 520px long, 22px half-width | 18 | 4500ms | Rooted while charging |
| Eye | 700ms | 80px radius, 26px centre | 10 edge / 18 centre | 6000ms | Centre: 40% slow for 1000ms |
| Orb | Visible projectile, 650px/s | 12px radius, 520px range | 8 | 7000ms | Stun 250ms (close) → 750ms (max range) |
| Rite | 600ms per circle, 800ms apart | 70px radius × 3 | 15 each | Once per life | Rooted for the whole channel |

Other values: radius 20, 1.5× kill score, health pips equal to the basic enemy's (1/2/3), so
it is a glass cannon you can burst once you reach it.

Sanity check on the Lance: after the lock you have 450ms to clear 22 + 14 = 36px. At 340px/s,
with ~250ms to react, that takes about 360ms. It's tight but fair, and it stays fair only if
you are watching.

## Player crowd control (new)

The Orb's stun and the Eye's slow need a small status layer on `Player`:
`stunnedUntil`, plus `slowUntil` and `slowFraction`.

| While stunned | Behaviour |
| --- | --- |
| Movement | None. `isRooted` already exists, so the stun extends it. |
| Uncommitted auto windup | Cancelled with a cooldown refund, the same as a move order today |
| Q/W/E cast window in progress | **Interrupted, cooldown refunded** (needs a decision, see below) |
| Q / W / E / F presses | Ignored. You cannot Flash out of a stun. |
| Move / attack / attack-move orders | **Buffered, latest wins**, then replayed when the stun ends. This reuses the `CastSystem` buffer behaviour. |
| `S` | Discards the buffered order |

A slow multiplies `PLAYER.moveSpeed` in `Player.update`. All timing uses the GameClock, so
both effects freeze correctly when paused.

## Look

- **Body:** a tall, narrow slime with a floating rune shard above it, so its silhouette
  differs from both the round basic and the wide horned Pursuer. It must not be blue,
  because blue means *you*.
- **Hostile spell colour:** electric gold/white with a red edge. It has to read as hostile
  and stay distinct from the orange-red edge fireballs and from your cyan, teal and violet.
- **Lance:** a thin dotted line while charging, then a solid, brighter line on lock, then a
  flash. The lock is the cue to move, so it must be the loudest moment.
- **Eye / Rite:** a ground circle that fills inward, with the centre ring drawn separately.
- **Stun on you:** a small gold spark ring over your slime plus a dizzy pose. The HP plate
  can show a short countdown bar.

This keeps the README rule of **no line from the player to anything**: the Lance starts at
the Magus.

## Architecture

The structure already supports this. `WaveDirector` notes that a third enemy is "one entry
in ARCHETYPES + its roster/pip keys."

| Piece | Change |
| --- | --- |
| `entities/Magus.ts` (new) | `extends Enemy`. State machine `reposition → casting(ability) → channel(rite)`. Owns spacing, the spell gap and choosing spells. It doesn't own zones. |
| `systems/HostileSpellSystem.ts` (new) | Owns every live hostile **zone** (line, circle) and the **Orb**. Resolves hits at their deadlines, applies damage and CC, and fizzles everything on wave clear (copying `EnemyProjectileSystem`'s `isWaveActive` gate). Keeping spells out of the entity is what lets placed zones outlive their caster. |
| `EnemyContext` | Add `spells` (`castLine` / `castCircle` / `fireOrb`), `player.vx/vy` (for leading) and `isLastStanding`. Basic and Pursuer ignore them. |
| `Projectile` | Expose `travelled` so the Orb's stun can scale with it. |
| `Player` | Stun/slow status as above. `AttackSystem`, `CastSystem` and `InputController` gate on `player.isStunned`. |
| `WaveDirector` | Add a `magus` entry to `ARCHETYPES` with a wide `minSpawnDistance`. `validateStages()` checks the new pip key automatically. |
| `balance.ts` | `MAGUS` block, `magus` added to `WaveRoster` / `EnemyPips`, `STAGES` rows. |
| `view/MagusView.ts`, `art/sprites.ts`, `theme.ts` | Sprite, zone drawing, stun FX. |
| UI | Kill tallies are already keyed by archetype. The end screen needs only a label. |

`onPlayerHit` already goes through the 250ms i-frames, so a Lance and an Eye landing on the
same frame do not stack. That behaviour seems fine to keep.

## Where it shows up

Introduce it in Stage 5, at most **one per wave**, and keep wave sizes at or below the
6-enemy cap. B = basic, P = Pursuer, M = Magus.

| Stage | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Pips (B / P / M) |
| --- | --- | --- | --- | --- | --- |
| 5 | **2B + 1P + 1M** | 2B + 3P | — | — | 2 / 3 / 2 |
| 6 | 4B + 1P | **2B + 2P + 1M** | — | — | 2 / 3 / 2 |
| 7 | **3B + 1P + 1M** | 2B + 3P | **3B + 2P + 1M** | — | 3 / 4 / 3 |
| 8 | 2B + 3P | **4B + 1P + 1M** | **2B + 3P + 1M** | — | 3 / 4 / 3 |
| 9 | **3B + 2P + 1M** | 2B + 3P | **2B + 3P + 1M** | — | 3 / 4 / 3 |
| 10 | **4B + 1P + 1M** | 3B + 3P | **4B + 1P + 1M** | **2B + 3P + 1M** | 3 / 4 / 3 |

Stages 1–4 are unchanged.

## Build order

Each step can be tested and shipped on its own.

1. **Player CC.** Stun/slow status and gating in Attack/Cast/Input, plus a debug hook to
   apply it. Tests: stun cancels the windup, buffers orders, blocks Flash, and freezes when
   paused.
2. **HostileSpellSystem.** Line and circle zones and the Orb, triggered from the console.
   Tests: hit/miss at the deadline, centre vs edge, fizzle on wave clear.
3. **Magus entity.** Spacing, spell gap, Lance/Eye/Orb, art.
4. **Waves.** `STAGES` rows, README tables, a `magus.spec.ts` suite in the style of
   `pressure.spec.ts`.
5. **Rite.** Last, and optional. The Magus works without it.

## Open questions

1. **Stun at all?** The alternative is a short root, where you can still cast and attack.
   That is less League-accurate and much less frustrating.
2. **Interrupting your cast:** refund the cooldown (matches how auto cancels work here), or
   burn it (closer to League, harsher)?
3. **Aim lead:** ship with `leadFraction` at 0 everywhere at first, or ramp it from Stage 7?
4. **Edge fireballs on Magus waves:** keep them, or turn ambient fire down while a Magus is
   alive so the screen doesn't get crowded?
5. **Rite trigger:** "last enemy standing" vs. a plain long cooldown (see the critique).

## The case against (devil's advocate)

What someone who hates this proposal would say:

- **"You put a stun in a mechanics trainer."** The game exists so you practise inputs, and a
  stun takes them away. Worse, an Orb plus a Pursuer is a guaranteed 33 damage you can't play
  your way out of: 750ms of stun against a 400ms telegraph. You've built a combo that teaches
  "get hit, then get hit again."
- **"It aims at where you are, so it teaches nothing new."** If it doesn't lead, "keep
  moving" beats every spell, and the edge fireballs already teach that. If it does lead, a
  bot with exact knowledge of your velocity is harsher than any human Xerath. Real Xerath
  players are beaten by mind games, and this AI has no mind to play against.
- **"A mob that runs away from an ADC is the most annoying enemy in games."** Chasing a
  backpedalling caster across the arena while Pursuers hit you from behind isn't kiting
  practice, it's a chore.
- **"The Rite trigger is gameable and punishes the wrong moment."** The best strategy is
  always to focus the Magus first, so the Rite almost never fires and the feature is dead
  code. When it does fire, it adds a 3-second dodge minigame to the end of every wave, right
  when the drill should be resetting.
- **"Too much scope for one mob."** Two new systems and a status layer that touches
  `AttackSystem`, `CastSystem` and `InputController`, the most-tested and most delicate code
  in the repo, all for an enemy that shows up in about half the waves from Stage 5 on.
- **"It ruins the look."** The README sells a dark, quiet field, and this adds lines,
  circles, a stun spark and a gold palette on top of red telegraphs and orange fireballs.
  Late waves become soup.
- **"It's Xerath in name only."** No mana, a charge that's only for show (the Lance's range
  never grows, so there's no charge-time vs. range trade-off), a root instead of Q's slow, a 3-shot Rite on a trigger nobody would choose. Call
  it a generic artillery mob, or commit to the real kit.

**Which of these land, in my view:** the stun/Pursuer combo and the Rite trigger are real
problems. I'd cap stacked CC (for example, a Pursuer swing can't *start* while you're
stunned) and probably move the Rite to a long cooldown. The scope critique is fair, but build
step 1 is also the groundwork for any future CC enemy. "Teaches nothing new" depends on
open question 3, and it's the one most worth playtesting.
