# Champion Animation Proposal

Status: **implemented** 2026-10-04, with the changes under "Decisions" at the end. The
code is the reference now: [motion.ts](../../src/game/view/motion.ts), each champion's
`motions.ts`, and "Motions" in the README.

Give each champion's slime its own body language for every auto and ability, so the
windup reads as "something big is coming" and the release reads as "it went", and
make that body language stretch and shrink with the real timing.

## What exists today

- **Body frames** (`ChampionArt.frames`): five poses per champion: `idle`, `squash`,
  `stretch`, `charge`, `cast`. Cassiopeia's and Ezreal's are the same edits (drop a row,
  double a row, close the eyes, "o" mouth) on different bodies.
- **Pose pick** (`PlayerView.sync`): one switch for every champion and slot. Any cast
  shows the `cast` frame, any auto windup shows `charge`, and the release shows
  `stretch`.
- **Charge-ups** (`CastStyle`: `bolt | orb | blink | fang | none`): drawn *over* the
  slime in `overGfx`. Only `fang` moves the body (it rears back, then lunges).
- **Timing**: the right inputs already come in. `cast.progress` and
  `attacks.windupProgress` run 0→1 across the real window, and `msSinceRelease` and
  `castReleaseAge` cover the follow-through. Nothing is wall-clock and nothing feeds
  back into gameplay.

So the slime's *face* changes, but its *body* doesn't act anything out. Cassiopeia's R
and her Q look the same on the slime. Only the ground cone tells them apart.

## The core idea: a motion is keyed to progress, not to time

Every animation is a **Motion**: keyframes placed at *fractions of the window*, plus
a follow-through placed in *ms after release*.

```
            ┌──────────── windup: t = cast.progress (0 → 1) ────────────┐┌─ follow-through ─┐
Cassio R    │ inhale (swell)       │ gulp │ hold, trembling │ GAZE ▶    ││ deflate, dust    │
            0                     0.55   0.70             0.92     1.0  +0ms           +260ms
                                                                    ▲
                                                     strike pose lands exactly when
                                                     the cone resolves (CastSystem)
```

Because the windup is sampled from the authoritative `progress`, it **scales for free**:

| Window | What you see |
| --- | --- |
| Ezreal R at level 1 (1000ms) | full brace, long tremble, hitch, recoil |
| Ezreal R at level 18 + 5 stacks (~330ms) | same beats, about 3× faster |
| Auto at 950ms cycle (237ms windup) | full coil-and-spit |
| Auto at the 90ms windup floor | a snap with the same strike pose |

