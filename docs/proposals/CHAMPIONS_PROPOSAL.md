# Playable Champions Proposal

Status: **Phase 0b implemented** 2026-10-04 (contract, registry, slot keys, enemy statuses, Ezreal in
`src/champions/ezreal/`, per-champion bests). Player ground zones wait for the first champion that
needs them (Cassiopeia). Phases 1 and 2 follow. Written 2026-10-04.

## Summary

The game has one hard-wired kit. Ezreal's Q, W and E appear by name in the keybinds, the
cooldown table, the input commands, the enemy class, the level perks, the HUD and the end
screen. Adding Cassiopeia this way would mean `if (champion === 'cassio')` branches
through all of them, and a third champion would double that.

Proposal: make a **champion** a self-contained folder that plugs into a shared engine,
the same way mobs already plug into the `ENEMIES` registry.

- **Slots, not ability names.** Keys, cooldowns, input and the HUD talk about Q / W / E
  (and later R) slots. The champion decides what each slot does.
- **One folder per champion** (`src/champions/ezreal/`, `src/champions/cassiopeia/`):
  its numbers, its ability code, its art, its docs. The engine (moving, autos, casting,
  cooldowns, Flash, projectiles, ground zones, status effects) stays shared.
- **Enemy status effects become generic.** Ezreal's W mark is hard-coded on `Enemy`.
  Cassiopeia needs poison, and later champions will need slows or stuns, so marks become
  one entry in a small status system.
- **Runs and bests are per champion.** Every logged run records who played it, and the
  end screen's "your best" compares like with like.

It ships in three phases. Phase 0 is a **pure refactor with Ezreal only**: nothing
changes for the player, and the existing test suites prove it. Then champion select,
then Cassiopeia.

## Where Ezreal is wired in today

| Place | What's Ezreal-specific |
| --- | --- |
| `KEYBINDS` / `Keybinds.ts` | Action names `skillshotQ`, `skillshotW`, `blinkE`; menu labels "Q: damage skillshot" |
| `balance.ts` | `SKILLSHOT_Q`, `SKILLSHOT_W`, `BLINK_E`, `PASSIVE` and `ATTACK` sit beside the enemy and wave config; `LEVELS.qRankUp` |
| `AbilityCooldowns.ts` | Its duration table imports Ezreal's three abilities |
| `InputController` / `CommandHandler` | `castSkillshot`, `castMark`, `castBlink` |
| `GameScene.ts` (~870 lines) | Wires Q/W/E callbacks by hand: Q hit refunds cooldowns, W mark, E bolt, passive stacks |
| `Enemy.ts` | `applyMark` / `isMarked` / `markUntil`, reading `SKILLSHOT_W` |
| `Progression.ts` | Level perks include Ezreal's Q rank-up (`qPips`) |
| `SkillshotSystem`, `BlinkSystem`, `PassiveSystem` | Ezreal's abilities, built as engine systems |
| HUD, `PlayerView`, `Fx` | `'q' \| 'w' \| 'e'` unions for icons, cast poses, cast effects |
| End screen / `ScoreSystem` | "Q ACCURACY" is an Ezreal stat |
| `RunHistory` | Runs don't record a champion, so bests would mix champions |

## Proposed structure

```
src/
  config/balance.ts          world only: arena, enemies, waves, difficulty, score, Flash
  champions/
    types.ts                 Champion, AbilityDef, Kit, KitContext
    index.ts                 CHAMPIONS registry, ChampionId, DEFAULT_CHAMPION
    ezreal/
      balance.ts             EZREAL: stats, auto attack, Q / W / E, passive, level perks
      kit.ts                 what Q / W / E and the passive do
      art.ts                 slime sprites, ability icons, palette
      theme.ts               projectile and cast presentation
      README.md              the kit, as a player reads it (moved out of the main README)
    cassiopeia/              same shape
  game/systems/              engine, champion-agnostic
```

### The champion contract

