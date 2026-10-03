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
  /**
   * Move speed. Lowered from 340 so fights read closer to League's pace;
   * Pursuers move at a fraction of this, so they slowed with it.
   */
  moveSpeed: 280,
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
  // The base attack cycle (windup + recovery, before passive stacks) comes from
  // the player's level: LEVELS.baseAttackCooldownMs, faster with every level.
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
  /**
   * Enemy health bars: 'damaged' shows a bar only once an enemy has lost a pip,
   * so a big swarm is not a wall of bars; 'always' shows every bar.
   */
  healthBars: 'damaged' as 'damaged' | 'always',
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

/**
 * The basic red slime. It is always aggroed but never attacks: it closes in
 * from range, then hangs around a pressure band inside your attack range and
 * shuffles sideways, so it crowds your spacing and target choice without
 * becoming a second melee threat.
 */
export const TARGETS = {
  radius: 18,
  /** Never spawn a target closer than this to the player. */
  minSpawnDistanceFromPlayer: 240,
  /** Keep targets this far from the arena border so they stay reachable. */
  edgeMargin: 60,
  /** Speed while closing in from outside the pressure band. 0 = static. */
  approachSpeed: 110,
  /** Slower speed while strafing inside the band, or easing back out of it. */
  strafeSpeed: 60,
  /**
   * Centre-to-centre distance band it holds from the player. Well inside the
   * player's 260 attack range, well outside melee.
   */
  pressureBand: { min: 150, max: 230 },
  /** While approaching, it re-reads the player's position this often. */
  approachReplanMs: 250,
  /** While strafing, it picks a new sidestep point this often. */
  strafeReplanMs: { min: 600, max: 1000 },
  /** How far around the player one sidestep swings, in degrees. */
  strafeArcDegrees: 35,
  /** Chance a new sidestep reverses the strafe direction. */
  strafeFlipChance: 0.3,
  /** Per-stage scaling of its own stats (see DIFFICULTY). Movement speed scales globally. */
  scaling: {
    spitCooldownMs: { k: -0.15, min: 1500 } as Curve,
  },
  /**
   * Spit: a slow, telegraphed glob. Rooted for `windupMs` (squashed, mouth
   * glowing, a short aim tick on the ground), then it fires at where the player
   * is at that instant — never re-aimed. A basic needs one of the attack
   * tokens (DIFFICULTY.attackTokens) to start its windup, so a crowd takes turns.
   */
  spit: {
    /** First stage on which basics spit. Stage 1 stays a pure kiting warm-up. */
    fromStage: 2,
    windupMs: 350,
    /** Measured from one spit to the next, with ±cooldownJitter so a group never fires in unison. */
    cooldownMs: 3000,
    cooldownJitter: 0.2,
    /** Only spits at a player within this centre-to-centre distance; also the glob's travel. */
    range: 400,
    speed: 280,
    radius: 6,
    damage: 5,
  },
} as const;

/**
 * Enemy projectiles: fired from the arena edge at wherever the player was when
 * the shot was created. They never home — every one of them is dodgeable.
 * They fire only while a wave is being fought. Each field is interpolated from
 * `start` to `end` by the current stage's `enemyFire` (see STAGES).
 */
export const ENEMY_PROJECTILES = {
  /**
   * An occasional positioning check, not bullet-hell: the enemies on the field
   * are the main pressure. (Was 2600 -> 700ms.)
   */
  spawnIntervalMs: { start: 4500, end: 3000 },
  speed: { start: 250, end: 520 },
  radius: { start: 10, end: 16 },
  damage: { start: 8, end: 16 },
  /** How many shots fire per spawn tick (fractional values are probabilistic). Always one. */
  volleySize: { start: 1, end: 1 },
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
  /** Flat, not stage-scaled: a landed swing costs a quarter of PLAYER.maxHp. */
  attackDamage: 25,
  /** Telegraph before the hit lands — your window to walk out. */
  windupMs: 400,
  /** Minimum gap between swings, measured from the START of a swing. */
  attackCooldownMs: 1200,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 2.25,
  /** However fast stages make it, it stays slower than you: correct kiting always keeps spacing. */
  maxSpeedFraction: 0.85,
  /** Per-stage scaling of its own stats (see DIFFICULTY). Movement speed scales globally. */
  scaling: {
    dashCooldownMs: { k: -0.2, min: 2500 } as Curve,
    attackCooldownMs: { k: -0.15, min: 800 } as Curve,
  },
  /**
   * Dash: a telegraphed gap-closer, not a damage source. From outside its
   * swing reach it crouches for `windupMs` with its path LOCKED and drawn on the
   * ground, then lunges `distance` px in `durationMs` (stopping early once you
   * are in reach). The normal, unchanged swing does the damage afterwards.
   */
  dash: {
    /** First stage on which Pursuers dash. */
    fromStage: 4,
    /** Only dashes from this centre-to-centre distance band, and never at a stunned player. */
    minRange: 110,
    maxRange: 240,
    windupMs: 450,
    distance: 160,
    durationMs: 280,
    /** Measured from the start of one dash to the next. */
    cooldownMs: 5000,
  },
} as const;

