/**
 * Cassiopeia's numbers. Tunable live from the console: __cassiopeia.Q.radius = 60
 *
 * She drills a different rhythm from Ezreal: autos are slower and her E is
 * the beat between them; Q and W are ground spells you place ahead of where
 * enemies will be; R is a once-a-stage cone that punishes enemies facing you.
 *
 * She's a battle mage (League's Cassiopeia, Ryze, Vladimir, Swain): sustained
 * damage from short range, in the thick of the fight, where Ezreal pokes from
 * far off. Her auto reaches ~0.77x his; E and W keep League's ratio to her auto
 * (700 / 550), and Q sits just past it, so her whole kit is shorter than his.
 */

export const STATS = {
  radius: 14,
  maxHp: 100,
  moveSpeed: 280,
};

/** Her auto: shorter than Ezreal's 260 (__balance.ATTACK.range). Centre to the target's edge. */
export const AUTO = {
  range: 200,
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
  /** Just past her auto range: you walk up to cast it. */
  range: 275,
  radius: 45,
  /** The telegraph: enemies can walk out of it. */
  delayMs: 400,
  castTimeMs: 150,
  cooldownMs: 3500,
};

/**
 * Poison: a pip every `tickMs` while it lasts. Q's lasts `durationMs` (two more
 * pips if they stay alive); W's only while they stand in the cloud (W.poisonMs).
 * It can't finish a spellcaster from above one pip (ENEMIES[id].spellcaster).
 */
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
  range: 250,
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
  /**
   * The bolts are lobbed from her body at this speed, and the cloud acts once
   * they're all down. League's 3000 is ~1400 here; a touch slower so the lob reads.
   */
  boltSpeed: 1200,
  durationMs: 4000,
  /** How often the cloud re-applies its slow and poison. */
  tickMs: 500,
  slowFraction: 0.35,
  /** A slow this short lapses the moment they leave the cloud. */
  slowMs: 600,
  /**
   * W's poison is as short, re-applied each tick: it lasts only while they're
   * inside, and lapses (without its pip) when they step out before a tick.
   */
  poisonMs: 600,
  castTimeMs: 150,
  cooldownMs: 12000,
};

/**
 * E, Twin Fang: point-and-click, as in League. Press it with the cursor on an
 * enemy within range; empty ground, or an enemy out of range, casts nothing.
 * One pip; two if the target is poisoned.
 */
export const E = {
  /** To the target's edge. 1.27x her auto range, League's 700 / 550. */
  range: 250,
  castTimeMs: 150,
  cooldownMs: 800,
  pips: 1,
  pipsOnPoisoned: 2,
  /** League's 2500 is ~1180 here. */
  boltSpeed: 1150,
};

/**
 * R, Petrifying Gaze: a cone. Enemies facing her are stunned; the rest are slowed. One pip to all.
 * As in League it has a half-second cast and strikes the moment the cast ends: she's rooted
 * throughout, and the cone telegraph is the cast window itself. Flash mid-cast and it strikes
 * from where she lands (R-Flash).
 */
export const R = {
  radius: 420,
  /** Half the opening, in radians (40°). */
  halfAngle: 0.698,
  castTimeMs: 500,
  cooldownMs: 45000,
  stunMs: 1500,
  slowFraction: 0.5,
  slowMs: 1500,
  /**
   * Every Twin Fang that lands on a poisoned enemy takes this off R's
   * remaining cooldown. This trainer's own rule, not League's: it replaces the
   * old once-a-stage refresh, so R comes round faster the better you play.
   */
  poisonedFangCooldownReductionMs: 500,
};

/** Status ids she applies. */
export const POISON_STATUS = 'cassiopeia.poison';
export const MIASMA_SLOW = 'cassiopeia.miasma';
export const PETRIFY_STATUS = 'cassiopeia.petrify';
export const GAZE_SLOW = 'cassiopeia.gaze';
