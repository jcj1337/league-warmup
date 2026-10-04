import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import { registerStatusLook } from '../../game/view/statusLooks';
import type { Champion } from '../types';
import { CASSIOPEIA_ART } from './art';
import { E, LEVELS, PETRIFY_STATUS, POISON_STATUS, Q, R, STATS, W } from './balance';
import { CassiopeiaKit } from './kit';

/** Poisoned: a violet drip overhead and a venom ring at the feet. Petrified: a stone eye. */
registerStatusLook(POISON_STATUS, { icon: TEX.fx.poison, ringColor: THEME.fx.poison.color, warnMs: 800, bobPx: 2 });
registerStatusLook(PETRIFY_STATUS, { icon: TEX.fx.petrify, ringColor: THEME.fx.gaze.color, warnMs: 400, bobPx: 0 });

/**
 * Cassiopeia: a venom mage. Ground spells to place ahead of enemies (Q, W), a
 * fast point-and-click bolt that rewards poisoned targets (E), and a cone
 * ultimate that petrifies whoever is facing her (R). See README.md here.
 */
export const CASSIOPEIA: Champion = {
  id: 'cassiopeia',
  name: 'Cassiopeia',
  stats: STATS,
  attack: { get baseCooldownMs() { return LEVELS.baseAttackCooldownMs; } },
  levels: LEVELS,
  art: CASSIOPEIA_ART,
  slots: {
    q: {
      label: 'Noxious Blast', targeting: 'point', range: Q.range,
      castTimeMs: () => Q.castTimeMs, cooldownMs: () => Q.cooldownMs,
      icon: TEX.icons.cassioQ, accent: THEME.ability.accents.venom, castStyle: 'orb', fx: 'poison',
    },
    w: {
      label: 'Miasma', targeting: 'point', range: W.range,
      castTimeMs: () => W.castTimeMs, cooldownMs: () => W.cooldownMs,
      icon: TEX.icons.cassioW, accent: THEME.ability.accents.miasma, castStyle: 'orb', fx: 'miasma',
    },
    e: {
      label: 'Twin Fang', targeting: 'unit', range: E.range,
      castTimeMs: () => E.castTimeMs, cooldownMs: () => E.cooldownMs,
      icon: TEX.icons.cassioE, accent: THEME.ability.accents.fang, castStyle: 'fang', fx: 'fang',
    },
    r: {
      label: 'Petrifying Gaze', targeting: 'direction',
      castTimeMs: () => R.castTimeMs, cooldownMs: () => R.cooldownMs,
      telegraph: { kind: 'cone', radius: () => R.radius, halfAngle: () => R.halfAngle },
      icon: TEX.icons.cassioR, accent: THEME.ability.accents.stone, castStyle: 'orb', fx: 'gaze',
    },
  },
  createKit: (ctx) => new CassiopeiaKit(ctx),
};
