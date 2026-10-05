import { PALETTE as P } from '../../config/theme';
import type { Motion } from '../types';

/**
 * What Snake Lady's body does for her auto and each cast (src/game/view/motion.ts).
 * Windup keys are fractions of the real window; follow-through keys are ms at
 * level-1 tempo. Offsets are screen px, scale is about her feet.
 *
 * She's a cobra: she draws back and coils before a strike, rears up tall to
 * aim down at the ground, and every spit ends in a flick of the tongue.
 */

/** Auto, a venom spit: coils back and down, snaps forward mouth-open, then flicks her tongue. */
export const AUTO_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'charge' },
    { at: 0.7, along: -3, sx: 1.1, sy: 0.88, ease: 'out' },
    { at: 1, along: -4, sx: 1.14, sy: 0.85 },
  ],
  followThrough: [
    { at: 0, frame: 'spit', along: 5, sx: 0.88, sy: 1.15 },
    { at: 60, frame: 'tongue', along: 3, sx: 0.96, sy: 1.05 },
    { at: 150, along: 0, sx: 1, sy: 1 },
  ],
};

/** Q: rears up tall on her coil, then nods down hard at the spot as it wells up. */
export const Q_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'cast' },
    { at: 0.7, along: -2, up: 3, sx: 0.88, sy: 1.2, ease: 'out' },
    { at: 1, up: 4, sx: 0.86, sy: 1.24 },
  ],
  followThrough: [
    { at: 0, frame: 'spit', along: 4, up: 0, sx: 1.2, sy: 0.78 },
    { at: 90, along: 1, sx: 0.97, sy: 1.05 },
    { at: 180, along: 0, sx: 1, sy: 1 },
  ],
};

/** E: rears back with her jaws open on the fangs, and lunges as they leave. */
export const E_MOTION: Motion = {
  windup: [
    { at: 0, frame: 'fangs' },
    { at: 1, along: -5, sx: 0.92, sy: 1.08, ease: 'out' },
  ],
  followThrough: [
    { at: 0, along: 9, sx: 1.15, sy: 0.88 },
    { at: 70, frame: 'idle', along: 3, sx: 1.03, sy: 0.98 },
    { at: 120, along: 0, sx: 1, sy: 1 },
  ],
};

/**
 * R: a deep breath in (she swells, eyes squeezed shut), a hard
 * gulp, a trembling hold, the hood flares, and on the frame the cone strikes her
 * eyes snap open, blazing. Then she lets the breath go. The trembling hold drops
 * out of a window under 300ms, so a hasted R still reads inhale, gulp, glare.
 */
export const R_MOTION: Motion = {
  glowColor: P.eyeGlow,
  windup: [
    { at: 0, frame: 'shut' },
    { at: 0.55, up: 2, sx: 1.22, sy: 1.12, ease: 'out' },
    { at: 0.62, up: 0, sx: 1.32, sy: 0.8, ease: 'in' },
    { at: 0.7, up: 1, sx: 1.18, sy: 1.1, ease: 'out' },
    { at: 0.76, tremble: 1.2, minWindowMs: 300 },
    { at: 0.9, tremble: 1.6, sx: 1.22, sy: 1.12, minWindowMs: 300 },
    { at: 1, tremble: 0, up: 3, sx: 1.3, sy: 1.22, ease: 'out' },
  ],
  followThrough: [
    { at: 0, frame: 'gaze', glow: 1, along: 3, up: 2, sx: 1.32, sy: 1.24 },
    { at: 160, glow: 0.8, along: 1, up: 0, sx: 1.12, sy: 1.06 },
    { at: 220, frame: 'cast', glow: 0, sx: 0.92, sy: 0.94, ease: 'out' },
    { at: 340, along: 0, sx: 1, sy: 1 },
  ],
};
