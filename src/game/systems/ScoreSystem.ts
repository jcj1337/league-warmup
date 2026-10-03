import { SCORE } from '../../config/balance';

/** Round tallies. Kept dumb on purpose — scoring will change a lot. */
export class ScoreSystem {
  public score = 0;
  /** Pip-removing hits landed by autos, Q and the E bolt. */
  public hitsLanded = 0;
  /** W marks cashed in for their extra pip. */
  public markProcs = 0;
  public targetsKilled = 0;
  /** Kills broken down by archetype id, for the end screen. */
  public readonly killsByType: Record<string, number> = {};
  public projectileHitsTaken = 0;
  /** Damage actually taken, per source ('pursuer', 'basic', 'magus', 'edgeFire'). */
  public readonly damageTaken: Record<string, number> = {};
  /** Source of the hit that took the last HP, once the player is dead. */
  public killedBy: string | null = null;

  private survivalCredit = 0;

  addHit(): void {
    this.hitsLanded++;
  }

  addMarkProc(): void {
    this.markProcs++;
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

  /** A hit that got through i-frames. `lethal` = it took the last HP. */
  addDamageTaken(source: string, amount: number, lethal: boolean): void {
    this.damageTaken[source] = (this.damageTaken[source] ?? 0) + amount;
    if (lethal) this.killedBy = source;
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
