/**
 * Ezreal's numbers. The world (arena, enemies, waves, score, Flash) stays in
 * src/config/balance.ts; everything here is his alone. Tunable live from the
 * console: __ezreal.SKILLSHOT_Q.speed = 1400
 */

export const STATS = {
  radius: 14,
  maxHp: 100,
  /**
   * Move speed. Lowered from 340 so fights read closer to League's pace;
   * Pursuers move at a fraction of this, so they slowed with it.
   */
  moveSpeed: 280,
};

/**
 * What a level gives him, and his auto pacing. Calibrated with the world's XP
 * curve (LEVELS in balance.ts) so the level roughly tracks the stage.
 */
export const LEVELS = {
  /** Q / W / E cooldown = base / (1 + haste / 100). 85 haste at level 18: cooldowns ×0.54. */
  abilityHastePerLevel: 5,
  /** The base auto cycle at level 1, sped up by attackSpeedPerLevel each level (700 → 438ms at 11 → 347ms at 18). */
  baseAttackCooldownMs: 700,
  attackSpeedPerLevel: 0.06,
  moveSpeedPerLevel: 0,
  /** Q ranks up: from this level each Q hit removes `pips` pips. */
  qRankUp: { level: 9, pips: 2 },
};

/**
 * Q: a quick-cast linear skillshot.
 *
 * The missile stops on the first enemy it touches and removes one pip (two
 * from LEVELS.qRankUp.level). A landed Q refunds part of every basic ability's
 * cooldown and stacks the passive.
 */
export const SKILLSHOT_Q = {
  /**
   * Slow enough that cast -> travel -> hit reads as three separate beats, and
   * that a moving Pursuer has to be led rather than pointed at.
   * (Was 1900; -34%.)
   */
  speed: 1250,
  /** Collision half-width (circle-vs-circle against the target's radius). */
  radius: 7,
  /**
   * Hard cap on travel; the missile dies here.
   * 450 == 1.73 x ATTACK.range (260) — clearly longer than an auto, nowhere
   * near able to cross the 1280px arena.
   */
  maxRange: 450,
  cooldownMs: 3000,
  /**
   * A landed Q takes this much off the REMAINING cooldown of Q, W, E AND R (as
   * in League, where it lowers every cooldown) — never Flash, and it never
   * restarts a cooldown. Missing gives nothing.
   */
  hitCooldownReductionMs: 750,
  /**
   * Commitment window before the bolt leaves, anchored to the auto-attack
   * windup (Stage 1's 700ms cycle × windupPercent = 175ms) so
   * weaving Q between autos feels like the same rhythm. Set 0 for instant.
   */
  castTimeMs: 165,
  /** Missile stops on the first target it hits — no pierce. */
  stopsOnFirstHit: true,
};

/**
 * W: an Essence-Flux-flavoured MARK skillshot.
 *
 * The projectile itself removes no pips — it marks whatever it touches. The
 * mark detonates the next time that enemy takes a hit from an auto, Q, or the
 * E bolt, removing one extra pip on top of that hit's own.
 */
export const SKILLSHOT_W = {
  /**
   * Commitment window before the orb actually leaves. The direction is locked
   * in when the key goes down, so moving the mouse mid-cast cannot re-aim it.
   * Slightly heavier than Q (165ms), still inside the auto-windup band.
   */
  castTimeMs: 185,
  /** Fatter and slower than Q, so it reads as a different kind of shot. */
  speed: 1000,
  radius: 12,
  maxRange: 450,
  cooldownMs: 6000,
  /** Marks last this long before lapsing harmlessly. */
  markDurationMs: 4000,
  /** Marks stop on the first enemy touched — no pierce. */
  stopsOnFirstHit: true,
};

/**
 * E: an Arcane-Shift-flavoured blink that fires a homing bolt on arrival.
 *
 * The blink always happens; the bolt only spawns if something is nearby. The
 * bolt prefers a W-marked enemy, which is what makes W -> E a real combo.
 */
export const BLINK_E = {
  /**
   * Commitment window before the blink fires. The destination is committed at
   * keypress, so this is a real decision rather than a reflex escape.
   * The heaviest of the three, because it is a blink — but still short enough
   * to weave: AUTO 175 ~ Q 165 < W 185 < E 210.
   */
  castTimeMs: 210,
  cooldownMs: 8000,
  /**
   * League's ratio to the auto: Arcane Shift 475 against Ezreal's 550 auto
   * (~0.86x), so just short of his attack range, and longer than Flash. (Was 310.)
   */
  range: 225,
  /**
   * Post-blink search radius for the bolt, measured from where E lands.
   * ~1.46x attack range. Provisional — was 455; tune after playtesting.
   */
  boltAcquisitionRange: 380,
  boltSpeed: 1050,
  boltRadius: 7,
};

/**
 * R: Trueshot Barrage, as in League. A long charge, then one global wave
 * that crosses the whole arena and passes through everything in its path.
 * The first enemy it touches takes the brunt; everyone after, less. Each
 * enemy hit is a passive stack. No stage refresh: a landed Q lowers its
 * cooldown like the others (SKILLSHOT_Q.hitCooldownReductionMs).
 */
export const ULT_R = {
  /** League's 1s: rooted while he charges it, the path drawn on the ground. */
  castTimeMs: 1000,
  cooldownMs: 60000,
  /** League's 2000 is ~950 here: about a second and a half to cross the arena. */
  speed: 950,
  /**
   * Collision half-width. League's wave is 320 wide, ~2.5 champion radii
   * either side of its line; this is two slime radii, a wide band to aim.
   */
  radius: 40,
  /** Global: far enough to leave the arena from anywhere in it. */
  maxRange: 1500,
  /** The first enemy it touches loses `firstPips`; every one after, `pips`. */
  firstPips: 2,
  pips: 1,
};

/**
 * The Ezreal-flavoured passive: landing abilities ramps your attack speed.
 *
 * Any damaging/marking ability hit stacks it: Q, the W mark landing, and the E
 * bolt. A W DETONATION does not (the stack was already granted when the mark
 * landed), and Flash never does.
 *
 * One shared timed buff, not per-stack timers — every hit adds a stack (to the
 * cap) AND refreshes the whole buff. When it expires, all stacks go at once.
 */
export const PASSIVE = {
  maxStacks: 5,
  /** Multiplicative attack-speed bonus per stack. 0.10 == +10% each. */
  attackSpeedPerStack: 0.1,
  durationMs: 6000,
};

/** The W mark, as an enemy status id. */
export const MARK_STATUS = 'ezreal.mark';
