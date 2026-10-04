import { SCORE } from '../../config/balance';

/** Every point is worth more on later stages: × (1 + SCORE.stageMultiplierPerStage × (stage − 1)). */
export function stageScoreMultiplier(stage: number): number {
  return 1 + SCORE.stageMultiplierPerStage * (stage - 1);
}

/**
 * How a cleared wave's speed bonus is earned: full at or under par, sliding
 * to nothing at par × SCORE.waveClear.zeroAtParMultiple. 0..1.
 */
export function speedFactor(elapsedMs: number, parMs: number): number {
  const zero = SCORE.waveClear.zeroAtParMultiple;
  if (parMs <= 0 || elapsedMs <= parMs) return 1;
  return Math.max(0, (zero * parMs - elapsedMs) / ((zero - 1) * parMs));
}

/**
 * Score and round tallies.
 *
 * Score only comes from doing things well — never from time alive, so
 * kiting one enemy forever earns nothing:
 *   kills   SCORE.pointsPerKill × the mob's scoreMultiplier
 *   speed   clearing a wave near its par time (see speedFactor)
 *   hp      the HP you finish a stage with, +50% if you took no damage in it
 * each × the stage multiplier, so later stages are worth more.
 */
export class ScoreSystem {
  public score = 0;
  /** Where the score came from, for the end screen. */
  public readonly scoreFrom = { kills: 0, speed: 0, hp: 0 };
  /** Pip-removing hits landed by autos and abilities. */
  public hitsLanded = 0;
  public targetsKilled = 0;
  /** Kills broken down by archetype id, for the end screen. */
  public readonly killsByType: Record<string, number> = {};
  public projectileHitsTaken = 0;
  /** Damage actually taken, per source ('pursuer', 'basic', 'magus', 'edgeFire', 'basicContact', …). */
  public readonly damageTaken: Record<string, number> = {};
  /** Source of the hit that took the last HP, once the player is dead. */
  public killedBy: string | null = null;
  /** Like damageTaken, but only since the current stage began (HP is full again then). */
  public stageDamage: Record<string, number> = {};

  addHit(): void {
    this.hitsLanded++;
  }

  /**
   * A kill on `stage`. `scoreMultiplier` comes from the enemy archetype, so a
   * tankier enemy is worth proportionally more without inflating the base value.
   * @returns the points awarded.
   */
  addKill(archetype: string, scoreMultiplier: number, stage = 1): number {
    this.targetsKilled++;
    this.killsByType[archetype] = (this.killsByType[archetype] ?? 0) + 1;
    return this.award('kills', SCORE.pointsPerKill * scoreMultiplier * stageScoreMultiplier(stage));
  }

  /**
   * A wave cleared `elapsedMs` after it began, against its `parMs`.
   * @returns the speed bonus awarded (0 when well over par).
   */
  addWaveClear(enemies: number, elapsedMs: number, parMs: number, stage: number): number {
    const factor = speedFactor(elapsedMs, parMs);
    return this.award('speed', SCORE.waveClear.pointsPerEnemy * enemies * factor * stageScoreMultiplier(stage));
  }

  /**
   * A stage cleared with `hp` left (before the heal). Flawless = no damage
   * taken during the stage.
   * @returns the HP bonus awarded, and whether it was flawless.
   */
  addStageClear(hp: number, stage: number): { points: number; flawless: boolean } {
    const flawless = Object.values(this.stageDamage).every((d) => d <= 0);
    const S = SCORE.stageClear;
    const points = this.award('hp', hp * S.pointsPerHp * (flawless ? 1 + S.flawlessBonus : 1) * stageScoreMultiplier(stage));
    return { points, flawless };
  }

  /** A hit that got through i-frames. `lethal` = it took the last HP. */
  addDamageTaken(source: string, amount: number, lethal: boolean): void {
    this.damageTaken[source] = (this.damageTaken[source] ?? 0) + amount;
    this.stageDamage[source] = (this.stageDamage[source] ?? 0) + amount;
    if (lethal) this.killedBy = source;
  }

  /** A new stage begins: its damage tally starts empty. */
  startStage(): void {
    this.stageDamage = {};
  }

  addProjectileHit(): void {
    this.projectileHitsTaken++;
  }

  private award(kind: keyof ScoreSystem['scoreFrom'], points: number): number {
    const whole = Math.round(points);
    this.scoreFrom[kind] += whole;
    this.score += whole;
    return whole;
  }
}
