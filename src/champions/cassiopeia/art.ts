import { PALETTE as P } from '../../config/theme';
import type { ChampionArt } from '../types';

/**
 * Cassiopeia's slime: the same friendly dome as Ezreal's, in venom green,
 * but the bottom of the body is a coiled snake tail sweeping out to the
 * facing side instead of a flat base. Same face, same crown on top.
 *   m body · L light · w shine · d dark · D deepest · k ink · c cheek · s scale
 */
const PAL = { k: P.ink, m: P.venom, L: P.venomLight, w: P.venomShine, d: P.venomDeep, D: P.venomDeepest, c: P.cheek, s: P.venomScale };

const BODY = [
  '....kkkkkk....',
  '..kkmmmmmmkk..',
  '.kmwwLmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLmmmmmmmmmk',
  'kmmmmkmmmmkmmk',
  'kmmmmkmmmmkmmk',
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
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];

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
  pal: PAL,
  frameHeight: 16,
  originY: 0.52,
};