/**
 * The Magus: a fragile artillery caster with a Xerath-style kit. It keeps its
 * distance and never moves while casting, and every spell is a telegraph you
 * can read and walk out of. Its health is the basic enemy's (see STAGES), so
 * once you reach it, it dies fast. Damage is flat, not stage-scaled, like
 * PURSUER.attackDamage.
 */
export const MAGUS = {
  radius: 20,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 1.5,
  /** Fraction of PLAYER.moveSpeed (≈168px/s). Below 1, so you can always run it down. */
  moveSpeedFraction: 0.6,
  /**
   * Centre-to-centre distance it holds from the player: just outside your autos,
   * at the edge of your Q. It backs off inside `min` and walks in beyond `max`.
   */
  spacing: { min: 360, max: 480 },
  /** How often it re-reads where to stand, so it reacts with a short, readable delay. */
  replanMs: 220,
  /** Quiet time after it arrives, before its first spell. */
  openingDelayMs: 900,
  /** Minimum gap between spell STARTS — one spell at a time, so zones never stack. */
  spellGapMs: 1400,
  /**
   * Aim lead, like a real Xerath: it aims where you will be when the spell
   * lands — this share of the way, at your current velocity, over the time
   * until impact (the Lance's lock, the Eye's delay, the Orb's flight, a Rite
   * circle's delay). 0 = where you are now. Keep running in a straight line and
   * you run into it; change direction or stop to dodge.
   */
  aimLead: 0.85,
  /**
   * Aim spread: each cast aims at a random point within this radius of where it
   * means to aim, rolled once per cast (per circle for the Rite) so the Lance
   * line and the Eye reticle stay steady while they track. The Orb, a thin
   * projectile, uses the smaller `orb` radius.
   */
  aimSpreadPx: { spell: 50, orb: 20 },
  /** Per-stage scaling of its own stats (see DIFFICULTY). Movement and orb speed scale globally. */
  scaling: {
    spellGapMs: { k: -0.3, min: 700 } as Curve,
  },

  /**
   * Q — Lance. Rooted, it charges a line that tracks where you are heading,
   * then LOCKS; the line lands `lockMs` later. The lock is your cue to sidestep.
   */
  lance: { chargeMs: 900, lockMs: 450, length: 520, halfWidth: 30, damage: 18, cooldownMs: 4500 },
  /**
   * W — Eye. Rooted for `castMs`, a reticle tracks where it will land; then the
   * circle goes down there and lands `delayMs` later. Its centre (your centre
   * inside `centreRadius`) hits harder and slows you.
   */
  eye: {
    castMs: 400, delayMs: 700, range: 560, radius: 95, centreRadius: 32,
    damage: 10, centreDamage: 18, slowFraction: 0.4, slowMs: 1000, cooldownMs: 6000,
  },
  /**
   * E — Orb. A visible projectile that stuns the player on contact, longer the
   * farther it flew (stunMinMs point-blank → stunMaxMs at full range). Inside
   * `triggerRange` it is the Magus's first answer to being dived.
   */
  orb: {
    windupMs: 300, triggerRange: 300, speed: 520, radius: 12, range: 420,
    damage: 8, stunMinMs: 250, stunMaxMs: 750, cooldownMs: 7000,
  },
  /**
   * R — Rite. Once per life, when it is the last enemy left in the wave: it
   * roots itself and calls `shots` delayed circles onto you, one after another.
   */
  rite: { leadInMs: 500, shots: 3, intervalMs: 800, delayMs: 600, radius: 70, damage: 15 },
} as const;

/**
 * The Sovereign: a mid-range sphere mage with a Syndra-style kit. She litters
 * the arena with Dark Spheres that stay put, then uses them: Force of Will
 * throws one (or one of her own basic slimes) at you, and Scatter flings every
 * sphere in a short cone outward along the line from her — a sphere that hits
 * you stuns. The skill it drills is reading the board: never stand behind a
 * sphere on her line. Killing her deletes all her spheres.
 */
