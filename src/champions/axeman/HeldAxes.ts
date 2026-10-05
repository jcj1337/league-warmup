import type Phaser from 'phaser';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../../game/art/textures';

/**
 * The spinning axes in his hands: one at his side while he holds one, one at
 * each side while he holds two. Reads the count and his position; changes
 * nothing.
 */
export class HeldAxes {
  private readonly axes: Phaser.GameObjects.Image[];
  private turn = 0;
  private ms = 0;
  /** How many are drawn, for inspection. */
  shown = 0;

  constructor(scene: Phaser.Scene) {
    this.axes = [0, 1].map(() => scene.add.image(0, 0, TEX.proj.spinAxe).setScale(THEME.art.scale).setVisible(false));
  }

  sync(x: number, y: number, count: number, deltaSeconds: number): void {
    const H = THEME.axeman.held;
    this.shown = count;
    this.ms += deltaSeconds * 1000;
    this.turn += deltaSeconds * H.turnsPerSecond * Math.PI * 2;
    this.axes.forEach((axe, i) => {
      if (i >= count) {
        axe.setVisible(false);
        return;
      }
      // The first is on his right; the second mirrors it, turning the other way, half a bob out of step.
      const side = i === 0 ? 1 : -1;
      const bob = Math.sin((this.ms / H.bobMs) * Math.PI * 2 + i * Math.PI) * H.bobPx;
      axe
        .setVisible(true)
        .setFlipX(side < 0)
        .setPosition(Math.round(x + side * H.sidePx), Math.round(y - H.liftPx + bob))
        .setRotation(side * this.turn)
        .setDepth(actorDepth(y) + 0.00005);
    });
  }

  hide(): void {
    this.shown = 0;
    for (const axe of this.axes) axe.setVisible(false);
  }
}