A sketch, to be firmed up in Phase 0:

```ts
interface Champion {
  id: ChampionId;                 // 'ezreal' | 'cassiopeia' | ...
  name: string;
  version: number;                // bumped when this champion's tuning changes
  stats: { maxHp: number; moveSpeed: number; radius: number };
  attack: AutoAttackConfig;       // range, windup, cycle, missile look
  slots: { q: AbilityDef; w: AbilityDef; e: AbilityDef; r?: AbilityDef };
  levels: LevelPerks;             // what a level gives *this* champion
  art: ChampionArt;               // sprite frames, icons, slot accent colours
  createKit(ctx: KitContext): Kit;
}

interface AbilityDef {
  label: string;                  // 'Mystic Shot', shown in the pause menu
  targeting: 'direction' | 'point' | 'unit' | 'self';
  range?: number;
  castTimeMs: number;
  cooldownMs: number;             // haste from levels applies on top
}

interface Kit {                   // one per run: passive stacks, live zones, ...
  cast(slot: Slot, aim: Aim): void;
  update(nowMs: number): void;
  passiveHud(): PassiveHud | null;   // drives the gem row, or hides it
  endScreenStats(): StatLine[];      // e.g. Ezreal: Q accuracy
  clear(): void;
}

interface KitContext {            // the narrow surface a kit may touch
  clock; player; enemies(); fx; cooldowns; statuses;
  hit(target: Enemy, opts: { pips: number; source: string }): HitResult;
  projectiles; zones;             // shared player-side projectile and ground-zone systems
}
```

**Targeting is declared, not coded per ability.** The engine already resolves
"toward the cursor" for every Ezreal ability. With `targeting` it can also resolve "a
ground point within range" (Cassiopeia Q/W) and "the enemy nearest the cursor" (her E,
which works like League quick-cast on a unit). It can also draw the matching range
indicator. Input and range-ring code stay generic.

**One hit funnel.** Kills, score, kill gold, XP and wave bookkeeping go through
`ctx.hit()`, which wraps today's `onTargetHit` / `onKill`. A kit only decides how many
pips a hit removes and what else follows (a refund, a detonation, a heal). It can't
forget to award score.

### Keys become slots

- Actions are renamed `abilityQ`, `abilityW`, `abilityE` (plus `abilityR` when the first
  ultimate arrives). Flash, attack-move, stop and chat stay as they are.
- The pause menu labels each row from the active champion: "Q: Mystic Shot",
  "Q: Noxious Blast". Your binding is per slot, shared across champions, as in League.
- Saved bindings migrate: `warmup.keybinds.v1` is read once, renamed to the new actions
  and saved as `v2`, so nobody loses their setup.
- `R` currently restarts from the end screen, so binding an ultimate to `R` won't
  conflict. Restart only listens while no run is in progress.

### Enemy status effects

`Enemy` gets a small `statuses` component: `apply(id, now, durationMs)`,
`has(id, now)` and `remaining(id, now)`. Each status has its own view: the W rune for
`ezreal.mark`, a green drip for `cassiopeia.poison`. The existing daze timer
(`dazedUntil`, from Sovereign throws) becomes a status too. Ids are namespaced by
champion, so two kits can't collide.

### Shared player-side systems

Today, ground zones (telegraph, then impact) exist only for enemies, in
`HostileSpellSystem`. Cassiopeia's Q and W are player-owned ground zones. Rather than
copy them, split out a side-neutral zone core that both use. Each side keeps its own
damage rule. Projectiles get the same treatment: Ezreal's Q/W bolts and his homing E
bolt become kit-configured uses of one player projectile system.

### Runs, scores and versions

- `RunRecord` gains `champion`. Records without it count as `ezreal`.
- Bests are compared per champion, per champion `version`, per world
  `BALANCE_VERSION`, per growth setting. Tuning Cassiopeia then doesn't reset
  Ezreal's best, and new enemies still reset everyone's.
