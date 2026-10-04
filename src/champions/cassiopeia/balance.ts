/**
 * Cassiopeia's numbers. Tunable live from the console: __cassiopeia.Q.radius = 60
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

/**
 * Q, Noxious Blast: a delayed blast at a ground point. One pip, and poison.
 * Sized from League by body widths, not by range: her Q is 200 units against a
 * ~65-unit champion, about three radii, so a small blast you aim at one enemy.
 */
export const Q = {
  /** 1.55x her auto range, League's 850 / 550: you walk up to cast it. */
  range: 400,
  radius: 45,
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

/**
 * W, Miasma: venom spat in an arc, a wall of clouds across her aim. Enemies
 * inside any cloud are slowed and poisoned; it deals no pip itself.
 */
export const W = {
  /** 1.27x her auto range, League's 700 / 550. */
  range: 330,
  /** How many clouds, laid side by side across her aim, the middle one on the aim point. */
  puffs: 7,
  puffRadius: 30,
  /** Centre of the first cloud to centre of the last; the field is this plus a cloud's width end to end. */
  spanPx: 120,
  /**
   * The clouds sit on an arc centred behind the aim point, as if thrown from
   * her: its radius is her distance to the aim point, never tighter than this,
   * so a W at her feet is a gentle curve, not a ring around her.
   */
  arcMinRadius: 220,
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
