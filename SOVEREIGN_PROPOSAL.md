# Sovereign (Syndra-style Sphere Mage) Proposal

Status: **implemented** 2026-10-03 with these decisions: the name stays **Sovereign**;
Force of Will **can throw her basic slimes** (they land live, dazed 400ms); **no ultimate**
(Q, W and E only); a regular mob, not a boss (at most one per wave, from Stage 9); and
**Pursuers made rarer** to make room (weight 2 → 1.5, max share 0.6 → 0.5). Your autos
don't pop spheres, and Scatter doesn't knock you back. Dark Sphere's cooldown is 2.5s
(not 3.5s) so she keeps building her board. See the README's Sovereign section.

## Summary

A new caster mob, the **Sovereign**, built on Syndra's kit. The Magus drills "dodge what
is aimed at you". The Sovereign drills **reading the board**:

- she litters the arena with **Dark Spheres** that stay put;
- her other spells **use** those spheres;
- the dangerous moment is standing *behind a sphere* on the line from her, or letting
  too many spheres pile up.

Like the Magus, she borrows the kit, not the look or name. She stays in the slime
family.

## Syndra's kit, and what we keep

| Syndra | What it does in League | Sovereign version | Kept / changed |
| --- | --- | --- | --- |
| Passive: Transcendent | Collecting splinters upgrades her spells (an extra sphere, wider E, R execute) | **Stage-based upgrades**: more spheres allowed and a wider E on later stages, through the usual `scaling` block | Kept as scaling; no execute |
| Q: Dark Sphere | A sphere lands on a spot after a short delay, dealing damage; it stays a few seconds | **Dark Sphere**: led circle (like the Eye), lands after 600ms, then **stays on the ground for 6s** | Kept |
| W: Force of Will | Grabs a sphere or a minion and throws it at a spot; slows | **Force of Will**: grabs one of her spheres and throws it at a led spot; lands after 500ms; damage + slow | Kept (throwing *your enemies* at you is an open question) |
| E: Scatter the Weak | Short cone knocks enemies back; any sphere in it flies outward and **stuns** what it hits | **Scatter**: short cone in front of her, and every sphere inside it is **launched outward along the line from her through the sphere**; a launched sphere that hits you stuns | Kept. No knockback on you in the first version (see questions) |
| R: Unleashed Power | Every sphere she has flies at one target | **Unleashed**: with 3+ spheres out, each sphere draws a line to you (tracking, then locking), then they all fly at once | Changed: **dodgeable** lines, not a lock-on |

## Behaviour

**Spacing.** She holds **280–380px** from you: inside your Q range, just outside your
autos. That's closer than the Magus (360–480), so she's easier to dive, but deadlier up
close because of Scatter. She backs off at 60% of your speed and never moves while
casting.

**Casting.** One spell at a time, at least **1.2s** apart. She picks by priority:

1. **Unleashed:** 3+ spheres out, off cooldown, and you within 500px.
2. **Scatter:** off cooldown, and either you're within the cone's reach (220px), or a
   sphere lines up with you (the line from her through that sphere passes within 60px of
   you, inside launch range). She is hunting the angle.
3. **Q→E combo:** if Scatter is ready but nothing lines up, she places a Dark Sphere
   **between you and her**, then Scatters it at you. This is the signature move.
4. Otherwise **Dark Sphere** or **Force of Will**, at random.

**Aim.** The same leading aim and random spread as the Magus: she aims where you're
heading, at a random spot near it, rolled once per cast. I'd move that aim logic out of
the Magus into a shared caster-aim helper.

**Spheres.** At most **3** on the field (4 from Stage 14, 5 from Stage 19: the
Transcendent nod). Placing one past the cap removes her oldest. A sphere lasts 6s, and
they all vanish when she dies, so killing her clears the board. They also fizzle on wave
clear, like every hostile spell.

## Starting numbers

All in a new `SOVEREIGN` block in `balance.ts`. Damage scales with the stage like every
enemy attack (`DIFFICULTY.damage`).

| Spell | Telegraph | Size | Damage / effect | Cooldown |
| --- | --- | --- | --- | --- |
| **Dark Sphere** | Led circle, lands after 600ms | radius 55 | 12; the sphere then sits there 6s | 3.5s |
| **Force of Will** | 300ms grab (sphere lifts over her head), then a led circle landing after 500ms | radius 70 | 12 + 30% slow for 1s; the thrown sphere is used up | 6s |
| **Scatter** | 350ms: the cone fills red, and **every sphere it will launch draws its exit line** | cone 220px, 60° (80° from Stage 14); launched spheres fly 450px at 900px/s, radius 14 | Cone: 10. Launched sphere: 8 + **600ms stun** | 7s |
| **Unleashed** | 700ms: spheres glow and draw lines to you that **track, then lock** for the last 250ms | each sphere flies at 700px/s, radius 16 | 10 per sphere | 14s |

