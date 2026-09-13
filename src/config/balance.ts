/**
 * All gameplay tuning lives here. Nothing else in the codebase should hard-code
 * a balance number — if you want to change how the game feels, change it here.
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
  backgroundColor: 0x11151c,
  floorColor: 0x171d27,
  borderColor: 0x2c3644,
} as const;

export const ROUND = {
  durationSeconds: 60,
} as const;

export const PLAYER = {
  radius: 14,
  color: 0x4ea1ff,
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

  // --- attack speed, and how it ramps with difficulty -----------------------
  /**
   * Attack cycle at the START of the round (windup included).
   * 700ms == 1.43 attacks/sec.
   */
  baseCooldownMs: 700,
  /**
   * Attack cycle once the attack-speed ramp is complete.
   * 420ms == 2.38 attacks/sec. The floor: cooldown never goes below this.
   */
  minCooldownMs: 420,
  /**
   * Seconds of round time over which the cooldown slides from base to min.
   * Independent of the enemy-projectile ramp, so you can have a calm opening
   * with attack speed already climbing (or vice versa).
   */
  attackSpeedRampSeconds: 45,
  /**
   * Shape of that slide. 1 = linear, >1 = stays slow early then speeds up late,
   * <1 = quick early gains.
   */
  attackSpeedCurve: 1.15,
  /** Set false to pin attack speed at baseCooldownMs for A/B testing. */
  attackSpeedScaling: true,
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
  damage: 12,
  /**
   * If true, a move order during windup cancels the attack: no damage dealt and
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
  projectileColor: 0x9fe8ff,

  // --- windup animation (visual only; read from the real attack state) ------
  /** How far the player leans toward the target at the end of the windup. */
  windupLeanPx: 9,
  /** How much the player squashes toward the target during windup. */
  windupScale: 1.18,
  /** Recoil kick after release, and how long it decays over. */
  releaseKickPx: 8,
  releaseKickMs: 120,
  /**
   * The charge ring that contracts onto the player through the windup. This is
   * the precise "can I still cancel?" cue — it lands on the body exactly when
   * the missile leaves.
   */
  chargeRingStartPad: 20,
  chargeRingEndPad: 3,
  /** Expanding ring drawn at the moment of release. */
  releaseRingRadius: 30,
  releaseRingMs: 180,
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
  cancel: ['ESCAPE'],
  restart: ['R', 'SPACE'],
};

/** Colors/durations for the gray-box command feedback pings. */
export const INDICATORS = {
  moveColor: 0x5fb0ff,
  attackMoveColor: 0xff7a6b,
  /** Ground markers are deliberately short-lived so the arena stays clean. */
  pingDurationMs: 260,
  pingRadius: 15,
} as const;

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
  /** READY / WINDUP / RECOVERY readout in the HUD panel. */
  showAttackState: true,
  /** The little "CANCEL" tag when a windup is aborted. */
  showCancelFeedback: true,
  /** Ring around the current attack target. */
  showTargetMarker: true,
  /** Floating damage numbers over targets. */
  showDamageNumbers: true,
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
  damage: 30,
  cooldownMs: 3000,
  /**
   * A landed Q takes this much off the REMAINING cooldown (it never restarts
   * the cooldown). Missing gives nothing: no refund, no passive stack.
   */
  hitCooldownReductionMs: 750,
  /** Cast time before the missile spawns. 0 = instant, and you keep moving. */
  castTimeMs: 0,
  /** Missile stops on the first target it damages — no pierce. */
  stopsOnFirstHit: true,
  // --- visuals -------------------------------------------------------------
  /** Drawn length of the bolt; the collision size stays `radius`. */
  boltLength: 26,
  /** Muzzle flash thrown out from the player on cast. */
  castFlashRadius: 26,
  castFlashMs: 160,
  impactRadius: 30,
  impactMs: 200,
} as const;

