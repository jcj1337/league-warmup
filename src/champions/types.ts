import type Phaser from 'phaser';
import type { Enemy } from '../game/entities/Enemy';
import type { Player } from '../game/entities/Player';
import type { RunEvents } from '../game/RunEvents';
import type { AbilityCooldowns } from '../game/systems/AbilityCooldowns';
import type { BlinkSystem } from '../game/systems/BlinkSystem';
import type { GameClock } from '../game/systems/GameClock';
import type { PlayerProjectileSystem } from '../game/systems/PlayerProjectileSystem';
import type { Progression } from '../game/systems/Progression';
import type { PixelColor } from '../game/art/pixel';
import type { ProjectileArtKey } from '../game/view/projectileArt';

/**
 * What a playable champion is to the engine.
 *
 * The engine owns moving, autos, cast windows, cooldowns, Flash, projectiles,
 * the HUD slots and the keys. A champion supplies its numbers (`stats`,
 * `attack`, `levels`), what each slot IS (`slots`: how it's aimed, its cast
 * time and cooldown, its icon) and a `Kit` that says what a slot DOES when it
 * resolves. Nothing in the engine switches on a champion id.
 *
 * Adding a champion: a folder under src/champions/<id>/ with its balance, kit
 * and definition, and one line in the CHAMPIONS registry (index.ts).
 */

/** The ability slots. Keys are bound per slot, shared across champions, like League. */
export type Slot = 'q' | 'w' | 'e' | 'r';
export const SLOTS: readonly Slot[] = ['q', 'w', 'e', 'r'];

/**
 * How a slot is aimed. The engine resolves the aim from the cursor before the
 * kit sees it:
 *   direction  toward the cursor (a skillshot)
 *   point      the cursor, clamped to `range` from the player (a ground spell)
 *   unit       the enemy under the cursor (the right-click hit test), its body within
 *              `range`; no enemy there, or out of range, no cast (out of range flashes
 *              the slot's range ring)
 *   self       on the player
 */
export type Targeting = 'direction' | 'point' | 'unit' | 'self';

/** The charge-up drawn over the slime during the cast window (PlayerView). 'none' draws nothing, not even the release flash. */
export type CastStyle = 'bolt' | 'orb' | 'blink' | 'fang' | 'none';

/**
 * A shape drawn on the ground during the cast window, from the player toward
 * the aim, filling with the cast's progress (CastTelegraphView). For a spell
 * that goes off the moment its cast ends, so the window itself is the warning.
 * Coloured by `fx` (the slot's own fx when omitted).
 */
export interface CastTelegraph {
  kind: 'cone';
  radius(): number;
  /** Half the opening, in radians. */
  halfAngle(): number;
  fx?: FxKey;
}

/** Which THEME.fx entry colours a slot's effects. Grows with each champion. */
export type FxKey = 'q' | 'w' | 'e' | 'r' | 'poison' | 'miasma' | 'fang' | 'gaze' | 'venom';

/** How a champion's auto looks: the missile, the colours of its muzzle burst and impact, its muzzle flash. */
export interface AutoLook {
  missile: ProjectileArtKey;
  fx: FxKey;
  /** Texture key of the flash at the slime's edge as it fires. */
  muzzle: string;
}

/** What a cast window scales with: both are 1 at level 1 with no passive. */
export interface CastPace {
  /** From ability haste: 1 + LEVELS.castHasteShare × haste / 100. */
  castSpeed: number;
  /** Level and passive together, as the auto windup reads them. */
  attackSpeed: number;
}

export interface AbilityDef {
  /** 'Mystic Shot': the pause menu's key row and the champion's README. */
  label: string;
  targeting: Targeting;
  /** Cast and pick range for point / unit targeting; the range ring for those. */
  range?: number;
  /**
   * Read live, so console tuning applies to the next cast. 0 means instant.
   * Handed how fast she casts right now: `castSpeed` from ability haste (most
   * slots divide by it), `attackSpeed` from level and passive (for a cast that
   * speeds up with her autos instead, like Ezreal's R).
   */
  castTimeMs(pace: CastPace): number;
  cooldownMs(): number;
  /** Texture key of the slot icon. */
  icon: string;
  /** Slot frame colour. */
  accent: number;
  castStyle: CastStyle;
  /** Drawn on the ground through the cast window; none for most slots. */
  telegraph?: CastTelegraph;
  /** What the slime's body does for this cast (see Motion). The engine's plain 'cast' pose when omitted. */
  motion?: Motion;
  /**
   * A mid-cast Flash leaves this cast where it began: it goes off from the
   * spot she stood when the key went down, aimed as clicked (Ezreal's R, as in
   * League). Otherwise the cast travels with her (Cassiopeia's W-Flash).
   */
  anchored?: boolean;
  fx: FxKey;
}

export interface ChampionStats {
  radius: number;
  maxHp: number;
  moveSpeed: number;
}

/** What a level gives this champion. Q / W / E / R cooldowns, autos and movement scale from these. */
export interface LevelPerks {
  /** Cooldown = base / (1 + haste / 100). */
  abilityHastePerLevel: number;
  /** Multiplies attack speed: +0.06 is 6% per level. */
  attackSpeedPerLevel: number;
  /** Multiplies move speed: +0.03 is 3% per level. */
  moveSpeedPerLevel: number;
}

/** The poses a champion's slime is drawn in. Cosmetics are composed on top (src/game/art/look.ts). */
export type BodyFrame = 'idle' | 'squash' | 'stretch' | 'charge' | 'cast';

/**
 * How a motion eases INTO a key from the one before it. 'snap' holds the
 * previous key's values and cuts over on the key itself.
 */
