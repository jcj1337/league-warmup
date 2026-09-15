/**
 * All gameplay tuning lives here. Nothing else in the codebase should hard-code
 * a balance number — if you want to change how the game feels, change it here.
 * How the game LOOKS (colours, sprite sizes, effect timings) lives in theme.ts.
 *
 * Units:
 *   distance  = pixels
 *   speed     = pixels / second
 *   time      = milliseconds (unless the field name says "Seconds")
 */

export const ARENA = {
  width: 1280,
  height: 720,
  /** Playable inset from the canvas edge; the visible border is drawn here. */
  padding: 24,
} as const;

export const PLAYER = {
  radius: 14,
  maxHp: 100,
  /** League-ish move speed (a marksman is ~330 units/s). */
  moveSpeed: 340,
  /** Snap to the destination when this close, so we never jitter around it. */
  arriveEpsilon: 3,
  /** Brief i-frames after taking a hit so one projectile can't multi-tick. */
  hitInvulnerabilityMs: 250,
} as const;

/**
 * The attack cycle, League style:
 *
 *   attack command
 *        |
 *        v
 *   [ WINDUP ]  rooted, cancellable, no damage yet
 *        |
 *        v
 *   FIRE          damage is committed here
 *        |
 *        v
 *   [ RECOVERY ] free to move — this is the orbwalk window
 *        |
 *        v
 *   next attack available
 *
 * windup + recovery == cooldownMs. Not `as const`, so you can also poke these
 * live from the browser console: __balance.ATTACK.range = 400
 */
export const ATTACK = {
  /**
   * Measured from the player's center to the EDGE of the target's hitbox, like
   * League: in range when dist(player, target) <= range + target.radius.
   * The debug ring drawn around the player is exactly this radius, so a target
   * is attackable as soon as its circle touches the ring.
   */
  range: 260,

  // --- attack speed ---------------------------------------------------------
  // The base attack cycle (windup + recovery, before passive stacks) is set per
  // stage in STAGES[n].baseAttackCooldownMs: 700ms at Stage 1 → 420ms at Stage 10.
  /**
   * Fraction of the cycle spent rooted in windup before release.
   * League's "attack cast time" as a percentage — THE knob for orbwalk feel.
   * Because it is a RATIO, the windup shrinks along with the cooldown as attack
   * speed ramps, so the visual and the mechanic stay in step automatically.
   */
  windupPercent: 0.25,
  /**
   * Absolute windup in ms, ignoring windupPercent. Note this does NOT scale with
   * attack speed — the cancel window stays constant while the cycle shortens.
   */
  windupMsOverride: null as number | null,
  /** Never let the scaled windup drop below this, or it becomes unreadable. */
  minWindupMs: 90,
  /**
   * If true, a move order during windup cancels the attack: no hit lands and
   * the cooldown is refunded. This is what makes animation-cancel drills work.
   * Move orders AFTER the attack fires never undo it.
   */
  allowMoveCancel: true,
  /**
   * If true, an attack command on an out-of-range target makes the player walk
   * into range and attack automatically (League right-click-to-attack).
   * If false, out-of-range attack commands are ignored.
   */
  chaseOutOfRangeTargets: true,
  /**
   * While chasing, the player walks toward a point this far inside max range
   * rather than toward the target itself. The chase still ENDS the moment the
   * target is in range, so in practice the player stops right at max range;
   * this buffer only shapes the approach when the target is moving away.
   */
  chaseBufferPx: 24,
  /**
   * How Attack Move picks a target among the enemies currently IN RANGE:
   *   'cursor' — closest to where the A-click was issued (League's default feel)
   *   'player' — closest to the player
   * Only in-range enemies are ever considered, so A-click never sends you
   * sprinting across the arena.
   */
  attackMoveTargeting: 'cursor' as 'cursor' | 'player',
  /**
   * After Attack Move acquires a target, should the player chase it if it walks
   * out of range? False = drop it and resume moving to the A-click destination,
   * which keeps A-click from dragging you around the map.
   * A DIRECT right-click on an enemy always chases (see chaseOutOfRangeTargets).
   */
  attackMoveChasesAcquiredTarget: false,
  /**
   * Range measurement. Default (false) is League's model: from the player's
   * CENTER to the EDGE of the target's hitbox.
   * Set true for edge-to-edge (also subtracts the player's own radius).
   * The drawn ring uses the same formula, so what you see is what you get.
   */
  rangeFromPlayerEdge: false,
  // --- basic-attack projectile ---------------------------------------------
  /**
   * Speed of the auto-attack missile. This is PURELY cosmetic/damage-delay:
   * the attack is committed the instant the missile spawns, and the next attack
   * is gated by cooldownMs, never by travel time.
   */
  projectileSpeed: 1150,
  projectileRadius: 6,
};

