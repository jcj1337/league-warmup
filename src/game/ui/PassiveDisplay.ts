import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';

/**
 * The Q passive readout: a row of stack pips with a thin duration bar beneath,
 * sitting just above the ability bar.
 *
 * Pure view. It is handed the live stack count and remaining fraction each
 * frame and derives nothing — PassiveSystem stays the only authority.
 */
export class PassiveDisplay {
  private readonly pips: Phaser.GameObjects.Arc[] = [];
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, maxStacks: number, centerY: number) {
    const p = THEME.passive;
    const totalWidth = (maxStacks - 1) * p.pipGap;
    const left = ARENA.width / 2 - totalWidth / 2;

    for (let i = 0; i < maxStacks; i++) {
      this.pips.push(
        scene.add
          .circle(left + i * p.pipGap, centerY, p.pipRadius, p.pipEmpty)
          .setStrokeStyle(1, p.pipStroke, 0.9)
          .setDepth(101),
      );
    }

    const barY = centerY + 11;
    this.barBg = scene.add
      .rectangle(ARENA.width / 2, barY, p.barWidth, p.barHeight, 0x000000, 0.5)
      .setDepth(100)
      .setVisible(false);
    this.bar = scene.add
      .rectangle(ARENA.width / 2 - p.barWidth / 2, barY, p.barWidth, p.barHeight, p.barColor)
      .setOrigin(0, 0.5)
      .setDepth(101)
      .setVisible(false);
  }

  update(stacks: number, remainingFraction: number): void {
    const p = THEME.passive;

    this.pips.forEach((pip, i) => {
      const filled = i < stacks;
      pip.setFillStyle(filled ? p.pipFilled : p.pipEmpty);
      pip.setScale(filled ? 1.12 : 1);
      pip.setAlpha(filled ? 1 : 0.55);
    });

    // The bar exists only while the buff does; it refills on every refresh.
    const active = stacks > 0 && remainingFraction > 0;
    this.barBg.setVisible(active);
    this.bar.setVisible(active);
    if (active) this.bar.width = p.barWidth * remainingFraction;
  }
}
