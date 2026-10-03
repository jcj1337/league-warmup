import { DIFFICULTY, type Curve } from '../../config/balance';

/**
 * The difficulty curve. One threat level per stage drives every scaled number:
 *
 *   T(stage) = DIFFICULTY.growth ^ (stage - 1)
 *   value    = clamp(base × T ^ k, min, max)
 *
 * Pure functions over the live config, so console edits to __balance apply the
 * next time a value is read (enemies read theirs once, at spawn).
 */

/** Threat level of a 1-based stage: 1 at Stage 1, ×growth per stage after. */
export function threat(stage: number): number {
  return Math.pow(DIFFICULTY.growth, Math.max(0, stage - 1));
}

/** A curve's value on a stage. `base` overrides the curve's own (a mob's config value). */
export function scaled(curve: Curve, stage: number, base: number = curve.base ?? 1): number {
  const value = base * Math.pow(threat(stage), curve.k);
  return Math.min(curve.max ?? Infinity, Math.max(curve.min ?? -Infinity, value));
}

/** Every global scaled number for one stage. Read by the director, the scene and the HUD/tests. */
export interface StageDifficulty {
  stage: number;
  threat: number;
  waveSize: number;
  maxAlive: number;
  arrivalGapMs: number;
  moveSpeed: number;
  projectileSpeed: number;
  damage: number;
  attackTokens: number;
  packSize: number;
}

export function stageDifficulty(stage: number): StageDifficulty {
  const D = DIFFICULTY;
  return {
    stage,
    threat: threat(stage),
    waveSize: Math.round(scaled(D.waveSize, stage)),
    maxAlive: Math.round(scaled(D.maxAlive, stage)),
    arrivalGapMs: scaled(D.arrivalGapMs, stage),
    moveSpeed: scaled(D.moveSpeed, stage),
    projectileSpeed: scaled(D.projectileSpeed, stage),
    damage: scaled(D.damage, stage),
    attackTokens: Math.round(scaled(D.attackTokens, stage)),
    packSize: Math.round(scaled(D.packSize, stage)),
  };
}

/** An enemy-cast projectile's speed on a stage: scaled, then capped. */
export function projectileSpeed(base: number, stage: number): number {
  return Math.min(DIFFICULTY.projectileMaxSpeed, base * scaled(DIFFICULTY.projectileSpeed, stage));
}
