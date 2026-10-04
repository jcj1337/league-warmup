# Architecture Proposal: Foundation for Champions and Cosmetics

Status: **for discussion**. Written 2026-10-04. Companion to
[CHAMPIONS_PROPOSAL.md](CHAMPIONS_PROPOSAL.md): that one says how a champion plugs in,
this one says what the codebase underneath needs first, and sets the phase order for both.

## Summary

The game was built feature by feature, and it shows in four places: persistence is
spread over four modules, the player's art is baked into its sprite frames, `GameScene`
does six jobs, and run events (kills, clears, death) are hand-wired callbacks. None of
that hurts today. All of it gets in the way of what's planned: a second champion,
champion select, unlockable cosmetics bought with a currency earned from score, the
Cuphead-style death screen and sound cues.

Proposal: a **foundation pass** (Phase 0a) before the champion refactor (0b), and a
**layered art** pass (0c) before any new champion is drawn. Each lands with no visible
change and all suites green. What's deliberately **not** touched: `WaveDirector`,
`AttackSystem`, the console-tunable mutable config, and the Phaser coupling.

## Findings

### 1. Persistence is scattered

[Keybinds.ts](../../src/game/Keybinds.ts), [MouseSpeed.ts](../../src/game/MouseSpeed.ts),
[Settings.ts](../../src/game/Settings.ts) and [RunHistory.ts](../../src/game/RunHistory.ts) each own a
`localStorage` key (`warmup.*.v1`), a guarded read, a guarded write and their own
validation. Cosmetics add currency, unlocks, the equipped look and the chosen champion:
three or four more copies of the same code, and no single place that knows what "the
player's data" is.

### 2. The player's art is baked

The crown is drawn into every one of the five player frames via `crowned()` in
[sprites.ts](../../src/game/art/sprites.ts). A hat cosmetic would mean redrawing every frame
of every champion per hat. The pixel pipeline (character maps + a per-sprite palette)
is actually ideal for cosmetics; it just needs to compose at texture time instead of
being hand-merged in the sprite table.

### 3. `GameScene` does six jobs

[GameScene.ts](../../src/game/scenes/GameScene.ts) (~875 lines) builds every system, wires their
callbacks by hand, owns the round lifecycle and pause, is the hit/kill funnel, assembles
the HUD snapshot, assembles the `RoundResult`, and writes the run log. The champion
proposal's `ctx.hit()` is this same funnel, so splitting it is Phase 0 work either way.

### 4. Run events are hand-wired

Kill gold, score, XP and the level-up ring are lines inside `onKill`; the heal and HP
bonus are lines inside `onStageCleared`; the chat feed derives its lines by diffing HUD
snapshots. Currency, cosmetic unlocks, the death card and sound cues all want the same
moments, and each would be one more line in those methods.

### 5. Tests reach into internals

The suites touch `director` 66 times, `attacks` 18, `skillshot` 17, `hostileSpells` 13,
`player` 15, plus `cooldowns`, `passive`, `cast`, `progression`, `metrics`, `apm`,
`inputs`. Renaming any of those breaks suites: the real cost of every refactor here.

### 6. Docs

[TECHNICAL_REPORT.md](../TECHNICAL_REPORT.md) still describes ten authored stages and two
enemies. Seven proposals sit at the repo root.

### Leave alone

- **`WaveDirector` (634 lines) and `AttackSystem` (503).** Big but cohesive, heavily
  tested, and they are the feel of the game. Not worth the risk.
- **Mutable config.** `__balance.ATTACK.range = 400` from the console is deliberate for
  live tuning. Settings were split from it on 2026-10-04; that's enough.
- **Phaser coupling** in entities and systems (views built in constructors, `Fx.of(scene)`).
  It blocks a headless simulation, which only the parked RL proposal wants.
- **`balance.ts` size.** Only the champion blocks move out (see the champion proposal);
  enemy, wave and score config stays.

## Proposed design

### Profile store

One module, `src/profile/Profile.ts`, owning one key, `warmup.profile.v1`:

```ts
interface ProfileData {
  version: 1;
  champion: ChampionId;
  keybinds: Partial<Record<SlotAction, string>>;
  mouseSpeed: number;
  settings: { attackRangeDisplay; showDamageNumbers; pauseOnFocusLoss };
  currency: number;
  unlocked: string[];              // cosmetic ids
  equipped: Partial<Record<CosmeticSlot, string>>;   // 'hat' | 'skin' | 'trail'
  runs: RunRecord[];
}
```

- **One read at boot, one guarded write per change.** `Keybinds`, `MouseSpeed`,
  `Settings` and `RunHistory` keep their APIs and console handles; they become views over
  the profile instead of owning storage.
