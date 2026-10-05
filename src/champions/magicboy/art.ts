import { PALETTE as P } from '../../config/theme';
import type { ChampionArt } from '../types';

/**
 * Magic Boy's slime: an ink-outlined blue dome lit from the top-left, with the
 * face set one pixel toward the direction it faces (right; flipX turns it),
 * and his gauntlet, a gold cuff with a gem, worn low on that side. Two clear
 * columns either side keep the body centred while the cuff reaches past it.
 * Friendly: dot eyes, a smile, cheeks. Cosmetics (the crown) are composed on
 * top by src/game/art/look.ts, never drawn here.
 *   m body · L light · w shine · d dark · k ink · c cheek
 *   y gold · o dark gold · g gem (lights with a motion's glow)
 */
const PAL = { k: P.ink, m: P.blue, L: P.blueLight, w: P.blueShine, d: P.blueDeep, c: P.cheek, y: P.gold, o: P.goldDark, g: P.auto };

const BODY = [
  '......kkkkkk......',
  '....kkmmmmmmkk....',
  '...kmwwLmmmmmmk...',
  '...kmwLmmmmmmmk...',
  '..kmmLmmmmmmmmmk..',
  '..kmmmmkmmmmkmmk..',
  '..kmmmmkmmmmkmmk..',
  '..kmmcmmmmmmmkkkkk',
  '..kdmmmmkmmkmkyggk',
  '..kddmmmmkkmmkoook',
  '...kddddddddddkkk.',
  '....kkkkkkkkkk....',
];

const without = (rows: readonly string[], ...drop: number[]) => rows.filter((_, i) => !drop.includes(i));
const withRow = (rows: readonly string[], index: number, row: string) => rows.map((r, i) => (i === index ? row : r));
const doubled = (rows: readonly string[], index: number) => [...rows.slice(0, index + 1), ...rows.slice(index)];

/** Eyes narrowed. */
const NARROWED = withRow(BODY, 5, '..kmmmmmmmmmmmmk..');

export const MAGIC_BOY_ART: ChampionArt = {
  frames: {
    idle: BODY,
    /** Breath out / landing half of the hop. */
    squash: without(BODY, 4),
    /** Airborne half of the hop, and the release pop. */
    stretch: doubled(BODY, 4),
    /** Attack windup: hunkered down, eyes narrowed. */
    charge: without(NARROWED, 4),
    /** Casting: little "o" mouth. */
    cast: withRow(BODY, 8, '..kdmmmmmkkmmkyggk'),
  },
  extraFrames: {
    /** R, bracing: eyes narrowed, teeth gritted. */
    grit: withRow(NARROWED, 8, '..kdmmmmkkkkmkyggk'),
  },
  glow: 'g',
  pal: PAL,
  frameHeight: 14,
  originY: 0.57,
};
