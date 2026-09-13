import type { AttackState } from './AttackSystem';

/** Per-frame context the metrics need; supplied by GameScene. */
export interface MetricsContext {
  attackState: AttackState;
  /** Is at least one enemy attackable right now? */
  enemyInRange: boolean;
  /** Does the player currently have a move order? */
  playerMoving: boolean;
}

/**
 * Raw mechanical counters for the kiting drill. Deliberately dumb: these are
 * measurements, not a score. A scoring formula can be layered on later once we
 * know which of these actually correlate with playing well.
 */
export class KitingMetrics {
  /** Windups begun (fired + cancelled). */
  public attacksStarted = 0;
  /** Windups that reached the fire point. */
  public attacksFired = 0;
  /** Windups cancelled before firing — no damage dealt. */
  public attacksCancelled = 0;
  /** Fired missiles that actually connected (a target can die mid-flight). */
  public attacksLanded = 0;

  /**
   * Time spent off cooldown with an enemy in range and no attack started —
   * i.e. DPS left on the table.
   */
  public idleInRangeMs = 0;

  /**
   * Time spent standing still during post-fire recovery, when a move order
   * could have been issued for free — i.e. kiting distance left on the table.
   */
  public wastedRecoveryMs = 0;

  onAttackStarted(): void {
    this.attacksStarted++;
  }

  onAttackCancelled(): void {
    this.attacksCancelled++;
  }

  /** The missile left the player — the auto is committed. */
  onAttackFired(): void {
    this.attacksFired++;
  }

  /** The missile connected. Counted separately because travel time is real. */
  onAttackLanded(): void {
    this.attacksLanded++;
  }

  update(deltaSeconds: number, ctx: MetricsContext): void {
    const ms = deltaSeconds * 1000;

    // Ready to swing, something to swing at, not swinging.
    if (ctx.attackState === 'idle' && ctx.enemyInRange) {
      this.idleInRangeMs += ms;
    }

    // The attack already fired; movement is free but is not being used.
    if (ctx.attackState === 'recovery' && !ctx.playerMoving) {
      this.wastedRecoveryMs += ms;
    }
  }
}
