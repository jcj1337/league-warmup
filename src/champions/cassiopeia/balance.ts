/**
 * Cassiopeia's numbers. Tunable live from the console: __cassiopeia.Q.radius = 90
 *
 * She drills a different rhythm from Ezreal: autos are slower and her E is
 * the beat between them; Q and W are ground spells you place ahead of where
 * enemies will be; R is a once-a-stage cone that punishes enemies facing you.
 */

export const STATS = {
  radius: 14,
  maxHp: 100,
  moveSpeed: 280,
};

/** Her level perks: no boots, but speed with every level. */
export const LEVELS = {
  abilityHastePerLevel: 5,
  /** Slower than Ezreal's 700ms: her E, not her auto, is the fast beat. */
  baseAttackCooldownMs: 950,
  attackSpeedPerLevel: 0.03,
  /** Serpentine Grace: +3% move speed per level (×1.51 at 18). */
  moveSpeedPerLevel: 0.03,
};

/** Q, Noxious Blast: a delayed blast at a ground point. One pip, and poison. */
export const Q = {
  range: 500,
  radius: 70,
  /** The telegraph: enemies can walk out of it. */
  delayMs: 400,
  castTimeMs: 150,
  cooldownMs: 3500,
};

/** Poison, from Q and W: a pip every `tickMs` for `durationMs` (so two more pips if they stay alive). */
export const POISON = {
  durationMs: 4000,
  tickMs: 2000,
};

/** W, Miasma: a lingering cloud. Enemies inside are slowed and poisoned; it deals no pip itself. */
export const W = {
  range: 450,
  radius: 90,
  durationMs: 4000,
  /** How often the cloud re-applies its slow and poison. */
  tickMs: 500,
  slowFraction: 0.35,
  /** A slow this short lapses the moment they leave the cloud. */
  slowMs: 600,
  castTimeMs: 150,
  cooldownMs: 12000,
};

/** E, Twin Fang: a point-and-click bolt. One pip; two if the target is poisoned. */
export const E = {
  range: 400,
  castTimeMs: 150,
  cooldownMs: 800,
  pips: 1,
  pipsOnPoisoned: 2,
  boltSpeed: 1150,
  boltRadius: 6,
};

/** R, Petrifying Gaze: a cone. Enemies facing her are stunned; the rest are slowed. One pip to all. */
export const R = {
  radius: 420,
  /** Half the opening, in radians (40°). */
  halfAngle: 0.698,
  delayMs: 350,
  castTimeMs: 200,
  cooldownMs: 45000,
  stunMs: 1500,
  slowFraction: 0.5,
  slowMs: 1500,
  /** It also comes back at every stage clear, like your HP. */
  refreshOnStageClear: true,
};

/** Status ids she applies. */
export const POISON_STATUS = 'cassiopeia.poison';
export const MIASMA_SLOW = 'cassiopeia.miasma';
export const PETRIFY_STATUS = 'cassiopeia.petrify';
export const GAZE_SLOW = 'cassiopeia.gaze';
