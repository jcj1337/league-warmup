import { THEME } from '../../config/theme';
import type { Motion } from '../types';

/**
 * What Ezreal's body does for his auto and each cast (src/game/view/motion.ts).
 * Windup keys are fractions of the real window; follow-through keys are ms at
 * level-1 tempo. Offsets are screen px, scale is about his feet.
 *
 * He's a quick-draw shooter: small, sharp anticipations, clean recoils, and his
 * gauntlet's gem lights up, in the slot's colour, before anything leaves it.
 */

/** Auto: hunker and lean into the target, gem warming; pop and kick back as the shot leaves. */
export function autoMotion(): Motion {
  const A = THEME.player.attack;
  return {
    windup: [
      { at: 0, frame: 'charge' },
      { at: 1, along: A.windupLeanPx, sx: 1.08, sy: 0.92, glow: 0.8 },
    ],
    followThrough: [
      { at: 0, frame: 'stretch', along: -A.releaseKickPx, sx: 0.92, sy: 1.1, glow: 1 },
      { at: A.releaseKickMs, along: 0, sx: 1, sy: 1, glow: 0 },
    ],
  };
}

/** Q, Mystic Shot: a quick-draw. A flinch back, then he stretches at the aim; a sharp kick as it fires. */
export const Q_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'cast' },
    { at: 0.3, along: -2, sx: 0.94, sy: 1.06, glow: 0.3, ease: 'out' },
    { at: 1, along: 4, sx: 1.16, sy: 0.9, glow: 1, ease: 'in' },
  ],
  followThrough: [
    { at: 0, frame: 'stretch', along: -5, sx: 0.9, sy: 1.1, glow: 1 },
    { at: 110, along: 0, sx: 1, sy: 1, glow: 0, ease: 'out' },
  ],
};

/** W, Essence Flux: gathers low and round, bobs up, then shoves it out and stays forward a beat. A push, not a recoil. */
export const W_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'cast' },
    { at: 0.6, sx: 1.14, sy: 0.86, glow: 0.5, ease: 'out' },
    { at: 0.85, up: 2, sx: 0.96, sy: 1.08, minWindowMs: 150 },
    { at: 1, up: 0, glow: 1 },
  ],
  followThrough: [
    { at: 0, frame: 'stretch', along: 5, sx: 1.12, sy: 0.92, glow: 1 },
    { at: 80, along: 5 },
    { at: 200, along: 0, sx: 1, sy: 1, glow: 0, ease: 'inOut' },
  ],
};

/** E, Arcane Shift: squashes, then pulls tall and thin and vanishes; pops in squashed where he lands and settles. */
export const E_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'cast' },
    { at: 0.45, sx: 1.2, sy: 0.78, glow: 0.3, ease: 'out' },
    { at: 1, sx: 0.55, sy: 1.4, up: 3, glow: 1, ease: 'in' },
  ],
  followThrough: [
    { at: 0, frame: 'squash', sx: 1.3, sy: 0.7, up: 0, glow: 0.8 },
    { at: 70, frame: 'stretch', sx: 0.9, sy: 1.12, glow: 0.3 },
    { at: 150, frame: 'idle', sx: 1, sy: 1, glow: 0 },
  ],
};

/**
 * R, Trueshot Barrage: plants wide, teeth gritted, the gem filling; a rising
 * tremble as the charge builds; a pull back, and a big recoil as the wave
 * leaves. The charge quickens with attack speed, and every beat goes with it.
 */
export const R_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'grit' },
    { at: 0.2, sx: 1.18, sy: 0.84, glow: 0.3, ease: 'out' },
    { at: 0.4, tremble: 0.4 },
    { at: 0.85, tremble: 2, sx: 1.22, sy: 0.8, glow: 0.9 },
    { at: 1, along: -4, sx: 1.08, sy: 0.92, tremble: 0, glow: 1, ease: 'in' },
  ],
  followThrough: [
    { at: 0, frame: 'stretch', along: -10, sx: 0.86, sy: 1.16, glow: 1 },
    { at: 90, along: -6, sx: 1.04, sy: 0.97, glow: 0.6 },
    { at: 240, frame: 'idle', along: 0, sx: 1, sy: 1, glow: 0, ease: 'out' },
  ],
};
