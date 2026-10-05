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
   * click drops it close; a long one, this far out. Decided once, as the axe
   * hits: nothing he does afterwards moves it. Kept short enough that he can
   * always walk to it in the second it takes to land.
   */
  dropMaxPx: 120,
  /** Not walking anywhere: it lands within this many px of him, close enough to catch without moving. */
  dropIdlePx: 12,
  /**
   * He catches it standing within this of the spot (centre to centre). The
   * drawn circle: a little larger than his body.
   */
  catchRadius: 36,
  /**
   * He can take it out of the air this long before it would touch the ground:
   * that is when the falling axe, as drawn, reaches his body. Without it the
   * catch came a beat after the axe looked caught.
   */
  catchEarlyMs: 120,
  /** A missed axe lies there this long and can still be picked up, then it is gone. */
  groundMs: 350,
  /**
   * HP he gets back for an axe he catches (never past full): `base` for the
   * first, `perCatch` more for each catch in a row, up to `max`. Missing one
   * axe ends the streak, and the next catch heals `base` again.
   */
  catchHeal: { base: 5, perCatch: 5, max: 20 },
  /** Score for each catch, × the stage multiplier: a kill is worth 100, so this is a nudge to go get it. */
  catchScoreBonus: 10,
};

/**
 * W: a burst of speed. Instant, and it interrupts nothing. Move speed jumps
 * and decays over `moveMs`; attack speed holds for `attackMs`. Catching an
 * axe resets its cooldown.
 */
export const W = {
  cooldownMs: 12000,
  moveBonus: 0.25,
  moveMs: 750,
  attackSpeedBonus: 0.3,
  attackMs: 3000,
};

/**
 * E: a great axe thrown a short way. It passes through everything: one pip
 * each, a slow, and whoever it hits is shoved aside, off the line. Wide and
 * short: it reaches about as far as his auto.
 */
export const E = {
  castTimeMs: 250,
  cooldownMs: 10000,
  speed: 1100,
  /** Collision half-width: a very wide band. */
  radius: 60,
  /** How far its centre travels; with its width it covers his auto range. */
  maxRange: 240,
  slowFraction: 0.4,
  slowMs: 2000,
  /** How far a hit enemy is shoved sideways, away from the line. An unstoppable enemy is not moved. */
  knockPx: 46,
};

/**
 * R: two great axes down a line across the arena. They turn for home, back to
 * him wherever he has gone, a little past the first enemy they hit
 * (`overshootPx`), or at once when he presses R again, or at the arena's edge.
 * They pass through everything, out and back.
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
  /** After the first enemy it hits, it carries on this far before turning. */
  overshootPx: 110,
};

export const CLEAVE_SLOW = 'axeman.cleave';
