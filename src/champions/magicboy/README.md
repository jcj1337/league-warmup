# Magic Boy

Magic Boy is the ADC the trainer was built around: autos to orbwalk with, a linear poke
(Q), a mark to cash in (W), a committed blink (E) and a global wave (R). Every number is
in [balance.ts](balance.ts), and [kit.ts](kit.ts) defines what each slot does. Keys are
per slot and shared across champions. You can rebind them in the pause menu.

| | Cast time | Cooldown | Range | Projectile speed | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700 to 347ms\* | 260 | 1150 px/s (homing) | 1 |
| Q | 165ms | 3000ms† | 450 | 1250 px/s | 1 (2 from level 9) |
| W | 185ms | 6000ms† | 450 | 1000 px/s | 0 on contact, **+1 on detonation** |
| E | 210ms | 8000ms† | 225 blink / 380 bolt acquisition | 1050 px/s bolt | 1 |
| R | 1000ms divided by attack speed, rooted | 30000ms† | global (the whole arena), 40 either side of its line | 950 px/s, pierces | **2 to the first enemy, 1 to each after** |
| F | instant | 20000ms | 190 | none | 0 |

\* Your level sets the auto cooldown, from 700ms at level 1 to 347ms at level 18 (+6%
attack speed per level). The windup is a quarter of the cooldown, and both shrink further
as the passive stacks. † At level 1. Each level gives +5 ability haste, which brings the
Q, W, E and R cooldowns down to ×0.54 at level 18. Haste shrinks the Q, W and E cast
windows at half that rate, to ×0.70 at level 18. R's charge follows attack speed instead.

When E's bolt lands it also pays 10 × the stage multiplier in score
(`BLINK_E.scoreBonus`). The blink alone pays nothing, so keeping a mob alive and blinking
around it earns nothing.

**Cast windows.** Q, W and E each commit you to a short window close to the auto windup:
auto 175ms, Q 165ms, W 185ms, E 210ms. The game locks the aim (Q, W) or the destination
(E) when you press the key, so moving the mouse mid-cast doesn't re-aim the spell. You're
rooted for the window, and the game ignores other ability keys. It holds any move,
attack-move or attack order you give (right- or left-clicking an enemy) and replays the
latest one the instant the cast resolves, so no auto starts mid-cast. `S` discards a held
order. Cooldowns start when the cast starts, so the window never lengthens them. Flash
stays instant on purpose.

**Motions** ([motions.ts](motions.ts)). His body shows each cast before it fires. He
wears a gauntlet, a gold cuff on his facing side, and its gem lights up in the slot's
colour before anything leaves it. On an auto he hunkers, leans in and kicks back. Q is a
quick draw: he flinches back, stretches toward the aim and kicks sharply. For W he
gathers low and round, then shoves forward and holds there a beat, so it looks different
from Q. For E he squashes, pulls tall and thin and vanishes, then pops in squashed where
he lands. For R he plants wide with teeth gritted and trembles harder as the charge
builds, then pulls back, and the wave knocks him back. Each windup follows the real cast
window, so the R charge plays its full brace, tremble and recoil whether it takes 1000ms
or 330ms.

**Passive.** A Q hit, a W mark landing or an E bolt hit each grants a stack and refreshes
a shared 6s timer. Each stack gives +10% attack speed, up to 5 stacks, and they all
expire together. A W *detonation* grants no stack, because the stack came when the mark
landed. Flash never grants one.

```
cooldownMs = stageBaseCooldown / (1 + stacks * 0.10)
```

**Cooldown refund.** A Q that lands takes 750ms off the *remaining* cooldowns of Q, W, E
and R, as in League. It never touches Flash and never restarts a cooldown. Each slot it
cuts flashes grey for half a second. This is how R comes back. Nothing refreshes it
between stages, so the more Qs you land, the more often you have R.

**R.** As in League, R is a long rooted charge followed by one wave that crosses the
whole arena. The charge is 1s divided by his attack speed, which counts levels and the
passive alike, so it takes about 625ms at level 11 and 495ms at 18. The wave passes
through every enemy within 40px of its line. The first enemy it touches loses two pips
and each one after loses one, so it clears a line of slimes and softens the rest. Every
enemy it hits grants a passive stack, and it detonates W marks like any other hit. Also
as in League, Flash during the charge leaves the wave behind. It still fires from where
you began, toward where you clicked.

**W combo.** W marks the enemy it touches and removes no pips. The next auto, Q or E bolt
to hit that enemy removes its own pip plus one more from the detonation, so W then Q
removes 2 pips. An unused mark lapses after 4s. E's bolt prefers a marked target, so W
then E cashes the mark in.