export const SOVEREIGN = {
  radius: 20,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 1.75,
  /** Fraction of PLAYER.moveSpeed (≈168px/s). Below 1, so you can always run her down. */
  moveSpeedFraction: 0.6,
  /** Closer than the Magus: inside your Q range, just outside your autos. */
  spacing: { min: 280, max: 380 },
  replanMs: 220,
  openingDelayMs: 900,
  /** Minimum gap between spell STARTS. */
  spellGapMs: 1200,
  /** She aims where you are heading, like the Magus (see MAGUS.aimLead)… */
  aimLead: 0.85,
  /** …at a random spot within this radius of it, rolled once per cast. */
  aimSpreadPx: 40,
  scaling: {
    spellGapMs: { k: -0.3, min: 600 } as Curve,
  },
  /** Dark Spheres of hers on the ground at once: `cap`, +1 from each stage in `extraFromStage`. */
  spheres: { cap: 3, extraFromStage: [14, 19], lifeMs: 6000 },
  /** Q — Dark Sphere: a led circle that lands after `delayMs`, then leaves a sphere. */
  sphere: { castMs: 250, delayMs: 600, range: 520, radius: 55, damage: 12, cooldownMs: 2500 },
  /**
   * W — Force of Will: she grabs one of her spheres or one of her basic slimes
   * within `grabRange` (a slime `slimeChance` of the time when both are there)
   * and throws it at a led spot. It lands `delayMs` later: damage + slow. A
   * thrown slime lands live, dazed for `slimeDazedMs`.
   */
  will: {
    grabMs: 300, grabRange: 280, slimeChance: 0.5, slimeDazedMs: 400,
    delayMs: 500, range: 480, radius: 70, damage: 12, slowFraction: 0.3, slowMs: 1000, cooldownMs: 6000,
  },
  /**
   * E — Scatter: a short cone in front of her. Every sphere inside it when she
   * starts the cast is flung outward along the line from her through it, and
   * stuns you on contact. She casts it when a sphere lines up with you (within
   * `lineUpPx` of where you're heading), or when you're inside the cone. With Q
   * and E both ready, `comboChance` of the time she places a sphere between you
   * and her first (`comboDistancePx` out) — the Q→E combo.
   */
  scatter: {
    windupMs: 350, radius: 220, angleDeg: 60, wideAngleDeg: 80, wideFromStage: 14, damage: 10,
    lineUpPx: 60, comboChance: 0.6, comboDistancePx: 160,
    launch: { range: 450, speed: 900, radius: 14, damage: 8, stunMs: 600 },
    cooldownMs: 7000,
  },
} as const;

// ============================================================================
// RUN — breathers and arrivals.
// ============================================================================
//
// Each wave is a finite roster whose enemies arrive one by one (see RUN.spawn).
// Killed enemies never respawn: the next wave spawns only after every enemy of
// the current one has arrived and died and the breather elapses (see WaveDirector).

export const RUN = {
  /** Breather after clearing a wave, before the next wave of the same stage spawns. */
  interWaveDelayMs: 400,
  /** Longer breather after a stage's last wave, before the next stage begins. */
  interStageDelayMs: 700,
  /**
   * Staggered arrival. A wave's roster is shuffled; the first enemy begins
   * arriving the moment the wave starts, each later one a random gap after the
   * previous: DIFFICULTY.arrivalGapMs for the stage, ± `gapJitter`. An
   * arriving enemy stands on its fixed spawn spot for `manifestMs` —
   * untargetable, undamageable, inert — and becomes a normal enemy at that
   * GameClock deadline. Never scaled: you always see where an enemy will appear.
   */
  spawn: {
    gapJitter: 1 / 3,
    manifestMs: 300,
    /** Members of one pack (DIFFICULTY.packSize) arrive this far apart, around one spot. */
    packMemberGapMs: 90,
  },
} as const;

// ============================================================================
// DIFFICULTY — one threat level per stage drives every scaled number.
// ============================================================================
//
//   T(stage) = growth ^ (stage - 1)              +15% per stage, compounding
//   value    = clamp(base × T ^ k, min, max)     k = how strongly it follows T
//
// A negative k shrinks the value (cooldowns, gaps). See systems/Difficulty.ts.
// Telegraphs (windups, Magus timings) and the arrival window are never scaled.

/** One scaled stat. `base` defaults to the stat's own config value where a mob declares it. */
export interface Curve {
  base?: number;
  k: number;
  min?: number;
  max?: number;
}

