import { LEVELS } from '../../config/balance';
import type { AttackPacing } from './AttackSystem';

/**
 * The player's level, League style: kills give XP (ENEMIES[id].xp), levels run
 * 1 → LEVELS.max, and each level makes the kit faster —
 *
 *   ability haste    LEVELS.abilityHastePerLevel per level on Q / W / E
 *                    (cooldown = base / (1 + haste / 100); Flash is a summoner, untouched)
 *   attack speed     +LEVELS.attackSpeedPerLevel per level on the base auto cycle
 *   Q rank-up        Q removes LEVELS.qRankUp.pips from LEVELS.qRankUp.level on
 *
 * It is the AttackPacing source: the base auto cycle comes from the level
 * (it used to come from the stage), and the passive multiplies on top.
 * Every number is read live from LEVELS, so console edits apply at once.
 */
export class Progression implements AttackPacing {
  /** 1-based level. */
  level = 1;
  /** XP into the current level. */
  xp = 0;
  /** All XP earned this run. */
  totalXp = 0;
  /** Clock time of the last level-up, for the HUD flash. */
  lastLevelUpAt = Number.NEGATIVE_INFINITY;

  get isMaxLevel(): boolean {
    return this.level >= LEVELS.max;
  }

  /** XP needed to go from the current level to the next; Infinity at max level. */
  get xpToNext(): number {
    return this.isMaxLevel ? Number.POSITIVE_INFINITY : xpToNext(this.level);
  }

  /** 0..1 through the current level (1 at max). */
  get progress(): number {
    return this.isMaxLevel ? 1 : this.xp / this.xpToNext;
  }

  get abilityHaste(): number {
    return LEVELS.abilityHastePerLevel * (this.level - 1);
  }

  /** Multiplies Q / W / E cooldowns. */
  get cooldownMultiplier(): number {
    return 100 / (100 + this.abilityHaste);
  }

  get attackSpeedMultiplier(): number {
    return 1 + LEVELS.attackSpeedPerLevel * (this.level - 1);
  }

  /** AttackPacing: the base auto cycle at this level, before passive stacks. */
  get baseAttackCooldownMs(): number {
    return LEVELS.baseAttackCooldownMs / this.attackSpeedMultiplier;
  }

  /** Pips one Q hit removes. */
  get qPips(): number {
    return this.level >= LEVELS.qRankUp.level ? LEVELS.qRankUp.pips : 1;
  }

  /**
   * Add XP from a kill.
   * @returns how many levels were gained (usually 0 or 1).
   */
  addXp(amount: number, nowMs: number): number {
    if (this.isMaxLevel || amount <= 0) return 0;
    this.totalXp += amount;
    this.xp += amount;
    let gained = 0;
    while (!this.isMaxLevel && this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    if (this.isMaxLevel) this.xp = 0;
    if (gained > 0) this.lastLevelUpAt = nowMs;
    return gained;
  }
}

/** XP to go from `level` to `level + 1`: LEVELS.xp.first, growing by LEVELS.xp.growth per level. */
export function xpToNext(level: number): number {
  return Math.round(LEVELS.xp.first * Math.pow(LEVELS.xp.growth, level - 1));
}
