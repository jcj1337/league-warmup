import { PALETTE as P } from '../../config/theme';
import type { ChampionArt } from '../types';

/**
 * Axe Man's slime: the same friendly dome as the others, in white, with a
 * full brown beard from cheek to cheek that carries his mouth. His crown is
 * the usual one in black (`hatPal`). The axes he holds are not part of the
 * body: the kit draws them spinning at his sides (HeldAxes).
 *   m body · L light · w shine · d shade · k ink · e eye (ink; lights with a motion's glow)
 *   c cheek · b beard · B beard light · n beard dark
 */
const PAL = {
  k: P.ink, e: P.ink, m: P.snow, L: P.snowShine, w: P.snowShine, d: P.snowShade,
  c: P.cheek, b: P.beard, B: P.beardLight, n: P.beardDark,
};

const BODY = [
  '....kkkkkk....',
  '..kkmmmmmmkk..',
  '.kmwwLmmmmmmk.',
  '.kmwLmmmmmmmk.',
  'kmmLmmmmmmmmmk',
  'kmmmmemmmmemmk',
  'kmmmmemmmmemmk',
  'kmmcBbbbbbbBck',
  'kdmbbbbkkbbbmk',
  'kddnbbbbbbbndk',
  '.kdnnbbbbnndk.',
  '..kkknnnnkkk..',
];

const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const withRows = (rows: readonly string[], edits: Record<number, string>) => rows.map((r, i) => edits[i] ?? r);
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];

/** Eyes narrowed. */
const NARROWED = withRow(BODY, 5, 'kmmmmmmmmmmmmk');

export const AXE_MAN_ART: ChampionArt = {
  frames: {
    idle: BODY,
    /** Breath out / landing half of the hop. */
    squash: without(BODY, 4),
    /** Airborne half of the hop, and the release pop. */
    stretch: doubled(BODY, 4),
    /** Attack windup: hunkered down, eyes narrowed. */
    charge: without(NARROWED, 4),
    /** Casting: mouth open in the beard. */
    cast: withRow(BODY, 8, 'kdmbbkkkkkbbmk'),
  },
  extraFrames: {
    /** The big throws (E, R): eyes narrowed, a roar through the beard. */
    roar: withRows(NARROWED, { 8: 'kdmbkkkkkkkbmk', 9: 'kddnbkkkkkbndk' }),
  },
  glow: 'e',
  pal: PAL,
  /** A black crown with a steel band, so it reads against the dark ground; pale glints, the same ruby. */
  hatPal: { W: P.steelShine, g: P.crownBlack, o: P.steelDeep },
  frameHeight: 14,
  originY: 0.57,
};
