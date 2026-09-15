import Phaser from 'phaser';
import { THEME } from '../../config/theme';

/** One drawn segment, for inspection. `x` is relative to the bar's left edge. */
export interface PipCell {
  x: number;
  w: number;
  filled: boolean;
}

/**
 * A segmented pixel health bar of constant total width: the bar is split into
 * one equal segment per health pip, so more pips means more dividers, never a
 * wider bar.
 *
 *   1 pip:   [############]
 *   2 pips:  [#####|#####]
 *   3 pips:  [###|###|###]
 *   after one hit on 3:  [###|###|   ]
 *
 * Dark plate, two-tone filled segments (bright top, darker bottom) in the enemy
 * red, hollow dark segments for lost pips, and a brief pale flash on a pip as it
 * is lost. When whole pixels cannot split the width exactly, segments differ by
 * at most 1px. Pure view — handed the numbers every frame, never changes them.
 */
export class PipBar {
  /** Readouts for inspection: segments drawn, how many are filled, total inner width and each segment. */
  segments = 0;
  filled = 0;
  width: number = THEME.pipBar.width;
  cells: PipCell[] = [];

  private readonly g: Phaser.GameObjects.Graphics;
  /** Visual ms at which each segment was lost, for the loss flash. */
  private lostAt: number[] = [];
  private visualMs = 0;

  constructor(scene: Phaser.Scene, depth: number = THEME.depth.bars) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /**
   * `cx` is the bar's centre, `y` the top of its segments. `pips` is clamped to
   * `maxPips`, so an over-full enemy simply shows every segment filled.
   */
  update(cx: number, y: number, pips: number, maxPips: number, deltaSeconds: number): void {
    const B = THEME.pipBar;
    this.visualMs += deltaSeconds * 1000;

    const segments = Math.max(1, Math.floor(maxPips));
    const filled = Phaser.Math.Clamp(Math.ceil(pips), 0, segments);

    if (segments !== this.segments) {
      this.lostAt = new Array(segments).fill(Number.NEGATIVE_INFINITY);
      this.cells = PipBar.layout(B.width, B.gap, segments);
    } else {
      for (let i = filled; i < this.filled; i++) this.lostAt[i] = this.visualMs;
    }
    this.segments = segments;
    this.filled = filled;
    this.width = B.width;

    const left = Math.round(cx - B.width / 2);
    const top = Math.round(y);
    const half = Math.floor(B.cellH / 2);

    const g = this.g.clear();
    g.fillStyle(B.back, 1);
    g.fillRect(left - B.border, top - B.border, B.width + B.border * 2, B.cellH + B.border * 2);

    for (let i = 0; i < segments; i++) {
      const cell = this.cells[i];
      cell.filled = i < filled;
      const x = left + cell.x;
      if (cell.filled) {
        g.fillStyle(B.top, 1);
        g.fillRect(x, top, cell.w, half);
        g.fillStyle(B.bottom, 1);
        g.fillRect(x, top + half, cell.w, B.cellH - half);
      } else {
        const flash = 1 - (this.visualMs - this.lostAt[i]) / B.lossFlashMs;
        g.fillStyle(flash > 0 ? B.lossFlash : B.empty, flash > 0 ? Math.max(0.35, flash) : 1);
        g.fillRect(x, top, cell.w, B.cellH);
      }
    }
  }

  /**
   * Split `width` into `segments` whole-pixel cells separated by `gap`-pixel
   * dividers. Boundaries are rounded from the exact split, so the first cell
   * starts at 0, the last ends at `width`, and cell widths differ by at most 1.
   */
  static layout(width: number, gap: number, segments: number): PipCell[] {
    const pitch = (width + gap) / segments;
    const cells: PipCell[] = [];
    for (let i = 0; i < segments; i++) {
      const x = Math.round(i * pitch);
      const end = i === segments - 1 ? width : Math.round((i + 1) * pitch) - gap;
      cells.push({ x, w: Math.max(1, end - x), filled: true });
    }
    return cells;
  }

  setVisible(visible: boolean): void {
    this.g.setVisible(visible);
  }

  get visible(): boolean {
    return this.g.visible;
  }

  destroy(): void {
    this.g.destroy();
  }
}