/**
 * The Ezreal-flavoured passive: landing Q ramps your attack speed.
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
  count: 4,
  radius: 18,
  /**
   * Sized against ATTACK.damage so a target dies in a known number of autos:
   * 24 / 12 = 2 hits, so the attack loop comes round fast while testing.
   * Both values stay independent — change either one.
   */
  maxHp: 24,
  color: 0xff6b6b,
  /** Delay before a killed target comes back somewhere else. */
  respawnDelayMs: 1200,
  /** Death animation length (visual only — the kill registers immediately). */
  deathAnimMs: 300,
  /** Shards thrown out on death. 0 disables the burst. */
  deathShards: 6,
  /** Hit flash + squash duration. */
  hitFeedbackMs: 130,
  /** Health bar geometry, drawn above the target. */
  hpBarWidth: 46,
  hpBarHeight: 7,
  hpBarOffsetY: 16,
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
 * Each field ramps linearly from `start` to `end` across the round; see
 * DifficultyManager.
 */
export const ENEMY_PROJECTILES = {
  color: 0xffd166,
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
 *
 * HP is expressed as a multiple of the basic target so the two stay in
 * proportion when you retune TARGETS.maxHp.
 */
export const PURSUER = {
  /** maxHp = TARGETS.maxHp * this. 24 * 2.5 = 60 == 5 autos at 12 damage. */
  baseHpMultiplier: 2.5,
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
  hpBarWidth: 64,
  hpBarHeight: 8,
  hpBarOffsetY: 20,
} as const;

/**
 * Which archetypes spawn at each difficulty level, as relative weights.
 * Index 0 == difficulty 1. Weights are normalised, so they need not sum to 1.
 * Adding an archetype means adding one row here plus a factory entry.
 */
export const ENEMY_SPAWN = {
  weights: {
    basic:   [1, 1, 1, 0.8, 0.75, 0.65, 0.6, 0.5, 0.5, 0.5],
    pursuer: [0, 0, 0, 0.2, 0.25, 0.35, 0.4, 0.5, 0.5, 0.5],
  } as Record<string, number[]>,
} as const;

/**
 * Modest HP growth so later stages bite without turning enemies into sponges.
 * D1-3 = 100%, then +5% per level: D4 105%, D5 110%, ...
 */
export const ENEMY_SCALING = {
  hpRampStartDifficulty: 4,
  hpPerDifficulty: 0.05,
  maxHpMultiplier: 1.5,
} as const;

/** The between-stage countdown / banner. Presentation only. */
export const STAGE = {
  /** Start counting down this long before the next difficulty level lands. */
  countdownSeconds: 3,
  /** How long the "STAGE N" banner stays up after it changes. */
  bannerMs: 1500,
} as const;

export const DIFFICULTY = {
  /**
   * Nothing scales for this long: the opening stays sparse so you can work on
   * attack timing and kiting before the arena gets busy.
   */
  rampStartSeconds: 22,
  /**
   * The ramp reaches full strength at this fraction of the round, so the last
   * stretch is a flat-out max-intensity test instead of a curve that only peaks
   * at the buzzer.
   */
  rampCompleteAtRoundFraction: 0.9,
  /**
   * Shape of the ramp between those two points. >1 keeps the early ramp gentle
   * and back-loads the pressure; 1 is linear.
   */
  rampCurve: 1.8,
  /** Displayed difficulty tiers (purely cosmetic, drives the HUD readout). */
  levels: 10,
} as const;

export const SCORE = {
  pointsPerDamage: 1,
  /** Base kill value; each archetype multiplies this by its scoreMultiplier. */
  pointsPerKill: 100,
  /** Small trickle just for staying alive; keeps a clean 60s worth something. */
  pointsPerSecondAlive: 5,
} as const;

export const UI = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  textColor: '#cfd6e4',
  dimColor: '#7b879b',
  accentColor: '#4ea1ff',
  dangerColor: '#ff6b6b',
} as const;
