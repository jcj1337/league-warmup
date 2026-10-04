import type { Slot } from '../../champions/types';

export type AbilityId = Slot | 'flash';

/**
 * One place that knows what is on cooldown and for how long.
 *
 * Every ability system asks this rather than keeping its own `readyAt`, which
 * is what makes cross-ability effects (a landed Q refunding Q/W/E) a single
 * call instead of three bits of duplicated arithmetic — and gives the HUD one
 * consistent source for every slot.
 *
 * Durations come from the champion's slot definitions (and FLASH for the
 * summoner), read live so console tuning applies to the next cast. All timing
 * is GameClock time, so pausing freezes every cooldown at once.
 */
export class AbilityCooldowns {
  private readonly readyAt: Record<AbilityId, number> = { q: 0, w: 0, e: 0, r: 0, flash: 0 };
  private now = 0;

  /**
   * `durations(id)` is the full cooldown of a slot before haste. `haste()`
   * multiplies the slot cooldowns (the player's level: see
   * Progression.cooldownMultiplier). Flash is a summoner spell and ignores it.
   */
  constructor(
    private readonly durations: (id: AbilityId) => number,
    private readonly haste: () => number = () => 1,
  ) {}

  update(nowMs: number): void {
    this.now = nowMs;
  }

  isReady(id: AbilityId): boolean {
    return this.now >= this.readyAt[id];
  }

  remainingMs(id: AbilityId): number {
    return Math.max(0, this.readyAt[id] - this.now);
  }

  /** The full cooldown right now: the slot's value, shortened by level for everything but Flash. */
  totalMs(id: AbilityId): number {
    return this.durations(id) * (id === 'flash' ? 1 : this.haste());
  }

  /** Put an ability on its full cooldown, starting now. */
  start(id: AbilityId): void {
    this.readyAt[id] = this.now + this.totalMs(id);
  }

  /**
   * Shave `ms` off the REMAINING cooldown of each listed ability.
   *
   * This never restarts or extends anything: it only pulls `readyAt` closer to
   * now, clamped so an ability can become ready immediately but never banks
   * negative cooldown for its next cast.
   */
  reduce(ms: number, ids: AbilityId[]): void {
    for (const id of ids) {
      this.readyAt[id] = Math.max(this.now, this.readyAt[id] - ms);
    }
  }

  /** Make an ability ready again: its cast was interrupted before it happened. */
  refund(id: AbilityId): void {
    this.readyAt[id] = this.now;
  }

  reset(): void {
    for (const id of Object.keys(this.readyAt) as AbilityId[]) this.readyAt[id] = 0;
  }
}
