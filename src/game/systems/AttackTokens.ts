import type { Enemy } from '../entities/Enemy';

/**
 * Attack tokens: a crowd takes turns. An enemy must hold a token to start a
 * token-gated attack (the basic spit) and hands it back when the attack
 * leaves, so at most `capacity` of them (DIFFICULTY.attackTokens for the
 * stage) are ever winding up at once — the fire grows with the crowd without
 * turning into a bullet hell.
 *
 * A token held by an enemy that is no longer active (killed mid-windup, or
 * its wave was replaced) is reclaimed automatically, so nothing ever leaks.
 */
export class AttackTokens {
  private readonly holders = new Set<Enemy>();

  /** `capacity` is read live, so the pool grows the moment a new stage begins. */
  constructor(private readonly capacityNow: () => number) {}

  get capacity(): number {
    return this.capacityNow();
  }

  get inUse(): number {
    this.reclaim();
    return this.holders.size;
  }

  /** Take a token (or keep the one already held). @returns whether `enemy` holds one now. */
  tryTake(enemy: Enemy): boolean {
    if (this.holders.has(enemy)) return true;
    this.reclaim();
    if (this.holders.size >= this.capacity) return false;
    this.holders.add(enemy);
    return true;
  }

  release(enemy: Enemy): void {
    this.holders.delete(enemy);
  }

  clear(): void {
    this.holders.clear();
  }

  private reclaim(): void {
    for (const e of this.holders) if (!e.active) this.holders.delete(e);
  }
}
