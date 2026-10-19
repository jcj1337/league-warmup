import { PALETTE as P } from '../../config/theme';
import type { PixelSprite } from './pixel';

/**
 * Every piece of pixel art in the game, as original hand-authored pixel maps.
 *
 * One string per row, one character per pixel, `.` = transparent. Each sprite
 * carries its own small character → PALETTE map, so colours stay in theme.ts.
 * Sprites are rasterised once at boot (see textures.ts) and displayed at
 * THEME.art.scale. To swap in real art later, load PNGs under the same texture
 * keys and delete the matching entries here. Nothing else needs to change.
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

// ---- bulwark: a wide sand slime under iron plates ------------------------------------
// The tank of the family: half again as wide as the Pursuer, an iron helm over
// its brow and plates on its flanks, two tusks. Its two clubs (bulwark_club)
// are drawn and swung by BulwarkView. All Out, the plates are gone: a
// narrower, hotter body split by ember seams, and the clubs are blades.
//   I iron · J iron light · i iron dark · c ember seam

const SAND_PAL = {
  k: P.ink, m: P.sand, L: P.sandLight, w: P.sandShine, d: P.sandDark, D: P.sandDeep,
  I: P.iron, J: P.ironLight, i: P.ironDark, y: P.eyeGlow, f: P.fang,
};

const SAND_BODY = [
  '......kkkkkkkkkkkk......',
  '....kkJJIIIIIIIIiikk....',
  '...kJJIIIIIIIIIIIIiik...',
  '..kJIIIIkkkkkkkkIIIIik..',
  '.kiIIkkkmmmmmmmmkkkIIik.',
  '.kiikmwwLmmmmmmmmmmkiik.',
  'kmkkmwwLmmmmmmmmmmmmkkmk',
  'kmmmLmmkkmmmmmmkkmmmmmmk',
  'kmmmmmmmykmmmmkymmmmmmmk',
  'kmmmmmmmmmmmmmmmmmmmmmmk',
  'kdmmmmmmkkkkkkkkmmmmmmdk',
  'kdmmmmmkfkkkkkkfkmmmmmdk',
  'kiIIimmmmkkkkkkmmmmiIIik',
  'kiIIiddmmmmmmmmmmddiIIik',
  'kDiiidddddddddddddiiiDDk',
  '.kDDDDddddddddddddDDDDk.',
  '..kkkkkkkkkkkkkkkkkkkk..',
];

const BARE_PAL = {
  k: P.ink, m: P.sandLight, L: P.sandShine, w: P.white, d: P.sand, D: P.sandDark,
  c: P.ember, y: P.fireCore, f: P.fang,
};

const BARE_BODY = [
  '........kkkkkkkk........',
  '......kkmmmmmmmmkk......',
  '....kkmwwLmmmmmmmmkk....',
  '...kmwwLmmmmmmmmmmmmk...',
  '..kmmwLmmmmmmmmmmmmmmk..',
  '..kmmLmmkkmmmmmmkkmmmk..',
  '..kmmmmmmykmmmmkymmmmk..',
  '..kmmcmmmmmmmmmmmmcmmk..',
  '..kdmcmmmkkkkkkmmmcmdk..',
  '..kdmmcmkfkkkkfkmcmmdk..',
  '..kdmmmmmmkkkkmmmmmmdk..',
  '..kddmmmmmmmmmmmmmmddk..',
  '..kDdddmmmmmmmmmmdddDk..',
  '...kDDddddddddddddDDk...',
  '....kkkkkkkkkkkkkkkk....',
];
const BULWARK_H = 18;

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

  shadow_xl: {
    rows: [
      '....ssssssssssssss....',
      '..ssssssssssssssssss..',
      'ssssssssssssssssssssss',
      'ssssssssssssssssssssss',
      '..ssssssssssssssssss..',
      '....ssssssssssssss....',
    ],
    pal: { s: SHADOW },
  },

  /** Kill gold coin: lit top-left, shaded bottom-right. */
  fx_coin: {
    rows: ['..kkk..', '.kWWgk.', 'kWWggok', 'kWgggok', 'kggggok', '.kgook.', '..kkk..'],
    pal: { k: P.ink, W: P.eyeHot, g: P.gold, o: P.goldDark },
  },
  /** The start screen's credit badge: a challenger crest, blue flame wings around bronze blades and a blue spike. */
  ui_challenger: {
    rows: [
      '.b.....................b.',
      'Bb..B.......c.......B..bB',
      'BcbBcb.c....W....c.bcBbcB',
      'Bbbcboybb..bWb..bbyobcbbB',
      'Bbcbboyyyo.bWb.oyyyobbcbB',
      '.BbboyYYYYYyYyYYYYYyobbB.',
      '.BbcboycccWyYyWcccyobcbB.',
      '..BbbcoyccWyYyWccyocbbB..',
      '...BcbboycWyYyWcyobbcB...',
      '....BbcboycWYWcyobcbB....',
      '.....cbbcoyWYWyocbbc.....',
      '.......cbboyYyobbc.......',
      '.........cboyobc.........',
    ],
    pal: { B: P.blueDeep, b: P.blue, c: P.blueLight, W: P.blueShine, o: P.goldDark, y: P.gold, Y: P.eyeHot },
  },
  fx_muzzle_venom: {
    rows: ['.g.', 'gWg', '.g.'],
    pal: { g: P.toxinDeep, W: P.toxinLight },
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
  // ---- bulwark ---------------------------------------------------------------
  bulwark_walk_0: { rows: frame(SAND_BODY, BULWARK_H), pal: SAND_PAL },
  bulwark_walk_1: { rows: frame(without(SAND_BODY, 9), BULWARK_H), pal: SAND_PAL },
  /** Strike windup and the brace: eyes white-hot (the view rears it up or hunkers it down). */
  bulwark_windup: { rows: frame(SAND_BODY, BULWARK_H), pal: { ...SAND_PAL, y: P.eyeHot } },
  /** Winded after Path Maker: eyes shut. */
  bulwark_winded: { rows: frame(without(SAND_BODY, 9), BULWARK_H), pal: { ...SAND_PAL, y: P.sandDark } },
  bulwark_bare_0: { rows: frame(BARE_BODY, BULWARK_H), pal: BARE_PAL },
  bulwark_bare_1: { rows: frame(without(BARE_BODY, 7), BULWARK_H), pal: BARE_PAL },
  bulwark_bare_windup: { rows: frame(BARE_BODY, BULWARK_H), pal: { ...BARE_PAL, y: P.white, c: P.fireCore } },
  bulwark_bare_winded: { rows: frame(without(BARE_BODY, 7), BULWARK_H), pal: { ...BARE_PAL, y: P.sand } },
  /** One of its two clubs, head pointing right (rotated to where it is held). */
  bulwark_club: {
    rows: [
      '....kkkkkkkk',
      'kkkkIIIIIJJk',
      'kHHkIIIIIJJk',
      'kkkkiiiiiIIk',
      '....kkkkkkkk',
    ],
    pal: { k: P.ink, I: P.iron, J: P.ironLight, i: P.ironDark, H: P.twig },
  },
  /** All Out: the clubs are blades. */
  bulwark_blade: {
    rows: [
      '....kkkkkkk.',
      'kkkkWWWWWWWk',
      'kHHkSSSSSSWk',
      'kkkksssssSk.',
      '....kkkkkk..',
    ],
    pal: { k: P.ink, S: P.silver, W: P.white, s: P.silverDark, H: P.twig },
  },
  /** A plate thrown off as it goes All Out. */
  bulwark_plate: { rows: ['.kkk.', 'kJIIk', 'kIIik', '.kkk.'], pal: { k: P.ink, I: P.iron, J: P.ironLight, i: P.ironDark } },
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

  // ---- snakelady: ability icons, her fang bolt, the poison and petrify marks ------
  icon_snake_q: {
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
  icon_snake_w: {
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
    pal: { k: P.ink, m: P.smogDeep, M: P.smog, W: P.toxinLight, g: P.smog },
  },
  icon_snake_e: {
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
  icon_snake_r: {
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
  /** One fang of Snake Lady's E, its tip pointing right (rotated to where it snaps). */
  fx_fang: {
    rows: ['kk.....', 'kWkk...', 'kWWWkk.', 'kWWWWWk', 'kLLkkk.', 'kk.....'],
    pal: { k: P.ink, W: P.toxinCore, L: P.toxinLight },
  },
  fx_petrify: {
    rows: ['..kkkkk..', '.kSSSSSk.', 'kSSkkkSSk', 'kSkGGGkSk', 'kSSkkkSSk', '.kSSSSSk.', '..kkkkk..'],
    pal: { k: P.ink, S: P.stone, G: P.venom },
  },

  // ---- projectiles -------------------------------------------------------------
  /** Snake Lady's auto: a slim needle of venom, a third the height of Magic Boy's bolt. */
  proj_venom: { rows: ['dgGGGWW'], pal: { d: P.toxinDeepest, g: P.toxinDeep, G: P.toxin, W: P.toxinLight } },
  // ---- axeman: his thrown axes and ability icons -----------------------------------
  //   S steel · W glint · h handle · k outline (ink; blood-red on a spinning axe)
  proj_axe: {
    rows: ['...kkk...', '..kSWSk..', '.kSWWSSk.', '.kSSSShk.', '..kkShk..', '....khk..', '.....khk.', '......khk', '.......kk'],
    pal: { k: P.ink, S: P.steel, W: P.steelShine, h: P.beard },
  },
  /** A spinning axe: in his hand, thrown by an empowered auto, and coming down to be caught. */
  proj_spin_axe: {
    rows: ['...kkk...', '..kSWSk..', '.kSWWSSk.', '.kSSSShk.', '..kkShk..', '....khk..', '.....khk.', '......khk', '.......kk'],
    pal: { k: P.blood, S: P.steel, W: P.steelShine, h: P.beardLight },
  },
  /** A double-bitted axe: his E, and his R drawn larger. */
  proj_cleave: {
    rows: [
      '.kkk...kkk.', 'kSWSk.kSWSk', 'kSWWSkSWWSk', 'kSSSShSSSSk', '.kkShhhSkk.',
      '...khhhk...', '....khk....', '....khk....', '....khk....', '....kkk....',
    ],
    pal: { k: P.bloodDeep, S: P.steel, W: P.steelShine, h: P.beard },
  },
  icon_axe_q: {
    rows: [
      '..............', '..r...........', '.r...kkk......', '.r..kSWSk.....', '....kSWWSk....', '...kSSSShk....', '....kkShk.....',
      '......khk...r.', '.......khk..r.', '........khk.r.', '.........kk.r.', '..........rr..', '..............', '..............',
    ],
    pal: { k: P.ink, S: P.steel, W: P.steelShine, h: P.beardLight, r: P.blood },
  },
  icon_axe_w: {
    rows: [
      '..............', '..............', '..r....r......', '..rr...rr.....', '..RRr..RRr....', '..RRRr.RRRr...', '..RRRRrRRRRr..',
      '..RRRr.RRRr...', '..RRr..RRr....', '..rr...rr.....', '..r....r......', '..............', '..............', '..............',
    ],
    pal: { r: P.bloodCore, R: P.blood },
  },
  icon_axe_e: {
    rows: [
      '..............', '..kkk...kkk...', '.kSWSk.kSWSk..', '.kSWWSkSWWSk..', '.kSSSShSSSSk..', '..kkShhhSkk...', '....khhhk.....',
      '.....khk......', '.....khk......', '.....khk......', '.....kkk......', '..............', '..............', '..............',
    ],
    pal: { k: P.ink, S: P.steel, W: P.steelShine, h: P.beardLight },
  },
  icon_axe_r: {
    rows: [
      '..............', '.rrrrrrrrrr...', '.r........r...', '.r.kkk....r...', '.rkSWSk..rrr..', '..kSWWSk..r...', '.kSSSShk......',
      '..kkShk.......', '....khk.......', '.....khk......', '......khk.....', '.......kk.....', '..............', '..............',
    ],
    pal: { k: P.ink, S: P.steel, W: P.steelShine, h: P.beardLight, r: P.blood },
  },
  proj_auto: { rows: ['...cc.', 'bccWWW', '...cc.'], pal: { b: P.autoDeep, c: P.auto, W: P.autoCore } },
  proj_q: { rows: ['.....TT..', 'ttTTTWWWW', '.....TT..'], pal: { t: P.qDeep, T: P.q, W: P.qCore } },
  proj_w: {
    rows: ['..vvv..', '.vVVVv.', 'vVMWMVv', 'vVWWWVv', 'vVMWMVv', '.vVVVv.', '..vvv..'],
    pal: { v: P.wDeep, V: P.w, M: P.wHot, W: P.wCore },
  },
  /** Magic Boy's R: a tall crescent of light, bowed forward, as wide as its hitbox. */
  proj_r: {
    rows: [
      '...YW.....', '....YW....', '....GYW...', '....GYW...', '....DGYW..', '....DGYW..', '.....DGYW.', '.....DGYW.', '....DDGYW.',
      '.....DDGYW', '.....DDGYW', '.....DDGYW', '.....DDGYW', '.....DDGYW', '.....DDGYW', '.....DDGYW', '....DDGYW.',
      '.....DGYW.', '.....DGYW.', '....DGYW..', '....DGYW..', '....GYW...', '....GYW...', '....YW....', '...YW.....',
    ],
    pal: { D: P.rDeep, G: P.rGold, Y: P.r, W: P.rCore },
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

  /** Basic spit: a small dark-red slime glob, smaller and darker than the orange edge fireball. */
  proj_glob: {
    rows: ['.kkk.', 'kdrdk', 'krwrk', 'kdrdk', '.kkk.'],
    pal: { k: P.ink, d: P.redDeep, r: P.red, w: P.redShine },
  },
  /** A launched Dark Sphere: a near-black core in a pale lavender rim. */
  proj_sphere: {
    rows: ['..ggg..', '.gkkkg.', 'gkdddkg', 'gkdddkg', 'gkdddkg', '.gkkkg.', '..ggg..'],
    pal: { g: P.voidGlow, k: P.voidRim, d: P.voidCore },
  },
  /** Magus orb: a crackling white-gold sphere, paler and spikier than the edge fireball. */
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
  /** A small basalt rock split by a dim ember seam, the only warm prop. */
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
  /** Magic Boy's R: a golden wave with its streaks behind it. */
  icon_r: {
    rows: [
      '.....YW.......', '......GYW.....', '.......GYW....', '........GYW...', 'g.g.g...DGYW..', '.........DGYW.', 'g.g.g.g..DGYW.',
      'g.g.g.g..DGYW.', '.........DGYW.', 'g.g.g...DGYW..', '........GYW...', '.......GYW....', '......GYW.....', '.....YW.......',
    ],
    pal: { g: P.rGold, D: P.rDeep, G: P.rGold, Y: P.r, W: P.rCore },
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
