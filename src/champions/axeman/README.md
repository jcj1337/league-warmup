# Axe Man

An auto-attacker who has to catch what he throws. Q readies a spinning axe, his next auto
throws it for an extra pip, and it comes down near him: stand where it lands and it is
back in his hand for the next auto. Keep catching and every auto is an axe. Every number
is in [balance.ts](balance.ts); what each slot does is [kit.ts](kit.ts). Keys are per slot
and shared across champions: see the main README's [Controls](../../../README.md#controls).

| | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- |
| Auto | 170ms windup\* | 680ms\* | 260 | 1, **2 with a spinning axe** |
| Q | instant, interrupts nothing | 7000ms† | self | readies one axe (he holds 2) |
| W | instant, interrupts nothing | 12000ms†, **reset by a catch** | self | — |
| E | 250ms | 10000ms† | 240 (about his auto range), 60 either side of its line, pierces | 1, a 40% slow for 2s, and a 46px shove off the line |
| R | 400ms | 40000ms† | down a line and back, 42 either side; **press R again to recall it** | 1 on the way out, 1 on the way back |
| F | instant | 20000ms | 190 | — |

\* his level-1 auto cycle is 680ms, +6% attack speed per level; the windup is a quarter of it.
† at level 1; ability haste (+5 per level) shortens them to ×0.54 at level 18.

**Q, the axe.** Press Q and a spinning axe turns at his side (two, one at each side, when
he holds two). It costs nothing to press mid-swing: Q and W never cancel an auto. The next
auto throws the axe instead of a plain one. With both hands full Q does nothing and is not
spent. Axes he neither throws nor catches for 6s are dropped. The gems over the ability
bar are his hands, draining with the time left.

**Where it lands.** The axe bounces off its target and comes down 1s later, marked by a
circle on the ground that fills as it falls. The spot is measured from where he stands as
the axe hits:

- **Walking somewhere:** toward where he clicked, as far as the click, up to 120px. A long
  click to the left drops it 120px to the left; a short one drops it that short distance.
- **Not walking:** within 12px of him, so he catches it without moving.

The spot is decided once, as the axe hits: where he is walking at that moment is what
counts. Once the circle is on the ground, nothing he does moves it.

**Catching.** The circle is a little larger than his body (36px). If his centre is inside it
as the axe comes down to him (from 120ms before it would touch the ground, which is when
the falling axe reaches his body), he catches it: the axe is back in his hand, the 6s hold timer starts over, **W is ready again**, he
**scores** 10 × the stage multiplier (`Q.catchScoreBonus`, a gold `+N` over him) and he
**heals**. The heal grows with a streak: 5 HP for the first catch, 5 more for each catch in
a row (10, 15), up to 20, never past full (a catch that fills him up reads **MAX**). Missing a single axe ends the streak, and
the next catch heals 5 again.
A missed axe lies there for 350ms and can still be picked up by stepping on it; then it
is gone, and he waits for Q.

**W.** +25% move speed, fading to nothing over 0.75s, and +30% attack speed for 3s. It is
what gets him under an axe he sent too far, and each catch gives it back.

**E.** A great axe thrown a short way, about as far as his auto reaches, and very wide.
It passes through everything: each enemy in it loses a pip, is slowed, and is
shoved sideways off the line, to whichever side it was on. An unstoppable enemy (a braced
Bulwark) is hit and slowed but not moved.

**R.** Two great axes fly down a line and come back to him, wherever he has gone. They
turn for home about 110px past the first enemy they hit, or at once when he presses R
again, or at the arena's edge if neither happens. They pass through everything, and each
enemy can be hit once on the way out and once on the way back. The second press is not a
new cast: the cooldown runs from the first.

**His look.** A rugged, off-white slime: heavy brows, a scar, a full unkempt brown beard,
and a black crown tipped and banded in gold. His plain auto is
a small thrown axe; a spinning axe is larger, red-edged and leaves a red trail.

From the console: `__axeMan.Q.dropMaxPx = 240`, `__axeMan.Q.airMs = 1200`.
