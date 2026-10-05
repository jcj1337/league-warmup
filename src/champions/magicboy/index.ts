import { ATTACK } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import { registerStatusLook } from '../../game/view/statusLooks';
import type { Champion } from '../types';
import { BLINK_E, LEVELS, MARK_STATUS, SKILLSHOT_Q, SKILLSHOT_W, STATS, ULT_R } from './balance';
import { MAGIC_BOY_ART } from './art';
import { MagicBoyKit } from './kit';
import { autoMotion, E_MOTION, Q_MOTION, R_MOTION, W_MOTION } from './motions';

/** The W mark, as the enemy wears it: a violet rune overhead and a ring at the feet. */
registerStatusLook(MARK_STATUS, {
  icon: TEX.mark,
  ringColor: THEME.mark.ringColor,
  warnMs: THEME.mark.warnMs,
  bobPx: THEME.mark.bobPx,
});

/**
 * Magic Boy: the ADC the trainer was built around. Autos, a linear poke (Q), a
 * mark to cash in (W), a committed blink (E) and a global wave (R). See README.md here for the
 * kit as a player reads it; balance.ts for every number.
 */
export const MAGIC_BOY: Champion = {
  id: 'magicboy',
  name: 'Magic Boy',
  stats: STATS,
  attack: {
    get baseCooldownMs() { return LEVELS.baseAttackCooldownMs; },
    // The world's default auto range: __balance.ATTACK.range.
    get range() { return ATTACK.range; },
  },
  levels: LEVELS,
  art: MAGIC_BOY_ART,
  autoMotion: autoMotion(),
  slots: {
    q: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => SKILLSHOT_Q.castTimeMs / castSpeed, cooldownMs: () => SKILLSHOT_Q.cooldownMs,
      icon: TEX.icons.q, accent: THEME.ability.accents.q, castStyle: 'bolt', fx: 'q', motion: Q_MOTION,
    },
    w: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => SKILLSHOT_W.castTimeMs / castSpeed, cooldownMs: () => SKILLSHOT_W.cooldownMs,
      icon: TEX.icons.w, accent: THEME.ability.accents.w, castStyle: 'orb', fx: 'w', motion: W_MOTION,
    },
    e: {
      targeting: 'direction',
      castTimeMs: ({ castSpeed }) => BLINK_E.castTimeMs / castSpeed, cooldownMs: () => BLINK_E.cooldownMs,
      icon: TEX.icons.e, accent: THEME.ability.accents.e, castStyle: 'blink', fx: 'e', motion: E_MOTION,
    },
    r: {
      targeting: 'direction',
      // The charge speeds up with his attack speed, level and passive alike.
      castTimeMs: ({ attackSpeed }) => ULT_R.castTimeMs / attackSpeed, cooldownMs: () => ULT_R.cooldownMs,
      // As in League, Flash mid-charge doesn't take the wave along: it leaves from where he began.
      anchored: true,
      icon: TEX.icons.r, accent: THEME.ability.accents.r, castStyle: 'orb', fx: 'r', motion: R_MOTION,
    },
  },
  notes: () => [
    `E's bolt scores +${BLINK_E.scoreBonus} when it hits`,
    `Q removes ${LEVELS.qRankUp.pips} pips from level ${LEVELS.qRankUp.level}`,
    `R: ${ULT_R.firstPips} pips to the first enemy, ${ULT_R.pips} to the rest`,
  ],
  createKit: (ctx) => new MagicBoyKit(ctx),
};
