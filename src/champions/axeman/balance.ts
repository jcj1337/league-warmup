/**
 * Axe Man's numbers. Tunable live from the console: __axeMan.Q.dropMaxPx = 220
 *
 * He drills one thing: catching. Q readies a spinning axe, the next auto
 * throws it for an extra pip, and it comes down somewhere near him, further
 * out the further away he is walking. Standing on that spot as it lands puts
 * the axe back in his hand, ready for the next auto, and resets W. Keep
 * catching and every auto is an axe; miss and he waits on Q's cooldown.
 */

export const STATS = {
  radius: 14,
  maxHp: 100,
  moveSpeed: 280,
};

/** His auto: the same reach as Magic Boy's (__balance.ATTACK.range is 260). Centre to the target's edge. */
export const AUTO = {
  range: 260,
};

export const LEVELS = {
  abilityHastePerLevel: 5,
  /** A touch quicker than Magic Boy's 700ms: he lives on his autos. */
  baseAttackCooldownMs: 680,
  attackSpeedPerLevel: 0.06,
  moveSpeedPerLevel: 0,
};

/**
 * Q: ready a spinning axe. Instant, and it interrupts nothing. He holds up to
 * `maxHeld`; each auto throws one, for `bonusPips` on top of the auto's own.
 * The thrown axe bounces off the target and comes down `airMs` later.
 */
export const Q = {
  cooldownMs: 7000,
  maxHeld: 2,
  /** Axes in hand are dropped if none is thrown or caught for this long. Catching refreshes it. */
  holdMs: 6000,
  bonusPips: 1,
  /** From the hit to the axe landing: the time he has to get under it. */
  airMs: 1000,
  /**
   * Where it lands: from where he stands when it hits, toward where he is
   * walking, as far as the rest of that walk up to this many px. A short
   * click drops it close; a long one, this far out.
   */
  dropMaxPx: 190,
  /** Not walking anywhere: it lands within this many px of him. */
  dropIdlePx: 34,
  /**
   * For this long after the hit the landing spot still follows his move
   * orders, then it is fixed: the click that comes just after the axe connects
   * (the normal orbwalk rhythm) still steers it.
   */
  steerMs: 220,
  /** He catches it standing within this of the spot (centre to centre). The drawn circle. */
  catchRadius: 46,
  /** A missed axe lies there this long and can still be picked up, then it is gone. */
  groundMs: 350,
};

/**
 * W: a burst of speed. Instant, and it interrupts nothing. Move speed jumps
 * and decays over `moveMs`; attack speed holds for `attackMs`. Catching an
 * axe resets its cooldown.
 */
export const W = {
  cooldownMs: 12000,
  moveBonus: 0.5,
  moveMs: 1500,
  attackSpeedBonus: 0.3,
  attackMs: 3000,
};

/**
 * E: axes thrown in a line. They pass through everything: one pip each, a
 * slow, and whoever they hit is shoved aside, off the line.
 */
export const E = {
  castTimeMs: 250,
  cooldownMs: 10000,
  speed: 1100,
  /** Collision half-width: a wide band. */
  radius: 36,
  maxRange: 430,
  slowFraction: 0.4,
  slowMs: 2000,
  /** How far a hit enemy is shoved sideways, away from the line. An unstoppable enemy is not moved. */
  knockPx: 46,
};

/**
 * R: two great axes across the whole arena. They pass through everything on
 * the way out, turn at the arena's edge and come back to him, wherever he has
 * gone, hitting everything in their path again.
 */
export const R = {
  castTimeMs: 400,
  cooldownMs: 40000,
  speed: 1000,
  radius: 42,
  /** Pips to each enemy on the way out, and again on the way back. */
  pips: 1,
  returnPips: 1,
  /** Never further than this before turning, edge or not. */
  maxRange: 1500,
};

export const CLEAVE_SLOW = 'axeman.cleave';
