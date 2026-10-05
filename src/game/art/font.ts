import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { GLYPHS, GLYPH_H, GLYPH_W, LOWER_GLYPHS } from './glyphs';

export const FONT_KEY = 'pixel-font';
/** The same font with real lower-case letters (LOWER_GLYPHS), for the title. */
export const CASED_FONT_KEY = 'pixel-font-cased';

/** One glyph cell: the 5×7 glyph plus a pixel of spacing right and below. */
const CELL_W = GLYPH_W + 1;
const CELL_H = GLYPH_H + 1;
const PER_ROW = 16;

/**
 * Build the bitmap fonts from the glyph tables once per game: a white glyph
 * sheet (tinted per use) plus BitmapText font data. In FONT_KEY lower-case
 * letters share the upper-case glyphs; CASED_FONT_KEY has its own.
 */
export function ensureFont(scene: Phaser.Scene): void {
  if (!scene.cache.bitmapFont.exists(FONT_KEY)) buildFont(scene, FONT_KEY, GLYPHS, true);
  if (!scene.cache.bitmapFont.exists(CASED_FONT_KEY)) buildFont(scene, CASED_FONT_KEY, { ...GLYPHS, ...LOWER_GLYPHS }, false);
}

function buildFont(scene: Phaser.Scene, key: string, glyphs: Record<string, string[]>, foldLower: boolean): void {
  const chars = Object.keys(glyphs);
  const rows = Math.ceil(chars.length / PER_ROW);
  const canvas = document.createElement('canvas');
  canvas.width = PER_ROW * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';

  const data = {
    retroFont: true,
    font: key,
    size: CELL_H,
    lineHeight: CELL_H,
    chars: {} as Record<number, unknown>,
  };

  chars.forEach((ch, i) => {
    const gx = (i % PER_ROW) * CELL_W;
    const gy = Math.floor(i / PER_ROW) * CELL_H;
    glyphs[ch].forEach((row, y) => {
      for (let x = 0; x < GLYPH_W; x++) if (row[x] === '#') ctx.fillRect(gx + x, gy + y, 1, 1);
    });

    const glyph = {
      x: gx, y: gy, width: CELL_W, height: CELL_H,
      centerX: Math.floor(CELL_W / 2), centerY: Math.floor(CELL_H / 2),
      xOffset: 0, yOffset: 0, xAdvance: CELL_W, data: {}, kerning: {},
      u0: gx / canvas.width, v0: gy / canvas.height,
      u1: (gx + CELL_W) / canvas.width, v1: (gy + CELL_H) / canvas.height,
    };
    data.chars[ch.charCodeAt(0)] = glyph;
    const lower = ch.toLowerCase();
    if (foldLower && lower !== ch) data.chars[lower.charCodeAt(0)] = glyph;
  });

  scene.textures.addCanvas(key, canvas);
  scene.cache.bitmapFont.add(key, { data, texture: key, frame: null });
}

/**
 * Pixel text at an integer scale (2 = 12px advance, 16px line). `color` is a
 * tint; the glyph sheet itself is white. `font` CASED_FONT_KEY keeps lower case.
 */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale = 2,
  color: number = THEME.ui.text,
  font: string = FONT_KEY,
): Phaser.GameObjects.BitmapText {
  return scene.add
    .bitmapText(Math.round(x), Math.round(y), font, text, CELL_H * scale)
    .setTint(color)
    .setDropShadow(scale >= 3 ? 2 : 1, scale >= 3 ? 2 : 1, THEME.ui.panel, 0.85);
}

/** Change a pixel text's integer scale. */
export function setPixelScale(text: Phaser.GameObjects.BitmapText, scale: number): Phaser.GameObjects.BitmapText {
  return text.setFontSize(CELL_H * scale);
}
