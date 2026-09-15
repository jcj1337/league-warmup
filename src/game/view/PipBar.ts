import Phaser from 'phaser';
import { THEME } from '../../config/theme';

/**
 * A segmented pixel health bar: one cell per health pip, so the number of hits
 * left reads at a glance.
 *
 *   3 pips:              [■][■][■]
 *   after one hit:       [■][■][ ]
 *
 * Dark plate, two-tone filled cells (bright top, darker bottom) in the enemy
 * red, hollow dark cells for lost pips, and a brief pale flash on a pip as it
 * is lost. Pure view — handed the numbers every frame, never changes them.
 */
export class PipBar {
  /** Readouts for inspection: total cells drawn, and how many are filled. */
  segments = 0;
  filled = 0;

  private readonly g: Phaser.GameObjects.Graphics;
  /** Visual ms at which each cell was lost, for the loss flash. */
  private lostAt: number[] = [];
  private visualMs = 0;

  constructor(scene: Phaser.Scene, depth: number = THEME.depth.bars) {
    this.g = scene.add.graphics().setDepth(depth);
  }

  /**
   * `cx` is the bar's centre, `y` the top of its cells. `pips` is clamped to
   * `maxPips`, so an over-full enemy simply shows every cell filled.
   */
  update(cx: number, y: number, pips: number, maxPips: number, deltaSeconds: number): void {
    const B = THEME.pipBar;
    this.visualMs += deltaSeconds * 1000;

    const segments = Math.max(1, Math.floor(maxPips));
    const filled = Phaser.Math.Clamp(Math.ceil(pips), 0, segments);

    if (segments !== this.segments) {
      this.lostAt = new Array(segments).fill(Number.NEGATIVE_INFINITY);
    } else {
      for (let i = filled; i < this.filled; i++) this.lostAt[i] = this.visualMs;
    }
    this.segments = segments;
    this.filled = filled;

    const width = segments * B.cellW + (segments - 1) * B.gap;
    const left = Math.round(cx - width / 2);
    const top = Math.round(y);
    const half = Math.floor(B.cellH / 2);

    const g = this.g.clear();
    g.fillStyle(B.back, 1);
    g.fillRect(left - B.border, top - B.border, width + B.border * 2, B.cellH + B.border * 2);

    for (let i = 0; i < segments; i++) {
      const x = left + i * (B.cellW + B.gap);
      if (i < filled) {
        g.fillStyle(B.top, 1);
        g.fillRect(x, top, B.cellW, half);
        g.fillStyle(B.bottom, 1);
        g.fillRect(x, top + half, B.cellW, B.cellH - half);
      } else {
        const flash = 1 - (this.visualMs - this.lostAt[i]) / B.lossFlashMs;
        g.fillStyle(flash > 0 ? B.lossFlash : B.empty, flash > 0 ? Math.max(0.35, flash) : 1);
        g.fillRect(x, top, B.cellW, B.cellH);
      }
    }
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
