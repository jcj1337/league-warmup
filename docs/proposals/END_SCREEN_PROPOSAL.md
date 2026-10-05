# End Screen Proposal

Status: **implemented** 2026-10-05 (`src/game/ui/EndScreen.ts`), as option B with these
changes from the text below:

- The taunt is not per mob. One line under DEFEATED says how qwer would have done, picked
  by mode and stage reached (`deathTaunt` in `src/game/ui/missionMessages.ts`).
- The damage bars show the last stage only, top three sources, the rest as OTHER; a mob's
  body contact is counted as that mob.
- The track runs to one stage past the furthest you have been.
- Not built: tinting a kit stat by how good it is (a kit row is free text), and the
  green "+N" against your best score (the screen says YOUR BEST SCORE instead).

## Why the screen feels bland

It is one block of text: seven rows, one size, one colour, one weight. So:

- **Nothing is ranked.** "DIFFICULTY HARD" has the same visual weight as the score.
  The best thing that happened (a new best on Hard) is three words at the end of row 1.
- **Numbers have no yardstick.** 74452 is good or bad compared to what? "Stage 8" is
  how far past your previous best?
- **The run has no story.** The screen doesn't say what killed you, which is the first
  thing a player wants to know and the only thing that tells them what to practise.
- **Colour carries no information**, because there is only one.

Adding colour as decoration won't fix that. The fix is to give each colour one meaning
and each block one question to answer.

## Proposal

The same panel, split into four blocks, each answering one question. Every number shown
is already in `RoundResult`; nothing new is tracked.

```
                         DEFEATED
              STAGE 8 · WAVE 1/3 · HARD · 6:42 · LV 9

  ┌────────┐  SLAIN BY SOVEREIGN
  │ killer │  "KNEEL."
  │ sprite │  THIS STAGE  ██████████░░░░  SOVEREIGN 46
  └────────┘              ████░░░░░░░░░░  PURSUER   18
                          ██░░░░░░░░░░░░  EDGE FIRE  9

  1 ── 2 ── 3 ── 4 ── 5 ── 6 ── 7 ── 8          ★ NEW BEST
                           ▲ old best  ☺ you     2 STAGES FURTHER

  SCORE   74452                         BEST 74452 (1 RUN)
  ███████████████████████░░░░░░░▒▒▒▒▒▓▓▓
  KILLS 41200   SPEED 18900   HP 9100   CLEAR 5252

  110 KILLS   ☻69  ☻22  ☻9  ☻7  ☻3        Q ACCURACY  30/36  83%

        [ PLAY AGAIN  [R] ]     [ RETURN TO SELECT ]
```

### 1. What killed me? (the death card)

- The killer's own sprite at large scale (the mob art already exists in `sprites.ts`;
  edge fire gets a flame), on a plate tinted with that mob's colour.
- **SLAIN BY `<NAME>`** in the mob's colour, and one short taunt per mob underneath.
  This is the Cuphead piece from the plan, and it's the single biggest source of
  personality on the screen.
- Up to three bars from `stageDamage`: who took your HP in the stage that ended the
  run. Each bar is in that source's colour. This is the "what to practise" line.

### 2. How far did I get? (the progress track)

- A node per stage up to max(this run, previous best) + 1. Cleared stages filled, the
  stage you died in pulsing red, with wave pips under it (1/3).
- A marker at `previousBest`, your champion's sprite at where you got to. Beating the
  marker is visible at a glance; falling short shows exactly how far short.
- On `newBest`: a gold **NEW BEST** stamp that punches in with a short shake, and the
  title plate edge goes gold. Otherwise the track reads "BEST: STAGE 9" in dim cream.
  This is the only place the screen celebrates, so it means something when it does.

### 3. How well did I score? (the score block)

- Score at 2× the size of everything else, in gold, counting up over ~0.8s.
- A single segmented bar from `scoreFrom` (kills / speed / hp / clear), labelled
  beneath. It shows how the score was earned, which today is hidden: a player who
  never gets the speed bonus sees that segment missing.
- Your best score beside it; green "+N" if this run beat it.

### 4. What did I do? (the detail strip)

- Kills by type as small mob sprites with counts, replacing the wrapped
  "BASIC 69 PURSUER 22 ..." line (which already overflows with five mob types).
- The champion's `kitRows` (Q accuracy etc.), with the percentage tinted by band:
  green ≥ 75, cream, red < 40.

### Colour rules

| Colour | Means | Used for |
| --- | --- | --- |
| Gold (`ui.accent`) | achievement | score, NEW BEST, buttons |
| Red (`ui.danger`) | what ended you | title, the death stage node |
| A mob's own body colour | that mob | killer name, damage bars, kill icons |
| Green (`ui.good`) | better than your past self | deltas vs best |
| Dim cream (`ui.dim`) | labels | every label; values stay full cream |

Just the last row (labels dim, values bright) fixes much of the flatness on its own.

### Reveal

Blocks arrive in order over about 1.5s: title, death card, track fills node by node,
score counts up, stamp. Any key or click skips to the finished screen; `R` still
restarts immediately at any point. Timed on the UI scene's own time: the run is over,
so nothing here is a gameplay deadline.

## What it costs

- **Code**: the overlay becomes its own view (`src/game/view/EndScreen.ts`) built from a
  `RoundResult`, instead of one `BitmapText` inside `UIScene`. Sizes, timings and the
  taunt lines go in `theme.ts` and the `ENEMIES` entries' presentation side. A mob's
  colour and portrait come from its registry entry, so a new mob needs no end-screen work.
- **Tests**: `endless`, `modes`, `progression`, `runs` and `score` read
  `UIScene.resultText.text` with regexes ("STAGE REACHED", "YOUR BEST", "NEW BEST!").
  The new view should expose a plain `summary` object for them instead of them parsing
  layout.
- **A decision reversed**: `runs.spec` asserts the screen does *not* show damage or
  "KILLED BY"; that was kept in the run log as tuning data. This proposal puts the
  killer and the last stage's damage back on screen, as coaching rather than tuning.
  Whole-run damage, the raw attack metrics and the rest stay off it.

## Alternatives

- **A. Recolour only.** Dim labels, gold score, mob-coloured kill counts, a NEW BEST
  stamp. An hour of work, no test changes beyond one regex. Fixes the flatness, not
  the missing story.
- **B. The proposal above (my recommendation)**, in three commits: (1) the view and
  colour hierarchy with today's content, (2) the death card and damage bars, (3) the
  progress track, score bar and reveal.
- **C. Full Cuphead card**: a full-screen takeover with a big animated killer pose and
  rhyming quote. The most personality, but it needs new art per mob, and it pushes the
  stats (which a trainer exists for) to a second screen.

## Open questions

1. Taunts: one fixed line per mob, or a small pool? Who writes them?
2. Should the progress track stop at your best + 1, or show a fixed horizon (e.g. 10)?
3. Is the damage breakdown wanted on screen, given it was deliberately removed before?
