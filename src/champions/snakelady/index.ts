import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import { registerStatusLook } from '../../game/view/statusLooks';
import type { Champion } from '../types';
import { SNAKE_LADY_ART } from './art';
import { AUTO, E, LEVELS, PETRIFY_STATUS, POISON_STATUS, Q, R, STATS, W } from './balance';
import { SnakeLadyKit } from './kit';
import { AUTO_MOTION, E_MOTION, Q_MOTION, R_MOTION } from './motions';

/** Poisoned: a violet drip overhead and a venom ring at the feet. Petrified: a stone eye. */
registerStatusLook(POISON_STATUS, { icon: TEX.fx.poison, ringColor: THEME.fx.poison.color, warnMs: 800, bobPx: 2 });
registerStatusLook(PETRIFY_STATUS, { icon: TEX.fx.petrify, ringColor: THEME.fx.gaze.color, warnMs: 400, bobPx: 0 });

/**
 * Snake Lady: a venom mage. Ground spells to place ahead of enemies (Q, W), a
 * fast point-and-click bolt that rewards poisoned targets (E), and a cone
 * ultimate that petrifies whoever is facing her (R). See README.md here.
 */
export const SNAKE_LADY: Champion = {
  id: 'snakelady',
  name: 'Snake Lady',
  stats: STATS,
  attack: {
    get baseCooldownMs() { return LEVELS.baseAttackCooldownMs; },
    get range() { return AUTO.range; },
  },
  levels: LEVELS,
  art: SNAKE_LADY_ART,
  autoMotion: AUTO_MOTION,
  /** A slim violet needle of venom, where Magic Boy's is a fat cyan bolt. */
  autoLook: { missile: 'venom', fx: 'venom', muzzle: TEX.player.muzzleVenom },
  slots: {
    q: {
      targeting: 'point', range: Q.range,
      castTimeMs: ({ castSpeed }) => Q.castTimeMs / castSpeed, cooldownMs: () => Q.cooldownMs,
      icon: TEX.icons.snakeQ, accent: THEME.ability.accents.venom, castStyle: 'none', fx: 'poison', motion: Q_MOTION,
    },
    w: {
      targeting: 'point', range: W.range,
      castTimeMs: ({ castSpeed }) => W.castTimeMs / castSpeed, cooldownMs: () => W.cooldownMs,
      icon: TEX.icons.snakeW, accent: THEME.ability.accents.smog, castStyle: 'orb', fx: 'smog',
    },
    e: {
      targeting: 'unit', range: E.range,
      castTimeMs: ({ castSpeed }) => E.castTimeMs / castSpeed, cooldownMs: () => E.cooldownMs,
      icon: TEX.icons.snakeE, accent: THEME.ability.accents.fang, castStyle: 'fang', fx: 'fang', motion: E_MOTION,
    },
    r: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => R.castTimeMs / castSpeed, cooldownMs: () => R.cooldownMs,
      telegraph: { kind: 'cone', radius: () => R.radius, halfAngle: () => R.halfAngle, fx: 'poison' },
      icon: TEX.icons.snakeR, accent: THEME.ability.accents.stone, castStyle: 'none', fx: 'gaze', motion: R_MOTION,
    },
  },
  createKit: (ctx) => new SnakeLadyKit(ctx),
};
