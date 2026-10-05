# Bulwark (K'Sante-style Tank) Proposal

Status: **implemented** 2026-10-04 as an **elite**, not a regular mob, with these
decisions: the name stays **Bulwark**; the brace **does not reduce damage**; it is a
stage's **capstone** (one in the last wave of every stage from **Stage 8**, two from about
Stage 18, never drawn by weight); it **costs 6**, and its wave draws **no Pursuers**;
**14 pips** at its debut (up to 18); All Out at **two thirds** of its pips, not half; a
stun that takes breaks a Strike it is winding up. No pull on the Heavy Strike yet. The
numbers below are the first proposal's where they differ; the README's Bulwark section and
`BULWARK` in `balance.ts` are current.

## Summary

A new melee mob, the **Bulwark**, built on K'Sante's kit: a big, slow slime with **10
pips** where everything else has 1 to 3. It is the first enemy that survives long enough
for sustained single-target damage to matter, which is what Cassiopeia's kit is built
around (keep it poisoned, bite it for two, earn R back).

- **Slow and large:** radius 34 (Pursuer 26), 0.4× your speed (Pursuer 0.55×).
- **Three moves, all telegraphed:** a short line slam (Strike), a braced charge along a
  locked path (Path Maker), and a transformation at half health (All Out).
- **Two phases, like K'Sante:** armoured and slow, then at half pips it sheds its plates
  and becomes fast and aggressive for the pips it has left.
- **At most one per wave**, from Stage 7.

The skill it drills: **stay on one target for several seconds without tunnelling.** You
have to keep hitting it while sidestepping its lines and reading the rest of the wave.

Like the Magus and the Sovereign, it borrows the kit, not the look or the name.

## K'Sante's kit, and what we keep

| K'Sante | What it does in League | Bulwark version | Kept / changed |
| --- | --- | --- | --- |
| Passive: Dauntless Instinct | Abilities mark enemies; his next auto on a marked enemy hits harder | None | Dropped: there is no auto-vs-ability split on the enemy side |
| Q: Ntofo Strikes | A short slam in a line that slows. Every third is a long strike that pulls and stuns | **Strike**: a short line in front of it, damage + slow. Every third is a **Heavy Strike**: twice as long, and it stuns | Kept. No pull in the first version (see questions) |
| W: Path Maker | Braces (damage reduction, unstoppable), then rams forward, knocking back and stunning | **Path Maker**: braces for 700ms with its path locked and drawn, then rams along it. Unstoppable throughout; hits you for damage + stun; then it is **winded** for 700ms | Kept, minus the damage reduction and the knockback |
| E: Footwork | A short dash with a shield; dashing to an ally shields the ally too | None | Dropped for now: shields are the Warden's engine work |
| R: All Out | Knocks one target away and duels it. He **loses tankiness** and gains damage, speed and faster abilities | **All Out**: at half pips it sheds its plates. Faster, shorter gaps between attacks, every second Strike is Heavy | Kept as a phase. "Loses tankiness" is literal: it is already at half health |

## Behaviour

**Movement.** It walks straight at you, like the Pursuer, but slower. It never stops to
keep distance. Because it always walks at you, it is always *facing* you, so
Cassiopeia's R petrifies it (except during Path Maker, below).

**Strike.** When you are within about 150px, it roots for 450ms with a line drawn on the
ground toward where you were when it started (locked, never re-aimed), then slams. If you
are still on the line you take damage and a slow. Step sideways, not backwards.

**Heavy Strike.** Every third Strike. The line is 300px long, so it reaches you at
Cassiopeia's auto range (200) and at most of Ezreal's. Longer windup (600ms), and it
stuns for 400ms. It starts a Heavy Strike from up to 280px away, so the Bulwark is not
harmless at range.

**Path Maker.** From 180 to 380px away, every 8s. It braces for 700ms: hunkered behind
its weapons, with its whole path (300px, as wide as its body) warming up red, as the
Pursuer's dash does. Then it rams down that path in 350ms. If its body touches you during
the ram you take damage and a 500ms stun, and it stops there.

- **Unstoppable** from the start of the brace to the end of the ram: slows and stuns
  don't take. Cassiopeia's R and W still remove their pip or apply poison; the petrify
  and the slow do nothing.
- It still **loses pips normally** while braced. No damage reduction: a mob built to be
  hit should never punish you for hitting it.
- **Winded** for 700ms after the ram: it stands still and can be stunned and slowed
  again. This is the window to land Cassiopeia's Q (400ms delay) or Ezreal's W → Q.

