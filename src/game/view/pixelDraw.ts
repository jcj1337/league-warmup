import Phaser from 'phaser';

const TAU = Math.PI * 2;

/**
 * A ring made of square pixel dots, snapped to whole pixels. The pixel-art
 * replacement for stroked circles: range rings, charge rings, telegraphs.
 * `from`/`to` draw only an arc.
 */
export function dottedRing(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  alpha: number,
  dot = 3,
  from = 0,
  to = TAU,
): void {
  if (r <= 0 || alpha <= 0) return;
  const span = to - from;
  const full = Math.abs(span) >= TAU - 1e-6;
  const n = Math.max(6, Math.round((Math.abs(span) * r) / (dot * 1.9)));
  const step = span / n;
  const half = dot / 2;
  g.fillStyle(color, Math.min(1, alpha));
  for (let i = 0; i < (full ? n : n + 1); i++) {
    const a = from + step * i;
    g.fillRect(Math.round(cx + Math.cos(a) * r - half), Math.round(cy + Math.sin(a) * r - half), dot, dot);
  }
}

/** A straight line of square pixel dots, `spacing` px apart, snapped to whole pixels. */
export function dottedLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  alpha: number,
  dot = 3,
  spacing = 8,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len <= 0 || alpha <= 0) return;
  const n = Math.max(1, Math.floor(len / spacing));
  const half = dot / 2;
  g.fillStyle(color, Math.min(1, alpha));
  for (let i = 0; i <= n; i++) {
    const t = (i * spacing) / len;
    g.fillRect(Math.round(x1 + (x2 - x1) * t - half), Math.round(y1 + (y2 - y1) * t - half), dot, dot);
  }
}

/** A solid, smooth ring (or arc, with `from`/`to`): the clean outline for the player's spells. */
export function smoothRing(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  alpha: number,
  width = 2,
  from = 0,
  to = TAU,
): void {
  if (r <= 0 || alpha <= 0) return;
  g.lineStyle(width, color, Math.min(1, alpha));
  g.beginPath();
  g.arc(cx, cy, r, from, to, false);
  g.strokePath();
}

/** A cone's solid, smooth outline: both sides and the arc. */
export function smoothWedge(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  angle: number,
  halfAngle: number,
  r: number,
  color: number,
  alpha: number,
  width = 2,
): void {
  if (r <= 0 || alpha <= 0) return;
  g.lineStyle(width, color, Math.min(1, alpha));
  g.strokePoints(wedgePoints(cx, cy, angle, halfAngle, r, 24), true, true);
}

/** The outline of a cone from (cx, cy): its tip, then the arc. For fillPoints. */
export function wedgePoints(cx: number, cy: number, angle: number, halfAngle: number, r: number, steps = 12): { x: number; y: number }[] {
  const pts = [{ x: cx, y: cy }];
  for (let i = 0; i <= steps; i++) {
    const a = angle - halfAngle + (2 * halfAngle * i) / steps;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** A cone's dotted edge: the arc and both sides. */
export function dottedWedge(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  angle: number,
  halfAngle: number,
  r: number,
  color: number,
  alpha: number,
): void {
  dottedRing(g, cx, cy, r, color, alpha, 3, angle - halfAngle, angle + halfAngle);
  for (const side of [-1, 1]) {
    const a = angle + side * halfAngle;
    dottedLine(g, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, color, alpha);
  }
}

/** A filled disc built from `cell`-sized squares — a chunky pixel orb. */
export function pixelDisc(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  alpha: number,
  cell = 3,
): void {
  if (r <= 0 || alpha <= 0) return;
  g.fillStyle(color, Math.min(1, alpha));
  const ox = Math.round(cx);
  const oy = Math.round(cy);
  const n = Math.ceil(r / cell);
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      if ((i * cell) ** 2 + (j * cell) ** 2 > r * r) continue;
      g.fillRect(ox + i * cell - cell / 2, oy + j * cell - cell / 2, cell, cell);
    }
  }
}

export interface PanelStyle {
  fill: number;
  fillAlpha: number;
  edge: number;
  highlight?: number;
  /** Border thickness in pixels. */
  border?: number;
}

/** A pixel-art HUD plate: square fill, notched corners, crisp border, top highlight. */
export function pixelPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  style: PanelStyle,
): void {
  const b = style.border ?? 2;
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);

  g.fillStyle(style.fill, style.fillAlpha);
  g.fillRect(x + b, y + b, w - b * 2, h - b * 2);

  g.fillStyle(style.edge, 1);
  g.fillRect(x + b * 2, y, w - b * 4, b);
  g.fillRect(x + b * 2, y + h - b, w - b * 4, b);
  g.fillRect(x, y + b * 2, b, h - b * 4);
  g.fillRect(x + w - b, y + b * 2, b, h - b * 4);
  // Notched corners.
  g.fillRect(x + b, y + b, b, b);
  g.fillRect(x + w - b * 2, y + b, b, b);
  g.fillRect(x + b, y + h - b * 2, b, b);
  g.fillRect(x + w - b * 2, y + h - b * 2, b, b);

  if (style.highlight !== undefined) {
    g.fillStyle(style.highlight, 0.55);
    g.fillRect(x + b * 2, y + b, w - b * 4, 1);
  }
}