The strike pose always lands on `progress = 1`, the frame the mechanic fires. The
animation can't run ahead of the spell or lag behind it, because it has no clock of
its own. This is the rule `CastSystem` already sets out ("the visuals only read
`progress`").

### Three scaling rules

1. **The windup is normalised to the window.** Covered above. Nothing to tune.
2. **Short windows drop beats.** Each keyframe can name a `minWindowMs`. If the
   window is shorter than that, the keyframe is skipped and its neighbours join up.
   For example, Cassiopeia's R drops the trembling hold below ~300ms but keeps
   inhale → gulp → gaze. This stops a fast cast from turning into a 1-frame flicker of
   five poses. (The existing `anticipationCurve` already front-loads short casts; it
   stays.)
3. **The follow-through compresses to fit the next action.** Release keyframes are in
   ms, multiplied by a *tempo*:
   `tempo = clamp(timeUntilNextAction / naturalFollowThroughMs, 0.35, 1)`.
   - For autos, `timeUntilNextAction` is the recovery (`cooldownMs − windupMs`). As
     attack speed rises, the spit's follow-through gets snappier, and the slime is
     always back to neutral before the next windup starts.
   - For any new windup (auto or cast), the follow-through is **cut immediately**.
     A new windup is never hidden behind an old follow-through.

### About "scales with cooldowns"

Today, **cast windows don't shrink with ability haste.** Only autos and Ezreal's R
speed up, both with attack speed. Q, W, E and Cassiopeia's R are fixed (150–500ms) at
every level. Ability haste only shortens the time *between* casts.

The animation will follow whatever the window does. Making Cassiopeia's R gulp
faster at level 18 is a **gameplay** change: make `castTimeMs` read haste, for example
`R.castTimeMs / (1 + haste / 200)` (half the cooldown effect). The motion then speeds
up with it, with no animation code involved. See Open questions.

## What a champion authors

Each champion folder gets a `motions.ts` next to `art.ts`. The engine never switches
on a champion id. It only samples whatever motion the slot names.

```ts
// src/champions/types.ts (sketch)
export interface Keyframe {
  /** Windup keys: 0..1 of the window. Follow-through keys: ms after release (× tempo). */
  at: number;
  /** A body frame, the shared ones or the champion's own extras ('inhale', 'gaze', ...). */
  frame?: string;
  /** Body offset in art pixels: `along` the aim (+ toward it), `up` off the ground. */
  along?: number;
  up?: number;
  /** ±px of shake, for a strained hold. */
  tremble?: number;
  /** Over-body details drawn in overGfx: eye glint, tongue, gauntlet glow, motes... */
  overlay?: OverlayId;
  /** How it eases into this key: 'snap' holds the previous key, then cuts. */
  ease?: 'linear' | 'in' | 'out' | 'snap';
  /** Skipped when the window is shorter than this (rule 2). */
  minWindowMs?: number;
}

export interface Motion {
  windup: Keyframe[];
  followThrough: Keyframe[];
}

export interface AbilityDef {
  // ...
  motion: Motion;          // replaces castStyle; the charge-ups become overlays
}

export interface Champion {
  // ...
  autoMotion: Motion;      // the champion's auto
}

export interface ChampionArt {
  frames: Record<BodyFrame, readonly string[]>;
  /** Champion-only poses its motions use. Rasterised by look.ts like the rest. */
  extraFrames?: Record<string, readonly string[]>;
  // ...
}
```

On the engine side:

- **`src/game/view/motion.ts`**: one pure function,
  `sample(motion, phase, t, windowMs, tempo) → { frame, along, up, tremble, overlays }`.
  It's pure, so a suite can check it from the console without drawing anything.
- **`PlayerView`** keeps its order of precedence (stunned > cast > auto windup >
  follow-through > walk > idle). Inside the cast and attack branches it asks
  `sample()` for the frame and offset, instead of the hard-coded `F.cast` / `F.charge`
  / `F.release`. The existing lean and recoil become the *default* auto motion, so a
  champion that authors nothing looks exactly as it does today.
- **`GameScene`** passes two extra numbers it already has: the auto's `windupMs` and
  recovery, plus the current cast's `durationMs` (from `CastSystem`), for rules 2 and 3.
- **`look.ts`** rasterises `extraFrames` with the hat composed on top, so cosmetics
  ride along. Frames wider than the body (the swollen inhale) are fine: `compose`
  already centres the hat on the frame width.
- **Stun mid-cast** (`interrupt()`): the cast branch drops, so the slime cuts straight
  to the stunned slump. That's the correct read: the spell didn't go.

### Pixel honesty

Squash, stretch and swelling stay **authored frames** (a dropped row, a doubled row, a
16-wide inflated body), as they are today. There's no fractional `setScale` on the
sprite, so the pixel grid never shimmers. Body motion is whole-pixel offsets
(`Math.round` is already there). Glows, tongues and motes are pixel overlays in
`overGfx`, like the current charge-ups.

## The animations

The goal is that each one reads as *that creature doing that thing* in the first
~80ms, even at the shortest window.

### Cassiopeia: serpent, venom, a gaze that turns things to stone

Her archetype is a **cobra**: she rears up, the hood flares, she strikes low, and the
tongue flicks. Her coil is already on the body, so she tightens and loosens it.

| Slot | Windup (fractions of the window) | Release / follow-through |
| --- | --- | --- |
| **Auto**: venom spit | 0–0.7: head draws back, coil tightens (`charge` + new `coil` frame, along −2). 0.7–1: cheeks fill (`cheeks` overlay). | Snaps forward (along +3, `stretch`), then a **forked tongue flick** (2-pixel overlay out of the mouth) for ~120ms × tempo. The tongue is her signature: on every auto, the player learns "tongue = shot went". |
| **Q** Noxious Blast | Rises tall on the coil (`rear` frame: stretch plus a narrow neck, up +2), looking down at the point. | **A downward nod**: drops (up −1, `squash`) as if spitting into the ground. That ties her motion to where the blast wells up. |
| **W** Miasma | Gargles: swells (`inhale` frame), with green motes gathering at the mouth (the current `orb` charge-up, now an overlay). | **A sweeping spray**: the body sways side to side across the aim (along stays put, the offset swings ±3 perpendicular) over ~200ms × tempo, matching the 7-cloud arc being laid. |
| **E** Twin Fang | Keeps today's rear-back and jaws, plus a `fangs` frame with two white fang pixels in the open mouth. Kept tiny: E is on an 800ms cooldown and is the beat between autos. | The existing lunge. The follow-through is capped short (tempo against her auto recovery), because she'll E again soon. |
| **R** Petrifying Gaze | **0–0.55 inhale**: swells over two frames (14→16 wide), eyes squeeze shut, rises (up +1). **0.55–0.70 gulp**: a hard 1-frame squash, and a dark throat pixel slides down the body (the gulp). **0.70–0.92 hold** (`minWindowMs: 300`): swollen, eyes shut, trembling ±1px, a faint stone-grey rim. **0.92–1.0 hood flare**: top rows widen (`hood` frame). | **At 1.0 the eyes snap open, glowing** (`gaze` frame with gold-white eye pixels, plus a bright 2-frame eye glint overlay). Then she **exhales and deflates** back to idle over ~260ms × tempo, with grey "stone dust" motes falling off her. The eye-open frame *is* the strike, so the player learns "eyes open = stunned if they faced me". |

Sketch of the R frames (14→16 wide, same palette, plus `g` for gaze glow; to be tuned
in-game):

```
inhale (16w, eyes shut, cheeks puffed)     gaze (hood flared, eyes lit, mouth open)
.....kkkkkk.....                           ...kkkkkkkk...
...kkmmmmmmkk...                           .kkmmmmmmmmkk.
..kmwwLmmmmmmk..                           kmwwLmmmmmmmmk
.kmwLmmmmmmmmmk.                           kmwLmmmmmmmmmk
kmmLmmmmmmmmmmmk                           kmmLmmmmmmmmmk
kmmmmmmmmmmmmmmk                           kmmmmggmmmggmk
kmmmkkmmmmmkkmmk                           kmmmmggmmmggmk
kmmccmmmmmmmccmk                           kmmcmmmmmmmmck
kdmmmmmmmmmmmmdk                           kdmmmmkkkkmmdk
.kdsmmmmmmmmsdk.                           .kdsmmmmmmsdk.
..kkdsmmmmmsdkk.                           ..kkdsmmmsdkk.
....kkddsddDkk..                           ....kddsddDkk.
......kkkDDDDk..                           .....kkkDDDDk.
.........kkkkk..                           ........kkkkk.
```

### Ezreal: explorer, arcane gauntlet, a gunslinger's rhythm

His archetype is a **quick-draw shooter**: small, sharp anticipations and big, clean
recoils. He has no arms, so his gauntlet is a **3-pixel glint on the leading edge of
the body** that charges and fires. It's the same overlay for every slot, coloured by
the slot's fx, so "the gauntlet lit up" always means "Ezreal is about to shoot".

| Slot | Windup | Release / follow-through |
| --- | --- | --- |
| **Auto** | Today's hunker and lean (keep: it's the orbwalk drill's core read), plus the gauntlet glint warming up gold. | Today's pop and recoil, with the follow-through tempo-scaled against recovery, so at 347ms cycles it's a crisp tick, not a wobble. |
| **Q** Mystic Shot | **A quick-draw**: a 1-frame snap back (along −2) at 0–0.3, then the body stretches *toward the aim* (a new `lean` frame, wider on the facing side) while the glint flares blue. | A sharp kick back (along −3) and the glint pops. The fastest, cleanest motion in his kit. |
| **W** Essence Flux | **A two-handed gather**: he settles low (`squash`), the existing orb charge-up gathers its motes, and he bobs up at 0.8 (up +1). Rounder and slower than Q on purpose. | **A shot-put push**: a forward shove (along +3) that *stays* forward a beat before easing back. A push, not a recoil, so W never reads as Q. |
| **E** Arcane Shift | **A vanish**: tight squash (0–0.5), then pulled tall and thin (`thin` frame: stretched, 2px narrower), shimmering (alternating light/deep palette rows) to 1.0. | **Arrival** at the new spot: pops in squashed, then settles through `stretch` → `idle` (~150ms × tempo), with a sparkle ring. The blink is already instant; this makes the landing readable. |
| **R** Trueshot Barrage | **A brace and channel**: plants wide (`brace` frame: one row lower, 1px wider each side), the glint grows. **0.4–0.85**: rising tremble (0 → ±2px) and gold motes pulled into the gauntlet. **0.85–1.0 hitch** (`minWindowMs: 250`): pulls back hard (along −3), the beat before the big hit. | **Big recoil**: knocked back (along −6, visual only, decaying over ~220ms × tempo), `stretch` held, a gold release ring. It's anchored, so if he Flashes mid-charge the motion plays where the *sprite* is, but the glint stays aimed at the committed line. |

Ezreal's R is the showcase for scaling: its window already goes from 1000ms to ~330ms
with attack speed, and the brace → tremble → hitch → recoil reads at both ends.

## Optional: cooldown tells in idle

This ties animation to cooldowns in a second way. When a long-cooldown ability
(either R) **comes off cooldown**, the idle slime does a one-off tell: Cassiopeia's
eyes glint once, and Ezreal's gauntlet sparks. While it's ready, the idle has a rare
fidget, about every 6s. It's a cue you notice without looking at the HUD. It's cheap,
because it reads `AbilityCooldowns` the way the HUD does.

## Tests

- `sample()` is pure, so a new `animation` suite (or a block in `kit`) can drive
  `__warmup`: cast R, pause the clock at progress 0.6, and expect `player.pose ===
  'cast'` and `player.motionFrame === 'gulp'`. Set `__cassiopeia.R.castTimeMs = 250`
  and expect the hold key to be skipped.
- Existing suites keep passing as long as `PlayerView.pose` keeps its current values.
  Add a `motionFrame` readout next to it rather than renaming it.

## Phasing

1. **Engine**: `Motion`, `sample()`, `extraFrames` in `look.ts`, `PlayerView` sampling,
   tempo, and a default motion that reproduces today's look. No visual change. Suites
   green.
2. **Cassiopeia**: R first (the gulp is the proof of concept), then auto (tongue),
   then Q / W / E.
3. **Ezreal**: the gauntlet overlay, R, then Q / W / E / auto.
4. *(Optional)* idle cooldown tells.

Each step is its own commit, per the working notes.

## Decisions

Settled before building. Where they differ from the plan above, these win.

1. **Haste shortens cast windows.** Every slot's window divides by
   `1 + LEVELS.castHasteShare × haste / 100` (share 0.5: ×0.70 at level 18). Ezreal's R
   keeps following attack speed instead. Each slot's `castTimeMs` gets
   `{ castSpeed, attackSpeed }`.
2. **Smooth scaling, not pixel-honest.** Squash and stretch are `sx` / `sy` on the
   sprite, about the feet. Authored frames carry only what scaling can't: faces, mouths,
   fangs, the tongue. "Pixel honesty" above is superseded.
3. **No idle cooldown tells.** A sound cue may come later instead.
4. **Ezreal's gauntlet is part of his art**, a gold cuff on the facing side. Its gem is
   his glow pixel, lit in the slot's colour by each motion.
5. **`castStyle` stays** as the charge-up overlay, rather than being replaced by
   `motion`. Cassiopeia's Q and R set it to `'none'`: the purple orb and its release
   flash are gone, and the body carries those cues. Her W keeps its orb and has no motion
   of its own, unchanged on request.
6. **Glow** is a mask of the art's `glow` characters (her eyes, his gem), drawn over the
   body, tinted, with a motion's `glow` as its alpha.
