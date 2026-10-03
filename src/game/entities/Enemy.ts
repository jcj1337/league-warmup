import Phaser from 'phaser';
import { DIFFICULTY, SKILLSHOT_W } from '../../config/balance';
import { scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';
import type { HostileSpellSink } from '../systems/HostileSpellSystem';
import type { AttackTokens } from '../systems/AttackTokens';
import type { EnemyView } from '../view/EnemyView';

/** Identifies an archetype for spawn weighting, scoring and kill tallies. */
export type EnemyArchetype = 'basic' | 'pursuer' | 'magus';

/**
 * Where an enemy is in its life, as far as gameplay is concerned.
 *
 *   spawning ──(GameClock reaches activeAt)──► active ──(last pip lost)──► dead
 *
 * Only an `active` enemy exists for gameplay: it can be targeted, hit, marked,
 * moves, attacks and counts as a threat. A `spawning` enemy sits on its fixed
 * spawn spot doing none of that. Nothing ever goes backwards.
 */
export type EnemyLifecycle = 'spawning' | 'active' | 'dead';

/** What an enemy's AI is allowed to see and do each frame. */
export interface EnemyContext {
  player: {
    x: number;
    y: number;
    radius: number;
    /** Current velocity in px/s, for enemies that lead their aim. */
    vx: number;
    vy: number;
    /** True while the player is stunned and cannot act. */
    stunned: boolean;
  };
  /** Apply damage to the player, tagged with who dealt it. Routed through the scene's i-frame logic. */
  damagePlayer(amount: number, source: EnemyArchetype): void;
  /**
   * Cast hostile spells (ground zones, the Magus orb). The spell system owns
   * them, so a spell already placed still lands after its caster dies.
   */
  spells: HostileSpellSink;
  /** Shared pool a crowd takes turns with for token-gated attacks (the basic spit). */
  attackTokens: AttackTokens;
  /** Enemies still between the player and a wave clear (pending + arriving + alive), the caller included. */
  enemiesRemaining: number;
}

export interface EnemyOptions {
  radius: number;
  /** Health pips: how many hits this enemy takes to kill. */
  maxHp: number;
  /** Kill score = SCORE.pointsPerKill * this. */
  scoreMultiplier: number;
  /** 1-based stage it spawned on: its scaled stats are fixed from this. */
  stage: number;
}

/**
 * What the AI is doing this frame, published for the view to animate.
 * Written by gameplay, only ever read by visuals.
 */
export interface EnemyPose {
  moving: boolean;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  /** 0..1 through an attack windup, or -1 when not winding up. */
  windup: number;
  /** Centre-to-centre reach of its attack, if it has one (for the telegraph). */
  reach: number;
}

/**
 * Everything every enemy shares: position, health pips, the W mark, the
 * spawn → active → dead lifecycle and the hit/death flow. Archetypes subclass
 * this, supply their AI in `updateAi()` and build their `view` in their
 * constructor.
 *
 * Health is discrete: `hp` / `maxHp` count PIPS, and every hit removes exactly
 * one (see takeHit). There are no damage amounts anywhere in the enemy model.
 *
 * Gameplay state (`hp`, `lifecycle`) flips immediately; the view only represents
 * it and is told about hits and deaths as they happen. All gameplay timing
 * reads the GameClock, so every enemy freezes correctly when paused.
 */
export abstract class Enemy {
  abstract readonly archetype: EnemyArchetype;

  public x: number;
  public y: number;

  public readonly radius: number;
  public readonly scoreMultiplier: number;
  /** The stage it spawned on. */
  public readonly stage: number;
  /** DIFFICULTY.moveSpeed on that stage: multiplies every speed the AI moves at. */
  public readonly moveScale: number;

  /** Remaining health pips. */
  public hp: number;
  /** Health pips at spawn, from the current stage's STAGES row. */
  public readonly maxHp: number;

  /**
   * Constructed enemies are active at once; the WaveDirector puts wave
   * arrivals through `beginArrival()` first.
   */
  public lifecycle: EnemyLifecycle = 'active';
  /** GameClock time the arrival began. Only meaningful once beginArrival() ran. */
  public arrivalStartedAt = 0;
  /** GameClock time a spawning enemy becomes active. The one activation deadline. */
  public activeAt = 0;

  /**
   * Generational guard captured by in-flight missiles, so a projectile aimed at
   * one enemy can never damage a different one.
   */
  public spawnId = 0;

  public readonly pose: EnemyPose = { moving: false, facing: 1, windup: -1, reach: 0 };

  /** The enemy's visual representation. Built by the archetype's constructor. */
  public view!: EnemyView;

  protected readonly scene: Phaser.Scene;
  protected readonly clock: GameClock;

  /**
   * W mark: clock time at which it lapses, or 0 for unmarked. Marks live on the
   * enemy itself so every archetype gets them for free and they die with it.
   */
  private markUntil = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, opts: EnemyOptions) {
    this.scene = scene;
    this.clock = clock;
    this.x = x;
    this.y = y;
    this.radius = opts.radius;
    this.scoreMultiplier = opts.scoreMultiplier;
    this.stage = opts.stage;
    this.moveScale = scaled(DIFFICULTY.moveSpeed, opts.stage);
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Alive and in play: targetable, damageable, moving, attacking. Every combat
   * system gates on this, so a spawning enemy is invisible to all of them.
   * Assigning forces the lifecycle (true = active, false = dead).
   */
  get active(): boolean {
    return this.lifecycle === 'active';
  }

  set active(value: boolean) {
    this.lifecycle = value ? 'active' : 'dead';
  }

  get spawning(): boolean {
    return this.lifecycle === 'spawning';
  }

  get dead(): boolean {
    return this.lifecycle === 'dead';
  }

  /** Hold this enemy in the arrival window until `nowMs + manifestMs`. */
  beginArrival(nowMs: number, manifestMs: number): void {
    this.lifecycle = 'spawning';
    this.arrivalStartedAt = nowMs;
    this.activeAt = nowMs + manifestMs;
  }

  /** 0..1 through the arrival window; 1 once active. Read by the view. */
  arrivalProgress(nowMs: number): number {
    if (!this.spawning) return 1;
    const span = this.activeAt - this.arrivalStartedAt;
    return span > 0 ? Phaser.Math.Clamp((nowMs - this.arrivalStartedAt) / span, 0, 1) : 1;
  }

  // ------------------------------------------------------------------ W mark

  /** Apply (or refresh) the W mark. */
  applyMark(nowMs: number): void {
    this.markUntil = nowMs + SKILLSHOT_W.markDurationMs;
  }

  isMarked(nowMs: number): boolean {
    return this.active && nowMs < this.markUntil;
  }

  /** Consume the mark — on detonation, or when the enemy dies. */
  clearMark(): void {
    this.markUntil = 0;
  }

  /** Time left on the mark, 0 when unmarked. Read by the view. */
  markRemainingMs(nowMs: number): number {
    return this.isMarked(nowMs) ? this.markUntil - nowMs : 0;
  }

  /**
   * One hit: removes exactly one pip. Autos, Q, the E bolt and a W detonation
   * each call this once. Spawning and dead enemies cannot be hit.
   * @returns true if this hit killed the enemy.
   */
  takeHit(): boolean {
    if (!this.active) return false;

    this.hp = Math.max(0, this.hp - 1);
    this.view.onHit();

    if (this.hp === 0) {
      // State flips NOW; the death pop is only decoration.
      this.lifecycle = 'dead';
      this.clearMark();
      this.view.onDeath();
      return true;
    }
    return false;
  }

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    // Activation happens at the GameClock deadline — never on an animation.
    if (this.spawning && nowMs >= this.activeAt) this.lifecycle = 'active';
    if (this.active) this.updateAi(deltaSeconds, nowMs, ctx);
    this.view.sync(nowMs, deltaSeconds);
  }

  /** Behaviour. Default: stand still. */
  protected updateAi(_deltaSeconds: number, _nowMs: number, _ctx: EnemyContext): void {}

  destroy(): void {
    this.view.destroy();
  }
}
