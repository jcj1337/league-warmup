# New Mobs and Boss Stages Proposal

Status: **for discussion**. Written 2026-10-02. Nothing here is implemented yet.

## Summary

- **Four new mobs**, each built to drill one ADC skill the current roster doesn't:
  - **Popper:** spacing under pressure.
  - **Splitter:** target selection.
  - **Grappler:** dodging hooks and hiding behind minions.
  - **Warden:** killing the support first.
- **A boss stage every 5 stages** (5, 10, 15, …). A boss is one big, telegraphed fight
  with a boss health bar, phases and adds, rotating between bosses.
- **A small engine layer** that all of this needs: enemies that spawn other enemies,
  enemies that die without being killed, shields, and a boss bar.

Everything plugs into what exists: the `ENEMIES` registry, the generator (a new mob's
first wave fields it alone), the difficulty curve, attack tokens, contact damage, the
run log and the score.

## Design rules for a new mob

1. **One skill per mob.** If a mob doesn't make you play differently, it's just another
   body.
2. **Every attack is telegraphed,** in the existing language: red ground hurts, the path
   or area is drawn before it lands, and telegraph timings never scale.
3. **Readable in a swarm of 30.** It needs its own silhouette and colour, not just a
   recolour. Blue is yours; red, purple and slate-green are taken; cyan, teal, violet,
   pink and gold are your abilities.
4. **Low pips.** You said tanky is annoying, so difficulty comes from behaviour, not
   health.

## The mobs

### Popper: spacing under pressure

A small **orange** slime with a fuse sprouting from its head. Its counterplay is the
opposite of the Pursuer's: you don't want it near you, but you want to kill it when
it is near *them*.

| | |
| --- | --- |
| Behaviour | Runs at you, faster than a Pursuer (0.75× your speed). Within 70px it stops and lights its fuse: 600ms of swelling, flashing and a red circle on the ground. Then it explodes (radius 85). |
| Damage | 14 (scaled like other attacks) to you if you're in the circle. **It also hits other enemies**: 1 pip to every mob in the blast. |
| Killed early | Pops harmlessly, with no blast. Killed **during** the fuse, it detonates on the spot. |
| Pips / cost / unlock | 1 / 1 / **Stage 3** |
| What it drills | Kill it before it arrives, or walk out of the fuse circle. Advanced: let it reach a crowd and pop it there. |

### Splitter: target selection

A **lime-green**, wobbly, translucent jelly, about the size of a Pursuer.

| | |
| --- | --- |
| Behaviour | Slow (0.4× your speed), walks at you, no attack beyond contact. On death it **splits into 3 Slimelings**: tiny, fast (0.7× your speed), 1-pip versions that charge you. |
| Damage | Contact only (Splitter 8, Slimeling 4). |
| Pips / cost / unlock | 2 (Slimelings 1) / 3.5, counting its 3 Slimelings / **Stage 6** |
| What it drills | When to kill it. Popping it next to you means three fast bodies on top of you; popping it at range buys time. Kill it early when you have space, late when you don't. |

### Grappler: dodging CC, and hiding behind minions

A squat **brown** slime with an iron hook. This is the Blitzcrank / Thresh lesson.

| | |
| --- | --- |
| Behaviour | Holds 250–350px from you. Every 5s it winds up (500ms: hook raised, a thin dotted line toward you, **locked** at the start) and throws a hook: 900px/s, 420px range, radius 10. |
| On hit | Pulls you 180px toward it over 200ms, then a 300ms stun. Uses the same stun rules as the Magus Orb, so no Pursuer swing can start on you while stunned. |
| **Blocked by other mobs** | The hook stops at the first enemy it touches, like minion block in League. Standing behind your enemies is real counterplay. |
| Pips / cost / unlock | 2 / 1.5 / **Stage 8** |
| What it drills | Sidestep the locked line, or put a body between you and it. |

### Warden: kill the support first

A tall **stone-grey** slime carrying a rune shield.

