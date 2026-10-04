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
  shadow: { s: 'shadow_s', m: 'shadow_m', l: 'shadow_l' },
  player: {
    idle: ['player_idle', 'player_squash'],
    walk: ['player_stretch', 'player_squash'],
    charge: 'player_charge',
    release: 'player_stretch',
    cast: 'player_cast',
    muzzle: 'fx_muzzle',
  },
  basic: { frames: ['basic_0', 'basic_1'], spit: 'basic_spit' },
  pursuer: {
    walk: ['pursuer_walk_0', 'pursuer_walk_1'],
    windup: 'pursuer_windup',
    crouch: 'pursuer_crouch',
    slam: 'pursuer_slam',
    alert: 'fx_alert',
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
    q: 'proj_q',
    w: 'proj_w',
    e: 'proj_e',
    hostile: ['proj_hostile_0', 'proj_hostile_1'],
    orb: ['proj_orb_0', 'proj_orb_1'],
    glob: 'proj_glob',
    sphere: 'proj_sphere',
  },
  fx: {
    coin: 'fx_coin',
    flashStar: 'fx_flash_star',
    pingMove: 'fx_ping_move',
    pingAttack: 'fx_ping_attack',
    dest: 'fx_dest',
  },
  ui: { gem: 'ui_gem', gemEmpty: 'ui_gem_empty' },
  props: {
    rockLarge: 'prop_rock_l',
    rockSmall: 'prop_rock_s',
    emberRock: 'prop_ember_rock',
    deadShrub: 'prop_dead_shrub',
  } as Record<string, string>,
  icons: { q: 'icon_q', w: 'icon_w', e: 'icon_e', flash: 'icon_flash' } as Record<string, string>,
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
