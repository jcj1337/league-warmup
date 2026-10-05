# Snake Lady

A venom mage with a different rhythm from Magic Boy: her autos are slower and her **E is the
beat between them**; Q and W are ground spells you place where enemies are *going* to be;
R is a cone that punishes enemies facing you. Every number is in
[balance.ts](balance.ts); what each slot does is [kit.ts](kit.ts). Keys are per slot and
shared across champions: see the main README's [Controls](../../../README.md#controls).

| | Aim | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | target | ~240ms windup\* | 950ms\* | 200 (Magic Boy's is 260) | 1 |
| Q | ground point | 150ms | 2300ms† | 275, blast radius 45 | 1 on landing, then poison |
| W | ground point | 150ms | 12000ms† | 250; a wall of 7 clouds across your aim, ~180 × 60 | 0; slows 35% and poisons, only while inside |
| E | the enemy **under** the cursor | 150ms | 800ms† | 250 | 1, **2 if poisoned** |
| R | cone toward the cursor | 500ms, rooted; strikes as it ends | 45000ms†, **−500ms per poisoned fang** | 280, 80° wide | 1; **stuns enemies facing you** 1.5s, slows the rest 50% |
| F | cursor | instant | 20000ms | 190 | — |

\* her level-1 auto cycle is 950ms (Magic Boy's is 700ms), +3% attack speed per level; the
windup is a quarter of it. † at level 1; ability haste (+5 per level) shortens Q / W / E / R,
as for Magic Boy: ×0.8 at level 6, ×0.67 at 11, ×0.54 at 18 (Q 2.3s → 1.2s, E 800 → 430ms).
Haste shortens every cast window at half that rate: ×0.70 at level 18 (R 500 → 351ms).

**Sizes come from League, by proportion.** Ranges are scaled by her auto range (League's
550 is her 200): W and E 700 → 250. Q is the exception: shorter than League's ratio, just
past her auto (275), so you walk up to cast it. Areas are scaled by body size instead, since
our bodies are far smaller relative to range than League's.

**A battle mage.** Like a battle mage in League, she does her damage
from short range, in the thick of the fight; Magic Boy pokes from far off. Her auto reaches 200
to his 260, and her whole kit is shorter than his to match.

**Poison.** A pip every 2s while it lasts; being poisoned is what makes E hit for two.
Q's blast poisons for 4s (two more pips if they stay alive). W's cloud poisons only while
they're inside it: step out before a tick and the poison lapses with no pip, so W is for
the slow and for setting up E, not for damage on its own. **Spellcasters** (the Magus and the
Sovereign) can't be poisoned to death: poisoned above one pip, it wears them down to one and
stops, so tagging one with Q and running doesn't kill it. Poisoned at one pip, it can.

**One feel for the whole kit.** Everything she casts bursts open into soft, blotchy puffs
that pop a little past their size, splatter droplets and shrink away, with smooth outlines
rather than dotted ones. W set the tone; Q, E and R share it.

**Her look.** The same friendly dome as Magic Boy's, in venom green, with two small fangs
under her smile. Her auto is her own: a slim, deep violet needle of venom where Magic Boy
fires a fat cyan bolt.

**Q and W are telegraphed.** Q lands 400ms after you place it: venom wells up in place
under the target, the ring filling from its centre as puffs bubble up inside it, then it
bursts. Anything that walks out of the ring before then is missed. Q is
small on purpose: in League it's about three champion radii wide, so you aim it at one
enemy, from a little further out than your auto.

**W is a wall, not a circle.** As in League, she spits venom in an arc: seven clouds land
side by side *across* your aim, the middle one on the cursor, bowing slightly away from
her. Lay it across a path to cut it off; an enemy just past the cursor along your aim line
is not inside. The clouds are *thrown*: seven venom bolts leave her body in a fan and lob
onto their spots (1200px/s), each cloud bursting open where its bolt lands, and the cloud
takes hold once they're all down. It lingers 4s and re-applies its slow and poison every half second to
whatever touches any of the clouds.

**E is point-and-click.** Press it with the cursor *on* an enemy (the same hit test as a
right-click attack) whose body is within 250px of you. Empty ground casts nothing, even
with an enemy close by; an enemy out of range casts nothing either, and E's range ring
closes in around you to show the reach. Either way the cooldown doesn't start. Its cooldown
is its own: autos never reset it and it never resets autos.

**E bites.** She rears back with her jaws opening, then lunges as two fangs leave her. They
weave apart in a shallow arc and meet again in the target, snapping shut across it in a
burst of venom puffs. A poisoned target takes a second, wider bite that closes a beat
later, a bigger burst, and a short screen shake: that's the two pips. A fang that **kills**
pays 10 × the stage multiplier in score (`E.killScoreBonus`, a gold `+N` over her).

**W-Flash and R-Flash.** Flash during either cast and the spell comes out of her where
she lands, aimed the same way: W's bolts leave from the Flash destination and the wall lands
as far ahead of her as you aimed it; R's cone strikes from there.

**R is a half-second cast.** As in League, she's rooted for 500ms while the cone fills
toward the cursor, and it strikes the instant the cast ends: a wave of venom puffs sweeps
out from her to the cone's edge, and a puff bursts on every enemy it catches, stone on the
ones it petrifies. A move order given during it waits, and goes as soon as the gaze lands.

**Her body says what's coming** ([motions.ts](motions.ts)). She's a cobra. Her auto coils
back, spits mouth-open and ends on a flick of the tongue. Q rears her up tall, then nods
down hard at the spot. E opens her jaws on two fangs and lunges. R is a breath: she swells
with her eyes squeezed shut, gulps, holds it trembling, and on the frame the cone strikes
her eyes snap open, blazing gold, before she lets the breath go. Every windup is keyed to
the real cast window, so it quickens with haste; under 300ms R drops the trembling hold
and keeps the breath, the gulp and the glare.

**R reads facing.** An enemy is *facing you* when its heading points toward you: walking at
you, or standing still having last walked at you. Those are petrified (stunned, with a
stone eye over their head); enemies walking away are slowed instead. Everyone in the cone
loses a pip.

**R comes back through E.** No stage refresh: every fang that lands on a poisoned
enemy takes 500ms off R's remaining cooldown (the R slot flashes grey), so it returns faster the more you keep
enemies poisoned and bite them. This is this trainer's own rule, not League's.

**Passive.** +3% move speed per level, in place of attack speed.