| | |
| --- | --- |
| Behaviour | Stays behind the crowd, 300–400px from you. Every 4s it **shields** the 2 nearest allies: a white ring around them that absorbs their next pip loss. It never attacks. |
| Pips / cost / unlock | 3 / 2 / **Stage 11**, at most 1 per wave until Stage 16 |
| What it drills | Priority under pressure: chase the Warden through its crowd, or chew through shields. A W mark detonation still removes a pip after the shield breaks, so W → Q is the shield answer. |

Health bars: shielded enemies show a white ring, even at full health.

### Considered, not proposed yet

- **Nest:** a stationary spawner that makes basics until killed. It overlaps with the
  Splitter, and the wave budget already handles numbers.
- **Sniper:** a laser-sight line shot. It overlaps the Magus Lance.

## Boss stages

Every 5th stage is a boss stage: **5, 10, 15, 20, …**, rotating through the bosses. A boss
stage is **one wave**: the boss plus the adds it summons. You enter it at full HP (the
stage-clear heal), and clearing it is a normal stage clear.

Stage 5 is currently hand-written and introduces the Magus. That intro moves to **Stage
6** (a generated debut, so you meet it alone), and Stage 5 becomes the first boss.

### Boss health and the bar

Pips stay the unit of damage: every auto still removes 1, a ranked Q 2, and so on. A
boss has many pips, so it gets its own **boss bar** across the top of the screen (name
plus a continuous bar, with phase thresholds marked) instead of the small segmented bar.

Boss HP is set from a **target fight length** and your expected damage per second at
that stage:

```
boss pips = targetSeconds × expected pips/s at the stage's typical level
```

| Boss stage | Typical level | Expected pips/s | Target | Boss pips |
| --- | --- | --- | --- | --- |
| 5 | 4 | ~2.3 | 40s | ~90 |
| 10 | 11 | ~4 | 45s | ~180 |
| 15 | 16 | ~5 | 50s | ~250 |

If you're over-levelled the fight is shorter; under-levelled, longer. Bosses are the one
place where tanky is fine, because the fight is about dodging, not grinding.

### Boss 1: the Slime King (Stages 5, 20, …)

A huge **red** slime (radius 55) with a gold crown: the basic family's king.

| Attack | Telegraph | Counterplay |
| --- | --- | --- |
| **Slam** | Rears up 700ms, red ring of radius 130 around itself fills | Step out of the ring |
| **Leap** | Crouches 400ms, a circle appears **on you**, it lands 900ms later (radius 90), then a Slam ring on landing | Move out of the circle, then out of the ring |
| **Royal decree** (at 66% and 33% HP) | A crown flash; 4 basics + 1 Pursuer arrive in a pack | Deal with the adds or keep hitting the King |

It walks at 0.45× your speed, and its contact damage is high (15), so don't hug it.
Phase 2 (below 50%) shortens the gaps between attacks.

### Boss 2: the Arch-Magus (Stages 10, 25, …)

The ascended Magus: bigger, floating, ringed by four rune tablets.

| Attack | Telegraph | Counterplay |
| --- | --- | --- |
| **Lance fan** | 3 Lances at once, 25° apart, all locked together | Find the gap between the lines |
| **Eye barrage** | 3 Eyes in sequence, each placed on you 500ms apart | Keep moving, and change direction |
| **Orb** | As the Magus, but it splits into 3 on a wall bounce | Watch the bounce |
| **Rite** (at 50% HP) | Rooted 6s, 6 circles, **vulnerable**: it takes 2 pips per hit while channelling | Dodge, and punish it hard |

Its rune tablets **shield** it (Warden-style, one pip each) and recharge every 8s. Break
them with autos before you go for burst.

### Boss 3: the Brood Mother (Stages 15, 30, …)

A bloated **lime** Splitter queen. This is the add-management fight.

