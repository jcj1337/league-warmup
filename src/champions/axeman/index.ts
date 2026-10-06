import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import type { Champion } from '../types';
import { AXE_MAN_ART } from './art';
import { AUTO, E, LEVELS, Q, R, STATS, W } from './balance';
import { AxeManKit } from './kit';
import { autoMotion, E_MOTION, R_MOTION } from './motions';

/**
 * Axe Man: an auto-attacker who has to catch what he throws. Q readies a
 * spinning axe for his next auto, and catching it as it comes down keeps it
 * (and resets W, a burst of speed to get under the next one). E shoves a line
 * of enemies aside; R crosses the arena and comes back. See README.md here.
 */
export const AXE_MAN: Champion = {
  id: 'axeman',
  name: 'Axe Man',
  stats: STATS,
  attack: {
    get baseCooldownMs() { return LEVELS.baseAttackCooldownMs; },
    get range() { return AUTO.range; },
  },
  levels: LEVELS,
  art: AXE_MAN_ART,
  autoMotion: autoMotion(),
  /** A plain thrown axe; with Q up it is a spinning one (see the kit's autoShot). */
  autoLook: { missile: 'axe', fx: 'axe', muzzle: TEX.player.muzzle },
  slots: {
    q: {
      targeting: 'self', quick: true,
      castTimeMs: () => 0, cooldownMs: () => Q.cooldownMs,
      icon: TEX.icons.axeQ, accent: THEME.ability.accents.steel, castStyle: 'none', fx: 'axe',
    },
    w: {
      targeting: 'self', quick: true,
      castTimeMs: () => 0, cooldownMs: () => W.cooldownMs,
      icon: TEX.icons.axeW, accent: THEME.ability.accents.blood, castStyle: 'none', fx: 'rush',
    },
    e: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => E.castTimeMs / castSpeed, cooldownMs: () => E.cooldownMs,
      icon: TEX.icons.axeE, accent: THEME.ability.accents.steel, castStyle: 'none', fx: 'axe', motion: E_MOTION,
    },
    r: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => R.castTimeMs / castSpeed, cooldownMs: () => R.cooldownMs,
      icon: TEX.icons.axeR, accent: THEME.ability.accents.blood, castStyle: 'none', fx: 'axe', motion: R_MOTION,
    },
  },
  notes: () => {
    const H = Q.catchHeal;
    const heals: number[] = [];
    for (let heal = H.base; heal < H.max; heal += H.perCatch) heals.push(heal);
    return [
      `Each catch in a row heals more: ${[...heals, H.max].join(', ')} HP`,
      `Miss one and the next catch heals ${H.base} again`,
      `A catch scores +${Q.catchScoreBonus}`,
    ];
  },
  createKit: (ctx) => new AxeManKit(ctx),
};