export type MotionEase = 'linear' | 'in' | 'out' | 'inOut' | 'snap';

/**
 * One pose of a Motion. A key only changes what it names: everything else
 * carries over from the key before (the first key starts from rest: scale 1,
 * no offset, no glow). Numbers ease between keys; `frame` cuts.
 */
export interface MotionKey {
  /** Windup keys: 0..1 through the window. Follow-through keys: ms after release, at level-1 tempo. */
  at: number;
  /** A body frame by name: the five shared poses, or one of the champion's `extraFrames`. */
  frame?: string;
  /** Body scale, about the feet: sx 1.2 is 20% wider, sy 0.8 is 20% shorter. */
  sx?: number;
  sy?: number;
  /** Screen px toward the aim (negative: drawn back), across it, and up off the ground. */
  along?: number;
  side?: number;
  up?: number;
  /** ±px of shake, for a strained hold. */
  tremble?: number;
  /** 0..1: how brightly the art's `glow` pixels light (her eyes, his gauntlet). */
  glow?: number;
  ease?: MotionEase;
  /** Windup keys only: skipped when the window is shorter than this, so a quick cast drops its beats instead of flickering through them. */
  minWindowMs?: number;
}

/**
 * What the body does for one auto or ability. The windup is sampled from the
 * real window's progress, so it can never run ahead of the spell or lag
 * behind it, and it quickens with the window (attack speed, haste). The
 * follow-through runs on after release in ms, compressed as the window
 * shrinks, and any new windup cuts it at once.
 */
export interface Motion {
  windup: readonly MotionKey[];
  followThrough: readonly MotionKey[];
  /** What the glow pixels light as; the slot's fx core when omitted. */
  glowColor?: number;
}

export interface ChampionArt {
  /** One pixel map per pose, one string per row, bottom-aligned into `frameHeight`. */
  frames: Record<BodyFrame, readonly string[]>;
  /** Poses only this champion's motions use, by name. Rasterised with the cosmetics like the rest. */
  extraFrames?: Readonly<Record<string, readonly string[]>>;
  /** Palette characters whose pixels light up with a motion's `glow` (eyes, a gem). */
  glow?: string;
  pal: Readonly<Record<string, PixelColor>>;
  frameHeight: number;
  /** Sprite origin (fraction of the body frame) that puts the body centre on the gameplay position. */
  originY: number;
}

export interface AttackProfile {
  /** The auto cycle at level 1 (windup + recovery), before attack speed. */
  baseCooldownMs: number;
  /** Auto range: the player's centre to the target's edge (see attackReach). Read live. */
  range: number;
}

/** Where a cast is aimed, as resolved by the engine from `Targeting`. */
export interface Aim {
  x: number;
  y: number;
  /** The picked enemy, for unit targeting. */
  target?: Enemy | null;
  /** An anchored cast (AbilityDef.anchored): where she stood when the key went down, to fire from. */
  from?: { x: number; y: number };
}

/** The passive readout above the ability bar, or null for a champion without stacks. */
export interface PassiveHud {
  stacks: number;
  max: number;
  /** 1 just after a stack, easing to 0 as the buff lapses. */
  fraction: number;
}

/** One end-screen line. */
export interface KitStat {
  label: string;
  value: string;
}

/** The narrow surface a kit may touch. Built by the scene once per run. */
export interface KitContext {
  scene: Phaser.Scene;
  clock: GameClock;
  events: RunEvents;
  player: Player;
  enemies: () => readonly Enemy[];
  cooldowns: AbilityCooldowns;
  progression: Progression;
  /** Shared blink geometry and relocation (E-style blinks and Flash). */
  blink: BlinkSystem;
  /** Shared linear player projectiles. */
  projectiles: PlayerProjectileSystem;
  /**
   * The hit funnel: a pip the kit removed itself (`hit`, after `target.takeHit()`),
   * or a kill it caused without a counted hit (`kill`). Every pip scores exactly once.
   */
  combat: { hit(target: Enemy, killed: boolean): void; kill(target: Enemy): void };
}

/** One run's worth of a champion's abilities: their live state, counters and effects. */
export interface Kit {
  /** Beyond the cooldown, which the engine checks: may this slot be cast at `aim` right now? */
  canCast(slot: Slot, aim: Aim): boolean;
  /**
   * The key went down: what the cast commits to. Called before the cast
   * window starts; the result is what `cast` receives when it resolves. A
   * blink commits its destination here, so the mouse can't move it mid-cast.
   */
  commit(slot: Slot, aim: Aim): Aim;
  /** The cast window elapsed (or the slot is instant): do the thing. */
  cast(slot: Slot, aim: Aim): void;
  update(deltaSeconds: number, nowMs: number): void;
  /** Multiplies the auto cycle (a passive's attack speed). 1 when none. */
  readonly attackSpeedMultiplier: number;
  passiveHud(): PassiveHud | null;
  /** Raw counters for the run log ('qFired', ...). */
  stats(): Record<string, number>;
  /** The end screen's champion-specific lines. */
  statRows(): KitStat[];
  /** Drop every live projectile and effect (round end, restart). */
  clear(): void;
}

export interface Champion {
  id: string;
  name: string;
  stats: ChampionStats;
  attack: AttackProfile;
  levels: LevelPerks;
  art: ChampionArt;
  /** What the body does for an auto. The engine's plain hunker-and-pop when omitted. */
  autoMotion?: Motion;
  /** How the auto looks. The engine's cyan bolt when omitted. */
  autoLook?: AutoLook;
  slots: { q: AbilityDef; w: AbilityDef; e: AbilityDef; r?: AbilityDef };
  createKit(ctx: KitContext): Kit;
}
