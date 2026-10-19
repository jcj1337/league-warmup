import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME, propDepth } from '../../config/theme';
import { addCanvasTexture, mulberry32 } from '../art/pixel';
import { TEX } from '../art/textures';

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

interface PropSpec {
  key: string;
  shadow: string | null;
  spacing: number;
}

const PROPS: Record<string, PropSpec> = {
  rockLarge: { key: TEX.props.rockLarge, shadow: TEX.shadow.l, spacing: 1 },
  rockSmall: { key: TEX.props.rockSmall, shadow: TEX.shadow.m, spacing: 0.7 },
  emberRock: { key: TEX.props.emberRock, shadow: TEX.shadow.m, spacing: 0.7 },
  deadShrub: { key: TEX.props.deadShrub, shadow: TEX.shadow.s, spacing: 0.8 },
};

/**
 * The battlefield: a quiet, dark ash waste plus a handful of decorative props.
 *
 * Built to stay out of the way. The ground is low-contrast ash with a few
 * scorched patches, hairline cracks (some with a dim ember seam) and sparse
 * pebbles; the centre stays clean. Props are few, kept out of the HUD strips,
 * and drawn in a depth band below every combatant.
 *
 * Visual only. Props have no collision, never block movement or projectiles.
 * Everything is generated from a fixed seed with its own RNG, so the field
 * looks the same every run and gameplay randomness is untouched.
 *
 * The ground is painted once at art resolution (1 texel = THEME.art.scale
 * world pixels) and cached as a texture, so restarts reuse it for free.
 */
export class Battlefield {
  readonly ground: Phaser.GameObjects.Image;
  readonly props: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene) {
    const S = THEME.art.scale;
    scene.cameras.main.setBackgroundColor(THEME.battlefield.void);

    if (!scene.textures.exists(TEX.ground)) {
      addCanvasTexture(scene, TEX.ground, paintGround(THEME.battlefield.seed));
    }
    this.ground = scene.add.image(0, 0, TEX.ground).setOrigin(0, 0).setScale(S).setDepth(THEME.depth.ground);

    this.placeProps(scene, mulberry32(THEME.battlefield.seed ^ 0x9e3779b9));
  }

  private placeProps(scene: Phaser.Scene, rand: () => number): void {
    const S = THEME.art.scale;
    const cfg = THEME.battlefield.props;
    const margin = ARENA.padding + 40;
    const placed: Array<{ x: number; y: number; spacing: number }> = [];

    for (const [name, count] of Object.entries(cfg.counts)) {
      const spec = PROPS[name];
      if (!spec) continue;
      for (let n = 0; n < count; n++) {
        for (let attempt = 0; attempt < 40; attempt++) {
          const x = margin + rand() * (ARENA.width - margin * 2);
          const y = margin + rand() * (ARENA.height - margin * 2);
          if (Math.hypot(x - ARENA.width / 2, y - ARENA.height / 2) < cfg.clearCenterRadius) continue;
          if (y < cfg.hudTop || y > cfg.hudBottom) continue;
          const spacing = cfg.minSpacing * spec.spacing;
          if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(spacing, p.spacing))) continue;

          placed.push({ x, y, spacing });
          const px = Math.round(x / S) * S;
          const py = Math.round(y / S) * S;
          if (spec.shadow) {
            scene.add.image(px, py - S, spec.shadow).setScale(S).setDepth(THEME.depth.shadow);
          }
          this.props.push(
            scene.add
              .image(px, py, spec.key)
              .setOrigin(0.5, 1)
              .setScale(S)
              .setFlipX(rand() < 0.5)
              .setDepth(propDepth(py)),
          );
          break;
        }
      }
    }
  }
}

