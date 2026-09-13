import Phaser from 'phaser';
import { DIFFICULTY, ENEMY_PROJECTILES, ROUND } from '../../config/balance';

type Ramp = { start: number; end: number };

/**
 * Maps round progress onto the enemy-projectile ramp.
 *
 * Everything scales linearly from `start` to `end` and hits full strength at
 * DIFFICULTY.rampCompleteAtRoundFraction, so the last few seconds are a flat
 * max-pressure stretch rather than a curve that only peaks at the buzzer.
 */
export class DifficultyManager {
  private elapsedSeconds = 0;

  reset(): void {
    this.elapsedSeconds = 0;
  }

  update(deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;
  }

  get elapsed(): number {
    return this.elapsedSeconds;
  }

  get remaining(): number {
    return Math.max(0, ROUND.durationSeconds - this.elapsedSeconds);
  }

  /**
   * 0 at round start, 1 once the ramp is complete.
   *
   * Stays flat at 0 for DIFFICULTY.rampStartSeconds so the opening is calm,
   * then eases up with DIFFICULTY.rampCurve (>1 keeps the early ramp gentle).
   */
  get t(): number {
    const start = DIFFICULTY.rampStartSeconds;
    const end = ROUND.durationSeconds * DIFFICULTY.rampCompleteAtRoundFraction;
    if (this.elapsedSeconds <= start || end <= start) {
      return this.elapsedSeconds <= start ? 0 : 1;
    }
    const linear = Phaser.Math.Clamp((this.elapsedSeconds - start) / (end - start), 0, 1);
    return Math.pow(linear, DIFFICULTY.rampCurve);
  }

  /** 1..DIFFICULTY.levels. Drives the HUD readout AND enemy composition. */
  get level(): number {
    return Math.min(DIFFICULTY.levels, 1 + Math.floor(this.t * DIFFICULTY.levels));
  }

  /** The level after this one, or null once we are at the cap. */
  get nextLevel(): number | null {
    return this.level >= DIFFICULTY.levels ? null : this.level + 1;
  }

  /**
   * Seconds until the next difficulty level lands — the inverse of the ramp.
   *
   *   t     = ((e - start) / (end - start)) ^ curve
   *   => e  = start + (end - start) * t ^ (1 / curve)
   *
   * Infinity at max level. Used only for the stage countdown, so it never
   * affects gameplay timing.
   */
  get secondsUntilNextLevel(): number {
    const next = this.nextLevel;
    if (next === null) return Number.POSITIVE_INFINITY;
    const tAtNext = (next - 1) / DIFFICULTY.levels;
    return Math.max(0, this.timeForT(tAtNext) - this.elapsedSeconds);
  }

  private timeForT(tv: number): number {
    const start = DIFFICULTY.rampStartSeconds;
    const end = ROUND.durationSeconds * DIFFICULTY.rampCompleteAtRoundFraction;
    if (end <= start) return start;
    return start + (end - start) * Math.pow(Phaser.Math.Clamp(tv, 0, 1), 1 / DIFFICULTY.rampCurve);
  }

  private lerp(ramp: Ramp): number {
    return Phaser.Math.Linear(ramp.start, ramp.end, this.t);
  }

  get spawnIntervalMs(): number {
    return this.lerp(ENEMY_PROJECTILES.spawnIntervalMs);
  }

  get projectileSpeed(): number {
    return this.lerp(ENEMY_PROJECTILES.speed);
  }

  get projectileRadius(): number {
    return this.lerp(ENEMY_PROJECTILES.radius);
  }

  get projectileDamage(): number {
    return this.lerp(ENEMY_PROJECTILES.damage);
  }

  /**
   * Fractional volley size: 2.4 means "2 shots, plus a 40% chance of a third".
   * Keeps the ramp smooth instead of jumping a whole projectile at a time.
   */
  get volleySize(): number {
    return this.lerp(ENEMY_PROJECTILES.volleySize);
  }
}
