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

/**
 * What every champion's player shares. Radius, HP and move speed are the
 * champion's (src/champions/<id>/balance.ts).
 */
export const PLAYER = {
  /**
   * The pace enemy speeds are tuned against (Magic Boy's), so a faster or slower
   * champion changes the matchup, never the enemies.
   */
  referenceMoveSpeed: 280,
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
   *
   * The default auto range, Magic Boy's. A champion sets its own through its
   * attack profile (Champion.attack.range): Snake Lady's is shorter.
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
export function attackReach(range: number, targetRadius: number, playerRadius: number): number {
  return range + targetRadius + (ATTACK.rangeFromPlayerEdge ? playerRadius : 0);
}

/**
 * DEFAULT keybinds, as physical keys (`KeyboardEvent.code`: 'KeyQ', 'CapsLock',
 * 'Space'), so Shift, Caps Lock and the keyboard layout never change what a key
 * does. The player can rebind every action but `cancel` and `restart` from the
 * pause menu; their bindings live in `Keybinds` (src/game/Keybinds.ts), which
 * InputController reads.
 */
export const KEYBINDS = {
  /** A: arm attack-move targeting, then left-click a location. */
  attackMove: 'KeyA',
  /**
   * T: League's "Player Attack Move Click" — one press issues the same attack
   * move command at the cursor, with no second click.
   */
  attackMoveClick: 'KeyT',
  stop: 'KeyS',
  /** The ability slots: what each does is the champion's (src/champions). */
  abilityQ: 'KeyQ',
  abilityW: 'KeyW',
  abilityE: 'KeyE',
  /** R: the ultimate, for champions that have one. */
  abilityR: 'KeyR',
  /** F: summoner-style blink. */
  flash: 'KeyF',
  /** Z: flip the chat feed between light and dark mode. */
  chatMode: 'KeyZ',
  /** Not rebindable: backs out of attack-move targeting, a rebind in progress, or opens / closes the menu. */
  cancel: 'Escape',
  /** Not rebindable: start a new run from the end screen. */
  restart: ['KeyR', 'Space'],
};

/**
 * Mouse Speed (pause menu), League-style: a multiplier on how far the cursor
 * moves per unit of mouse movement, on top of your OS pointer speed. At 1 the
 * game uses your normal OS cursor untouched; any other value locks the pointer
 * to the canvas during play and drives a game cursor at speed × the OS motion.
 * The player's value lives in `MouseSpeed` (src/game/MouseSpeed.ts).
 */
export const MOUSE = {
  defaultSpeed: 1,
  minSpeed: 0,
  maxSpeed: 10,
  step: 0.1,
};

/**
 * Pause-menu preferences that aren't DEBUG overlays. Defaults only; the
 * player's values live in `Settings` (src/game/Settings.ts).
 */
export const PREFERENCES = {
  /** Open the pause menu when the window loses focus (alt-tab, another window, tab switch). */
  pauseOnFocusLoss: true,
};

/**
 * Development readouts. All of these are pure overlay — turning any of them off
 * changes nothing about how the game plays.
 */
export const DEBUG = {
  /**
   * When the player's attack-range ring is drawn. Not a player setting: the
   * game always plays on 'contextual'; the others are for tuning, from the console.
   *   'contextual' — only while an Attack Move command is being used (A mode,
   *                  or briefly after T): the ring is a targeting aid, not
   *                  permanent furniture.
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

/** F: a summoner-style blink. No hit, no passive, no cooldown refund. */
export const FLASH = {
  cooldownMs: 20000,
  /**
   * League's ratio to the auto: Flash 400 against a 550 auto (~0.73x), so
   * noticeably shorter than your attack range, and shorter than Magic Boy's E. (Was 275.)
   */
  range: 190,
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
  scoreMultiplier: 2.5,
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
   * projectile, uses the smaller `orb` radius, and the Eye its own: its hard
   * hit is a 32px centre, which a wide spread almost never puts on you.
   */
  aimSpreadPx: { spell: 50, orb: 20, eye: 15 },
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
   * inside `centreRadius`) hits harder and slows you. The delay is long enough
   * to walk out after seeing it go down (≈ radius / your speed + reaction time):
   * a reaction check, not a guess.
   */
  eye: {
    castMs: 550, delayMs: 1000, range: 560, radius: 95, centreRadius: 32,
    damage: 10, centreDamage: 18, slowFraction: 0.4, slowMs: 1000, cooldownMs: 6000,
  },
  /**
   * E — Orb. A visible projectile that stuns the player on contact, longer the
   * farther it flew (stunMinMs point-blank → stunMaxMs at full range). Inside
   * `triggerRange` it is the Magus's first answer to being dived. Through the
   * `windupMs` an aim line tracks where you're heading; it LOCKS for the last
   * `lockMs` — sidestep then, as with the Lance. A thin shot, so it leads fully
   * (`aimLead` 1, not the Magus's 0.85): keep running straight and it hits.
   */
  orb: {
    windupMs: 650, lockMs: 250, aimLead: 1, triggerRange: 300, speed: 520, radius: 12, range: 420,
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
 * throws one (or any other mob of her wave) at you, and Scatter flings every
 * sphere in a short cone outward along the line from her — a sphere that hits
 * you stuns. The skill it drills is reading the board: never stand behind a
 * sphere on her line. Killing her deletes all her spheres.
 */
export const SOVEREIGN = {
  radius: 20,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 3,
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
   * W — Force of Will: she grabs one of her spheres or any other mob of her
   * wave within `grabRange` (a mob `mobChance` of the time when both are there)
   * and throws it at a led spot. It lands `delayMs` later: damage + slow. A
   * thrown mob drops what it was winding up and lands live, dazed for
   * `mobDazedMs`. A mob nothing can stop (a Bulwark mid Path Maker) is never grabbed.
   */
  will: {
    grabMs: 300, grabRange: 280, mobChance: 0.5, mobDazedMs: 400,
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

/**
 * The Bulwark: a big, slow, many-pipped tank with a K'Sante-style kit, and the
 * capstone of a stage (ENEMIES.bulwark.capstone): one in the last wave. It
 * walks you down and never keeps its distance. Everything it does is a
 * telegraph, and it loses pips like anything else while it does it: the drill
 * is staying on one target for seconds without tunnelling. Damage is flat,
 * stage-scaled like every enemy attack (DIFFICULTY.damage).
 */
export const BULWARK = {
  radius: 34,
  /** Kill score relative to a basic target. */
  scoreMultiplier: 8,
  /** Fraction of PLAYER.referenceMoveSpeed: slower than the Pursuer (0.55). */
  moveSpeedFraction: 0.4,
  /** However fast stages and All Out make it, it stays slower than you. */
  maxSpeedFraction: 0.8,
  /** It stops walking this far short of touching you: its body is not its attack. */
  standOffPx: 10,
  /** Per-stage scaling of its own stats (see DIFFICULTY). Movement speed scales globally. */
  scaling: {
    strikeCooldownMs: { k: -0.15, min: 1100 } as Curve,
    pathMakerCooldownMs: { k: -0.2, min: 4000 } as Curve,
  },
  /**
   * Q, Strike: rooted for `windupMs` with a line LOCKED toward where you stood
   * and drawn on the ground, then it slams. On the line when it lands: damage
   * and a slow. It starts one when you are within `length` of its centre, then
   * holds the slam for `recoverMs`.
   */
  strike: {
    windupMs: 450, length: 150, halfWidth: 30, damage: 14, slowFraction: 0.3, slowMs: 800,
    /** Measured from the start of one Strike (Heavy or not) to the next. */
    cooldownMs: 1800,
    recoverMs: 260,
    /** Every this-many-th Strike is a Heavy Strike. */
    heavyEvery: 3,
  },
  /**
   * The Heavy Strike: twice as long, a longer windup, and it stuns. It is
   * started from up to `triggerRange` away, so the Bulwark threatens you at
   * your own range.
   */
  heavy: { windupMs: 600, length: 300, halfWidth: 26, triggerRange: 280, damage: 14, stunMs: 400 },
  /**
   * W, Path Maker: from `minRange`..`maxRange` it braces for `braceMs` with
   * its whole path LOCKED and drawn, then rams `distance` px down it in
   * `durationMs`. Its body touching you during the ram: damage and a stun, and
   * it stops there. Unstoppable (no stun or slow takes) from the brace to the
   * end of the ram, then winded, standing still, for `windedMs`.
   */
  pathMaker: {
    minRange: 180, maxRange: 380, braceMs: 700, distance: 300, durationMs: 350,
    damage: 20, stunMs: 500, windedMs: 700,
    /** Measured from the start of one brace to the next. */
    cooldownMs: 8000,
  },
  /**
   * R, All Out: at or below `atPipsFraction` of its pips it sheds its plates
   * in a `flareMs` flare (unstoppable), then for the rest of its life it is
   * faster, its cooldowns are multiplied by `cooldownMultiplier`, and every
   * `heavyEvery`-th Strike is Heavy. Windups never change.
   */
  allOut: { atPipsFraction: 2 / 3, flareMs: 400, speedMultiplier: 1.5, cooldownMultiplier: 0.6, heavyEvery: 2 },
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
  waveSize: { base: 6, k: 0.85 } as Curve,
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
  /**
   * How fast an enemy's aim cursor travels, in px/s (see Enemy.aim): its aim
   * chases you at this speed instead of snapping, so a blink leaves it behind
   * for a moment. Well above walking speed, so walking is always tracked; the
   * cap keeps a blink worth something on any stage. × the mode's aimSpeedMultiplier.
   */
  aimSpeed: { base: 900, k: 0.35, max: 1800 } as Curve,
  /**
   * How quickly a caster picks up a change in your direction, for a spell it
   * places in one go: the velocity it leads by turns toward your real one as
   * if the point this many ms ahead of you moved at its aim speed. Reversing
   * at full speed takes it about a third of a second at Stage 1.
   */
  aimLeadCatchUpMs: 500,
  /** Multiplies the casters' aim spread (MAGUS / SOVEREIGN.aimSpreadPx): they get more accurate with the stage. */
  aimSpread: { base: 1, k: -0.25, min: 0.4 } as Curve,
  /** Enemies arrive in packs of this many (rounded) at nearby spots: 1 until about Stage 8. */
  packSize: { base: 1, k: 0.4, min: 1, max: 5 } as Curve,
  /** Share of max HP restored when a stage is cleared: 1 = back to full. */
  stageClearHeal: 1,
};

/**
 * Bumped whenever tuning changes how hard a run is. The run log tags each run
 * with it, and its summary only compares runs from the same version.
 */
export const BALANCE_VERSION = 15;

/**
 * The player's level, League style: kills give XP (ENEMIES[id].xp). This is
 * the world's XP curve; what a level GIVES is the champion's (its `levels`
 * perks, src/champions/<id>/balance.ts). Calibrated so the level roughly
 * tracks the stage — about level 11 at Stage 10, level 18 around Stage 17.
 * See systems/Progression.ts.
 */
export const LEVELS = {
  max: 18,
  /** XP from level 1 to 2, and how much more each later level needs. */
  xp: { first: 10, growth: 1.2 },
  /**
   * Ability haste shortens cast windows too, at this share of what it does to
   * cooldowns: cast = base / (1 + share × haste / 100). 85 haste at level 18
   * is ×0.70 (Snake Lady's R 500 → 351ms). A slot that scales with attack
   * speed instead (Magic Boy's R) ignores it.
   */
  castHasteShare: 0.5,
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
  /**
   * A spellcaster: damage over time can't finish it. Poisoned above one pip,
   * poison wears it down to one and stops there, so you can't tag it and run;
   * poisoned at one pip, the poison may kill.
   */
  spellcaster?: boolean;
  /**
   * A stage's capstone: never drawn by weight. From its unlockStage on, the
   * LAST wave of every generated stage fields it first (as many as its
   * maxPerWave allows, one without it), and the rest of the wave is bought
   * with what is left of the budget.
   */
  capstone?: boolean;
  /** Mob ids a generated wave never draws once it fields this one. */
  crowdsOut?: readonly string[];
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
    // Costs 3: a caster in the wave makes room by pushing out basics.
    name: 'Magus', cost: 3, unlockStage: 5, weight: 0.6, maxShare: 0.25,
    maxPerWave: { base: 1, k: 0.3, max: 3 },
    pips: { start: 1, every: 10, max: 2 },
    contactDamage: 6,
    xp: 3,
    spellcaster: true,
  },
  sovereign: {
    name: 'Sovereign', cost: 3, unlockStage: 5, weight: 0.6, maxShare: 0.25,
    maxPerWave: { base: 1, k: 0, max: 1 },
    pips: { start: 2, every: 10, max: 3 },
    contactDamage: 6,
    xp: 3,
    spellcaster: true,
  },
  bulwark: {
    // The capstone: it takes about half of an early last wave's budget, and
    // Pursuers (the other melee chaser) stay out of its wave.
    name: 'Bulwark', cost: 6, unlockStage: 8, weight: 0, maxShare: 1,
    capstone: true,
    crowdsOut: ['pursuer'],
    maxPerWave: { base: 1, k: 0.3, max: 2 },
    // 14 at its Stage 8 debut, 16 from Stage 14, 18 from Stage 20.
    pips: { start: 12, every: 3, max: 18 },
    contactDamage: 12,
    xp: 6,
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
 *   - Stage 1 is basic slimes only; Pursuers arrive in Stage 2; the Magus (Wave 1)
 *     and the Sovereign (Wave 2) in 5.
 *   - Single waves for Stages 1-3, two for 4-5.
 * Add, remove or edit stages freely: everything past the table is generated.
 * This is Normal's intro; Easy and Hard have their own below (see MODES).
 */
export const STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3 }] },
  /* 2 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 3 */ { waves: [{ basic: 2, pursuer: 2 }] },
  /* 4 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 3, pursuer: 2 }] },
  /* 5 */ { waves: [{ basic: 2, pursuer: 1, magus: 1 }, { basic: 2, pursuer: 2, sovereign: 1 }] },
];

/** Easy's intro: slimes and Pursuers only. Generated from Stage 7, where the Magus debuts alone. */
const EASY_STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3 }] },
  /* 2 */ { waves: [{ basic: 3 }] },
  /* 3 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 4 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 5 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 2, pursuer: 2 }] },
  /* 6 */ { waves: [{ basic: 3, pursuer: 1 }, { basic: 3, pursuer: 2 }] },
];