export const DIFFICULTY = {
  /** Threat growth per stage. 1.15 doubles the threat about every 5 stages. */
  growth: 1.15,
  /**
   * Enemies per wave. A stage's authored roster keeps its MIX; its size grows to
   * this (never below the authored size). See WaveDirector.rosterFor().
   */
  waveSize: { base: 6, k: 1 } as Curve,
  /** Most enemies on the field at once; further arrivals wait for a slot. */
  maxAlive: { base: 8, k: 0.6, min: 8, max: 40 } as Curve,
  /** Average gap between arrivals (jittered by RUN.spawn.gapJitter). */
  arrivalGapMs: { base: 250, k: -0.5, min: 50 } as Curve,
  /** Multiplies every mob's movement speed. The Pursuer stays capped below yours (PURSUER.maxSpeedFraction). */
  moveSpeed: { base: 1, k: 0.1 } as Curve,
  /** Multiplies enemy-cast projectile speeds (basic spit, Magus orb), capped at `projectileMaxSpeed`. */
  projectileSpeed: { base: 1, k: 0.15 } as Curve,
  projectileMaxSpeed: 650,
  /**
   * Multiplies damage from enemy attacks (swings, spit, Magus spells). Steep,
   * because every stage starts from full HP: the run ends at the first stage
   * you cannot survive from 100 HP. Edge fire keeps its own ramp.
   */
  damage: { base: 1, k: 0.35 } as Curve,
  /** Multiplies contact damage (ENEMIES[id].contactDamage): steeper still, so getting boxed in turns lethal. */
  contactDamage: { base: 1, k: 0.5 } as Curve,
  /** How many basics may be winding up a spit at once (see AttackTokens). */
  attackTokens: { base: 2, k: 0.5, min: 2, max: 10 } as Curve,
  /** Enemies arrive in packs of this many (rounded) at nearby spots: 1 until about Stage 8. */
  packSize: { base: 1, k: 0.4, min: 1, max: 5 } as Curve,
  /** Share of max HP restored when a stage is cleared: 1 = back to full. */
  stageClearHeal: 1,
};

/**
 * Bumped whenever tuning changes how hard a run is. The run log tags each run
 * with it, and its summary only compares runs from the same version.
 */
export const BALANCE_VERSION = 8;

/**
 * The player's level, League style: kills give XP (ENEMIES[id].xp) and each
 * level makes the kit faster. Calibrated so the level roughly tracks the
 * stage — about level 11 at Stage 10, level 18 around Stage 17. See
 * systems/Progression.ts.
 */
export const LEVELS = {
  max: 18,
  /** XP from level 1 to 2, and how much more each later level needs. */
  xp: { first: 10, growth: 1.2 },
  /** Q / W / E cooldown = base / (1 + haste / 100). 85 haste at level 18: cooldowns ×0.54. */
  abilityHastePerLevel: 5,
  /** The base auto cycle at level 1, sped up by attackSpeedPerLevel each level (700 → 438ms at 11 → 347ms at 18). */
  baseAttackCooldownMs: 700,
  attackSpeedPerLevel: 0.06,
  /** Q ranks up: from this level each Q hit removes `pips` pips. */
  qRankUp: { level: 9, pips: 2 },
};

/** Body contact: an active enemy touching you hurts (see Enemy.checkContact). */
export const CONTACT = {
  /** One enemy can bump you at most this often. Player i-frames still apply on top. */
  cooldownMs: 800,
};

// ============================================================================
// ENEMIES — the registry. One entry per mob: how waves pick it, when it
// unlocks and how tough it is. Its behaviour numbers live in its own block
// (TARGETS / PURSUER / MAGUS); the class that builds it is registered in
// WaveDirector's ARCHETYPES. See "Adding a mob" in the README.
// ============================================================================

export interface EnemyEntry {
  /** How the chat names it ("New threat: Magus."). */
  name: string;
  /** Budget points per body in a generated wave: heavier mobs mean fewer bodies. */
  cost: number;
  /**
   * First stage it can appear on. On a generated stage, that stage's first
   * wave fields exactly one of it, so you meet it alone first.
   */
  unlockStage: number;
  /** Relative pick chance among the unlocked mobs of a generated wave. */
  weight: number;
  /** Most of a generated wave's budget it may take, as a fraction (at least one body). */
  maxShare: number;
  /** Optional cap per wave (rounded down), authored waves included. */
  maxPerWave?: Curve;
  /** Health pips: `start` on Stage 1, +1 every `every` stages, never above `max`. */
  pips: { start: number; every: number; max: number };
  /** Damage when its body touches yours (×DIFFICULTY.contactDamage), at most once per CONTACT.cooldownMs. */
  contactDamage: number;
  /** XP the player earns for killing one (see LEVELS). */
  xp: number;
}