**All Out.** When it drops to half its pips, a 400ms flare (unstoppable, plates flying
off), then for the rest of its life:

| | Armoured | All Out |
| --- | --- | --- |
| Speed | 0.4× yours | 0.6× yours (capped at 0.8×, so it can always be kited) |
| Gap between Strikes | 1800ms | 1100ms |
| Heavy Strike | every third | every second |
| Path Maker cooldown | 8s | 5s |

Windups are the same in both phases. Telegraphs never get shorter.

**Rules it shares with the Pursuer.** It never starts a Strike or a Path Maker on a
stunned player. Damage scales with the stage (`DIFFICULTY.damage`) like every enemy
attack.

## Starting numbers

All in a new `BULWARK` block in `balance.ts`.

| Move | Telegraph | Size | Damage / effect | Cooldown |
| --- | --- | --- | --- | --- |
| **Strike** | 450ms, line locked at the start | 150 long, 30 either side | 14 + 30% slow for 800ms | 1800ms |
| **Heavy Strike** | 600ms, line locked at the start | 300 long, 26 either side | 14 + 400ms stun | replaces every third Strike |
| **Path Maker** | 700ms brace, path locked at the start | 300 long, body width (34 either side), 350ms ram | 20 + 500ms stun | 8s |
| **All Out** | 400ms flare at half pips | n/a | see the table above | once |

Registry entry (`ENEMIES.bulwark`):

| | Value | Why |
| --- | --- | --- |
| Pips | 8, +1 every 3 stages, at most 14 | **10 at its Stage 7 debut**, 12 at Stage 13, 14 from Stage 19 |
| Cost | 4 | It pushes four basics out of the wave |
| Unlock | Stage 7 | Stage 5 introduces both casters; Stage 6 is a breather |
| Per wave | 1, a second from about Stage 18 | `maxPerWave: { base: 1, k: 0.3, max: 2 }` |
| Contact damage | 12 (Pursuer 10) | A big body you should not path through |
| XP / score | 5 / ×4 | About the Pursuer's rate per pip |
| Spellcaster | no | Poison can finish it |

**Why 10 pips and not 6.** By my arithmetic from the champion READMEs (not measured in
game), around level 8 Cassiopeia removes about 4 pips a second on a poisoned target she
can stand next to, and Ezreal about 3 with his passive stacked. Six pips would last about
two seconds, which is a slightly fatter Pursuer. Ten is roughly 3s in ideal conditions and
5 to 6s while dodging. Pips are the first dial to turn in a playtest.

**The wave's par time** already counts pips (`SCORE.waveClear.parMsPerPip`), so a Bulwark
adds 6s to its wave's par with no change.

## What it does for each champion

| | Cassiopeia | Ezreal |
| --- | --- | --- |
| Damage | Poison stays up for its whole life; every E is a two-pip bite | Autos with full passive stacks; W → Q is 3 pips from level 9 |
| Ultimate | Each poisoned fang takes 500ms off R, so one Bulwark returns about 2s of R | R takes 2 pips as the first enemy on the line |
| Control | R petrifies it for 1.5s (it always faces you) unless it is in Path Maker; W slows its walk | None, but he out-ranges every Strike except the Heavy |
| Risk | She fights at 200px, inside Heavy Strike and Path Maker reach | Lower: he can kite it at 260 |

## Counterplay

| Threat | Read | Answer |
| --- | --- | --- |
| Strike | short red line from its body | sidestep; it is rooted for the windup, so keep hitting |
| Heavy Strike | long red line, its weapons raised overhead | sidestep; count the Strikes |
| Path Maker | hunkered, a wide path warming up red | move off the path; don't spend R or W on it now; punish the 700ms after |
| All Out | plates burst off, it changes colour | it is at half health: burst it down before it reaches you |
| Its body | the biggest thing on the field | don't get pinned between it and the crowd |

## Look

- **Body:** a wide, squat, **sand-tan** slime, about twice a basic's width, with dark iron
  plates across its back and brow, carrying two blunt clubs (the ntofos).
- **All Out:** the plates are gone, the body is a brighter, hotter tan, and the clubs have
  become pale blades. Narrower silhouette, so the phase reads without colour too.
- **Telegraphs** use the Pursuer's red ground language, not the casters' gold or lavender:
  this is a melee threat.
- **Colour.** K'Sante's own teal and gold are your Q and Flash. Red, purple, slate-green
  and indigo are the existing mobs; orange, lime, brown and stone-grey are spoken for in
  the mobs proposal. Tan is open and reads on the dark ash.