/** Hard's intro: the casters arrive inside it. Generated, with the Bulwark capstone, from Stage 5. */
const HARD_STAGES: StageDefinition[] = [
  /* 1 */ { waves: [{ basic: 3, pursuer: 1 }] },
  /* 2 */ { waves: [{ basic: 2, pursuer: 2 }] },
  /* 3 */ { waves: [{ basic: 3, pursuer: 1, magus: 1 }, { basic: 3, pursuer: 2 }] },
  /* 4 */ { waves: [{ basic: 2, pursuer: 1, sovereign: 1 }, { basic: 2, pursuer: 1, magus: 1, sovereign: 1 }] },
];

/** Generated stages (everything past a mode's intro table). */
export const ENDLESS = {
  wavesPerStage: 3,
};

// ============================================================================
// MODES — the difficulty picked on the start screen. Normal is the reference;
// a mode is only numbers, and the engine never asks which mode it is.
//
//   Easy   specials unlock later and are drawn less; waves are smaller.
//   Hard   specials unlock earlier and are drawn more; damage is doubled.
// ============================================================================

export interface Mode {
  id: string;
  /** How the start screen and the HUD name it. */
  name: string;
  /** Multiplies every HP the player loses, whatever dealt it (see Combat.playerHit). */
  damageMultiplier: number;
  /** Points for clearing a stage, × the stage multiplier like every award (see ScoreSystem). */
  stageClearBonus: number;
  /** Multiplies DIFFICULTY.waveSize: a wave's size, and a generated wave's budget. */
  waveSizeMultiplier: number;
  /** Multiplies DIFFICULTY.aimSpeed: how fast enemy aim catches up with you. */
  aimSpeedMultiplier: number;
  /** Per mob, the ENEMIES fields this mode overrides (unlock stage, weight, share, per-wave cap). */
  enemies: Partial<Record<EnemyId, Partial<EnemyEntry>>>;
  /** Its hand-written intro; every later stage is generated. */
  stages: StageDefinition[];
}

