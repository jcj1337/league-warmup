/**
 * The authoritative gameplay clock.
 *
 * Every deadline in the game (attack windup, attack cooldown, Q cooldown, target
 * respawn, enemy spawn ticks, hit flashes) is an absolute timestamp compared
 * against "now". If "now" came from Phaser's wall clock, pausing would let real
 * time run on underneath us and every one of those deadlines would fire at once
 * the instant we resumed: windups completing instantly, cooldowns wiped, a
 * volley of enemy projectiles all at once.
 *
 * So gameplay reads time from HERE instead, and this only advances on frames the
 * simulation actually runs. Pausing is then simply "stop calling advance()":
 * every stored deadline stays exactly as far in the future as it was.
 *
 * Phaser's own `time` is still used for tweens and other pure decoration.
 */
export class GameClock {
  private ms = 0;

  /** Milliseconds of simulated time since the round began. */
  get now(): number {
    return this.ms;
  }

  /** Called once per simulated frame with the same clamped delta movement uses. */
  advance(deltaMs: number): void {
    this.ms += deltaMs;
  }
}