/** Paint the ground at art resolution. Deterministic for a given seed. */
function paintGround(seed: number): HTMLCanvasElement {
  const S = THEME.art.scale;
  const W = Math.ceil(ARENA.width / S);
  const H = Math.ceil(ARENA.height / S);
  const pad = Math.round(ARENA.padding / S);
  const rand = mulberry32(seed);
  const B = THEME.battlefield;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const put = (x: number, y: number, color: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    img.data[i] = (color >> 16) & 0xff;
    img.data[i + 1] = (color >> 8) & 0xff;
    img.data[i + 2] = color & 0xff;
    img.data[i + 3] = 255;
  };
  const inPlay = (x: number, y: number) => x >= pad && y >= pad && x < W - pad && y < H - pad;
  const nearCentre = (x: number, y: number, r: number) => Math.hypot(x - W / 2, y - H / 2) < r;
  const bayer = (x: number, y: number) => (BAYER4[y % 4][x % 4] + 0.5) / 16;

  const coarse = valueNoise(W, H, 28, rand);
  const fine = valueNoise(W, H, 9, rand);

  // 1. Ash: broad, low-contrast tone drift with ordered dithering at the boundaries.
  const tones = B.ashTones;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = Phaser.Math.Clamp(coarse(x, y) * 0.8 + fine(x, y) * 0.2, 0, 0.999);
      const idx = Phaser.Math.Clamp(Math.floor(n * tones.length + (bayer(x, y) - 0.5) * 0.8), 0, tones.length - 1);
      put(x, y, tones[idx]);
    }
  }

  // 2. Scorched patches, dithered out at the rim, away from the centre.
  for (let i = 0; i < B.scorchPatches; i++) {
    const cx = pad + 24 + rand() * (W - pad * 2 - 48);
    const cy = pad + 24 + rand() * (H - pad * 2 - 48);
    const r = 7 + rand() * 7;
    if (nearCentre(cx, cy, B.clearCenterArt + r)) continue;
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
      for (let x = Math.floor(cx - r * 1.4 - 2); x <= cx + r * 1.4 + 2; x++) {
        if (!inPlay(x, y)) continue;
        const dist = Math.hypot((x - cx) / 1.4, y - cy) / r + (fine(x, y) - 0.5) * 0.5;
        if (dist >= 1) continue;
        if (dist > 0.65 && bayer(x, y) < (dist - 0.65) / 0.35) continue;
        put(x, y, B.scorch);
      }
    }
  }

  // 3. Hairline cracks. Some carry a dim ember seam through their middle.
  const crack = (sx: number, sy: number, angle: number, length: number, ember: boolean, branch: boolean) => {
    let x = sx;
    let y = sy;
    let a = angle;
    for (let s = 0; s < length; s++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a);
      y += Math.sin(a);
      const px = Math.round(x);
      const py = Math.round(y);
      if (!inPlay(px, py) || nearCentre(px, py, B.clearCenterArt)) return;
      const mid = s > length * 0.3 && s < length * 0.7;
      put(px, py, ember && mid ? (rand() < 0.2 ? B.lavaGlow : B.lavaDim) : B.crack);
      if (branch && s === Math.floor(length * 0.5) && rand() < 0.6) {
        crack(x, y, a + (rand() < 0.5 ? -0.9 : 0.9), Math.floor(length * 0.4), false, false);
      }
    }
  };
  for (let i = 0; i < B.cracks; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = pad + 6 + rand() * (W - pad * 2 - 12);
      const y = pad + 6 + rand() * (H - pad * 2 - 12);
      if (nearCentre(x, y, B.clearCenterArt + 12)) continue;
      crack(x, y, rand() * Math.PI * 2, 16 + Math.floor(rand() * 26), rand() < B.emberCrackChance, true);
      break;
    }
  }

  // 4. Sparse pebbles and the odd dim ember speck. The centre stays clean.
  for (let y = pad; y < H - pad; y++) {
    for (let x = pad; x < W - pad; x++) {
      const r = rand();
      if (nearCentre(x, y, B.clearCenterArt)) continue;
      if (r < B.pebbleDensity) {
        put(x, y, B.pebble);
        put(x, y + 1, B.scorch);
      } else if (r < B.pebbleDensity + B.emberDensity) {
        put(x, y, B.lavaGlow);
      }
    }
  }

  // 5. Basalt band in the non-playable padding: a lit lip, a few dull embers,
  //    and a shadow line on the ash so the boundary reads clearly.
  const rockNoise = valueNoise(W, H, 5, rand);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (inPlay(x, y)) continue;
      const n = rockNoise(x, y);
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      let c: number = n < 0.4 ? B.border.deep : n < 0.75 ? B.border.dark : B.border.mid;
      if (edge === pad - 1) c = B.border.lip;
      else if (edge === pad - 2 && n > 0.55) c = B.border.mid;
      else if (rand() < 0.004) c = B.border.ember;
      put(x, y, c);
    }
  }
  for (let x = pad; x < W - pad; x++) {
    put(x, pad, B.crack);
    put(x, H - pad - 1, B.crack);
  }
  for (let y = pad; y < H - pad; y++) {
    put(pad, y, B.crack);
    put(W - pad - 1, y, B.crack);
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Smooth 2D value noise in [0,1] on a grid of `cell` art pixels. */
function valueNoise(w: number, h: number, cell: number, rand: () => number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const g = (i: number, j: number) => grid[Phaser.Math.Clamp(j, 0, gh - 1) * gw + Phaser.Math.Clamp(i, 0, gw - 1)];
    const a = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * tx;
    const b = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * tx;
    return a + (b - a) * ty;
  };
}
