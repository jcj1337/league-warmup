import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { GLYPHS, GLYPH_H, GLYPH_W } from './glyphs';

export const FONT_KEY = 'pixel-font';

/** One glyph cell: the 5×7 glyph plus a pixel of spacing right and below. */
const CELL_W = GLYPH_W + 1;
const CELL_H = GLYPH_H + 1;
const PER_ROW = 16;

/**
 * Build the bitmap font from the glyph table once per game: a white glyph
 * sheet (tinted per use) plus BitmapText font data. Lower-case letters share
 * the upper-case glyphs.
 */
export function ensureFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return;

  const chars = Object.keys(GLYPHS);
  const rows = Math.ceil(chars.length / PER_ROW);
  const canvas = document.createElement('canvas');
  canvas.width = PER_ROW * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';

  const data = {
    retroFont: true,
    font: FONT_KEY,
    size: CELL_H,
    lineHeight: CELL_H,
    chars: {} as Record<number, unknown>,
  };

  chars.forEach((ch, i) => {
    const gx = (i % PER_ROW) * CELL_W;
    const gy = Math.floor(i / PER_ROW) * CELL_H;
    GLYPHS[ch].forEach((row, y) => {
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
    if (lower !== ch) data.chars[lower.charCodeAt(0)] = glyph;
  });

  scene.textures.addCanvas(FONT_KEY, canvas);
  scene.cache.bitmapFont.add(FONT_KEY, { data, texture: FONT_KEY, frame: null });
}

/**
 * Pixel text at an integer scale (2 = 12px advance, 16px line). `color` is a
 * tint; the glyph sheet itself is white.
 */
export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale = 2,
  color: number = THEME.ui.text,
): Phaser.GameObjects.BitmapText {
  return scene.add
    .bitmapText(Math.round(x), Math.round(y), FONT_KEY, text, CELL_H * scale)
    .setTint(color)
    .setDropShadow(scale >= 3 ? 2 : 1, scale >= 3 ? 2 : 1, THEME.ui.panel, 0.85);
}

/** Change a pixel text's integer scale. */
export function setPixelScale(text: Phaser.GameObjects.BitmapText, scale: number): Phaser.GameObjects.BitmapText {
  return text.setFontSize(CELL_H * scale);
}
