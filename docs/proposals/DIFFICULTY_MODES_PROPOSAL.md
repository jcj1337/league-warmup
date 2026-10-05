# Difficulty Modes Proposal

Status: **approved** 2026-10-04, being implemented, with these decisions: the bonus is
per **stage**; its sizes are none / 500 / 1500; Easy **does not** reduce damage (thinner
waves and later, rarer specials are enough); Easy's waves are 75% of Normal's. The numbers
are first guesses to tune in play; `MODES` in `balance.ts` is current.

## Summary

A second setting on the start screen, next to the champion: **Easy**, **Normal** or
**Hard**. Normal is the game as it is today and the default. Easy and Hard mirror each
other around it.

| | Easy | Normal (today) | Hard |
| --- | --- | --- | --- |
| Magus first appears | Stage 7 | Stage 5 | Stage 3 |
| Sovereign first appears | Stage 8 | Stage 5 | Stage 4 |
| Bulwark closes every stage from | Stage 11 | Stage 8 | Stage 5 |
| How often casters are drawn | half as often | as now | 2.5× as often |
| Enemies per wave | 75% | 100% | 100% |
| Damage you take | ×1 | ×1 | ×2 |
| Stage-clear bonus (× stage multiplier) | none | 500 | 1500 |

Separately, and in every mode, what the specials score is rebalanced.

Normal's waves and damage are unchanged. Its scores do change (the rebalance and the new
bonus), so `BALANCE_VERSION` goes to 12 and old bests stop being compared.

## Scoring

### Specials score more

Kill score, as a multiple of a Slime's 100:

| Mob | Today | Proposed |
| --- | --- | --- |
| Slime | 1 | 1 |
| Pursuer | 2.25 | 2.25 |
| Magus | 1.5 | 2.5 |
| Sovereign | 1.75 | 3 |
| Bulwark | 5 | 8 |

Hard fields more of these, so it already out-scores Normal stage for stage without a flat
multiplier.

### A stage-clear bonus per mode

Instead of doubling every point on Hard, clearing a stage pays a flat bonus set by the
mode, multiplied by the stage multiplier every other point already gets
(× 1 + 0.25 per stage past the first):

| Stage cleared | Easy | Normal (500) | Hard (1500) |
| --- | --- | --- | --- |
| 1 | 0 | 500 | 1500 |
| 5 | 0 | 1000 | 3000 |
| 10 | 0 | 1625 | 4875 |

For scale: the existing HP bonus for a stage is at most 1000 (1500 flawless) before the
same multiplier, and a Stage 10 on Normal is worth roughly 20,000 to 25,000 in kills. So
the bonus is a visible reward for the clear, not the bulk of the score.

It is its own line in the score breakdown (`scoreFrom.clear`) and its own popup over the
slime (`+500 CLEAR`), above the HP bonus.

## Design

### One mode object, read as numbers

A `MODES` table in `src/config/balance.ts`. The engine reads a mode's numbers and never
tests `mode === 'hard'`, the same rule as champions.

```ts
export const MODES = {
  easy: {
    name: 'Easy', damageMultiplier: 1, waveSizeMultiplier: 0.75, stageClearBonus: 0,
    enemies: {
      magus:     { unlockStage: 7, weight: 0.3 },
      sovereign: { unlockStage: 8, weight: 0.3 },
      bulwark:   { unlockStage: 11, maxPerWave: { base: 1, k: 0, max: 1 } },   // never two
    },
    stages: EASY_STAGES,
  },
  normal: {
    name: 'Normal', damageMultiplier: 1, waveSizeMultiplier: 1, stageClearBonus: 500,
    enemies: {}, stages: STAGES,
  },
  hard: {
    name: 'Hard', damageMultiplier: 2, waveSizeMultiplier: 1, stageClearBonus: 1500,
    enemies: {
      magus:     { unlockStage: 3, weight: 1.5, maxShare: 0.5, maxPerWave: { base: 2, k: 0.3, max: 4 } },
      sovereign: { unlockStage: 4, weight: 1.5, maxShare: 0.5, maxPerWave: { base: 1, k: 0.3, max: 2 } },
      bulwark:   { unlockStage: 5, maxPerWave: { base: 1.3, k: 0.3, max: 2 } },  // two from about Stage 12
    },
    stages: HARD_STAGES,
  },
} satisfies Record<string, Mode>;
```

