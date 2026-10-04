import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';

/**
 * The passive readout: a row of stack gems with a thin duration bar beneath,
 * sitting just above the ability bar.
 *
 * Pure view. It is handed the live stack count and remaining fraction each
 * frame and derives nothing — PassiveSystem stays the only authority.
 */
export class PassiveDisplay {
  private readonly pips: Phaser.GameObjects.Image[] = [];
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, maxStacks: number, centerY: number) {
    const p = THEME.passive;
    const totalWidth = (maxStacks - 1) * p.pipGap;
    const left = Math.round(ARENA.width / 2 - totalWidth / 2);

    for (let i = 0; i < maxStacks; i++) {
      this.pips.push(scene.add.image(left + i * p.pipGap, centerY, TEX.ui.gemEmpty).setScale(2).setDepth(101));
    }

    const barY = centerY + 10;
    const barLeft = Math.round(ARENA.width / 2 - p.barWidth / 2);
    this.barBg = scene.add
      .rectangle(barLeft - 1, barY - 1, p.barWidth + 2, p.barHeight + 2, THEME.ui.panel, 0.9)
      .setOrigin(0, 0)
      .setDepth(100)
      .setVisible(false);
    this.bar = scene.add
      .rectangle(barLeft, barY, p.barWidth, p.barHeight, p.barColor)
      .setOrigin(0, 0)
      .setDepth(101)
      .setVisible(false);
  }

  update(stacks: number, remainingFraction: number): void {
    const p = THEME.passive;

    this.pips.forEach((pip, i) => {
      const filled = i < stacks;
      pip.setTexture(filled ? TEX.ui.gem : TEX.ui.gemEmpty).setAlpha(filled ? 1 : 0.8);
    });

    // The bar exists only while the buff does; it refills on every refresh.
    const active = stacks > 0 && remainingFraction > 0;
    this.barBg.setVisible(active);
    this.bar.setVisible(active);
    if (active) this.bar.setSize(Math.max(1, Math.round(p.barWidth * remainingFraction)), p.barHeight);
  }

  destroy(): void {
    for (const pip of this.pips) pip.destroy();
    this.barBg.destroy();
    this.bar.destroy();
  }
}
