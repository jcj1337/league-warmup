import Phaser from 'phaser';

/** A palette entry: a colour, or [colour, alpha] for translucent pixels. */
export type PixelColor = number | readonly [number, number];

/**
 * One small pixel sprite: one string per row, one character per pixel, `.` is
 * transparent and every other character is looked up in `pal`.
 */
export interface PixelSprite {
  rows: readonly string[];
  pal: Readonly<Record<string, PixelColor>>;
}

/** Rasterise a pixel sprite to a canvas at 1 art pixel = 1 canvas pixel. */
export function spriteToCanvas(key: string, sprite: PixelSprite): HTMLCanvasElement {
  const h = sprite.rows.length;
  const w = sprite.rows[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);

  sprite.rows.forEach((row, y) => {
    // Authoring guard: a ragged row means a mistyped sprite, so fail loudly.
    if (row.length !== w) throw new Error(`pixel sprite "${key}" row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const entry = sprite.pal[ch];
      if (entry === undefined) throw new Error(`pixel sprite "${key}" uses unmapped character "${ch}"`);
      const [color, alpha] = typeof entry === 'number' ? [entry, 1] : entry;
      const i = (y * w + x) * 4;
      img.data[i] = (color >> 16) & 0xff;
      img.data[i + 1] = (color >> 8) & 0xff;
      img.data[i + 2] = color & 0xff;
      img.data[i + 3] = Math.round(alpha * 255);
    }
  });

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Register a pixel sprite as a texture, once per game (textures outlive scene restarts). */
export function addPixelTexture(scene: Phaser.Scene, key: string, sprite: PixelSprite): void {
  if (scene.textures.exists(key)) return;
  addCanvasTexture(scene, key, spriteToCanvas(key, sprite));
}

/**
 * Register a finished canvas as a texture. Not `textures.addCanvas`: that makes a
 * CanvasTexture, which reads every pixel straight back (getImageData) for pixel editing
 * we never do, a GPU readback per texture at boot. A plain texture has no base frame
 * until one is added; images need it.
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  scene.textures.create(key, canvas, canvas.width, canvas.height)?.add('__BASE', 0, 0, 0, canvas.width, canvas.height);
}

/**
 * Small deterministic RNG for decoration and effects. Kept separate from
 * Math.random / Phaser's RNG so visuals can never shift gameplay randomness.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Snap an angle to one of `directions` evenly spaced headings. */
export function snapAngle(angle: number, directions: number): number {
  const step = (Math.PI * 2) / directions;
  return Math.round(angle / step) * step;
}