`enemies` is a partial override of an `ENEMIES` entry per mob. `stages` is that mode's
hand-written intro. The name `MODES` avoids a clash with `DIFFICULTY`, which already means
the per-stage scaling curve.

The chosen mode is saved as `Profile.data.mode` (default `'normal'`, validated in
`sanitize`). `GameScene.create()` resolves it once, like the champion, and hands it to the
systems below. It is fixed for the run.

### Rosters: `WaveDirector`

`WaveDirector` reads the registry through one accessor (`entry(id)`), the stage table
through `STAGES`, and the wave size through `stageDifficulty(stage).waveSize`. All three
become mode-aware:

- `entry(id)` returns `{ ...ENEMIES[id], ...mode.enemies[id] }`. Unlock stage, weight,
  share and per-wave cap all follow, and so does the chat's "New threat" line.
- `STAGES` reads become `mode.stages`. `validateConfig` checks every mode.
- Wave size (which is also a generated wave's budget) is multiplied by
  `mode.waveSizeMultiplier`. Authored waves never drop below their authored size.

The intros:

```ts
// Easy: slimes and Pursuers only; generated from Stage 7, where the Magus debuts alone.
const EASY_STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3 }] },
  /* 2 */ { waves: [{ basic: 3 }] },
  /* 3 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 4 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 5 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 2, pursuer: 2 }] },
  /* 6 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 3, pursuer: 2 }] },
];

// Hard: casters inside the intro; generated (and the Bulwark capstone) from Stage 5.
const HARD_STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 2 */ { waves: [{ basic: 2, pursuer: 2 }] },
  /* 3 */ { waves: [{ basic: 3, pursuer: 1, magus: 1 }, { basic: 3, pursuer: 2 }] },
  /* 4 */ { waves: [{ basic: 2, pursuer: 1, sovereign: 1 }, { basic: 2, pursuer: 1, magus: 1, sovereign: 1 }] },
];
```

Not changed in this version: behaviours gated on a stage inside a mob's own block (basic
spit from Stage 2, Pursuer dash from 4, the Sovereign's extra spheres from 14), and the
per-stage scaling curve itself. The Bulwark's pips follow the stage as now: 13 at its
Hard debut, 15 at its Easy one.

### Damage: `Combat.playerHit`

Every HP the player loses already passes through `Combat.playerHit`, so
`mode.damageMultiplier` goes there once and covers attacks, spells, body contact and edge
fire. The run log and the hit popup show the real numbers.

Hard is harsh, by request: a Pursuer swing is 25 on Stage 1 today, so 50 on Hard and about
77 by Stage 10 once stage scaling applies. Easy and Normal are ×1.

### The run log and bests

`RunRecord` gains `mode?: string` (absent means Normal, so old runs stay valid).
`RunHistory.summary` filters by mode as it does by champion, so "YOUR BEST" and "NEW BEST"
are per champion and per mode. `RoundResult` carries the mode; `__runs.summary()` defaults
to the current one.

### The start screen and HUD

- A row under the champion tiles: `EASY   NORMAL   HARD`, the chosen one highlighted. A
  click picks without starting the run, as a champion tile does. **Up / Down** step
  through it (Left / Right still browse champions). The panel grows about 40px.
- Picking saves to the profile and calls `returnToStart()`, as a champion pick does,
  because the held round has already built its first wave.
- During an Easy or Hard run the stage plate shows a small `EASY` / `HARD` tag, and the
  end screen names the mode beside the score.

### Tests

`startSuite(..., { champion, mode })` writes the mode into the profile before boot. A new
`modes.spec.ts` checks, per mode: `describeStage` shows each special's debut stage and the
Bulwark's first capstone wave; Easy's generated waves are smaller than Normal's on the
same stage; a scripted hit costs ×1 / ×1 / ×2; a stage clear pays the mode's bonus; the
run is logged with its mode and only counts toward that mode's best; the picker works by
click and by key and does not start the run. `score.spec.ts` is updated for the new
multipliers and Normal's bonus.

## Phases

One commit each, suites green:

1. `MODES`, `Profile.data.mode`, the mode passed into the systems; the damage multiplier;
   run log and bests per mode. Reachable from the console only.
2. Scoring: the special rebalance and the stage-clear bonus. `BALANCE_VERSION` 12.
3. Mode-aware `entry()`, stage table and wave size in `WaveDirector`; `EASY_STAGES`,
   `HARD_STAGES`.
4. Start screen picker, HUD tag, end screen line.
5. `modes.spec.ts`, README section, a line in `CLAUDE.md`.
