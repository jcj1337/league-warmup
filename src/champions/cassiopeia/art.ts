import { PALETTE as P } from '../../config/theme';
import type { ChampionArt } from '../types';

/**
 * Cassiopeia's slime: the same friendly dome as Ezreal's, in venom green,
 * but the bottom of the body is a coiled snake tail sweeping out to the
 * facing side instead of a flat base. Same face, same crown on top.
 *   m body · L light · w shine · d dark · D deepest · k ink · e eye (ink; lights with a motion's glow)
 *   c cheek · s scale · F fang · t tongue
 */
const PAL = {
  k: P.ink, e: P.ink, m: P.venom, L: P.venomLight, w: P.venomShine, d: P.venomDeep, D: P.venomDeepest,
  c: P.cheek, s: P.venomScale, F: P.fang, t: P.tongue,
};

const BODY = [
  '....kkkkkk....',
  '..kkmmmmmmkk..',
  '.kmwwLmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLmmmmmmmmmk',
  'kmmmmemmmmemmk',
  'kmmmmemmmmemmk',
  'kmmcmmmmmmmmck',
  'kdmmmmkmmkmmdk',
  '.kdsmmmmmmsdk.',
  '..kkdsmmmsdkk.',
  '....kddsddDkk.',
  '.....kkkDDDDk.',
  '........kkkkk.',
];

const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const withRows = (rows: readonly string[], edits: Record<number, string>) => rows.map((r, i) => edits[i] ?? r);
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];
/** Two clear columns either side, so a pose can reach past the body (the tongue) and stay centred. */
const padded = (rows: readonly string[]) => rows.map((r) => `..${r}..`);

/** Eyes squeezed shut, cheeks puffed, mouth pressed closed: holding a breath. */
const SHUT = withRows(BODY, {
  5: 'kmmmmmmmmmmmmk',
  6: 'kmmmeemmmeemmk',
  7: 'kmmccmmmmmccmk',
  8: 'kdmmmmmmmmmmdk',
});

export const CASSIOPEIA_ART: ChampionArt = {
  frames: {
    idle: BODY,
    /** Breath out / landing half of the hop: the coil takes the weight. */
    squash: without(BODY, 4),
    /** Airborne half of the hop, and the release pop. */
    stretch: doubled(BODY, 4),
    /** Attack windup: hunkered down, eyes narrowed. */
    charge: without(withRow(BODY, 5, 'kmmmmmmmmmmmmk'), 4),
    /** Casting: little "o" mouth. */
    cast: withRow(BODY, 8, 'kdmmmmmkkmmmdk'),
  },
  extraFrames: {
    /** The spit: mouth wide open. */
    spit: withRows(BODY, { 8: 'kdmmmkkkkmmmdk', 9: '.kdsmmkkmmsdk.' }),
    /** The flick after a spit: a forked tongue out past the facing side. */
    tongue: withRows(padded(BODY), {
      7: '..kmmcmmmmmmmmck.t',
      8: '..kdmmmmmkttttttt.',
      9: '...kdsmmmmmmsdk..t',
    }),
    /** Twin Fang: jaws open on two fangs. */
    fangs: withRows(BODY, { 8: 'kdmmmkkkkkmmdk', 9: '.kdsmFkkFmsdk.' }),
    /** Petrifying Gaze, breathing in: eyes shut, cheeks full. */
    shut: SHUT,
    /** Petrifying Gaze, the strike: eyes wide (they light up), mouth open. */
    gaze: withRows(BODY, {
      5: 'kmmmeemmmeemmk',
      6: 'kmmmeemmmeemmk',
      8: 'kdmmmmkkkkmmdk',
    }),
  },
  glow: 'e',
  pal: PAL,
  frameHeight: 16,
  originY: 0.52,
};
