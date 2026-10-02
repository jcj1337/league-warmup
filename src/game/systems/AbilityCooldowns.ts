import { BLINK_E, FLASH, SKILLSHOT_Q, SKILLSHOT_W } from '../../config/balance';

export type AbilityId = 'q' | 'w' | 'e' | 'flash';

/** Full cooldown per ability, read from config. */
const DURATIONS: Record<AbilityId, () => number> = {
  q: () => SKILLSHOT_Q.cooldownMs,
  w: () => SKILLSHOT_W.cooldownMs,
  e: () => BLINK_E.cooldownMs,
  flash: () => FLASH.cooldownMs,
};

/**
 * One place that knows what is on cooldown and for how long.
 *
 * Every ability system asks this rather than keeping its own `readyAt`, which
 * is what makes cross-ability effects (a landed Q refunding Q/W/E) a single
 * call instead of three bits of duplicated arithmetic — and gives the HUD one
 * consistent source for every slot.
 *
 * All timing is GameClock time, so pausing freezes every cooldown at once.
 */
export class AbilityCooldowns {
  private readonly readyAt: Record<AbilityId, number> = { q: 0, w: 0, e: 0, flash: 0 };
  private now = 0;

  update(nowMs: number): void {
    this.now = nowMs;
  }

  isReady(id: AbilityId): boolean {
    return this.now >= this.readyAt[id];
  }

  remainingMs(id: AbilityId): number {
    return Math.max(0, this.readyAt[id] - this.now);
  }

  totalMs(id: AbilityId): number {
    return DURATIONS[id]();
  }

  /** Put an ability on its full cooldown, starting now. */
  start(id: AbilityId): void {
    this.readyAt[id] = this.now + DURATIONS[id]();
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
    this.readyAt.q = 0;
    this.readyAt.w = 0;
    this.readyAt.e = 0;
    this.readyAt.flash = 0;
  }
}
