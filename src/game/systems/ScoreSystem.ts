import { SCORE } from '../../config/balance';

/** Round tallies. Kept dumb on purpose — scoring will change a lot. */
export class ScoreSystem {
  public score = 0;
  public damageDealt = 0;
  public targetsKilled = 0;
  /** Kills broken down by archetype id, for the end screen. */
  public readonly killsByType: Record<string, number> = {};
  public projectileHitsTaken = 0;

  private survivalCredit = 0;

  addDamage(amount: number): void {
    this.damageDealt += amount;
    this.score += amount * SCORE.pointsPerDamage;
  }

  /**
   * A kill. `scoreMultiplier` comes from the enemy archetype, so a tankier
   * enemy is worth proportionally more without inflating the base value.
   */
  addKill(archetype: string, scoreMultiplier: number): void {
    this.targetsKilled++;
    this.killsByType[archetype] = (this.killsByType[archetype] ?? 0) + 1;
    this.score += SCORE.pointsPerKill * scoreMultiplier;
  }

  addProjectileHit(): void {
    this.projectileHitsTaken++;
  }

  /** Trickle of points for staying alive; accumulated in fractional seconds. */
  tickSurvival(deltaSeconds: number): void {
    this.survivalCredit += deltaSeconds * SCORE.pointsPerSecondAlive;
    const whole = Math.floor(this.survivalCredit);
    if (whole > 0) {
      this.score += whole;
      this.survivalCredit -= whole;
    }
  }
}
