import { PASSIVE } from './balance';

/**
 * Magic Boy's passive: landing an ability ramps his attack speed.
 *
 * Ownership is deliberately narrow:
 *   - the kit decides *when* an ability hit and calls `addStack()`
 *   - this system owns the stack count and the expiry
 *   - AttackSystem only ever reads `attackSpeedMultiplier` (through the kit)
 *
 * Nobody else stores passive state, so there is one place to change how it
 * behaves. All timing is on the GameClock, so it freezes with a pause.
 *
 * Stacks are ONE shared buff, not independent timers: each hit adds a stack (up
 * to the cap) and refreshes the whole thing. When it lapses, every stack goes.
 */
export class PassiveSystem {
  private stacks = 0;
  /** Clock time at which every stack drops. */
  private expiresAt = 0;
  private now = 0;

  /** Bumped on every gained stack, so the HUD/player can react exactly once. */
  public lastStackAt = -Infinity;

  get stackCount(): number {
    return this.stacks;
  }

  get maxStacks(): number {
    return PASSIVE.maxStacks;
  }

  get isMaxStacked(): boolean {
    return this.stacks >= PASSIVE.maxStacks;
  }

  get remainingMs(): number {
    return this.stacks > 0 ? Math.max(0, this.expiresAt - this.now) : 0;
  }

  /** 1 immediately after a hit, easing to 0 as the buff lapses. */
  get remainingFraction(): number {
    return this.stacks > 0 ? this.remainingMs / PASSIVE.durationMs : 0;
  }

  /**
   * The multiplicative attack-speed bonus.
   *   0 stacks -> 1.0, 5 stacks -> 1.5 at +10% each.
   */
  get attackSpeedMultiplier(): number {
    return 1 + this.stacks * PASSIVE.attackSpeedPerStack;
  }

  /** An ability connected: one more stack (to the cap) and a full refresh either way. */
  addStack(): void {
    this.stacks = Math.min(PASSIVE.maxStacks, this.stacks + 1);
    this.expiresAt = this.now + PASSIVE.durationMs;
    this.lastStackAt = this.now;
  }

  update(nowMs: number): void {
    this.now = nowMs;
    if (this.stacks > 0 && nowMs >= this.expiresAt) {
      // All stacks expire together, never one at a time.
      this.stacks = 0;
    }
  }

  reset(): void {
    this.stacks = 0;
    this.expiresAt = 0;
    this.lastStackAt = -Infinity;
  }
}
