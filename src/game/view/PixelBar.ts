import Phaser from 'phaser';
import { THEME } from '../../config/theme';

export interface BarColors {
  top: number;
  bottom: number;
}

/**
 * A compact pixel health bar: dark border plate, two-tone fill (bright top
 * half, darker bottom half) and a pale ghost layer that trails behind damage.
 * Whole-pixel aligned. Pure view — it is handed the numbers every frame.
 */
export class PixelBar {
  private readonly back: Phaser.GameObjects.Rectangle;
  private readonly ghost: Phaser.GameObjects.Rectangle;
  private readonly top: Phaser.GameObjects.Rectangle;
  private readonly bottom: Phaser.GameObjects.Rectangle;
  private readonly height: number;
  private readonly border: number;

  constructor(
    scene: Phaser.Scene,
    private readonly width: number,
    colors: BarColors,
    depth: number = THEME.depth.bars,
    height: number = THEME.hpBar.height,
    border: number = THEME.hpBar.border,
  ) {
    this.height = height;
    this.border = border;
    const half = Math.floor(height / 2);
    this.back = scene.add
      .rectangle(0, 0, width + border * 2, height + border * 2, THEME.hpBar.back, 1)
      .setOrigin(0, 0)
      .setDepth(depth);
    this.ghost = scene.add.rectangle(0, 0, width, height, THEME.hpBar.ghost, 0.85).setOrigin(0, 0).setDepth(depth);
    this.top = scene.add.rectangle(0, 0, width, half, colors.top).setOrigin(0, 0).setDepth(depth);
    this.bottom = scene.add.rectangle(0, 0, width, height - half, colors.bottom).setOrigin(0, 0).setDepth(depth);
  }

  /** `cx` is the bar's centre, `y` the top of its fill. Fractions are 0..1. */
  update(cx: number, y: number, fraction: number, ghostFraction = fraction): void {
    const left = Math.round(cx - this.width / 2);
    const top = Math.round(y);
    const half = Math.floor(this.height / 2);
    const fill = this.fillWidth(fraction);
    const ghost = this.fillWidth(ghostFraction);

    this.back.setPosition(left - this.border, top - this.border);
    this.ghost.setPosition(left, top).setVisible(ghost > fill).setSize(ghost, this.height);
    this.top.setPosition(left, top).setVisible(fill > 0).setSize(fill, half);
    this.bottom.setPosition(left, top + half).setVisible(fill > 0).setSize(fill, this.height - half);
  }

  setColors(colors: BarColors): void {
    this.top.setFillStyle(colors.top);
    this.bottom.setFillStyle(colors.bottom);
  }

  setVisible(visible: boolean): void {
    this.back.setVisible(visible);
    if (!visible) {
      this.ghost.setVisible(false);
      this.top.setVisible(false);
      this.bottom.setVisible(false);
    }
  }

  setDepth(depth: number): void {
    for (const r of [this.back, this.ghost, this.top, this.bottom]) r.setDepth(depth);
  }

  destroy(): void {
    this.back.destroy();
    this.ghost.destroy();
    this.top.destroy();
    this.bottom.destroy();
  }

  /** Whole pixels, and never an empty bar for a unit that is still alive. */
  private fillWidth(fraction: number): number {
    const f = Phaser.Math.Clamp(fraction, 0, 1);
    if (f <= 0) return 0;
    return Math.max(1, Math.round(this.width * f));
  }
}