- **Health bar.** The pip bar is 34px wide whatever the pip count, which leaves 1px
  segments at 12 pips. The Bulwark gets a wider bar (58px: 3px segments at 12 pips).

## Architecture

| Piece | Change |
| --- | --- |
| `balance.ts` | `BULWARK` block; `ENEMIES.bulwark`; `BALANCE_VERSION` 10 → 11 |
| `entities/Bulwark.ts` | The AI, modelled on `Pursuer`: `chase`, `strikeWindup`, `brace`, `ram`, `winded`, `allOutFlare`, plus an `allOut` flag. It resolves its own Strike geometry at the end of the windup, as the Pursuer resolves its swing, so a Strike dies with it |
| `entities/Enemy.ts` | `unstoppable` flag: `stun()` and `applySlow()` do nothing while it is set, and `stun()` returns whether it took |
| `EnemyContext` | `stunPlayer(ms)` and `slowPlayer(fraction, ms)`, wired to the same scene functions the hostile spells use. Today only spells can stun or slow you; a melee mob has no way to |
| `champions/cassiopeia/kit.ts` | One line: apply the petrify status only if `stun()` took, so no stone eye appears on a mob that shrugged it off |
| `view/BulwarkView.ts` | Line and path telegraphs (the Pursuer's dash drawing, generalised), the winded pose, the All Out frame set |
| `view/PipBar.ts`, `EnemyArt` | An optional bar width per archetype |
| `art/sprites.ts`, `textures.ts`, `theme.ts` | About ten frames (walk ×2, strike windup, brace, slam, winded; All Out walk ×2, windup, brace), an extra-large shadow, the tan palette entries, a `THEME.bulwark` block |
| `WaveDirector.ts` | One line in `ARCHETYPES` |
| README | A Bulwark section and the mob table |
| Tests | `bulwark.spec.ts`: pips by stage, Strike hits on the line and misses off it, every third is Heavy and stuns, Path Maker locks its path, is unstoppable and leaves it winded, All Out at half pips and its numbers, nothing starts on a stunned player, Cassiopeia's R petrifies it outside Path Maker and not inside. Suites that read generated rosters from Stage 7 on (`endless`, `waves`, `scaling`, `mobs`) probably need their expectations updated; I have not checked each one |

Nothing in the hit funnel changes. Every hit still removes exactly one pip.

## Build order

Each step is its own commit with the suites green.

1. **The body:** registry entry, entity that only walks and bumps, sprite, wide pip bar.
   Already playable as a damage sponge.
2. **Strike and Heavy Strike,** with `stunPlayer` / `slowPlayer` on the context.
3. **Path Maker,** with `unstoppable` and the winded window.
4. **All Out.**

## Open questions

1. **Name:** Bulwark, or something else? (Warden is taken by the shield support in the
   mobs proposal.)
2. **Pips:** 10 at debut as proposed, or start nearer the 6 you mentioned and raise it
   after playing?
3. **Should the brace block hits,** as K'Sante's W reduces damage? I'd say **no**: it
   works against the reason this mob exists, and it would be the first exception to "one
   hit, one pip".
4. **Heavy Strike pull:** in League the third Q drags you in. That needs forced movement
   on the player, which the mobs proposal plans for the Grappler. I'd add the pull when
   that exists and ship the stun alone first.
5. **Unlock stage:** 7 as proposed, or earlier so a Cassiopeia run meets it sooner?

## What a critic would say

- **"You said tanky is annoying."** The mobs proposal has "low pips" as a design rule for
  exactly that reason. This is a deliberate exception, held in check by one per wave, no
  healing, no damage reduction, and a cost that removes four other bodies.
- **"It's a Cassiopeia mob."** Ezreal gets no poison payoff from it, so for him it is ten
  autos on a slow target. The Strikes and Path Maker are there so those seconds are a
  dodging drill and not a wait, but it will feel slower on him.
- **"All Out won't last long enough to notice."** At 4 pips a second, five pips is
  barely more than a second. If the second phase never gets to act, raise the pips or
  move the threshold up to two thirds.
- **"Cassiopeia's R trivialises it."** A 1.5s petrify on a mob that always faces you is a
  free kill window. That is the intended reward for holding R, and Path Maker is the one
  time it fails, but it may make the Bulwark the only sensible R target.
- **"More red lines in the soup."** Stage 15+ already has Magus zones, Sovereign spheres,
  spit and edge fire. One Bulwark adds two line telegraphs; two of them in All Out adds a
  lot.