- **Migrations.** `migrate(raw): ProfileData` reads the four old keys once, folds them in,
  and removes them. Future schema changes are one more step in the same function. No
  player loses settings, bindings or their run log.
- **Field-by-field validation**, as `Settings` does today: a bad field falls back to its
  default, the rest loads.
- **Currency is awarded in the same write as the run record**, so a reload between the
  two can never pay twice or lose a run.
- Client-side and editable from the console, like everything else here. Fine for a
  single-player trainer, which is why currency must only ever gate cosmetics.

### Run event bus

A tiny typed emitter owned by the run:

```ts
interface RunEvents {
  hit:          { target: Enemy; killed: boolean; source: string };
  kill:         { target: Enemy; points: number };
  waveCleared:  ClearedWave & { points: number };
  stageCleared: { stage: number; points: number; flawless: boolean; healed: number };
  playerHit:    { damage: number; source: string; lethal: boolean };
  levelUp:      { level: number };
  death:        RoundResult;
}
```

Kill gold, XP, the level-up ring, the chat feed, the stage heal popup, and later
currency, unlock checks, the death card and sound cues are listeners. Gameplay systems
emit; nothing listens back into gameplay, so this never becomes a hidden control flow.

### `GameScene` split

- **`Run`** (no Phaser): round lifecycle (`awaitingStart` / running / paused / over), the
  `GameClock`, the event bus, `RoundResult` assembly, the profile write at death.
- **`Combat`**: the hit funnel (`hit(target, opts)` → score, mark/status checks, kill →
  XP, events). This is what a champion kit receives as `ctx.hit()`.
- **`GameScene`**: Phaser glue only. Builds systems, calls `update` in order, forwards
  input, exposes `getHudState()` / `getRoundResult()`.

### Layered player art

`sprites.ts` keeps hand-authored pixel maps; a compositor assembles them at texture time:

- A champion's body frames (`idle`, `squash`, `stretch`, `charge`, `cast`) plus a
  **frame anchor** (where the top of the head is per frame, so a hat rides the hop).
- **Layers**: `hat` (the crown is the first one, equipped by default), later `trail`,
  `aura`. Each layer is a small pixel map with its own palette and an offset from the
  anchor.
- **Skins**: a palette override for the body (`blue` → `midnight`), free with the current
  pipeline.
- Texture keys become `${champion}_${frame}_${lookHash}` so a changed look rebuilds only
  the player's frames.

The crown looks exactly as it does today after this change.

### Test accessors

`tests/e2e/support/harness.ts` gains a `game(page)` helper returning the handles suites
use (`director`, `attacks`, `player`, `kit`, ...). Suites move to it **as their files are
touched**, not in one sweep. Internals can then be renamed by updating one accessor.

### Docs

- `docs/proposals/` for every proposal; `docs/TECHNICAL_REPORT.md` marked historical
  until the refactor settles, then rewritten.
- The README keeps the world; each champion's kit gets its own README (see the champion
  proposal).

## Cosmetics (later; sketch only)

So the foundation is built for the right thing:

- **Currency:** awarded at run end, `round(score × rate)`, shown on the end screen as
  `+N` with the coin art from kill gold. Separate from score; score stays the
  comparison number.
- **Unlocks:** a flat catalogue (`id`, `slot`, `price`, `art`), bought from a wardrobe
  screen reachable from the start screen. No gameplay effect, ever.
- **Equip:** per profile, one per slot, shared across champions where the layer fits.
- A short proposal of its own when it's time, with the first catalogue.

## Phases

| Phase | Contents | Visible change |
| --- | --- | --- |
| **0a. Foundation** | Profile store + migrations; run event bus; `GameScene` → `Run` / `Combat` / scene; test accessors where touched; docs moved | None |
| **0b. Champions** | Champion contract and registry, slot keybinds, enemy status effects, shared player zones/projectiles, Ezreal moved into `src/champions/ezreal/` (see the champion proposal) | None |
| **0c. Layered art** | Compositor; body + hat layer + skins; crown as the default hat | None |
| **1. Select** | Champion row on the start screen, saved to the profile, per-champion bests | Picker |
| **2. Cassiopeia** | Her folder, art, kit, facing-based R, her suite | Second champion |
| **Later: Cosmetics** | Currency on the end screen, wardrobe, first skins and hats | Cosmetics |

Every step is its own commit with all active suites green, so work can stop after any
of them without leaving the game half-moved.

## Open questions

1. Currency rate: `score / 100`? Decide with the cosmetics proposal.
2. Should the run log keep its 500-run cap inside the profile, or drop raw runs and keep
   only summaries once a profile exists?
3. The old `warmup.*.v1` keys: delete after migration (recommended) or leave for a
   release as a rollback?
