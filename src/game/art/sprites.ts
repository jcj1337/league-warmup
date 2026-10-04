import { PALETTE as P } from '../../config/theme';
import type { PixelSprite } from './pixel';

/**
 * Every piece of pixel art in the game, as original hand-authored pixel maps.
 *
 * One string per row, one character per pixel, `.` = transparent. Each sprite
 * carries its own small character → PALETTE map, so colours stay in theme.ts.
 * Sprites are rasterised once at boot (see textures.ts) and displayed at
 * THEME.art.scale. To swap in real art later, load PNGs under the same texture
 * keys and delete the matching entries here — nothing else needs to change.
 */

const SHADOW = [P.shadow, 0.4] as const;

// ============================================================ frame helpers

/** Bottom-align a body in a fixed-height frame, so squash / stretch keeps it planted. */
function frame(body: readonly string[], height: number): string[] {
  const blank = '.'.repeat(body[0].length);
  return [...Array.from({ length: height - body.length }, () => blank), ...body];
}
const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];

// ============================================================ slime family
// One family, one silhouette: an ink-outlined dome lit from the top-left, with
// the face set one pixel toward the direction it faces (right; flipX turns it).
//   m body · L light · w shine · d dark · D deepest · k ink
// Hostiles glow and snarl. The playable slimes live with their champions
// (src/champions/<id>/art.ts) and are composed with cosmetics at run start.

// ---- basic: red slime ------------------------------------------------------------

const RED_PAL = { k: P.ink, m: P.red, L: P.redLight, w: P.redShine, d: P.redDeep, y: P.eyeGlow, f: P.fang };

const RED_BODY = [
  '....kkkkkk....',
  '..kkmmmmmmkk..',
  '.kmwwLmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLkmmmmmmkmk',
  'kmmmmkmmmmkmmk',
  'kmmmmymmmmymmk',
  'kdmmmmmmmmmmdk',
  'kdmmmmkkkkmmdk',
  'kddmmkfkkfkddk',
  '.kddddddddddk.',
  '..kkkkkkkkkk..',
];
const BASIC_H = 13;

// ---- pursuer: horned purple slime --------------------------------------------------

const PURPLE_PAL = {
  k: P.ink, m: P.purple, L: P.purpleLight, w: P.purpleShine, d: P.purpleDark, D: P.purpleDeep,
  h: P.horn, y: P.eyeOrange, f: P.fang,
};

const PURPLE_BODY = [
  '.kk............kk.',
  '.khk..........khk.',
  '..khk........khk..',
  '..khkkkkkkkkkkhk..',
  '.kmLLmmmmmmmmmmmk.',
  'kmLwwmmmmmmmmmmmmk',
  'kLwwmmmmmmmmmmmmmk',
  'kLmmmkkmmmmmmkkmmk',
  'kLmmmmmkmmmmkmmmmk',
  'kmmmmmyymmmmyymmmk',
  'kmmmmmmmmmmmmmmmdk',
  'kdmmmkkkkkkkkkkmdk',
  'kdmmmkfkkkkkkfkmdk',
  'kddmmmmkkkkkkmmddk',
  'kDddmmmmmmmmmmddDk',
  '.kDDddddddddddDDk.',
  '..kkkkkkkkkkkkkk..',
];
const PURSUER_H = 18;

// ---- magus: tall slate slime in a brass crest and mask ------------------------------
// The caster of the family: taller than it is wide, a pointed brass crest, a
// face-plate with burning eye slits and an arcane core glowing through its body.
// Two brass rune tablets (magus_rune) float around it, drawn by MagusView.
//   G brass · B brass light · g brass dark · y eye / core glow · o arcane

const MAGUS_PAL = {
  k: P.ink, m: P.magus, L: P.magusLight, w: P.magusShine, d: P.magusDark, D: P.magusDeep,
  G: P.brass, B: P.brassLight, g: P.brassDark, y: P.arcaneCore, o: P.arcane,
};

const MAGUS_BODY = [
  '......kk......',
  '.....kBGk.....',
  '....kBGGgk....',
  '...kkBGGgkk...',
  '..kmwkkkkkmk..',
  '.kmwwLmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLmmmmmmmmmk',
  'kmgGGGGGGGGGgk',
  'kmgGGyyGGyyGgk',
  'kmmgggggggggmk',
  'kdmmmmmmmmmmdk',
  'kdmmmmmoommmdk',
  'kddmmmmmmmmddk',
  '.kDddddddddDk.',
  '..kkkkkkkkkk..',
];
const MAGUS_H = 18;

