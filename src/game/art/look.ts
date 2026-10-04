import type Phaser from 'phaser';
import type { BodyFrame, Champion } from '../../champions/types';
import { THEME } from '../../config/theme';
import { addPixelTexture, type PixelColor, type PixelSprite } from './pixel';

/**
 * The player's look: a champion's body frames with cosmetic layers composed
 * on top, rasterised to textures on demand.
 *
 * A champion authors only its body (idle, squash, stretch, charge, cast). A
 * hat is a small pixel map stacked on the body's top row, so it squashes and
 * stretches with the hop; a skin is a palette override on the body. Layers
 * are composed here, once per look, so no champion frame is ever hand-merged
 * with a cosmetic. Texture keys carry the look, so changing it rebuilds only
 * the player's frames.
 */

/** A pixel map with its own palette, stacked above the body. */
export interface PixelLayer {
  rows: readonly string[];
  pal: Readonly<Record<string, PixelColor>>;
}

/** Palette overrides for the body's own characters ('m', 'L', ...). */
export type SkinPalette = Readonly<Record<string, PixelColor>>;

/** What the player wears: cosmetic layers and a skin, already resolved from the catalogue. */
export interface PlayerLook {
  /** A short id for texture keys ('crown-base'). */
  id: string;
  hat: PixelLayer | null;
  skin: SkinPalette | null;
}

/** Texture keys per pose, plus where the body sits in the composed frame. */
export interface PlayerFrames {
  frames: {
    idle: [string, string];
    walk: [string, string];
    charge: string;
    release: string;
    cast: string;
  };
  /** Sprite origin (fraction of height) putting the body centre on the gameplay position. */
  originY: number;
  /** Screen pixels the hat adds above the head: text over the slime starts this much higher. */
  hatPx: number;
}

/** Rasterise every frame of `champion` wearing `look` (once per key) and say where they are. */
export function ensurePlayerFrames(scene: Phaser.Scene, champion: Champion, look: PlayerLook): PlayerFrames {
  const art = champion.art;
  const hatRows = look.hat?.rows.length ?? 0;
  const key = (frame: BodyFrame) => `player_${champion.id}_${frame}_${look.id}`;

  for (const frame of ['idle', 'squash', 'stretch', 'charge', 'cast'] as const) {
    addPixelTexture(scene, key(frame), compose(art.frames[frame], art.pal, art.frameHeight, look));
  }

  const totalHeight = art.frameHeight + hatRows;
  return {
    frames: {
      idle: [key('idle'), key('squash')],
      walk: [key('stretch'), key('squash')],
      charge: key('charge'),
      release: key('stretch'),
      cast: key('cast'),
    },
    originY: (hatRows + art.frameHeight * art.originY) / totalHeight,
    hatPx: hatRows * THEME.art.scale,
  };
}

/**
 * One composed frame: the body (skinned) bottom-aligned into `frameHeight`,
 * with the hat's rows directly above the body's top row, centred. Layer
 * characters are moved to private codes so they can never collide with the
 * body's.
 */
export function compose(body: readonly string[], pal: Readonly<Record<string, PixelColor>>, frameHeight: number, look: PlayerLook): PixelSprite {
  const width = body[0]?.length ?? 0;
  const blank = '.'.repeat(width);
  const merged: Record<string, PixelColor> = { ...pal, ...(look.skin ?? {}) };

  const hat: string[] = [];
  if (look.hat) {
    let code = 0xe000;
    const remap = new Map<string, string>();
    for (const [ch, color] of Object.entries(look.hat.pal)) {
      const priv = String.fromCharCode(code++);
      remap.set(ch, priv);
      merged[priv] = color;
    }
    for (const row of look.hat.rows) {
      const cells = [...row].map((ch) => (ch === '.' ? '.' : (remap.get(ch) ?? ch)));
      const pad = Math.max(0, width - cells.length);
      const left = Math.floor(pad / 2);
      hat.push('.'.repeat(left) + cells.join('') + '.'.repeat(pad - left));
    }
  }

  const padding = Math.max(0, frameHeight - body.length);
  const rows = [...hat, ...Array.from({ length: padding }, () => blank), ...body];
  return { rows, pal: merged };
}