export const MODES = {
  easy: {
    id: 'easy', name: 'Easy', damageMultiplier: 1, stageClearBonus: 0, waveSizeMultiplier: 0.75, aimSpeedMultiplier: 0.8,
    enemies: {
      magus: { unlockStage: 7, weight: 0.3 },
      sovereign: { unlockStage: 8, weight: 0.3 },
      // Never two.
      bulwark: { unlockStage: 11, maxPerWave: { base: 1, k: 0, max: 1 } },
    },
    stages: EASY_STAGES,
  },
  normal: {
    id: 'normal', name: 'Normal', damageMultiplier: 1, stageClearBonus: 500, waveSizeMultiplier: 1, aimSpeedMultiplier: 1,
    enemies: {},
    stages: STAGES,
  },
  hard: {
    id: 'hard', name: 'Hard', damageMultiplier: 2, stageClearBonus: 1500, waveSizeMultiplier: 1, aimSpeedMultiplier: 1.25,
    enemies: {
      magus: { unlockStage: 3, weight: 1.5, maxShare: 0.5, maxPerWave: { base: 2, k: 0.3, max: 4 } },
      sovereign: { unlockStage: 4, weight: 1.5, maxShare: 0.5, maxPerWave: { base: 1, k: 0.3, max: 2 } },
      // Two from about Stage 12 (Normal: 18).
      bulwark: { unlockStage: 5, maxPerWave: { base: 1.3, k: 0.3, max: 2 } },
    },
    stages: HARD_STAGES,
  },
} satisfies Record<string, Mode>;

export type ModeId = keyof typeof MODES;

/** A mob's registry entry as a mode plays it: ENEMIES[id] with the mode's overrides on top. */
export function enemyEntry(id: EnemyId, mode: Mode): EnemyEntry {
  return { ...ENEMIES[id], ...mode.enemies[id] };
}
export const DEFAULT_MODE: ModeId = 'normal';

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
 * forever earns nothing. See ScoreSystem. The flat bonus for clearing a stage
 * is the mode's (MODES[id].stageClearBonus).
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
