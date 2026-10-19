# Snake Lady

Snake Lady is a venom mage with a different rhythm from Magic Boy. Her autos are slower,
and **E is what you cast between them**. Q and W are ground spells you place where
enemies are *going* to be. R is a cone that punishes enemies facing you. Every number is
in [balance.ts](balance.ts), and [kit.ts](kit.ts) defines what each slot does. Keys are
per slot and shared across champions. You can rebind them in the pause menu.

| | Aim | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | target | ~240ms windup\* | 950ms\* | 200 (Magic Boy's is 260) | 1 |
| Q | ground point | 150ms | 2300ms† | 275, blast radius 45 | 1 on landing, then poison |
| W | ground point | 150ms | 12000ms† | 250; a wall of 7 clouds across your aim, ~180 × 60 | 0; slows 35% and poisons, only while inside |
| E | the enemy **under** the cursor | 150ms | 800ms† | 250 | 1, **2 if poisoned** |
| R | cone toward the cursor | 500ms, rooted; strikes as it ends | 45000ms†, **−500ms per poisoned fang** | 280, 80° wide | 1; **stuns enemies facing you** 1.5s, slows the rest 50% |
| F | cursor | instant | 20000ms | 190 | 0 |

\* Her level-1 auto cycle is 950ms (Magic Boy's is 700ms), and she gains +3% attack speed
per level. The windup is a quarter of the cycle. † At level 1. As for Magic Boy, each
level gives +5 ability haste, which shortens Q, W, E and R to ×0.8 at level 6, ×0.67 at
11 and ×0.54 at 18. That takes Q from 2.3s to 1.2s and E from 800ms to 430ms. Haste
shortens every cast window at half that rate, to ×0.70 at level 18, so R's cast goes from
500ms to 351ms.

**Sizes come from League, by proportion.** Ranges scale by her auto range. League's 550
is her 200, so W and E go from 700 to 250. Q is the exception. At 275 it's shorter than
League's ratio, just past her auto, so you walk up to cast it. Areas scale by body size
instead, because our bodies are far smaller relative to range than League's.

**A battle mage.** Like a battle mage in League, she does her damage from short range,
in the middle of the fight, while Magic Boy pokes from far off. Her auto reaches 200 to
his 260, and her whole kit is shorter than his to match.

**Poison.** Poison removes a pip every 2s while it lasts, and it's what makes E hit for
two. Q's blast poisons for 4s, which is two more pips if the enemy stays alive. W's cloud
poisons only while an enemy is inside it. An enemy that steps out before a tick loses the
poison without losing a pip, so W is for the slow and for setting up E, not for damage on
its own. Poison can't kill a spellcaster (the Magus or the Sovereign) from above one pip.
It wears one down to one pip and stops, so tagging one with Q and running doesn't kill
it. Poison on a spellcaster already at one pip can kill it.

**Effects.** Everything she casts bursts into soft, blotchy puffs that pop a little past
their size, splatter droplets and shrink away. Their outlines are smooth, not dotted.
Q, E and R use the same style as W.

**Her look.** She has the same rounded slime body as Magic Boy, in venom green, with two
small fangs under her smile. Her auto is a slim, deep violet needle of venom, where Magic
Boy fires a fat cyan bolt.

**Q and W are telegraphed.** Q lands 400ms after you place it. Venom wells up under the
target, and the ring fills from its centre as puffs bubble up inside it, then it bursts.
Q misses anything that walks out of the ring before then. Q is small on purpose. In
League it's about three champion radii wide, so you aim it at one enemy, from a little
further out than your auto.

**W is a wall.** As in League, she spits venom in an arc. Seven clouds land side by side
*across* your aim, the middle one on the cursor, in a line that bows slightly away from
her. Lay it across a path to cut it off. An enemy just past the cursor along your aim
line is not inside it. She throws the clouds: seven venom bolts leave her body in a fan
and lob onto their spots at 1200px/s, and each cloud bursts open where its bolt lands.
The wall starts working once all seven are down. It lasts 4s and re-applies its slow and
poison every half second to anything touching any of the clouds.

**E is point-and-click.** Press it with the cursor *on* an enemy whose body is within
250px of you. It uses the same hit test as a right-click attack. Pressed over empty
ground, E casts nothing, even with an enemy close by. Pressed on an enemy out of range,
it casts nothing either, and E's range ring closes in around you to show the reach. In
both cases the cooldown doesn't start. Autos never reset E's cooldown, and E never resets
autos.

**E's bite.** She rears back with her jaws opening, then lunges as two fangs leave her.
They weave apart in a shallow arc and meet again in the target, snapping shut across it
in a burst of venom puffs. A poisoned target takes a second, wider bite a beat later,
with a bigger burst and a short screen shake. That second bite is the second pip. A fang
that **kills** pays 10 × the stage multiplier in score (`E.killScoreBonus`), shown as a
gold `+N` over her.

**W-Flash and R-Flash.** If you Flash during either cast, the spell comes from where she
lands, aimed the same way. W's bolts leave from the Flash destination, and the wall lands
as far ahead of her as you aimed it. R's cone strikes from the Flash destination.

**R is a half-second cast.** As in League, she's rooted for 500ms while the cone fills
toward the cursor, and it strikes the instant the cast ends. A wave of venom puffs sweeps
out from her to the cone's edge, and a puff bursts on every enemy it catches, a stone
puff on the ones it petrifies. A move order you give during the cast waits and goes as
soon as R strikes.

**Motions** ([motions.ts](motions.ts)). Her body shows each cast before it fires, and she
moves like a cobra. On an auto she coils back, spits with her mouth open and ends on a
flick of the tongue. For Q she rears up tall, then nods down hard at the spot. For E she
opens her jaws on two fangs and lunges. R is a breath. She swells with her eyes squeezed
shut, gulps and holds it, trembling. On the frame the cone strikes, her eyes snap open,
blazing gold, before she lets the breath go. Each windup follows the real cast window,
so it quickens with haste. Under 300ms, R drops the trembling hold but keeps the breath,
the gulp and the glare.

**R and facing.** An enemy is *facing you* when its heading points toward you. That means
it's walking at you, or standing still after last walking at you. R petrifies those
enemies, which stuns them and puts a stone eye over their heads. It slows enemies walking
away instead. Every enemy in the cone loses a pip.

**E shortens R.** Nothing refreshes R between stages. Instead, every fang that lands on a
poisoned enemy takes 500ms off R's remaining cooldown, and the R slot flashes grey. The
more you keep enemies poisoned and bite them, the sooner R is back. League doesn't have
this rule. It's this trainer's own.

**Passive.** She gains +3% move speed per level. Magic Boy's passive gives attack speed
instead.