| Attack | Telegraph | Counterplay |
| --- | --- | --- |
| **Brood** | Every 6s, spits out 3 Slimelings (sac swells first) | Kill them or kite them |
| **Acid pool** | Lobs 2 blobs that leave lingering pools (4s, damage per 0.5s while inside) | Don't fight inside the pools |
| **Burst** (at death) | Splits into 6 Slimelings | The last 10 seconds are a swarm |

Bosses after 15 cycle again (20: King, 25: Arch-Magus, 30: Brood Mother), with HP and
damage on the curve as usual.

### Boss rewards

| | |
| --- | --- |
| Score | `boss kill: 2000 × stage multiplier`, plus a **boss speed bonus** against a par equal to the target fight length (same slide-to-zero-at-2× rule as waves) |
| XP | Worth about one level's XP at that stage, so a boss kill feels like a power spike |
| Feedback | A "BOSS" banner on the stage, the boss's name in the chat ("Mission 5: Defeat the Slime King."), a big death pop, and a "BOSS DEFEATED" banner |

## Engine work

| Piece | Change |
| --- | --- |
| Summon | `ctx.summon(type, x, y)` lets an enemy add enemies to the current wave (Splitter children, boss adds). The wave isn't clear until they're dead too. |
| Death without a kill | A Popper that blows itself up dies with no score or XP. The director checks for a wave clear on **any** death, not only player kills. |
| Shield | `Enemy.shield`: absorbs the next `takeHit()`. White ring in the view. |
| Mob-vs-mob damage | The Popper blast hits enemies: `HostileSpellSystem` circles can target enemies as well as the player. |
| Hook | A hostile shot that stops at the first enemy body it touches (needs the roster), plus a forced pull on `Player` that composes with the stun rules (cancels windups and casts the same way). |
| Bosses | `Boss extends Enemy`: a pattern state machine (attack → recover → next), phase thresholds and pip-scaled HP. A boss bar in `UIScene`. `STAGES` entries can be `{ boss: 'slimeKing' }`. A `BOSSES` registry with the rotation. |
| Art | Each mob: a sprite set in the slime family style, a view with its telegraph, and its colour in `PALETTE`. The King and Arch-Magus are scaled-up variants (2× pixel maps, not just stretched). |
| Tests | One spec per mob (behaviour, telegraph, counterplay, unlock) and one for bosses (HP formula, phases, adds, bar, rewards, rotation). |

## Phases

1. **Engine:** summon, death without a kill, shields, mob-vs-mob blasts. Small, but
   everything else needs it.
2. **Popper and Splitter.** Cheapest to build, and they change how swarms play the most.
3. **Slime King at Stage 5,** with the boss bar, the `BOSSES` registry and the Magus
   intro moved to Stage 6.
4. **Grappler** (the hook is the most mechanically involved mob) **and Warden.**
5. **Arch-Magus** at Stage 10, then **Brood Mother** at 15.

Each phase is playable on its own.

## Open questions

1. **Which mobs?** All four, or a subset to start? My order: Popper → Splitter →
   Grappler → Warden.
2. **Boss every 5 stages, replacing the stage** (proposed), or an extra stage inserted
   after every 5th?
3. **Boss fight length:** 40–50 seconds as proposed, or shorter (25–30s) to keep the
   warmup snappy?
4. **Popper friendly fire:** keep its blast hurting other mobs? It rewards clever play,
   but it can also clear waves for you by accident.

## Risks

- **Screen noise.** Four new attack types in a 40-body swarm: hooks, blasts, shields,
  splits. Unlock stages are spaced out, and the Warden is capped, but Stage 15+ needs a
  playtest.
- **Bosses vs. the warmup's pace.** A 45s boss every 5 stages is about 15% of a run. If
  the warmup should stay snappy, use shorter fights (question 3).
- **The hook is the biggest mechanic change.** Forced movement on the player touches the
  same delicate input code as the stun did. It's built on the stun's rules, but it needs
  careful testing.
- **Splitter and Brood Mother balance.** Children multiply bodies quickly. That's why
  the Splitter's cost (3.5 = 2 + 3 × 0.5) counts its children: a wave's budget stays honest
  about how many bodies it really fields.