/**
 * Single source of truth for attack reach, used by BOTH the hit test and the
 * drawn range ring so they can never drift apart.
 *
 * Returns the maximum distance between the player's center and the target's
 * CENTER at which the attack connects — which is exactly the radius of the ring
 * that should be drawn around the player. A target whose center sits inside the
 * ring is attackable, full stop.
 */
export function attackReach(targetRadius: number, playerRadius: number): number {
  return ATTACK.range + targetRadius + (ATTACK.rangeFromPlayerEdge ? playerRadius : 0);
}

/**
 * Keybinds, normalized to uppercase key names ('A', 'S', 'Q', 'ESCAPE', 'SPACE').
 * InputController is the only thing that reads these, so rebinding later means
 * changing this object — not hunting through the scenes.
 */
export const KEYBINDS = {
  /** A: arm attack-move targeting, then left-click a location. */
  attackMove: ['A'],
  /**
   * T: League's "Player Attack Move Click" — one press issues the same attack
   * move command at the cursor, with no second click.
   */
  attackMoveClick: ['T'],
  stop: ['S'],
  /** Q: quick-cast, fires instantly toward the cursor. */
  skillshotQ: ['Q'],
  /** W: quick-cast mark skillshot. */
  skillshotW: ['W'],
  /** E: quick-cast blink toward the cursor, then a homing bolt. */
  blinkE: ['E'],
  /** F: summoner-style blink. */
  flash: ['F'],
  cancel: ['ESCAPE'],
  restart: ['R', 'SPACE'],
};

/**
 * Development readouts. All of these are pure overlay — turning any of them off
 * changes nothing about how the game plays.
 */
export const DEBUG = {
  /**
   * When the player's attack-range ring is drawn:
   *   'contextual' — only while an Attack Move command is being used (A mode,
   *                  or briefly after T). This is the default: the ring is a
   *                  targeting aid, not permanent furniture.
   *   'always'     — the old behaviour, useful when tuning range itself
   *   'off'        — never
   * Changing this never changes the attack range calculation.
   */
  attackRangeDisplay: 'contextual' as 'contextual' | 'always' | 'off',
  /** The little "CANCEL" tag when a windup is aborted. */
  showCancelFeedback: true,
  /** Ring around the current attack target. */
  showTargetMarker: true,
  /** Floating "-1" pip-loss numbers over targets. */
  showDamageNumbers: true,
};

/**
 * APM readout: raw player inputs (every key press and mouse-button press,
 * bound or not) per minute over a rolling window. Informational only — it never feeds scoring or gameplay.
 */
export const APM = {
  /** Only inputs this recent count. */
  windowMs: 30000,
  /**
   * Early in a run the window is not full yet; divide by at least this much
   * time so a few opening clicks cannot read as thousands of APM.
   */
  minWindowMs: 10000,
};

/**
 * Q: a quick-cast linear skillshot.
 *
 * Press Q and it fires instantly toward the cursor — no targeting mode, no
 * confirming click, no indicator. Finite range, stops on the first enemy hit.
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
   * A landed Q takes this much off the REMAINING cooldown of Q, W AND E — never
   * Flash, and it never restarts a cooldown. Missing gives nothing.
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
} as const;

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
} as const;

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
  /** ~1.2x attack range. Real repositioning, well short of Q/W reach. (Was 364.) */
  range: 310,
  /**
   * Post-blink search radius for the bolt, measured from where E lands.
   * ~1.46x attack range. Provisional — was 455; tune after playtesting.
   */
  boltAcquisitionRange: 380,
  boltSpeed: 1050,
  boltRadius: 7,
} as const;

