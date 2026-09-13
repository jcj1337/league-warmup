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

  // ----------------------------------------------------------- projectiles
  projectiles: {
    /** Your autos: fast, thin, cyan. */
    autoColor: 0x9fe8ff,
    autoCore: 0xffffff,
    /** Q: chunkier, green, unmistakably an ability. */
    qColor: 0x7cf3c0,
    qCore: 0xe8fff6,
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
} as const;
