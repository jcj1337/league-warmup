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
  '.kdsmmFmmFsdk.',
  '..kkdsmmmsdkk.',
  '....kddsddDkk.',
  '.....kkkDDDDk.',
  '........kkkkk.',
];

const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const withRows = (rows: readonly string[], edits: Record<number, string>) => rows.map((r, i) => edits[i] ?? r);
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];
/**
 * Her tail, out behind her from the coil and curling up to a point: laid over
 * every pose, bottom-aligned, with four clear columns either side of the body
 * so it (and the tongue) can reach past it and the body stays centred.
 */
const TAIL = [
  '.kk...................',
  'kLsk..................',
  'kmsk..................',
  '.kmsk.................',
  '.kmsskkkk.............',
  '.kmmsssssss...........',
  '..kkkkkkkkkk..........',
];
const withTail = (rows: readonly string[]) => {
  const out = rows.map((r) => `....${r}....`);
  const off = out.length - TAIL.length;
  return out.map((r, y) => {
    const t = TAIL[y - off];
    return t === undefined ? r : [...r].map((ch, x) => (t[x] !== '.' ? t[x] : ch)).join('');
  });
};
/** One row of a finished (tailed) frame, `str` painted from column `x`. */
const paint = (rows: readonly string[], y: number, x: number, str: string) =>
  rows.map((r, i) => (i === y ? r.slice(0, x) + str + r.slice(x + str.length) : r));

/** Eyes squeezed shut, cheeks puffed, mouth pressed closed: holding a breath. */
const SHUT = withRows(BODY, {
  5: 'kmmmmmmmmmmmmk',
  6: 'kmmmeemmmeemmk',
  7: 'kmmccmmmmmccmk',
  8: 'kdmmmmmmmmmmdk',
});

export const CASSIOPEIA_ART: ChampionArt = {
  frames: {
    idle: withTail(BODY),
    /** Breath out / landing half of the hop: the coil takes the weight. */
    squash: withTail(without(BODY, 4)),
    /** Airborne half of the hop, and the release pop. */
    stretch: withTail(doubled(BODY, 4)),
    /** Attack windup: hunkered down, eyes narrowed. */
    charge: withTail(without(withRow(BODY, 5, 'kmmmmmmmmmmmmk'), 4)),
    /** Casting: little "o" mouth. */
    cast: withTail(withRow(BODY, 8, 'kdmmmmmkkmmmdk')),
  },
  extraFrames: {
    /** The spit: mouth wide open. */
    spit: withTail(withRows(BODY, { 8: 'kdmmmkkkkmmmdk', 9: '.kdsmmkkmmsdk.' })),
    /** The flick after a spit: a forked tongue out past the facing side. */
    tongue: paint(paint(paint(withTail(BODY), 7, 19, 't'), 8, 10, 'mkttttttt'), 9, 19, 't'),
    /** Twin Fang: jaws open on two fangs. */
    fangs: withTail(withRows(BODY, { 8: 'kdmmmkkkkkmmdk', 9: '.kdsmFkkFmsdk.' })),
    /** Petrifying Gaze, breathing in: eyes shut, cheeks full. */
    shut: withTail(SHUT),
    /** Petrifying Gaze, the strike: eyes wide (they light up), mouth open. */
    gaze: withTail(withRows(BODY, {
      5: 'kmmmeemmmeemmk',
      6: 'kmmmeemmmeemmk',
      8: 'kdmmmmkkkkmmdk',
    })),
  },
  glow: 'e',
  pal: PAL,
  frameHeight: 16,
  originY: 0.52,
};
