# Ezreal

The ADC the trainer was built around: autos to orbwalk with, a linear poke (Q), a mark
to cash in (W) and a committed blink (E). Every number is in [balance.ts](balance.ts);
what each slot does is [kit.ts](kit.ts). Keys are per slot and shared across champions:
see the main README's [Controls](../../../README.md#controls).

| | Cast time | Cooldown | Range | Projectile speed | Pips removed |
| --- | --- | --- | --- | --- | --- |
| Auto | 175ms windup\* | 700→347ms\* | 260 | 1150 px/s (homing) | 1 |
| Q | 165ms | 3000ms† | 450 | 1250 px/s | 1 (2 from level 9) |
| W | 185ms | 6000ms† | 450 | 1000 px/s | 0 on contact, **+1 on detonation** |
| E | 210ms | 8000ms† | 310 blink / 380 bolt acquisition | 1050 px/s bolt | 1 |
| F | instant | 20000ms | 275 | — | — |

\* the auto cooldown is set by your level (700ms at level 1, +6% attack speed per level,
347ms at 18); the windup is a quarter of it, and both shrink further as the passive stacks.
† at level 1; ability haste (+5 per level) shortens Q / W / E to ×0.54 at level 18.

**Cast windows.** Q/W/E commit for a short window anchored to the auto windup
(auto 175 ≈ Q 165 < W 185 < E 210). The aim (Q/W) or destination (E) is frozen at
keypress, so moving the mouse mid-cast cannot re-aim the spell. The player is rooted
for the window and other ability inputs are ignored. Move, attack-move and attack orders
(right- or left-clicking an enemy) are **buffered** — the latest one wins — and replay the
instant the cast resolves, so no auto starts mid-cast. `S` discards a buffered order.
Cooldowns start at cast *start*, so the window never extends them. Flash stays instant,
deliberately.

**Passive.** Any landed ability hit — Q, the W mark landing, or the E bolt — grants a
stack (max 5, +10% attack speed each) and refreshes a shared 6s timer. All stacks
expire together. A W *detonation* grants none (the stack came when the mark landed),
and Flash never does.

```
cooldownMs = stageBaseCooldown / (1 + stacks * 0.10)
```

**Cooldown refund.** A landed Q takes 750ms off the *remaining* cooldown of Q, W and
E — never Flash, and never by restarting a cooldown.

**W combo.** W marks on contact and removes no pips. The next auto, Q or E bolt hit on
that enemy removes its own pip plus one more from the detonation (W → Q = 2 pips); an
unused mark lapses harmlessly after 4s.
E's bolt prefers a marked target, so W → E cashes the mark in.
