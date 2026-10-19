# Axe Man

Axe Man is an auto-attacker who has to catch what he throws. Q readies a spinning axe,
and his next auto throws it for an extra pip. The axe then comes down near him. Stand
where it lands and it's back in his hand for the next auto. If you keep catching, every
auto is an axe. Every number is in [balance.ts](balance.ts), and [kit.ts](kit.ts) defines
what each slot does. Keys are per slot and shared across champions. You can rebind them
in the pause menu.

| | Cast time | Cooldown | Range | Pips removed |
| --- | --- | --- | --- | --- |
| Auto | 170ms windup\* | 680ms\* | 260 | 1, **2 with a spinning axe** |
| Q | instant, interrupts nothing | 7000ms† | self | readies one axe (he holds 2) |
| W | instant, interrupts nothing | 12000ms†, **reset by a catch** | self | 0 |
| E | 250ms | 10000ms† | 240 (about his auto range), 60 either side of its line, pierces | 1, a 40% slow for 2s, and a 46px shove off the line |
| R | 400ms | 40000ms† | down a line and back, 42 either side; **press R again to recall it** | 1 on the way out, 1 on the way back |
| F | instant | 20000ms | 190 | 0 |

\* His level-1 auto cycle is 680ms, and he gains +6% attack speed per level. The windup
is a quarter of the cycle. † At level 1. Each level gives +5 ability haste, which
shortens these cooldowns to ×0.54 at level 18.

**Q, the axe.** Press Q and a spinning axe turns at his side. When he holds two, there's
one at each side. Pressing Q mid-swing costs nothing, because Q and W never cancel an
auto. The next auto throws the axe instead of a plain one. With both hands full, Q does
nothing and isn't spent. He drops any axe he hasn't thrown or caught for 6s. The gems
over the ability bar stand for his hands and drain as the time runs out.

**Where it lands.** The axe bounces off its target and comes down 1s later. A circle on
the ground marks the spot and fills as the axe falls. The game measures the spot from
where he stands when the axe hits.

- If he's walking, the axe lands toward where he clicked, as far as the click, up to
  120px. A long click to the left drops it 120px to the left, and a short one drops it
  that short distance.
- If he isn't walking, it lands within 12px of him, so he catches it without moving.

The game picks the spot once, when the axe hits, from where he's walking at that moment.
Once the circle is on the ground, nothing he does moves it.

**Catching.** The circle is 36px, a little larger than his body. He catches the axe if
his centre is inside the circle as the axe comes down to him. That window starts 120ms
before the axe would touch the ground, when the falling axe reaches his body. A catch
puts the axe back in his hand, restarts the 6s hold timer and makes **W ready again**.
It also scores 10 × the stage multiplier (`Q.catchScoreBonus`), shown as a gold `+N` over
him, and heals him. The heal grows with a streak. The first catch heals 5 HP, and each
catch in a row heals 5 more (10, 15), up to 20. It never heals past full, and a catch
that fills him up shows `MAX`. Missing a single axe ends the streak, and the next catch
heals 5 again. A missed axe lies on the ground for 350ms, and he can still pick it up by
stepping on it. After that it's gone, and he waits for Q.

**W.** It gives +25% move speed that fades to nothing over 0.75s, and +30% attack speed
for 3s. Use it to get under an axe he threw too far. Each catch resets it.

**E.** He throws a great axe a short way, about as far as his auto reaches, and it's very
wide. It passes through everything. The axe removes a pip from each enemy it hits, slows
it, and shoves it sideways off the line, toward whichever side it was already on. An
unstoppable enemy, such as a braced Bulwark, still loses the pip and gets the slow, but
doesn't move.

**R.** Two great axes fly down a line and come back to him, wherever he has gone. They
turn back about 110px past the first enemy they hit, or at once when you press R again,
or at the arena's edge if neither happens. They pass through everything and can hit each
enemy once on the way out and once on the way back. The second press isn't a new cast,
so the cooldown runs from the first.

**His look.** He's a rugged, off-white slime with heavy brows, a scar, a full unkempt
brown beard, and a black crown tipped and banded in gold. His plain auto is a small
thrown axe. A spinning axe is larger, has red edges and leaves a red trail.

You can tune him from the browser console, for example `__axeMan.Q.dropMaxPx = 240` or
`__axeMan.Q.airMs = 1200`.