Other values: radius 20, pips 2 (like the Pursuer: +1 from Stage 11), contact damage 6,
XP 3, cost 2, at most **1 per wave**, first appears **Stage 9** (a generated debut, so you
meet her alone).

**Stun rules** are the Magus Orb's: no movement, autos, abilities or Flash; held orders
replay when it ends; no Pursuer swing starts on a stunned player. A launched sphere can
only stun you once per Scatter.

## Counterplay, which is the whole point

| Threat | Read | Answer |
| --- | --- | --- |
| Dark Sphere | circle on the ground | step out; then **remember where the sphere is** |
| Scatter | cone fill + exit lines from each sphere | don't stand **behind a sphere** relative to her; step off the line during the 350ms |
| Q→E | a sphere lands between you and her | that's the warning: get off that line before the cone fills |
| Unleashed | 3+ spheres glowing, lines converging on you | move perpendicular as the lines lock; better, kill her before she has 3 out |
| Her | squishy, 280–380px away | dive her: killing her deletes every sphere |

## Look

- **Body:** a deep **indigo-black** slime, darker than the purple Pursuer, with a silver
  diadem and pale lavender eyes. Two small dark orbs circle her, with a white rim so they
  read on the dark ground.
- **Ground spheres:** black orbs with a pale rim and a slow pulse. In their last second
  they flicker, so you know they're about to expire.
- **Exit lines and Unleashed lines:** pale lavender dotted lines with a red fill on the
  ground once they lock, the same "red ground hurts" language as everything else.
- She can't be violet, magenta or pink (your W and E) or purple (the Pursuer). Indigo-black
  with white and lavender accents is the open slot.

## Architecture

| Piece | Change |
| --- | --- |
| `entities/Sovereign.ts` | The AI: spacing, priorities, the Q→E combo, line-up detection |
| `systems/HostileSpellSystem.ts` | A new **persistent object** layer for spheres (position, lifetime, owner), a **cone** zone shape, launchable shots with a fixed stun, and line telegraphs that track then lock |
| `view/SovereignView.ts`, `HostileSpellView` | Sprite, orbiting orbs, sphere drawing, cone and line telegraphs |
| Shared aim | Lead + spread pulled out of `Magus` into a helper both casters use |
| `balance.ts` | `SOVEREIGN` block, `ENEMIES.sovereign` entry (cost 2, unlock 9, `maxPerWave` 1), `scaling` (sphere cap, cone width) |
| Tests | `sovereign.spec.ts`: sphere lifetime and cap, Scatter launching only spheres in the cone along the right line, stun, Q→E, Unleashed lock and dodge, spheres cleared on death and wave clear |

## Build order

1. **Spheres, Dark Sphere and Force of Will,** with spacing and the sprite.
2. **Scatter:** the cone, launching, exit-line telegraphs, the stun and the Q→E combo.
3. **Unleashed.**

## Open questions

1. **Name:** Sovereign (from Syndra's "Dark Sovereign" title), or something else?
2. **Can your autos pop her spheres?** That would add a target-selection decision (clear
   the board or hit her), but your attack-move would then auto-target spheres. I'd say
   **no** for now: killing her clears the board.
3. **Force of Will throwing *your enemies*:** she grabs one of her basic slimes and
   throws it onto you, where it lands live, so its contact damage and spit come with it.
   It's very Syndra and very nasty. Include it, or keep W to spheres only?
4. **Scatter knockback:** should the cone also push you back, as in League? That needs
   the forced-movement system planned for the Grappler. I'd leave it for later.
5. **Should she become a boss** (a "Dark Sovereign" for the Stage 15 slot) instead of, or
   as well as, being a regular mob?

## What a critic would say

- **"It's the Magus again."** Both are casters that throw circles at you. The
  difference, persistent spheres and angle-based stuns, only shows up when she lives
  long enough to build a board. At 2 pips in a swarm she might die before she's
  interesting.
- **"Too much to track in a swarm."** Spheres, exit lines, Unleashed lines, plus 30
  slimes, spit, Magus zones and edge fire. The 1-per-wave cap and the 3-sphere cap
  help, but Stage 15+ with a Magus *and* a Sovereign could be soup.
- **"The Q→E combo is a guaranteed stun."** If the sphere lands between you and her,
  then the cone fills 350ms later, the stun is only avoidable if you saw the sphere
  land. That's the point, but it will feel unfair the first few times.
- **"Unleashed with 5 spheres is a bullet hell."** Five lines converging from five
  angles leaves few safe directions. The sphere cap scaling is the dial.
