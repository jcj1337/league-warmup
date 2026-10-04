import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import { registerStatusLook } from '../../game/view/statusLooks';
import type { Champion } from '../types';
import { BLINK_E, LEVELS, MARK_STATUS, SKILLSHOT_Q, SKILLSHOT_W, STATS } from './balance';
import { EzrealKit } from './kit';

/** The W mark, as the enemy wears it: a violet rune overhead and a ring at the feet. */
registerStatusLook(MARK_STATUS, {
  icon: TEX.mark,
  ringColor: THEME.mark.ringColor,
  warnMs: THEME.mark.warnMs,
  bobPx: THEME.mark.bobPx,
});

/**
 * Ezreal: the ADC the trainer was built around. Autos, a linear poke (Q), a
 * mark to cash in (W) and a committed blink (E). See README.md here for the
 * kit as a player reads it; balance.ts for every number.
 */
export const EZREAL: Champion = {
  id: 'ezreal',
  name: 'Ezreal',
  stats: STATS,
  attack: { get baseCooldownMs() { return LEVELS.baseAttackCooldownMs; } },
  levels: LEVELS,
  slots: {
    q: {
      label: 'Mystic Shot', targeting: 'direction',
      castTimeMs: () => SKILLSHOT_Q.castTimeMs, cooldownMs: () => SKILLSHOT_Q.cooldownMs,
      icon: TEX.icons.q, accent: THEME.ability.accents.q, castStyle: 'bolt', fx: 'q',
    },
    w: {
      label: 'Essence Flux', targeting: 'direction',
      castTimeMs: () => SKILLSHOT_W.castTimeMs, cooldownMs: () => SKILLSHOT_W.cooldownMs,
      icon: TEX.icons.w, accent: THEME.ability.accents.w, castStyle: 'orb', fx: 'w',
    },
    e: {
      label: 'Arcane Shift', targeting: 'direction',
      castTimeMs: () => BLINK_E.castTimeMs, cooldownMs: () => BLINK_E.cooldownMs,
      icon: TEX.icons.e, accent: THEME.ability.accents.e, castStyle: 'blink', fx: 'e',
    },
  },
  createKit: (ctx) => new EzrealKit(ctx),
};
