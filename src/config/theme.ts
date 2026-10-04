/**
 * Everything about how the game LOOKS lives here; balance.ts stays about how it
 * PLAYS. Nothing in this file may change a gameplay outcome — sprite sizes,
 * effect lengths and colours are all read-only presentation.
 *
 * Style target: a top-down pixel-art slime skirmish on a dark, quiet volcanic
 * waste. Chunky 3× pixels and dark ink outlines. The ground stays low-contrast
 * ash so everything that matters pops: a friendly blue slime hero, a hostile
 * slime family (red basic, horned purple Pursuer, brass-masked Magus),
 * orange-red enemy fire, pale arcane-gold Magus spells, and
 * one strong colour identity per ability:
 *   auto = sky cyan · Q = teal · W = violet/magenta · E = pink/blue · F = gold
 *
 * PALETTE holds the raw colours. THEME assigns them to roles. Pixel sprites
 * (src/game/art/sprites.ts) map their characters onto PALETTE entries, so a
 * palette change recolours the art too.
 */

export const PALETTE = {
  // ---- ink, shadow ---------------------------------------------------------
  ink: 0x1d1a22,
  shadow: 0x000000,

  // ---- battlefield: ash waste ---------------------------------------------
  // Deliberately low-contrast so units, projectiles and cues own the screen.
  ashDeep: 0x272123,
  ashDark: 0x2c2628,
  ashBase: 0x312a2c,
  ashLight: 0x362f30,
  scorch: 0x282224,
  crack: 0x161214,
  pebble: 0x4a4140,
  basaltDeep: 0x0e0b0d,
  basalt: 0x171315,
  basaltMid: 0x201b1d,
  basaltLip: 0x4a3f3c,
  lavaDim: 0x5a2417,
  lavaGlow: 0xa9441f,
  ember: 0xe07a2e,
  rockDark: 0x2a2426,
  rock: 0x463d3e,
  rockLight: 0x685b59,
  twigDark: 0x44372d,
  twig: 0x75614f,
  void: 0x0d0b0c,

  // ---- slime family (shared) ------------------------------------------------
  gold: 0xf2c14e,
  goldDark: 0xb07a1e,
  fang: 0xfff4e0,
  horn: 0xf0dcb0,
  eyeGlow: 0xffe066,
  eyeHot: 0xfff4c2,

  // ---- player: blue slime ----------------------------------------------------
  blueDeep: 0x1d3f96,
  blue: 0x3e88ee,
  blueLight: 0x82c6ff,
  blueShine: 0xeaf7ff,
  cheek: 0xff8db4,

  // ---- basic enemy: red slime -------------------------------------------------
  redDeep: 0x7c1a2b,
  red: 0xd8383f,
  redLight: 0xff7b63,
  redShine: 0xffd8ca,

  // ---- pursuer: horned purple slime -------------------------------------------
  purpleDeep: 0x341558,
  purpleDark: 0x57278c,
  purple: 0x8446c8,
  purpleLight: 0xb58af0,
  purpleShine: 0xefe0ff,
  eyeOrange: 0xff9a2e,

  // ---- magus: slate-green slime in brass, crackling with storm-gold arcana ------
  magusDeep: 0x1a2624,
  magusDark: 0x2a3d38,
  magus: 0x456258,
  magusLight: 0x76998a,
  magusShine: 0xd8f0e2,
  brassDark: 0x8a5a1c,
  brass: 0xd9a03a,
  brassLight: 0xffd97a,
  /** Magus spell energy: paler and whiter than the orange-red edge fire. */
  arcaneDeep: 0x7a5410,
  arcane: 0xfff27a,
  arcaneCore: 0xfffdf0,

  // ---- sovereign: indigo-black slime, silver diadem, void spheres ---------------
  sovDeep: 0x14102a,
  sovDark: 0x251f45,
  sov: 0x3a3266,
  sovLight: 0x5f5598,
  sovShine: 0xc4bbea,
  silver: 0xd3d9e6,
  silverDark: 0x8a92a6,
  /** Dark Spheres: near-black cores with a pale rim, so they read on the ash. */
  voidCore: 0x0b0910,
  voidRim: 0xe6defc,
  voidGlow: 0xa894e6,

  // ---- player combat colours ----------------------------------------------
  autoDeep: 0x2f8fd8,
  auto: 0x6fd0ff,
  autoCore: 0xe8fbff,
  qDeep: 0x0f9e8a,
  q: 0x2fe3c3,
  qCore: 0xd8fff6,
  wDeep: 0x6b2fb3,
  w: 0xa35cf0,
  wHot: 0xe070e8,
  wCore: 0xfbe3ff,
  eDeep: 0xc2307e,
  e: 0xff5fae,
  eBlue: 0x7ab8ff,
  eCore: 0xfff0fa,
  // Ezreal's R, Trueshot Barrage: League's golden wave.
  rDeep: 0xb7791f,
  rGold: 0xf5b83d,
  r: 0xffdf5c,
  rCore: 0xfffbe0,
  flash: 0xffe98a,
  flashCore: 0xfffbe6,
  passive: 0x7cf3c0,

  // ---- hostile -------------------------------------------------------------
  fireDark: 0x5a1a0e,
  fire: 0xe2482b,
  fireOrange: 0xff8a2a,
  fireCore: 0xffe38a,
  warning: 0xff5a3c,

  // ---- health --------------------------------------------------------------
  hpGreen: 0x68d24e,
  hpGreenDark: 0x3a9a32,
  hpRed: 0xe0413a,
  hpRedDark: 0xa4262a,
  hpAmber: 0xf2b84b,
  hpAmberDark: 0xb47e24,
  hpGhost: 0xf2e6d0,

  // ---- interface -----------------------------------------------------------
  white: 0xffffff,
  cream: 0xf4ead5,
  creamDim: 0xbdb19a,
  creamFaint: 0x8a806f,
  panel: 0x1d1a22,
  panelEdge: 0x4d4552,
  panelHighlight: 0x6f6574,
  panelHover: 0x2e2a36,
  danger: 0xff6b57,
  good: 0x7fdc6a,

  // ---- cassiopeia: a venom-green slime with a coiled tail -------------------------
  venomDeepest: 0x173d2a,
  venomDeep: 0x24734a,
  venom: 0x4fc96d,
  venomLight: 0x9cf09a,
  venomShine: 0xeaffe6,
  venomScale: 0x3a9c5a,
  tongue: 0xe8445e,
  // Her spells are purple, as in League: violet blasts, a plum miasma, lilac fangs.
  toxinDeepest: 0x1a0a26,
  toxinDeep: 0x3a1656,
  toxin: 0x9446d0,
  toxinLight: 0xc890f5,
  toxinCore: 0xf6ecff,
  miasmaDeep: 0x2a1040,
  miasma: 0x6e3a9e,
  stone: 0x9aa0ad,
  stoneCore: 0xeef1f7,
  stoneDeep: 0x5c6270,
} as const;