/** F: a summoner-style blink. No hit, no passive, no cooldown refund. */
export const FLASH = {
  cooldownMs: 20000,
  /** ~1.06x attack range — shorter than E. (Was 325.) */
  range: 275,
} as const;

/**
 * The Ezreal-flavoured passive: landing Q ramps your attack speed.
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
} as const;

export const TARGETS = {
  radius: 18,
  /** Never spawn a target closer than this to the player. */
  minSpawnDistanceFromPlayer: 240,
  /** Keep targets this far from the arena border so they stay reachable. */
  edgeMargin: 60,
  /** Targets drift slowly so pure standstill kiting doesn't work. 0 = static. */
  driftSpeed: 45,
  /** How often a drifting target picks a new wander destination. */
  driftRetargetMs: 1800,
} as const;

/**
 * Enemy projectiles: fired from the arena edge at wherever the player was when
 * the shot was created. They never home — every one of them is dodgeable.
 * They fire only while a wave is being fought. Each field is interpolated from
 * `start` to `end` by the current stage's `enemyFire` (see STAGES).
 */
export const ENEMY_PROJECTILES = {
  /**
   * Roughly 45% of the old spawn frequency (was 900 -> 220ms) so dodging stays
   * present but secondary to kiting during this testing stage.
   */
  spawnIntervalMs: { start: 2600, end: 700 },
  speed: { start: 250, end: 520 },
  radius: { start: 10, end: 16 },
  damage: { start: 8, end: 16 },
  /** How many shots fire per spawn tick (fractional values are probabilistic). */
  volleySize: { start: 1, end: 1.5 },
  /**
   * Random aim error in degrees applied to each shot. A little spray keeps you
   * from standing still and reading a perfectly predictable line.
   */
  aimJitterDegrees: 3,
  /** Distance past the arena edge before a projectile is culled. */
  cullMargin: 80,
} as const;

/**
 * The Pursuer: our first mob with movement AI. It walks the player down, so the
 * drill becomes "keep spacing" rather than "hit the stationary dummy".
 * Its health pips are set per stage in STAGES[n].enemyPips.
 */
export const PURSUER = {
  radius: 26,
  /** Fraction of PLAYER.moveSpeed. Below 1 so it can always be kited. */
  moveSpeedFraction: 0.55,
  /** Centre-to-centre reach for its melee swing (see attackReachTo()). */
  attackRange: 16,
  attackDamage: 10,
  /** Telegraph before the hit lands — your window to walk out. */
  windupMs: 400,
  /** Minimum gap between swings, measured from the START of a swing. */
  attackCooldownMs: 1200,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 2.25,
} as const;

// ============================================================================
// THE RUN — stages and waves. Every progression knob lives in RUN and STAGES.
// ============================================================================
//
// A run fights STAGES in order. Each stage is a list of waves; each wave is a
// finite, authored roster. Killed enemies never respawn: the next wave spawns
// only after every enemy of the current one is dead and the breather elapses,
// and clearing a stage's last wave moves to the next stage. Clearing the last
// wave of the last stage completes the run; dying ends it. Elapsed time never
// advances anything — progression is kills alone (see WaveDirector).

export const RUN = {
  /** Most enemies a wave may field. Every roster in STAGES is validated against this. */
  maxAliveEnemies: 4,
  /** Breather after clearing a wave, before the next wave of the same stage spawns. */
  interWaveDelayMs: 800,
  /** Longer breather after a stage's last wave, before the next stage begins. */
  interStageDelayMs: 1200,
} as const;

/** How many of each archetype a wave spawns. Omitted archetypes spawn none. */
export interface WaveRoster {
  basic?: number;
  pursuer?: number;
}

/**
 * Enemy health in PIPS, per archetype. Every auto, Q hit and E bolt hit removes
 * exactly one pip; a W-mark detonation removes one more. Whole numbers >= 1.
 */
export interface EnemyPips {
  basic: number;
  pursuer: number;
}

