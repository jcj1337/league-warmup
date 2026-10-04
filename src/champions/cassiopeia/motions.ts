import type { Motion } from '../types';

/**
 * What Cassiopeia's body does for each cast (src/game/view/motion.ts).
 * Offsets are screen px; windup keys are fractions of the cast window.
 */

/** E, Twin Fang: she rears back through the window and lunges as the fangs leave. */
export const E_MOTION: Motion = {
  windup: [{ at: 0, frame: 'cast' }, { at: 1, along: -5, ease: 'out' }],
  followThrough: [{ at: 0, along: 9 }, { at: 120, along: 0 }],
};
