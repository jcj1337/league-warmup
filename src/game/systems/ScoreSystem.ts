import { SCORE } from '../../config/balance';

/** Round tallies. Kept dumb on purpose — scoring will change a lot. */
export class ScoreSystem {
  public score = 0;
  public damageDealt = 0;
  public targetsKilled = 0;
  public projectileHitsTaken = 0;

  private survivalCredit = 0;

  addDamage(amount: number): void {
    this.damageDealt += amount;
    this.score += amount * SCORE.pointsPerDamage;
  }

  addKill(): void {
    this.targetsKilled++;
    this.score += SCORE.pointsPerKill;
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
