import Phaser from 'phaser';
import { SKILLSHOT_W } from '../../config/balance';
import type { GameClock } from '../systems/GameClock';
import type { EnemyView } from '../view/EnemyView';

/** Identifies an archetype for spawn weighting, scoring and kill tallies. */
export type EnemyArchetype = 'basic' | 'pursuer';

/** What an enemy's AI is allowed to see and do each frame. */
export interface EnemyContext {
  player: { x: number; y: number; radius: number };
  /** Apply damage to the player. Routed through the scene's i-frame logic. */
  damagePlayer(amount: number): void;
}

export interface EnemyOptions {
  radius: number;
  /** Health pips: how many hits this enemy takes to kill. */
  maxHp: number;
  /** Kill score = SCORE.pointsPerKill * this. */
  scoreMultiplier: number;
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
 * Everything every enemy shares: position, health pips, the W mark and the
 * hit/death lifecycle. Archetypes subclass this, supply their AI in
 * `updateAi()` and build their `view` in their constructor.
 *
 * Health is discrete: `hp` / `maxHp` count PIPS, and every hit removes exactly
 * one (see takeHit). There are no damage amounts anywhere in the enemy model.
 *
 * Gameplay state (`hp`, `active`) flips immediately; the view only represents
 * it and is told about hits and deaths as they happen. All gameplay timing
 * reads the GameClock, so every enemy freezes correctly when paused.
 */
export abstract class Enemy {
  abstract readonly archetype: EnemyArchetype;

  public x: number;
  public y: number;

  public readonly radius: number;
  public readonly scoreMultiplier: number;

  /** Remaining health pips. */
  public hp: number;
  /** Health pips at spawn, from the current stage's STAGES row. */
  public readonly maxHp: number;

  /** Killed enemies stay in the list but inactive until the director clears them. */
  public active = true;

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
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
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
   * each call this once.
   * @returns true if this hit killed the enemy.
   */
  takeHit(): boolean {
    if (!this.active) return false;

    this.hp = Math.max(0, this.hp - 1);
    this.view.onHit();

    if (this.hp === 0) {
      // State flips NOW; the death pop is only decoration.
      this.active = false;
      this.clearMark();
      this.view.onDeath();
      return true;
    }
    return false;
  }

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    if (this.active) this.updateAi(deltaSeconds, nowMs, ctx);
    this.view.sync(nowMs, deltaSeconds);
  }

  /** Behaviour. Default: stand still. */
  protected updateAi(_deltaSeconds: number, _nowMs: number, _ctx: EnemyContext): void {}

  destroy(): void {
    this.view.destroy();
  }
}