const P = PALETTE;

/** '#rrggbb' for the few APIs (Phaser Text styles) that want CSS strings. */
export function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export const THEME = {
  /** Every sprite is authored at 1 art pixel = this many world pixels. */
  art: {
    scale: 3,
  },

  /**
   * Draw order. Units and props are y-sorted INSIDE their band
   * (see actorDepth / propDepth), so lower-on-screen draws in front.
   * Props sit in a band below every combatant, so decoration never hides one.
   */
  depth: {
    ground: 0,
    ping: 2,
    shadow: 3,
    props: 5,
    /** Ground-level overlays (range ring, telegraphs, mark rings): above props, below units. */
    groundFx: 8,
    actors: 10,
    projectiles: 20,
    hostileProjectiles: 21,
    fx: 22,
    mark: 23,
    bars: 24,
    reticle: 25,
    text: 26,
    screen: 60,
  },

  // ---------------------------------------------------------------- world
  battlefield: {
    /** Fixed seed: the decoration is identical every run and never touches gameplay RNG. */
    seed: 0x5eed1e,
    void: P.void,
    /** Ash tones, darkest first. Close in value on purpose: texture, not pattern. */
    ashTones: [P.ashDeep, P.ashDark, P.ashBase, P.ashLight],
    scorch: P.scorch,
    crack: P.crack,
    pebble: P.pebble,
    lavaDim: P.lavaDim,
    lavaGlow: P.lavaGlow,
    /** Darker burnt patches. */
    scorchPatches: 4,
    /** Hairline ground cracks; a fraction of them carry a dim ember seam. */
    cracks: 9,
    emberCrackChance: 0.45,
    /** Chance per art pixel of a pebble / a lone dim ember speck. */
    pebbleDensity: 0.004,
    emberDensity: 0.0001,
    /** Art pixels around the centre kept free of cracks and specks. */
    clearCenterArt: 45,
    /** Basalt band drawn in the non-playable padding around the arena. */
    border: { deep: P.basaltDeep, dark: P.basalt, mid: P.basaltMid, lip: P.basaltLip, ember: P.lavaDim },
    props: {
      /** How many of each prop to try to place (rejection-sampled, so a few may be skipped). */
      counts: { rockLarge: 2, rockSmall: 3, deadShrub: 2, emberRock: 1 } as Record<string, number>,
      /** Keep this clear around the player's start. */
      clearCenterRadius: 220,
      minSpacing: 190,
      /** Props stay out of the HUD strips at the top and bottom. */
      hudTop: 110,
      hudBottom: 600,
    },
  },

  // --------------------------------------------------------------- player
  player: {
    shadowOffsetY: 17,
    /** Distance from the body centre to where shots / casts visibly leave the slime. */
    muzzleDistance: 20,
    castEmitDistance: 10,
    /** Idle breathing and the hop cycle while moving. */
    idleFrameMs: 480,
    walkFrameMs: 140,
    hitFlashMs: 130,
    hpBarWidth: 32,
    hpBarOffsetY: 24,
    /** Attack animation. Visual only; read from the real attack state. */
    attack: {
      windupLeanPx: 6,
      releaseKickPx: 6,
      releaseKickMs: 120,
      muzzleMs: 90,
      chargeRingStartPad: 20,
      chargeRingEndPad: 3,
      chargeColor: P.gold,
      releaseRingRadius: 30,
      releaseRingMs: 180,
      releaseColor: P.autoCore,
    },
    rangeRing: {
      idle: P.cream,
      inRange: P.good,
      pending: P.danger,
    },
    moveMarker: P.cream,
    /** Stunned: little arcane stars circling over the head. Slowed: a dotted ring at the feet. */
    stun: { color: P.arcane, core: P.arcaneCore, stars: 3, orbitPx: 12, liftPx: 40, spinMs: 650 },
    slow: { color: P.arcane, alpha: 0.6 },
  },

  // -------------------------------------------------------------- enemies
  enemy: {
    hitFlashMs: 130,
    /** Death pop length. Visual only — the kill registers immediately. */
    deathAnimMs: 300,
    deathShards: 10,
    damageNumber: P.cream,
    damageNumberRiseMs: 520,
    /**
     * Placeholder arrival cue: a dotted ring closing onto the fixed spawn spot
     * across the gameplay arrival window. Replaced by the real manifest pass.
     */
    spawnCue: { color: P.cream, startRadiusScale: 2, alphaStart: 0.25, alphaEnd: 0.8 },
  },

  basic: {
    originY: 0.54,
    shadowOffsetY: 17,
    frameMs: 260,
    hpBarOffsetY: 24,
    burst: [P.red, P.redLight, P.redShine],
    /** Spit windup: a short dotted aim tick on the ground toward the player. */
    spitAim: { color: P.warning, lengthPx: 34, alphaStart: 0.4, alphaEnd: 1 },
  },

  pursuer: {
    originY: 0.61,
    shadowOffsetY: 20,
    frameMs: 180,
    hpBarOffsetY: 30,
    burst: [P.purple, P.purpleLight, P.horn],
    /** How long the flattened "slam" frame holds after a swing resolves. */
    slamMs: 160,
    /** Telegraph: the ground under its real reach warms up across the windup. */
    telegraph: { color: P.warning, fillAlphaStart: 0.1, fillAlphaEnd: 0.28, alertAt: 0.55 },
    slashColor: P.purpleShine,
    /** Dash: the locked path warms up red across the windup; afterimages trail the lunge. */
    dash: { color: P.warning, fillAlphaStart: 0.1, fillAlphaEnd: 0.3, trail: P.purpleLight },
  },

  magus: {
    originY: 0.62,
    shadowOffsetY: 18,
    frameMs: 320,
    hpBarOffsetY: 26,
    burst: [P.magus, P.brass, P.arcane],
    /** Two brass rune tablets float at its sides, bobbing out of step; mid-cast they rise, draw in and flare. */
    runes: { sidePx: 27, liftPx: 8, bobPx: 3, bobMs: 900, castRisePx: 10, castPull: 0.8 },
    /** Energy gathering over its crest while it casts. */
    castGlow: { color: P.arcane, core: P.arcaneCore, liftPx: 40, radius: 7 },
    /** Lance charge: a dotted line that tracks you and reaches full length as the charge completes. */
    lanceCharge: { color: P.arcane, alphaStart: 0.25, alphaEnd: 0.75 },
    /**
     * Orb windup: a dotted aim line (orb range long) that tracks you, then turns
     * into a red strip with bright edges when it locks.
     */
    orbAim: { color: P.arcane, alphaStart: 0.25, alphaEnd: 0.6, lockFill: P.warning, lockFillAlpha: 0.22, lockEdge: P.arcaneCore },
  },

  sovereign: {
    originY: 0.6,
    shadowOffsetY: 17,
    frameMs: 300,
    hpBarOffsetY: 24,
    burst: [P.sov, P.silver, P.voidGlow],
    /** Two small dark orbs circling her head. */
    orbs: { count: 2, orbitPx: 24, liftPx: 6, spinMs: 2000, radius: 7 },
    /** A grabbed sphere or slime floats this far over her head before the throw. */
    holdLiftPx: 38,
    /** Scatter's exit lines: where each sphere will fly. */
    exitLine: { color: P.voidGlow, fill: P.warning, fillAlphaStart: 0.08, fillAlphaEnd: 0.24 },
  },

  /** A Dark Sphere on the ground. It flickers through its last `warnMs`. */
  darkSphere: { radius: 12, core: P.voidCore, rim: P.voidRim, glow: P.voidGlow, pulseMs: 900, warnMs: 1000 },

  /**
   * Hostile ground zones (Magus Lance / Eye / Rite). The same language as the
   * Pursuer telegraph — red ground hurts — edged in the Magus's arcane gold.
   */
  spellZone: {
    fill: P.warning,
    fillAlphaStart: 0.07,
    fillAlphaEnd: 0.26,
    edge: P.arcane,
    edgeAlphaStart: 0.5,
    edgeAlphaEnd: 1,
    /** The Eye's sweet spot. */
    centre: P.arcaneCore,
    strike: { color: P.arcane, core: P.arcaneCore, deep: P.arcaneDeep, ms: 240 },
    /** The Sovereign's spells: the same red ground, edged in void lavender. */
    voidEdge: P.voidGlow,
    voidStrike: { color: P.voidGlow, core: P.voidRim, deep: P.sov, ms: 240 },
  },

  /** Compact pixel health bars under each unit. */
  hpBar: {
    height: 4,
    border: 1,
    back: P.ink,
    ghost: P.hpGhost,
    player: { top: P.hpGreen, bottom: P.hpGreenDark },
    enemy: { top: P.hpRed, bottom: P.hpRedDark },
  },

  /** Segmented enemy health: one cell per pip (see PipBar). */
  pipBar: {
    /**
     * Total inner width, whatever the pip count: more pips add dividers, never
     * width. 34 splits evenly into 1, 2, 3 or 4 segments (34 / 16 / 10 / 7px).
     */
    width: 34,
    cellH: 5,
    /** Divider between segments. */
    gap: 2,
    border: 1,
    back: P.ink,
    top: P.hpRed,
    bottom: P.hpRedDark,
    /** A lost pip: a hollow slot that still shows the enemy's full count. */
    empty: P.panelEdge,
    /** Pale flash on a pip as it is lost. */
    lossFlash: P.hpGhost,
    lossFlashMs: 260,
  },

  /** The W mark drawn on a marked enemy. */
  mark: {
    color: P.w,
    accent: P.wCore,
    ringColor: P.wHot,
    /** Fade/blink over this final stretch so the lapse is readable. */
    warnMs: 600,
    bobPx: 3,
  },

  // --------------------------------------------------------------- effects
  fx: {
    auto: { color: P.auto, core: P.autoCore, deep: P.autoDeep, impactRadius: 18, impactMs: 180, sparks: 5 },
    /** Cassiopeia's auto: violet, smaller and quicker than her spells. */
    venom: { color: P.toxin, core: P.toxinCore, deep: P.toxinDeep, impactRadius: 15, impactMs: 160, sparks: 4 },
    q: { color: P.q, core: P.qCore, deep: P.qDeep, castFlashRadius: 24, castFlashMs: 120, impactRadius: 30, impactMs: 200, sparks: 9 },
    w: { color: P.w, core: P.wCore, deep: P.wDeep, castFlashRadius: 28, castFlashMs: 130, impactRadius: 34, impactMs: 220, sparks: 8 },
    e: { color: P.e, core: P.eCore, deep: P.eDeep, blue: P.eBlue, blinkMs: 180, impactRadius: 24, impactMs: 200, sparks: 7 },
    r: { color: P.r, core: P.rCore, deep: P.rDeep, castFlashRadius: 44, castFlashMs: 220, impactRadius: 34, impactMs: 240, sparks: 10 },
    // Cassiopeia: violet for Q and the poison, plum for W, lilac fangs for E, stone for R.
    poison: { color: P.toxin, core: P.toxinCore, deep: P.toxinDeep, castFlashRadius: 22, castFlashMs: 120, impactRadius: 28, impactMs: 220, sparks: 8 },
    miasma: { color: P.miasma, core: P.toxinCore, deep: P.miasmaDeep, castFlashRadius: 26, castFlashMs: 130, impactRadius: 30, impactMs: 220, sparks: 6 },
    fang: { color: P.toxinLight, core: P.toxinCore, deep: P.toxin, castFlashRadius: 18, castFlashMs: 100, impactRadius: 20, impactMs: 170, sparks: 6 },
    gaze: { color: P.stone, core: P.stoneCore, deep: P.stoneDeep, castFlashRadius: 30, castFlashMs: 160, impactRadius: 36, impactMs: 260, sparks: 10 },
    flash: { color: P.flash, core: P.flashCore, burstMs: 220 },
    hostile: { color: P.fireOrange, core: P.fireCore, deep: P.fire },
    detonation: { color: P.wHot, accent: P.wCore, deep: P.w, radius: 46, ms: 280, shards: 12 },
    hit: { color: P.white },
    passive: P.passive,
    cancel: P.danger,
    ping: { move: P.cream, attackMove: P.danger, durationMs: 260 },
    /** Trail puffs: one every `spacing` px of travel. */
    trails: {
      auto: { color: P.auto, spacing: 14, life: 120, size: 3 },
      venom: { color: P.toxin, spacing: 10, life: 110, size: 2 },
      q: { color: P.q, spacing: 10, life: 150, size: 3 },
      w: { color: P.wHot, spacing: 12, life: 240, size: 6 },
      e: { color: P.e, spacing: 10, life: 160, size: 3 },
      r: { color: P.rGold, spacing: 8, life: 260, size: 6 },
      hostile: { color: P.fireOrange, spacing: 16, life: 220, size: 6 },
      orb: { color: P.arcane, spacing: 10, life: 200, size: 4 },
      sphere: { color: P.voidGlow, spacing: 10, life: 220, size: 5 },
      glob: { color: P.redDeep, spacing: 10, life: 160, size: 3 },
      fang: { color: P.toxinLight, spacing: 10, life: 140, size: 3 },
    },
  },

  /** A slot's cast telegraph (CastTelegraphView), in the slot's fx colours: deep fill, colour sweep and edge. */
  castTelegraph: {
    fillAlphaStart: 0.12,
    fillAlphaEnd: 0.4,
    coreAlpha: 0.35,
    edgeAlphaStart: 0.5,
    edgeAlphaEnd: 1,
    /** A smooth solid outline, this wide. */
    edgeWidth: 2,
  },

  /**
   * Cassiopeia's Twin Fang, past the cast: two fangs that split apart in flight
   * and snap shut on the target. A poisoned target takes a second, wider bite
   * (closing a beat later, since its fangs start further out), a bigger burst
   * and a short shake.
   */
  twinFang: {
    /** How far apart the two fangs weave at mid-flight, and how high they arc. */
    weavePx: 9,
    arcPx: 14,
    /** Each fang starts this far outside the target's edge and snaps to `biteDepth` of its radius inside it. */
    biteGapPx: 14,
    biteDepth: 0.45,
    biteMs: 90,
    /** The second bite on a poisoned target: wider, and turned across the first. */
    poisonedGapPx: 28,
    poisonedTurn: 1.1,
    /** Past the target's edge. */
    burstPx: 12,
    poisonedBurstPx: 26,
    burstMs: 200,
    sparks: 6,
    poisonedSparks: 12,
    shakeMs: 70,
    shakeIntensity: 0.003,
  },

  /**
   * Ability cast animations. Pure presentation — the CastSystem timer decides
   * when a cast completes; these only shape how that reads on screen.
   */
  /** Champion motions (src/game/view/motion.ts): how the slime's body acts out autos and casts. */
  motion: {
    /** A follow-through never plays faster than this share of its authored length. */
    minTempo: 0.35,
    /** How fast a `tremble` shakes: one swing every this many ms. */
    trembleMs: 45,
  },

  cast: {
    /** <1 front-loads the charge so a 165ms cast still reads. Applied as pow(progress, this). */
    anticipationCurve: 0.55,
    wOrbStartRadius: 3,
    wOrbEndRadius: 9,
    eRingStartPad: 24,
    eRingEndPad: 2,
    releaseFlashMs: 105,
    releaseFlashRadius: 30,
    /** The 'fang' style: her jaws opening at the mouth (the rear and lunge are her E's motion). */
    fangJawPx: 10,
  },

  passive: {
    pipFilled: P.passive,
    maxStackColor: P.passive,
    barColor: P.passive,
    barWidth: 76,
    barHeight: 4,
    pipGap: 16,
  },

  markers: {
    targetInRange: P.good,
    targetOutOfRange: P.gold,
  },

  // ------------------------------------------------------------------- ui
  ui: {
    text: P.cream,
    dim: P.creamDim,
    faint: P.creamFaint,
    accent: P.gold,
    danger: P.danger,
    good: P.good,
    warn: P.gold,
    panel: P.panel,
    panelAlpha: 0.82,
    panelEdge: P.panelEdge,
    panelHighlight: P.panelHighlight,
    hpTop: P.hpGreen,
    hpBottom: P.hpGreenDark,
    hpMidTop: P.hpAmber,
    hpMidBottom: P.hpAmberDark,
    hpLowTop: P.hpRed,
    hpLowBottom: P.hpRedDark,
    hitRim: P.danger,
    /** Player level readout and XP bar on the vitals plate. */
    level: P.gold,
    xpTop: P.gold,
    xpBottom: P.hpAmberDark,
    scrim: P.ink,
  },

  /** Bottom-left system-message feed (ChatBox). Presentation only. */
  chat: {
    width: 360,
    height: 112,
    /** Default spot: the HUD's left margin, just above the vitals plate. */
    margin: 40,
    bottomGap: 108,
    depth: 100,
    padding: 10,
    textScale: 2,
    messageGap: 4,
    maxMessages: 8,
    /** Older messages fade by this much per step back, down to oldestAlpha. */
    fadePerMessage: 0.2,
    oldestAlpha: 0.4,
    /** Light mode (default): translucent, for normal play. Dark mode (Z): near-opaque plate, full-strength frame and text. */
    lightFillAlpha: 0.45,
    lightFrameAlpha: 0.7,
    lightTextAlpha: 0.8,
    darkFillAlpha: 0.97,
    darkFrameAlpha: 1,
    darkTextAlpha: 1,
    /** Drag handle: a hit strip this tall over the bottom border, reaching handleOverhang px below the panel. */
    handleHitHeight: 10,
    handleOverhang: 4,
    handleHoverAlpha: 0.55,
    colors: { welcome: P.gold, mission: P.cream, complete: P.good, threat: P.danger } as Record<string, number>,
  },

  /**
   * Kill gold: the score a kill earned, floating up over the slime with a coin,
   * like League's last-hit gold. Kills this close together add into the
   * popup still on screen instead of stacking a new one on top of it.
   */
  killGold: {
    color: P.gold,
    lifeMs: 900,
    risePx: 30,
    mergeMs: 250,
    /** Coin drawn at this pixel scale, left of the number. */
    coinScale: 2,
    coinGapPx: 4,
  },

  /** Stage / wave transition banners. Presentation only. */
  banners: {
    stageMs: 1500,
    waveMs: 900,
  },

  /**
   * How long the attack-range ring stays up after an instant Attack Move Click
   * (T), and how much of that is spent fading out. A-mode instead holds the ring
   * for as long as targeting is armed.
   */
  rangeHint: {
    holdMs: 320,
    fadeMs: 160,
    /** A point-and-click slot pressed on an enemy out of range: its range ring closes in to the edge, in the slot's colour. */
    unitOutOfRange: { fromPx: 14, ms: 360, alpha: 0.9 },
  },

  /** Bottom-centre ability bar: the Q/W/E kit row plus a separate Flash slot. */
  ability: {
    slotSize: 62,
    slotGap: 10,
    bottomMargin: 40,
    summonerSize: 46,
    summonerGap: 26,
    readyEdge: P.creamDim,
    cooldownEdge: P.panelEdge,
    fill: P.panel,
    cooldownWashAlpha: 0.55,
    /** Something took time off a cooldown (Ezreal's Q hit, Cassiopeia's poisoned fang): the slot washes grey, fading over this long. */
    reduceFlash: P.silver,
    reduceFlashAlpha: 0.6,
    reduceFlashMs: 500,
    sweepColor: P.ink,
    sweepAlpha: 0.7,
    /** Per-slot accent: the ability's own colour. */
    accents: { q: P.q, w: P.w, e: P.e, r: P.r, flash: P.flash, venom: P.toxin, miasma: P.miasma, fang: P.toxinLight, stone: P.stone } as Record<string, number>,
  },

  /** Title card before the first run of a page load. Presentation only. */
  startScreen: {
    scrimAlpha: 0.85,
    /** The start prompt fades to this alpha and back, once per pulse each way. */
    promptMinAlpha: 0.35,
    promptPulseMs: 700,
  },

  /**
   * The player's ground spells (PlayerZoneView): Cassiopeia's purple, never
   * the red that means "this hurts you". Her clouds are venom lobbed from her
   * body, landing in opaque blotchy puffs that pop open with a little
   * overshoot, splatter droplets and shrink away; Q and the gaze land clean,
   * in a splash and a sweeping stone front.
   */
  playerZone: {
    fill: P.toxinDeep,
    fillAlphaStart: 0.12,
    fillAlphaEnd: 0.4,
    /** The disc growing from the centre that counts the delay down. */
    core: P.toxin,
    coreAlpha: 0.35,
    edge: P.toxin,
    edgeAlphaStart: 0.5,
    edgeAlphaEnd: 1,
    /** Outlines are smooth solid lines this wide. */
    edgeWidth: 2,
    /** Droplets and rings thrown out where something lands; the gaze's wash. */
    splash: P.toxinLight,
    splashDrops: 8,
    /**
     * The puffs are opaque: translucent ones would stack where they overlap and
     * read as a string of beads, not one cloud. They shrink away instead of fading.
     * Venom for her spells; stone where the gaze petrifies.
     */
    styles: {
      venom: { rim: P.miasma, fill: P.miasmaDeep, blotch: P.toxinDeepest, drop: P.toxinLight },
      stone: { rim: P.stone, fill: P.stoneDeep, blotch: P.ink, drop: P.stoneCore },
    },
    /** How far the rim shows past each puff. */
    cloudRimPx: 3,
    blotchAlpha: 0.7,
    /** A splash (Q landing, an enemy caught by the gaze): droplets and two rings running out, over this long. */
    splashMs: 300,
    /**
     * A burst of puffs (a bite): a big puff and a ring of smaller ones popping
     * a beat apart, held, then shrinking away.
     */
    burstMs: 480,
    burstHoldFraction: 0.5,
    burstCore: 0.8,
    burstSide: 0.5,
    /** How far out the side puffs sit, as a fraction of the burst's radius. */
    burstSpread: 0.6,
    burstPuffs: 5,
    burstStaggerMs: 22,
    burstSplatMs: 240,
    /** The gaze's front: it reaches the cone's edge over `sweepTravel` of `sweepMs`, then fades. Stone, not venom. */
    sweepMs: 540,
    sweepTravel: 0.42,
    sweepFront: P.stoneCore,
    sweepFrontWidth: 4,
    sweepWash: P.stone,
    sweepWashAlpha: 0.22,
    /** A thrown cloud's puff bursts open over this long where its bolt lands, and splats droplets for the next. */
    puffPopMs: 140,
    puffSplatMs: 220,
    puffSplatDrops: 5,
    /** The bolts in flight: a lob from her mouth, peaking higher the further it goes. */
    bolt: P.toxin,
    boltCore: P.toxinLight,
    boltRadius: 8,
    boltMouthPx: 10,
    boltArcPx: 12,
    boltArcPerPx: 0.12,
    /** Trail blobs behind the bolt, each this much further back along its flight (0..1). */
    boltTrail: 3,
    boltTrailStep: 0.05,
    boltShadow: P.ink,
    boltShadowAlpha: 0.45,
    cloudPulseMs: 1400,
    /** Motes per puff. */
    cloudMotes: 2,
    mote: P.toxinLight,
    moteRiseMs: 1100,
  },

  /** Pause / settings menu. */
  menu: {
    scrimAlpha: 0.7,
    button: P.ink,
    buttonHover: P.panelHover,
    buttonEdge: P.panelEdge,
    buttonEdgeHover: P.gold,
  },
} as const;

/** Depth for a y-sorted combatant: lower on screen draws in front. */
export function actorDepth(y: number): number {
  return THEME.depth.actors + Math.max(0, y) / 10000;
}

/** Depth for a y-sorted prop, always beneath every combatant. */
export function propDepth(y: number): number {
  return THEME.depth.props + Math.max(0, y) / 10000;
}
