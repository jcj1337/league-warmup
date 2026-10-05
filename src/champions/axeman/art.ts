import { PALETTE as P } from '../../config/theme';
import type { ChampionArt } from '../types';

/**
 * Axe Man's slime: the same dome as the others, but rugged. A dirty,
 * off-white body with little shine, heavy brows set low over the eyes, a scar
 * across the brow, no blush, and a full, unkempt brown beard that carries a
 * grim line of a mouth. His crown is the usual one in black, tipped in gold
 * (`hatPal`). The axes he holds are not part of the body: the kit draws them
 * spinning at his sides (HeldAxes).
 *   m body · L light · d shade · k ink (outline, brows, mouth) · e eye (ink; lights with a motion's glow)
 *   s scar · b beard · B beard light · n beard dark
 */
const PAL = {
  k: P.ink, e: P.ink, m: P.snow, L: P.snowShine, d: P.snowShade, s: P.snowDeep,
  b: P.beard, B: P.beardLight, n: P.beardDark,
};

const BODY = [
  '....kkkkkk....',
  '..kkmmmmmmkk..',
  '.kmLLmmmmsmmk.',
  '.kmLmmmmmmsmk.',
  'kmmmkkmmmkkmmk',
  'kmmmmemmmmemmk',
  'kdmmmemmmmemdk',
  'kdbBbbnbbnbBbk',
  'kdbbbbkkkkbbbk',
  'kdnbbnbbbnbbnk',
  '.knnbbnbbnbnk.',
  '..kkknnnnkkk..',
];

const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const withRows = (rows: readonly string[], edits: Record<number, string>) => rows.map((r, i) => edits[i] ?? r);
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];

/** Eyes narrowed to slits under the brows. */
const NARROWED = withRow(BODY, 5, 'kmmmmmmmmmmmmk');

export const AXE_MAN_ART: ChampionArt = {
  frames: {
    idle: BODY,
    /** Breath out / landing half of the hop. The forehead gives, so the brows stay. */
    squash: without(BODY, 3),
    /** Airborne half of the hop, and the release pop. */
    stretch: doubled(BODY, 3),
    /** Attack windup: hunkered down, eyes narrowed. */
    charge: without(NARROWED, 3),
    /** Casting: mouth open in the beard. */
    cast: withRow(BODY, 8, 'kdbbbkkkkkkbbk'),
  },
  extraFrames: {
    /** The big throws (E, R): eyes narrowed, a roar through the beard. */
    roar: withRows(NARROWED, { 8: 'kdbbkkkkkkkkbk', 9: 'kdnbbkkkkkbbnk' }),
  },
  glow: 'e',
  pal: PAL,
  /** A black crown tipped and banded in gold, so it reads as a crown on a pale head; the same ruby. */
  hatPal: { W: P.gold, g: P.crownBlack, o: P.goldDark },
  frameHeight: 14,
  originY: 0.57,
};