export const ENEMIES = {
  basic: {
    name: 'Slime', cost: 1, unlockStage: 1, weight: 3, maxShare: 1,
    // One hit, always: basics get more numerous, never tougher.
    pips: { start: 1, every: 10, max: 1 },
    contactDamage: 6,
    xp: 1,
  },
  pursuer: {
    // Fewer since the Sovereign joined: weight 2 → 1.5, share 0.6 → 0.5.
    name: 'Pursuer', cost: 1.5, unlockStage: 2, weight: 1.5, maxShare: 0.5,
    pips: { start: 2, every: 10, max: 3 },
    contactDamage: 10,
    xp: 2,
  },
  magus: {
    name: 'Magus', cost: 2, unlockStage: 5, weight: 0.6, maxShare: 0.25,
    maxPerWave: { base: 1, k: 0.3, max: 3 },
    pips: { start: 1, every: 10, max: 2 },
    contactDamage: 6,
    xp: 3,
  },
  sovereign: {
    name: 'Sovereign', cost: 2, unlockStage: 7, weight: 0.6, maxShare: 0.25,
    maxPerWave: { base: 1, k: 0, max: 1 },
    pips: { start: 2, every: 10, max: 3 },
    contactDamage: 6,
    xp: 3,
  },
} satisfies Record<string, EnemyEntry>;

/** Every mob id. Adding a key to ENEMIES adds it everywhere this type is used. */
export type EnemyId = keyof typeof ENEMIES;

/** How many of each mob a wave fields. Omitted mobs field none. */
export type WaveRoster = Partial<Record<EnemyId, number>>;

// ============================================================================
// THE RUN — endless. Stages 1-5 are hand-written; every later stage is
// generated (see WaveDirector). Clear a stage's last wave to move on; the run
// ends only when you die. Elapsed time never advances a wave or stage —
// progression is kills alone.
// ============================================================================

export interface StageDefinition {
  /** The stage's waves, fought in order: each one's MIX of mobs. */
  waves: WaveRoster[];
}

/**
 * The hand-written intro. Each roster is a wave's MIX; its actual size
 * follows DIFFICULTY.waveSize (never smaller than authored), so it grows in
 * the same proportions. See WaveDirector.rosterFor().
 *   - Stage 1 is basic slimes only; Pursuers arrive in Stage 2, the Magus in 5.
 *   - Single waves for Stages 1-3, two for 4-5.
 * Add, remove or edit stages freely: everything past the table is generated.
 */
export const STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3 }] },
  /* 2 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 3 */ { waves: [{ basic: 2, pursuer: 2 }] },
  /* 4 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 3, pursuer: 2 }] },
  /* 5 */ { waves: [{ basic: 2, pursuer: 1, magus: 1 }, { basic: 2, pursuer: 3 }] },
];

/** Generated stages (everything past STAGES). */
export const ENDLESS = {
  wavesPerStage: 3,
};

/**
 * Per-stage ramps, indexed by stage - 1. Past the end, the last value holds.
 * (The player's attack speed comes from their level instead: see LEVELS.)
 */
export const STAGE_RAMPS = {
  /**
   * Edge-projectile pressure: 0..1 along the ENEMY_PROJECTILES start → end
   * ramps (spawn interval, speed, size, damage, volley size).
   */
  enemyFire: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1],
};

/**
 * Score rewards doing things well — never time alive, so kiting one enemy
 * forever earns nothing. See ScoreSystem.
 */
export const SCORE = {
  /** Base kill value; each archetype multiplies this by its scoreMultiplier. */
  pointsPerKill: 100,
  /** Every point is worth more on later stages: × (1 + this × (stage − 1)). */
  stageMultiplierPerStage: 0.25,
  /** Speed bonus for clearing a wave quickly. */
  waveClear: {
    /** Full bonus per enemy in the wave. */
    pointsPerEnemy: 50,
    /** A wave's par time: its scheduled arrivals, plus this per health pip in it. */
    parMsPerPip: 600,
    /** Full bonus at or under par, sliding to nothing at par × this. */
    zeroAtParMultiple: 2,
  },
  /** HP bonus for finishing a stage healthy (counted before the full heal). */
  stageClear: {
    pointsPerHp: 10,
    /** Extra share of the HP bonus when the stage cost you no damage at all. */
    flawlessBonus: 0.5,
  },
};
