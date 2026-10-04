# Cassiopeia

A venom mage with a different rhythm from Ezreal: her autos are slower and her **E is the
beat between them**; Q and W are ground spells you place where enemies are *going* to be;
R is a once-a-stage cone that punishes enemies facing you. Every number is in
[balance.ts](balance.ts); what each slot does is [kit.ts](kit.ts). Keys are per slot and
shared across champions: see the main README's [Controls](../../../README.md#controls).

| | Aim | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | target | ~240ms windup\* | 950ms\* | 260 | 1 |
| Q, Noxious Blast | ground point | 150ms | 3500ms† | 400, blast radius 45 | 1 on landing, then poison |
| W, Miasma | ground point | 150ms | 12000ms† | 330; a wall of 7 clouds across your aim, ~180 × 60 | 0; slows 35% and poisons inside |
| E, Twin Fang | the enemy nearest the cursor | 150ms | 800ms† | 400 | 1, **2 if poisoned** |
| R, Petrifying Gaze | cone toward the cursor | 500ms, rooted; strikes as it ends | 45000ms†, **back at every stage clear** | 420, 80° wide | 1; **stuns enemies facing you** 1.5s, slows the rest 50% |
| F | cursor | instant | 20000ms | 275 | — |

\* her level-1 auto cycle is 950ms (Ezreal's is 700ms), +3% attack speed per level; the
windup is a quarter of it. † at level 1; ability haste (+5 per level) shortens Q / W / E / R,
as for Ezreal: ×0.8 at level 6, ×0.67 at 11, ×0.54 at 18 (Q 3.5s → 1.9s, E 800 → 430ms).

**Sizes come from League, by proportion.** Ranges are scaled by her auto range (League's
550 is our 260): Q 850 → 400, W 700 → 330. Areas are scaled by body size instead, since
our bodies are far smaller relative to range than League's.

**Poison.** Q's blast and W's cloud poison what they touch for 4s: a pip every 2s while it
lasts (two more pips if they stay alive). Being poisoned is what makes E hit for two.

**Q and W are telegraphed.** Q lands 400ms after you place it; the purple disc swelling
to the edge is the countdown, and anything that walks out before it lands is missed. Q is
small on purpose: in League it's about three champion radii wide, so you aim it at one
enemy, from a little further out than your auto.

**W is a wall, not a circle.** As in League, she spits venom in an arc: seven clouds land
side by side *across* your aim, the middle one on the cursor, bowing slightly away from
her. Lay it across a path to cut it off; an enemy just past the cursor along your aim line
is not inside. The clouds are *thrown*: seven venom bolts leave her body in a fan and lob
onto their spots (1200px/s), each cloud bursting open where its bolt lands, and the cloud
takes hold once they're all down. It lingers 4s and re-applies its slow and poison every half second to
whatever touches any of the clouds.

**E is point-and-click.** It takes the enemy nearest your cursor whose body is within 400px
of you, like a quick-cast point-and-click in League; with nothing in range it doesn't cast
and the cooldown doesn't start. Its cooldown is its own: autos never reset it and it never
resets autos.

**W-Flash and R-Flash.** Flash during either cast and the spell comes out of her where
she lands, aimed the same way: W's bolts leave from the Flash destination and the wall lands
as far ahead of her as you aimed it; R's cone strikes from there.

**R is a half-second cast.** As in League, she's rooted for 500ms while the cone fills
toward the cursor, and it strikes the instant the cast ends. A move order given during it
waits, and goes as soon as the gaze lands.

**R reads facing.** An enemy is *facing you* when its heading points toward you: walking at
you, or standing still having last walked at you. Those are petrified (stunned, with a
stone eye over their head); enemies walking away are slowed instead. Everyone in the cone
loses a pip. R is back at every stage clear, so you get one per stage.

**Passive, Serpentine Grace.** +3% move speed per level, in place of attack speed.