- Score rules stay global (kills × stage, speed, HP), so scores are comparable in
  spirit. The end-screen stat lines come from `kit.endScreenStats()`: Ezreal keeps
  "Q ACCURACY", and Cassiopeia might show "POISON UPTIME".

### Picking a champion

The start screen gets a champion row: one portrait per champion, left/right or a click
to choose, and any key to start. The choice is saved with the other settings. The pause
menu adds "Change champion", which returns to the start screen and begins a new run.

## Tests

- `startSuite()` takes `{ champion }`, defaulting to Ezreal. Kit-specific suites (`kit`,
  `cast`, `orbwalk`) pin Ezreal. World suites (`waves`, `mobs`, `hud`, `score`, ...) run
  on the default.
- A new **contract suite** loops over every registered champion. For each, it starts a
  run, casts every slot, lands a hit and a kill, dies, and checks the end screen. A new
  champion is covered by the generic checks as soon as it's registered.
- Each champion gets its own suite for its mechanics (`cassiopeia.spec.ts`).

## Docs

- The README keeps the world: controls, the run, enemies and settings. Each champion's
  kit moves to `src/champions/<id>/README.md`, linked from a short "Champions" table.
- An "Adding a champion" checklist, like "Adding a mob".
- Proposals move to `docs/proposals/`.
- `TECHNICAL_REPORT.md` is out of date: it still describes 10 authored stages and two
  enemies. Rewrite its kit sections after Phase 0, or mark it historical.

## Phases

The full order, including the foundation work that comes first (profile store, run event
bus, `GameScene` split, layered art), is in
[ARCHITECTURE_PROPOSAL.md](ARCHITECTURE_PROPOSAL.md). In its numbering this proposal is
Phase 0b; the table below is the champion-specific part only.

| Phase | What | Player-visible change |
| --- | --- | --- |
| **0. Refactor** | Champion contract and registry with Ezreal only; slot keybinds with migration; status effects; shared zones/projectiles; hit funnel; run log `champion` field | None. All 24 active suites must pass, with only renames in the tests |
| **1. Select** | Champion row on the start screen, saved choice, "Change champion", per-champion bests | A one-champion picker |
| **2. Cassiopeia** | Her folder, art, kit and suite, following a short kit proposal of its own | A second champion |

Phase 0 is the expensive one: it touches `GameScene`, the ability systems and most kit
tests. Doing it on its own is what makes Phases 1 and 2, and every champion after them,
cheap.

## Fit check: does Cassiopeia fit this shape?

A quick check that the structure works for her, not a kit design:

| Her piece | Needs from the engine |
| --- | --- |
| Q, Noxious Blast: delayed blast at a point, poisons | `point` targeting, a player ground zone, the poison status |
| W, Miasma: lingering clouds that slow | Ground zones with a duration, an enemy slow status |
| E, Twin Fang: point-and-click bolt, very short cooldown, stronger on poisoned targets | `unit` targeting, a homing projectile, a status check in its hit rule |
| Passive: no boots, move speed per level | `levels` perks per champion |
| R, Petrifying Gaze: cone that stuns enemies facing her | An optional `r` slot, a cone zone, an enemy stun status |

All of it fits. No piece needs a `champion === 'cassiopeia'` branch in the engine.

## Open questions

1. **Picker placement.** On the start screen (recommended) or only in the pause menu?
2. **The crown.** Should every champion wear it, as the player's signature in qwer's
   backyard, or only Ezreal? Recommendation: every champion, drawn as a shared layer.
3. **Ultimates.** Phase 0 can add an optional R slot cheaply. Should Cassiopeia launch
   with R, and should Ezreal get one later?
4. **Autos for a mage.** The trainer is built around orbwalking. Should Cassiopeia keep a
   full auto attack, or a weak one so her E becomes the rhythm, as in League?
5. **Bindings.** Shared per slot across champions (recommended, like League), or saved
   per champion?
