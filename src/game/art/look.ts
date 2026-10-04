import type Phaser from 'phaser';
import type { Champion } from '../../champions/types';
import { THEME } from '../../config/theme';
import { motionFrames } from '../view/motion';
import { addPixelTexture, type PixelColor, type PixelSprite } from './pixel';

/**
 * The player's look: a champion's body frames with cosmetic layers composed
 * on top, rasterised to textures on demand.
 *
 * A champion authors only its body (idle, squash, stretch, charge, cast, and
 * any extra poses its motions use). A
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
  /** Every pose by name, the five shared ones and the champion's extras, for motions. */
  named: Readonly<Record<string, string>>;
  /** The same, as glow masks: only the art's `glow` pixels, in white. Null when the art has none. */
  glow: Readonly<Record<string, string>> | null;
  /** Sprite origin (fraction of height) putting the body centre on the gameplay position. */
  originY: number;
  /** Screen pixels the hat adds above the head: text over the slime starts this much higher. */
  hatPx: number;
}

/** Rasterise every frame of `champion` wearing `look` (once per key) and say where they are. */
export function ensurePlayerFrames(scene: Phaser.Scene, champion: Champion, look: PlayerLook): PlayerFrames {
  const art = champion.art;
  const hatRows = look.hat?.rows.length ?? 0;
  const key = (frame: string) => `player_${champion.id}_${frame}_${look.id}`;

  const bodies: Record<string, readonly string[]> = { ...art.frames, ...(art.extraFrames ?? {}) };
  const named: Record<string, string> = {};
  const glow: Record<string, string> | null = art.glow ? {} : null;
  for (const [frame, rows] of Object.entries(bodies)) {
    const sprite = compose(rows, art.pal, art.frameHeight, look);
    addPixelTexture(scene, key(frame), sprite);
    named[frame] = key(frame);
    if (glow && art.glow) {
      addPixelTexture(scene, `${key(frame)}_glow`, glowMask(sprite, rows, art.glow));
      glow[frame] = `${key(frame)}_glow`;
    }
  }

  // Authoring guard: a motion naming a pose the art doesn't have fails at load, not mid-run.
  const used = [champion.autoMotion, ...Object.values(champion.slots).map((d) => d?.motion)].flatMap(motionFrames);
  for (const frame of used) {
    if (!(frame in named)) throw new Error(`${champion.id}: a motion uses frame "${frame}", which its art doesn't have`);
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
    named,
    glow,
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

/**
 * A composed frame reduced to its glow pixels (the body characters in
 * `chars`), in white, everything else transparent: tinted and faded over the
 * body by PlayerView. The hat sits above the body rows, so it never glows.
 */
function glowMask(sprite: PixelSprite, body: readonly string[], chars: string): PixelSprite {
  const offset = sprite.rows.length - body.length;
  const rows = sprite.rows.map((row, y) => {
    const src = body[y - offset];
    return src === undefined ? '.'.repeat(row.length) : [...src].map((ch) => (chars.includes(ch) ? '*' : '.')).join('');
  });
  return { rows, pal: { '*': 0xffffff } };
}