// ---- sovereign: indigo-black slime under a silver diadem ------------------------------
// The sphere mage: a tall silver spike over a dark dome, a diadem band across
// the brow and pale lavender eyes. Two dark orbs circle her (SovereignView).
//   S silver · W silver shine · y lavender eyes

const SOV_PAL = {
  k: P.ink, m: P.sov, L: P.sovLight, w: P.sovShine, d: P.sovDark, D: P.sovDeep,
  S: P.silver, s: P.silverDark, W: P.white, y: P.voidRim,
};

const SOV_BODY = [
  '......kk......',
  '.....kWsk.....',
  '....kkWskk....',
  '..kkmmkkmmkk..',
  '.kmwLmmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLmmmmmmmmmk',
  'kSSSSSSSSSSSsk',
  'kmmmmymmmmymmk',
  'kmmmmmmmmmmmmk',
  'kdmmmmmmmmmmdk',
  'kddmmmmmmmmddk',
  '.kDddddddddDk.',
  '..kkkkkkkkkk..',
];
const SOV_H = 16;

export const SPRITES: Record<string, PixelSprite> = {
  // ---- utility -------------------------------------------------------------
  px: { rows: ['w'], pal: { w: P.white } },

  shadow_s: { rows: ['.sssssss.', 'sssssssss', '.sssssss.'], pal: { s: SHADOW } },
  shadow_m: {
    rows: ['..ssssssss..', '.ssssssssss.', '.ssssssssss.', '..ssssssss..'],
    pal: { s: SHADOW },
  },
  shadow_l: {
    rows: ['...ssssssssss...', '.ssssssssssssss.', 'ssssssssssssssss', '.ssssssssssssss.', '...ssssssssss...'],
    pal: { s: SHADOW },
  },

  /** Kill gold coin: lit top-left, shaded bottom-right. */
  fx_coin: {
    rows: ['..kkk..', '.kWWgk.', 'kWWggok', 'kWgggok', 'kggggok', '.kgook.', '..kkk..'],
    pal: { k: P.ink, W: P.eyeHot, g: P.gold, o: P.goldDark },
  },
  fx_muzzle: {
    rows: ['..w..', '.wWw.', 'wWWWw', '.wWw.', '..w..'],
    pal: { w: P.auto, W: P.autoCore },
  },

  // ---- basic enemy -----------------------------------------------------------
  basic_0: { rows: frame(RED_BODY, BASIC_H), pal: RED_PAL },
  basic_1: { rows: frame(without(RED_BODY, 7), BASIC_H), pal: RED_PAL },
  /** Spit windup: hunkered down, mouth glowing. */
  basic_spit: { rows: frame(without(withRow(RED_BODY, 8, 'kdmmmmkyykmmdk'), 7), BASIC_H), pal: RED_PAL },

  // ---- pursuer ---------------------------------------------------------------
  pursuer_walk_0: { rows: frame(PURPLE_BODY, PURSUER_H), pal: PURPLE_PAL },
  pursuer_walk_1: { rows: frame(without(PURPLE_BODY, 10), PURSUER_H), pal: PURPLE_PAL },
  /** Windup: rears up tall, eyes white-hot. */
  pursuer_windup: { rows: frame(doubled(PURPLE_BODY, 6), PURSUER_H), pal: { ...PURPLE_PAL, y: P.eyeHot } },
  /** Dash windup: crouched low, eyes white-hot. */
  pursuer_crouch: { rows: frame(without(PURPLE_BODY, 6, 10), PURSUER_H), pal: { ...PURPLE_PAL, y: P.eyeHot } },
  /** Swing resolved: flattened slam. */
  pursuer_slam: { rows: frame(without(PURPLE_BODY, 6, 10), PURSUER_H), pal: PURPLE_PAL },
  // ---- magus -----------------------------------------------------------------
  magus_0: { rows: frame(MAGUS_BODY, MAGUS_H), pal: MAGUS_PAL },
  magus_1: { rows: frame(without(MAGUS_BODY, 11), MAGUS_H), pal: MAGUS_PAL },
  /** Casting: drawn up tall, eye slits and core white-hot. */
  magus_cast: { rows: frame(doubled(MAGUS_BODY, 6), MAGUS_H), pal: { ...MAGUS_PAL, y: P.white, o: P.arcaneCore } },
  sovereign_0: { rows: frame(SOV_BODY, SOV_H), pal: SOV_PAL },
  sovereign_1: { rows: frame(without(SOV_BODY, 9), SOV_H), pal: SOV_PAL },
  /** Casting: drawn up tall, eyes white-hot. */
  sovereign_cast: { rows: frame(doubled(SOV_BODY, 5), SOV_H), pal: { ...SOV_PAL, y: P.white } },
  magus_rune: {
    rows: ['.kkk.', 'kBGgk', 'kGygk', 'kGGgk', 'kGygk', 'kgggk', '.kkk.'],
    pal: { k: P.ink, B: P.brassLight, G: P.brass, g: P.brassDark, y: P.arcane },
  },

  fx_alert: {
    rows: ['.k.', 'kwk', 'kwk', 'kwk', 'kwk', '.k.', 'kwk', '.k.'],
    pal: { k: P.ink, w: P.warning },
  },

  // ---- W mark ----------------------------------------------------------------
  fx_mark: {
    rows: [
      '....k....',
      '...kVk...',
      '..kVMVk..',
      '.kVMWMVk.',
      'kVMWWWMVk',
      '.kVMWMVk.',
      '..kVMVk..',
      '...kVk...',
      '....k....',
    ],
    pal: { k: P.ink, V: P.w, M: P.wHot, W: P.wCore },
  },

  // ---- cassiopeia: ability icons, her fang bolt, the poison and petrify marks ------
  icon_cassio_q: {
    rows: [
      '..............',
      '......g.......',
      '....g.gg.g....',
      '.....kkkk.....',
      '..g.kGGGGk.g..',
      '....kGWWGk....',
      '.g.kGWWWWGk.g.',
      '...kGGWWGGk...',
      '....kGGGGk....',
      '..g..kkkk..g..',
      '.....g..g.....',
      '......gg......',
      '..............',
      '..............',
    ],
    pal: { k: P.ink, g: P.toxinDeep, G: P.toxin, W: P.toxinCore },
  },
  icon_cassio_w: {
    rows: [
      '..............',
      '..............',
      '......kkk.....',
      '....kkmmmkk...',
      '..kkmmmMMmmk..',
      '.kmmMMMMMmmmk.',
      '.kmMMWWMMMmmk.',
      '.kmmMMMMMmmmk.',
      '..kkmmmmmmkk..',
      '....kkkkkk....',
      '...g..g..g....',
      '..g..g..g.....',
      '..............',
      '..............',
    ],
    pal: { k: P.ink, m: P.miasmaDeep, M: P.miasma, W: P.toxinLight, g: P.miasma },
  },
  icon_cassio_e: {
    rows: [
      '..............',
      '..kkk....kkk..',
      '.kWWWk..kWWWk.',
      '.kWGGk..kGGWk.',
      '..kGGk..kGGk..',
      '..kGGk..kGGk..',
      '...kGk..kGk...',
      '...kGk..kGk...',
      '....kk..kk....',
      '....kGk.kGk...',
      '.....k...k....',
      '..............',
      '..............',
      '..............',
    ],
    pal: { k: P.ink, G: P.toxinLight, W: P.toxinCore },
  },
  icon_cassio_r: {
    rows: [
      '..............',
      '..............',
      '.....kkkk.....',
      '...kkssssk....',
      '..kssSSSSssk..',
      '.kssSkkkkSssk.',
      '.ksSkGGGGkSsk.',
      '.ksSkGWWGkSsk.',
      '.kssSkkkkSssk.',
      '..kssSSSSssk..',
      '...kkssssk....',
      '.....kkkk.....',
      '..............',
      '..............',
    ],
    pal: { k: P.ink, s: P.stoneDeep, S: P.stone, G: P.venom, W: P.venomShine },
  },
  proj_fang: { rows: ['..gG..', 'gGGWWW', '..gG..'], pal: { g: P.toxin, G: P.toxinLight, W: P.toxinCore } },
  fx_poison: {
    rows: ['...k...', '..kGk..', '..kGk..', '.kGGGk.', '.kGWGk.', 'kGGWGGk', 'kGGGGGk', '.kGGGk.', '..kkk..'],
    pal: { k: P.ink, G: P.toxin, W: P.toxinCore },
  },
  fx_petrify: {
    rows: ['..kkkkk..', '.kSSSSSk.', 'kSSkkkSSk', 'kSkGGGkSk', 'kSSkkkSSk', '.kSSSSSk.', '..kkkkk..'],
    pal: { k: P.ink, S: P.stone, G: P.venom },
  },

  // ---- projectiles -------------------------------------------------------------
  proj_auto: { rows: ['...cc.', 'bccWWW', '...cc.'], pal: { b: P.autoDeep, c: P.auto, W: P.autoCore } },
  proj_q: { rows: ['.....TT..', 'ttTTTWWWW', '.....TT..'], pal: { t: P.qDeep, T: P.q, W: P.qCore } },
  proj_w: {
    rows: ['..vvv..', '.vVVVv.', 'vVMWMVv', 'vVWWWVv', 'vVMWMVv', '.vVVVv.', '..vvv..'],
    pal: { v: P.wDeep, V: P.w, M: P.wHot, W: P.wCore },
  },
  proj_e: {
    rows: ['....bP..', '..bPPPp.', 'bbPWWWWP', '..bPPPp.', '....bP..'],
    pal: { b: P.eBlue, P: P.e, p: P.eDeep, W: P.eCore },
  },
  proj_hostile_0: {
    rows: ['..kkk..', '.krork.', 'kroyork', 'koyyyok', 'kroyork', '.krork.', '..kkk..'],
    pal: { k: P.fireDark, r: P.fire, o: P.fireOrange, y: P.fireCore },
  },
  proj_hostile_1: {
    rows: ['..kkk..', '.korok.', 'koryrok', 'kryyyrk', 'koryrok', '.korok.', '..kkk..'],
    pal: { k: P.fireDark, r: P.fire, o: P.fireOrange, y: P.fireCore },
  },

  /** Basic spit: a small dark-red slime glob — smaller and darker than the orange edge fireball. */
  proj_glob: {
    rows: ['.kkk.', 'kdrdk', 'krwrk', 'kdrdk', '.kkk.'],
    pal: { k: P.ink, d: P.redDeep, r: P.red, w: P.redShine },
  },
  /** A launched Dark Sphere: a near-black core in a pale lavender rim. */
  proj_sphere: {
    rows: ['..ggg..', '.gkkkg.', 'gkdddkg', 'gkdddkg', 'gkdddkg', '.gkkkg.', '..ggg..'],
    pal: { g: P.voidGlow, k: P.voidRim, d: P.voidCore },
  },
  /** Magus orb: a crackling white-gold sphere — paler and spikier than the edge fireball. */
  proj_orb_0: {
    rows: ['...a...', '..kak..', '.kaWak.', 'aaWWWaa', '.kaWak.', '..kak..', '...a...'],
    pal: { k: P.arcaneDeep, a: P.arcane, W: P.arcaneCore },
  },
  proj_orb_1: {
    rows: ['a.....a', '.akkka.', '.kaWak.', '.kWWWk.', '.kaWak.', '.akkka.', 'a.....a'],
    pal: { k: P.arcaneDeep, a: P.arcane, W: P.arcaneCore },
  },

  // ---- effects -----------------------------------------------------------------
  fx_flash_star: {
    rows: ['....f....', '....f....', '..f.F.f..', '...fFf...', 'ffFFFFFff', '...fFf...', '..f.F.f..', '....f....', '....f....'],
    pal: { f: P.flash, F: P.flashCore },
  },
  fx_ping_move: {
    rows: ['...c...', '..c.c..', '.c...c.', 'c..C..c', '.c...c.', '..c.c..', '...c...'],
    pal: { c: P.cream, C: P.white },
  },
  fx_ping_attack: {
    rows: ['....r....', '....r....', '.........', '.........', 'rr..R..rr', '.........', '.........', '....r....', '....r....'],
    pal: { r: P.danger, R: P.white },
  },
  fx_dest: { rows: ['.c.', 'cCc', '.c.'], pal: { c: P.cream, C: P.white } },
  ui_gem: { rows: ['..k..', '.kPk.', 'kPWPk', '.kPk.', '..k..'], pal: { k: P.ink, P: P.passive, W: P.white } },
  ui_gem_empty: { rows: ['..k..', '.kPk.', 'kPWPk', '.kPk.', '..k..'], pal: { k: P.ink, P: P.panelEdge, W: P.panel } },

  // ---- props (visual only: no collision) ----------------------------------------
  prop_rock_l: {
    rows: [
      '....kkkkkk....',
      '..kksSSSSssk..',
      '.ksSSSSSSSssk.',
      'ksSSSSSsssssgk',
      'ksSSSssssssggk',
      'ksssssssgsgggk',
      'kgssssssggggk.',
      '.kggsssgggggk.',
      '..kkgggggkkk..',
      '....kkkkk.....',
    ],
    pal: { k: P.ink, s: P.rock, S: P.rockLight, g: P.rockDark },
  },
  prop_rock_s: {
    rows: ['..kkkk..', '.kSSssk.', 'kSSsssgk', 'kssssggk', '.kgggkk.', '..kkkk..'],
    pal: { k: P.ink, s: P.rock, S: P.rockLight, g: P.rockDark },
  },
  /** A small basalt rock split by a dim ember seam — the only warm prop. */
  prop_ember_rock: {
    rows: ['..kkkk..', '.kSSosk.', 'kSSoysgk', 'kssoyggk', '.kgogkk.', '..kkkk..'],
    pal: { k: P.ink, s: P.rock, S: P.rockLight, g: P.rockDark, o: P.lavaGlow, y: P.ember },
  },
  prop_dead_shrub: {
    rows: [
      '.t...t...t.',
      '..t..t..t..',
      't..t.t.t..t',
      '.t.TtTtT.t.',
      '..tTTtTTt..',
      '...TTtTT...',
      '....TtT....',
      '...kTTTk...',
      '..kkkkkkk..',
    ],
    pal: { k: P.ink, t: P.twig, T: P.twigDark },
  },

  // ---- ability icons ---------------------------------------------------------------
  icon_q: {
    rows: [
      '..............',
      '..............',
      '........kk....',
      '........kTk...',
      '..ttt...kTTk..',
      '.....kkkkTTTk.',
      'tttttkTTTWWWTk',
      '.....kkkkTTTk.',
      '..ttt...kTTk..',
      '........kTk...',
      '........kk....',
      '..............',
      '..............',
      '..............',
    ],
    pal: { k: P.ink, t: P.qDeep, T: P.q, W: P.qCore },
  },
  icon_w: {
    rows: [
      '......v.......',
      '......V.......',
      '..............',
      '.....kkkk.....',
      '....kvVVvk....',
      '...kvVPPVvk...',
      'vV.kVPWWPVk.Vv',
      'vV.kVPWWPVk.Vv',
      '...kvVPPVvk...',
      '....kvVVvk....',
      '.....kkkk.....',
      '..............',
      '......V.......',
      '......v.......',
    ],
    pal: { k: P.ink, v: P.wDeep, V: P.w, P: P.wHot, W: P.wCore },
  },
  icon_e: {
    rows: [
      '..............',
      '..........pp..',
      '.........pPPp.',
      '........pPWWPp',
      '.......b.pPPp.',
      '......b...pp..',
      '.....b........',
      '....b.........',
      '...b..........',
      '.bb.b.........',
      'bBBb..........',
      'bBBb..........',
      '.bb...........',
      '..............',
    ],
    pal: { p: P.e, P: P.eCore, W: P.white, b: P.eBlue, B: P.eCore },
  },
  icon_flash: {
    rows: [
      '......g.......',
      '......g.......',
      '..g...Y...g...',
      '...g..Y..g....',
      '....g.Y.g.....',
      '.....YYY......',
      'ggYYYYWYYYYgg.',
      '.....YYY......',
      '....g.Y.g.....',
      '...g..Y..g....',
      '..g...Y...g...',
      '......g.......',
      '......g.......',
      '..............',
    ],
    pal: { g: P.gold, Y: P.flash, W: P.flashCore },
  },
};
