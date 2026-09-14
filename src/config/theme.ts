/**
 * Everything about how the game LOOKS lives here; balance.ts stays about how it
 * PLAYS. If you want to restyle the prototype, this is the only file to touch.
 *
 * Style target: minimalist top-down training simulator — dark field, cool blues
 * for you, warm reds for hostiles, amber for "dodge this", cyan for your shots.
 * Readability first: silhouettes differ by SHAPE, not just color.
 */

export const THEME = {
  // ---------------------------------------------------------------- arena
  arena: {
    /** Outside the play field. */
    voidColor: 0x0a0d12,
    /** The field itself, plus a slightly lighter center for depth. */
    floorColor: 0x141a23,
    floorCenterColor: 0x1a2230,
    /** Fine grid, then a brighter line every `majorEvery` cells. */
    gridColor: 0x1e2836,
    gridMajorColor: 0x2a3a4e,
    gridSize: 40,
    majorEvery: 4,
    /** Border frame + corner brackets. */
    borderColor: 0x33506e,
    borderGlowColor: 0x4ea1ff,
    bracketLength: 54,
    /** Faint edge shading that pulls the eye to the middle of the field. */
    vignetteColor: 0x05070b,
    vignetteAlpha: 0.55,
    vignetteBand: 140,
  },

  // --------------------------------------------------------------- player
  player: {
    core: 0x4ea1ff,
    coreBright: 0xbfe0ff,
    outline: 0xdff0ff,
    ringColor: 0x6fb6ff,
    shadowAlpha: 0.32,
    /** Slow breathing of the outer ring while idle. */
    idlePulseAmp: 0.06,
    idlePulseSpeed: 0.0022,
  },

  // -------------------------------------------------------------- enemies
  target: {
    core: 0xff6b6b,
    coreDark: 0x8e2330,
    outline: 0x2a0f14,
    plateColor: 0xff9a8a,
    shadowAlpha: 0.3,
    /** Hostiles rotate slowly so they read as active machines, not props. */
    spinSpeed: 0.00035,
    hitFlashColor: 0xffe3e3,
  },

  /**
   * The Pursuer. Deliberately a different hue and a heavier silhouette than the
   * basic target so the two never blur together at speed.
   */
  pursuer: {
    core: 0xc2410c,
    coreDark: 0x5c1a06,
    outline: 0x2a0f05,
    accent: 0xffa94d,
    eye: 0xffd9a8,
    shadowAlpha: 0.34,
    /** Telegraph ring colour while it winds up a swing. */
    windupColor: 0xff7a6b,
  },

  /**
   * Ability cast animations. Pure presentation — the CastSystem timer decides
   * when a cast completes; these only shape how that reads on screen.
   */
  cast: {
    /** How much the player compresses at full charge. */
    compression: 0.14,
    /** W: the gathering orb grows between these radii over the cast. */
    wOrbStartRadius: 2,
    wOrbEndRadius: 9,
    /** W: how far in front of the player the orb gathers. */
    wOrbOffset: 8,
    /** E: the gathering ring contracts between these pads over the cast. */
    eRingStartPad: 24,
    eRingEndPad: 2,
    /** Peak flash at the moment a cast completes. */
    releaseFlashMs: 140,
    releaseFlashRadius: 30,
  },

  /** The W mark drawn on a marked enemy. */
  mark: {
    color: 0x9d7cf3,
    accent: 0xe8dcff,
    /** Radians per ms for the rotating accents. */
    spinSpeed: 0.0026,
  },

  /** Q passive: stack pips + duration bar under the ability bar. */
  passive: {
    pipFilled: 0x7cf3c0,
    pipEmpty: 0x25323f,
    pipStroke: 0x3d5c6e,
    pipRadius: 5,
    pipGap: 15,
    barWidth: 76,
    barHeight: 3,
    barColor: 0x7cf3c0,
    /** Extra emphasis on the player while the passive is fully stacked. */
    maxStackColor: 0x7cf3c0,
  },

  // ----------------------------------------------------------- projectiles
  projectiles: {
    /** Your autos: fast, thin, cyan. */
    autoColor: 0x9fe8ff,
    autoCore: 0xffffff,
    /** Q: chunkier, green, unmistakably an ability. */
    qColor: 0x7cf3c0,
    qCore: 0xe8fff6,
    /** W: violet mark orb — fatter and unmistakably not Q. */
    wColor: 0x9d7cf3,
    wCore: 0xe8dcff,
    /** E: hot-pink homing bolt, and the blink flashes that go with it. */
    eColor: 0xff5fa8,
    eCore: 0xffd9ec,
    /** Flash: pale gold starburst. */
    flashColor: 0xfff3c4,
    /** Incoming: fat, amber, heavy dark rim — "dodge me". */
    enemyColor: 0xffb347,
    enemyRim: 0x3a2405,
    enemyCore: 0xfff0cf,
  },

  // -------------------------------------------------------------- markers
  markers: {
    moveColor: 0x5fb0ff,
    attackMoveColor: 0xff7a6b,
    targetLockColor: 0x62d26f,
    targetAcquiringColor: 0xffd166,
  },

  // ------------------------------------------------------------------- ui
  ui: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    text: '#dce6f5',
    dim: '#7d8aa0',
    faint: '#5a6577',
    accent: '#5fb0ff',
    danger: '#ff7a6b',
    good: '#62d26f',
    warn: '#ffd166',
    /** Panel plates behind HUD groups. */
    panelColor: 0x0e141d,
    panelAlpha: 0.72,
    panelStroke: 0x27364a,
    panelRadius: 8,
  },

  /**
   * How long the attack-range ring stays up after an instant Attack Move Click
   * (T), and how much of that is spent fading out. A-mode instead holds the ring
   * for as long as targeting is armed.
   */
  rangeHint: {
    holdMs: 320,
    fadeMs: 160,
  },

  /** Bottom-centre ability bar. Laid out for N slots; only Q exists today. */
  ability: {
    slotSize: 62,
    slotGap: 10,
    /** Distance from the bottom of the arena to the bottom of the slots. */
    bottomMargin: 40,
    /** Summoner spells (Flash) are smaller and set apart from the kit row. */
    summonerSize: 46,
    summonerGap: 26,
    radius: 10,
    readyFill: 0x152233,
    readyStroke: 0x5fb0ff,
    cooldownFill: 0x0c1119,
    cooldownStroke: 0x2b3a4e,
    /** Dark wash over the slot while the ability is unavailable. */
    cooldownWashAlpha: 0.62,
    /** The radial sweep that drains as the cooldown runs down. */
    sweepColor: 0x05070b,
    sweepAlpha: 0.66,
  },

  /** Pause / settings menu. */
  menu: {
    panelColor: 0x0d131c,
    panelAlpha: 0.97,
    panelStroke: 0x35506e,
    scrimColor: 0x04060a,
    scrimAlpha: 0.72,
    buttonFill: 0x16202e,
    buttonFillHover: 0x22344a,
    buttonStroke: 0x3d5c7e,
    buttonStrokeHover: 0x5fb0ff,
  },
} as const;
