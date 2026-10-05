import { PALETTE as P, THEME } from '../../config/theme';
import type { Motion } from '../types';

/**
 * What Axe Man's body does for his auto and each cast (src/game/view/motion.ts).
 * Windup keys are fractions of the real window; follow-through keys are ms at
 * level-1 tempo. Q and W are instant, so they have no motion of their own.
 *
 * He throws with his whole body: a lean back to wind the arm, then well
 * forward past his feet as the axe leaves.
 */

/** Auto: leans back to wind up, then heaves forward as the axe leaves and rocks back. */
export function autoMotion(): Motion {
  const A = THEME.player.attack;
  return {
    windup: [
      { at: 0, frame: 'charge' },
      { at: 0.55, along: -3, sx: 0.96, sy: 1.05, ease: 'out' },
      { at: 1, along: A.windupLeanPx, sx: 1.1, sy: 0.9, ease: 'in' },
    ],
    followThrough: [
      { at: 0, frame: 'stretch', along: A.windupLeanPx + 3, sx: 1.12, sy: 0.92 },
      { at: A.releaseKickMs, along: 0, sx: 1, sy: 1, ease: 'out' },
    ],
  };
}

/** E: both arms back, a roar, then a wide shove of axes down the line. */
export const E_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'roar' },
    { at: 0.5, along: -4, sx: 0.92, sy: 1.1, glow: 0.4, ease: 'out' },
    { at: 1, along: 5, sx: 1.2, sy: 0.86, glow: 1, ease: 'in' },
  ],
  followThrough: [
    { at: 0, frame: 'stretch', along: 7, sx: 1.16, sy: 0.9, glow: 1 },
    { at: 90, along: 5 },
    { at: 220, frame: 'idle', along: 0, sx: 1, sy: 1, glow: 0, ease: 'inOut' },
  ],
  glowColor: P.blood,
};

/** R: plants low and wide, trembling as he winds the two great axes, and hurls them with everything. */
export const R_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'roar' },
    { at: 0.3, sx: 1.2, sy: 0.82, glow: 0.3, ease: 'out' },
    { at: 0.8, along: -5, tremble: 1.5, sx: 1.24, sy: 0.8, glow: 0.9 },
    { at: 1, along: 4, tremble: 0, sx: 1.1, sy: 0.92, glow: 1, ease: 'in' },
  ],
  followThrough: [
    { at: 0, frame: 'stretch', along: 9, sx: 0.88, sy: 1.16, glow: 1 },
    { at: 100, along: 5, sx: 1.04, sy: 0.97, glow: 0.6 },
    { at: 260, frame: 'idle', along: 0, sx: 1, sy: 1, glow: 0, ease: 'out' },
  ],
  glowColor: P.blood,
};
