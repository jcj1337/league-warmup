import Phaser from 'phaser';
import { ensureFont } from './font';
import { addPixelTexture } from './pixel';
import { SPRITES } from './sprites';

/**
 * Texture keys, in one place. Views only ever refer to art through these, so
 * replacing generated placeholder art with loaded PNGs is a key-for-key swap.
 */
export const TEX = {
  px: 'px',
  shadow: { s: 'shadow_s', m: 'shadow_m', l: 'shadow_l', xl: 'shadow_xl' },
  /** The player's body frames are composed per champion and look (src/game/art/look.ts); only this is static. */
  player: { muzzle: 'fx_muzzle', muzzleVenom: 'fx_muzzle_venom' },
  basic: { frames: ['basic_0', 'basic_1'], spit: 'basic_spit' },
  pursuer: {
    walk: ['pursuer_walk_0', 'pursuer_walk_1'],
    windup: 'pursuer_windup',
    crouch: 'pursuer_crouch',
    slam: 'pursuer_slam',
    alert: 'fx_alert',
  },
  bulwark: {
    walk: ['bulwark_walk_0', 'bulwark_walk_1'],
    windup: 'bulwark_windup',
    winded: 'bulwark_winded',
    bareWalk: ['bulwark_bare_0', 'bulwark_bare_1'],
    bareWindup: 'bulwark_bare_windup',
    bareWinded: 'bulwark_bare_winded',
    club: 'bulwark_club',
    blade: 'bulwark_blade',
    plate: 'bulwark_plate',
  },
  sovereign: {
    idle: ['sovereign_0', 'sovereign_1'],
    cast: 'sovereign_cast',
  },
  magus: {
    idle: ['magus_0', 'magus_1'],
    cast: 'magus_cast',
    rune: 'magus_rune',
  },
  mark: 'fx_mark',
  proj: {
    auto: 'proj_auto',
    venom: 'proj_venom',
    q: 'proj_q',
    w: 'proj_w',
    e: 'proj_e',
    r: 'proj_r',
    hostile: ['proj_hostile_0', 'proj_hostile_1'],
    orb: ['proj_orb_0', 'proj_orb_1'],
    glob: 'proj_glob',
    sphere: 'proj_sphere',
    fang: 'proj_fang',
  },
  fx: {
    coin: 'fx_coin',
    poison: 'fx_poison',
    petrify: 'fx_petrify',
    fang: 'fx_fang',
    flashStar: 'fx_flash_star',
    pingMove: 'fx_ping_move',
    pingAttack: 'fx_ping_attack',
    dest: 'fx_dest',
  },
  ui: { gem: 'ui_gem', gemEmpty: 'ui_gem_empty', challenger: 'ui_challenger' },
  props: {
    rockLarge: 'prop_rock_l',
    rockSmall: 'prop_rock_s',
    emberRock: 'prop_ember_rock',
    deadShrub: 'prop_dead_shrub',
  } as Record<string, string>,
  icons: {
    q: 'icon_q', w: 'icon_w', e: 'icon_e', r: 'icon_r', flash: 'icon_flash',
    cassioQ: 'icon_cassio_q', cassioW: 'icon_cassio_w', cassioE: 'icon_cassio_e', cassioR: 'icon_cassio_r',
  } as Record<string, string>,
  ground: 'battlefield_ground',
} as const;

/**
 * Rasterise every pixel sprite and the pixel font. Idempotent: textures live on
 * the game, not the scene, so this does real work only on the first call.
 */
export function ensureArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX.px)) {
    for (const [key, sprite] of Object.entries(SPRITES)) addPixelTexture(scene, key, sprite);
  }
  ensureFont(scene);
}
