# Wave-Clear Feedback Proposal

Status: **for discussion**. Written 2026-10-03. Nothing here is implemented yet.

## What "+150 SPEED" actually is

It's the **quick-clear score bonus** from the score revamp. It is not enemy scaling
and not a buff to you.

- Every wave has a **target time** (internally `par`): its scheduled arrivals plus
  600ms per enemy health pip.
- Clear it at or under the target and you get the full bonus: 50 points per enemy in
  the wave, times the stage's score multiplier. The bonus slides to nothing at twice
  the target.
- The same popup system also shows **"+720 HP"** or **"+1080 FLAWLESS"** at a stage
  clear (10 points per HP you finished with), plus the green **"+N"** of the full
  heal. All three stack above your slime.

## Why it doesn't work, from first principles

The bonus exists for one reason: to **change how you play** (clear faster, take less
damage). Feedback on a reward only does that if the player can answer three questions
the moment they see it:

1. **What earned this?** "SPEED" reads like a stat: your speed, or the enemies'.
   Nothing says "you cleared that wave quickly".
2. **How well did I do?** "+150" has no scale. Was that the most you could get, or a
   tenth of it? Did a slow wave just get nothing, silently?
3. **What do I do differently?** Without the target time, there's nothing to aim for.

It's also in the worst place. Over your character is where your eyes are *during
combat*, and the next wave is already arriving. Score text there competes with
telegraphs, and three stacked popups at a stage clear is noise.

**Principle:** one message, in one place, in plain words, with the yardstick next to
the result. Text over the character should only be about the character (damage,
heal, level up).

## Proposal

| Moment | Today | Proposed |
| --- | --- | --- |
| Wave cleared | "WAVE CLEAR" banner at the top; "+150 SPEED" over your slime | The banner gets a second line: **`6.2s / TARGET 8.0s   QUICK CLEAR +150`**. Too slow for a bonus: **`14.9s / TARGET 8.0s   NO BONUS`** |
| Stage cleared | "STAGE CLEAR"; "+720 HP" or "+1080 FLAWLESS" over your slime | Second line: **`72 HP LEFT   +720`** or **`NO DAMAGE TAKEN   +1080`** |
| Full heal | green "+28" over your slime | unchanged: it's about your character, so it belongs there |
| Chat feed | mission start / complete only | one plain sentence per bonus, so it can be read later: *"Wave 2 cleared in 6.2s (target 8.0s): quick-clear bonus +150."* |
| First mission briefing | "Mission 1: Clear 1 wave." | adds once: *"Clear waves fast and finish missions healthy for bonus score."* |

The banner already lives at the top centre and already announces the clear, so this
adds no new HUD element. It only attaches the result to the moment you're already
reading. The banner would stay up ~1.2s (long enough to read; the next wave is still
arriving).

## Alternatives

- **A. Just delete the popups.** The bonus still counts, and the end screen's "SCORE
  FROM" row still shows the totals. This is the cheapest option, but the bonus then
  stops teaching anything mid-run, which defeats its purpose.
- **B. The proposal above (my recommendation).** Plain words, a target, in the banner
  and the chat.
- **C. B plus a live target timer.** A thin bar under the wave counter drains during
  the wave and empties at the target. This creates the strongest pull to play fast,
  but it's more HUD and more pressure, and it competes with the telegraphs. It could
  be added later if B isn't motivating enough.

## What a critic would say

- **"Nobody reads a second banner line mid-fight."** Fair for the first few waves. The
  chat line is the backup, and the number stays the same shape every wave, so it
  becomes glanceable.
- **"Showing NO BONUS feels like a scolding."** It's also the only way to learn the
  target exists. It could be faint grey instead of red.
- **"Target times you can't see during the wave are still guesswork."** True; that's
  what option C fixes.

## Open questions

1. A, B or C?
2. Show "NO BONUS" on slow waves, or stay silent?
3. Keep the stage HP bonus line, or fold it into the end-screen breakdown only?