export interface StageDefinition {
  /** How many hits each archetype takes to kill during this stage. */
  enemyPips: EnemyPips;
  /**
   * The player's base auto cycle (windup + recovery) during this stage, before
   * passive stacks. Higher stage → faster autos; time spent never changes it.
   */
  baseAttackCooldownMs: number;
  /**
   * Edge-projectile pressure: 0..1 along the ENEMY_PROJECTILES start → end
   * ramps (spawn interval, speed, size, damage, volley size).
   */
  enemyFire: number;
  /** The stage's waves, fought in order. Add or remove entries freely. */
  waves: WaveRoster[];
}

/**
 * The stage table. A provisional first balance pass:
 *   - enemyPips: basic 1 / 2 / 3 pips across Stages 1-3 / 4-6 / 7-10 (capped at
 *     3), Pursuer always one more (2 / 3 / 4).
 *   - baseAttackCooldownMs: 700ms → 420ms in even steps, the old ramp's endpoints.
 *   - enemyFire: from the calm opening (0) to full strength (1).
 *   - waves: short early stages (a single wave each for 1-3), two waves for 4-6,
 *     three for 7-9, and a four-wave final gauntlet at Stage 10 — 22 in all.
 *     Wave sizes stay modest early instead of padding the short stages.
 *     Pursuers arrive in Stage 2; later waves lean on them while staying mixed,
 *     with a single all-Pursuer wave closing the run.
 */
export const STAGES: StageDefinition[] = [
  /* 1 */ { enemyPips: { basic: 1, pursuer: 2 }, baseAttackCooldownMs: 700, enemyFire: 0,
    waves: [{ basic: 3 }] },
  /* 2 */ { enemyPips: { basic: 1, pursuer: 2 }, baseAttackCooldownMs: 669, enemyFire: 0.1,
    waves: [{ basic: 3, pursuer: 1 }] },
  /* 3 */ { enemyPips: { basic: 1, pursuer: 2 }, baseAttackCooldownMs: 638, enemyFire: 0.2,
    waves: [{ basic: 2, pursuer: 2 }] },
  /* 4 */ { enemyPips: { basic: 2, pursuer: 3 }, baseAttackCooldownMs: 607, enemyFire: 0.3,
    waves: [{ basic: 3, pursuer: 1 }, { basic: 2, pursuer: 2 }] },
  /* 5 */ { enemyPips: { basic: 2, pursuer: 3 }, baseAttackCooldownMs: 576, enemyFire: 0.4,
    waves: [{ basic: 2, pursuer: 2 }, { basic: 1, pursuer: 3 }] },
  /* 6 */ { enemyPips: { basic: 2, pursuer: 3 }, baseAttackCooldownMs: 544, enemyFire: 0.5,
    waves: [{ basic: 1, pursuer: 3 }, { basic: 2, pursuer: 2 }] },
  /* 7 */ { enemyPips: { basic: 3, pursuer: 4 }, baseAttackCooldownMs: 513, enemyFire: 0.6,
    waves: [{ basic: 2, pursuer: 2 }, { basic: 1, pursuer: 3 }, { basic: 1, pursuer: 3 }] },
  /* 8 */ { enemyPips: { basic: 3, pursuer: 4 }, baseAttackCooldownMs: 482, enemyFire: 0.7,
    waves: [{ basic: 2, pursuer: 2 }, { basic: 1, pursuer: 3 }, { basic: 1, pursuer: 3 }] },
  /* 9 */ { enemyPips: { basic: 3, pursuer: 4 }, baseAttackCooldownMs: 451, enemyFire: 0.85,
    waves: [{ basic: 1, pursuer: 3 }, { basic: 2, pursuer: 2 }, { basic: 1, pursuer: 3 }] },
  /* 10 */ { enemyPips: { basic: 3, pursuer: 4 }, baseAttackCooldownMs: 420, enemyFire: 1,
    waves: [{ basic: 2, pursuer: 2 }, { basic: 1, pursuer: 3 }, { basic: 2, pursuer: 2 }, { pursuer: 4 }] },
];

export const SCORE = {
  /** Base kill value; each archetype multiplies this by its scoreMultiplier. */
  pointsPerKill: 100,
  /** Small trickle just for staying alive; keeps a clean 60s worth something. */
  pointsPerSecondAlive: 5,
} as const;
