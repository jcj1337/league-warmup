# Cassiopeia

A venom mage with a different rhythm from Ezreal: her autos are slower and her **E is the
beat between them**; Q and W are ground spells you place where enemies are *going* to be;
R is a once-a-stage cone that punishes enemies facing you. Every number is in
[balance.ts](balance.ts); what each slot does is [kit.ts](kit.ts). Keys are per slot and
shared across champions: see the main README's [Controls](../../../README.md#controls).

| | Aim | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | target | ~240ms windup\* | 950ms\* | 260 | 1 |
| Q, Noxious Blast | ground point | 150ms | 3500ms† | 500, blast radius 70 | 1 on landing, then poison |
| W, Miasma | ground point | 150ms | 12000ms† | 450, cloud radius 90 | 0; slows 35% and poisons inside |
| E, Twin Fang | the enemy nearest the cursor | 150ms | 800ms† | 400 | 1, **2 if poisoned** |
| R, Petrifying Gaze | cone toward the cursor | 200ms | 45000ms†, **back at every stage clear** | 420, 80° wide | 1; **stuns enemies facing you** 1.5s, slows the rest 50% |
| F | cursor | instant | 20000ms | 275 | — |

\* her level-1 auto cycle is 950ms (Ezreal's is 700ms), +3% attack speed per level; the
windup is a quarter of it. † at level 1; ability haste (+5 per level) shortens Q / W / E / R.

**Poison.** Q's blast and W's cloud poison what they touch for 4s: a pip every 2s while it
lasts (two more pips if they stay alive). Being poisoned is what makes E hit for two.

**Q and W are telegraphed.** Q lands 400ms after you place it; the green ring closing in
is the countdown, and anything that walks out before it lands is missed. W lingers 4s and
re-applies its slow and poison every half second to whatever is inside.

**E is point-and-click.** It takes the enemy nearest your cursor whose body is within 400px
of you, like a quick-cast point-and-click in League; with nothing in range it doesn't cast
and the cooldown doesn't start. Its cooldown is its own: autos never reset it and it never
resets autos.

**R reads facing.** An enemy is *facing you* when its heading points toward you: walking at
you, or standing still having last walked at you. Those are petrified (stunned, with a
stone eye over their head); enemies walking away are slowed instead. Everyone in the cone
loses a pip. R is back at every stage clear, so you get one per stage.

**Passive, Serpentine Grace.** +3% move speed per level, in place of attack speed.
