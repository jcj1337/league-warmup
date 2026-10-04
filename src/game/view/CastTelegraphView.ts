import Phaser from 'phaser';
import type { CastTelegraph, FxKey } from '../../champions/types';
import { THEME } from '../../config/theme';
import { dottedLine, dottedWedge, wedgePoints } from './pixelDraw';

/**
 * A slot's cast telegraph (AbilityDef.telegraph): the shape the spell will
 * strike, drawn on the ground from the player toward the aim for as long as
 * the cast window runs, its fill sweeping out with the cast's progress, in
 * the slot's fx colours. A pure read of the cast: the scene hands it the live
 * aim (which a mid-cast Flash carries along) every frame.
 */
export class CastTelegraphView {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
  }

  draw(telegraph: CastTelegraph | null, slotFx: FxKey, x: number, y: number, aimX: number, aimY: number, progress: number): void {
    const g = this.gfx;
    g.clear();
    if (!telegraph) return;
    const T = THEME.castTelegraph;
    const f = THEME.fx[telegraph.fx ?? slotFx];
    const angle = Math.atan2(aimY - y, aimX - x);
    const fillAlpha = Phaser.Math.Linear(T.fillAlphaStart, T.fillAlphaEnd, progress);
    const edgeAlpha = Phaser.Math.Linear(T.edgeAlphaStart, T.edgeAlphaEnd, progress);

    if (telegraph.kind === 'cone') {
      const radius = telegraph.radius();
      const half = telegraph.halfAngle();
      g.fillStyle(f.deep, fillAlpha);
      g.fillPoints(wedgePoints(x, y, angle, half, radius), true);
      g.fillStyle(f.color, T.coreAlpha);
      g.fillPoints(wedgePoints(x, y, angle, half, radius * progress), true);
      dottedWedge(g, x, y, angle, half, radius, f.color, edgeAlpha);
      return;
    }

    // A line: a strip from the player, the fill running out along it.
    const length = telegraph.length();
    const hw = telegraph.halfWidth();
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy * hw;
    const ny = dx * hw;
    const strip = (len: number) => [
      { x: x + nx, y: y + ny },
      { x: x + dx * len + nx, y: y + dy * len + ny },
      { x: x + dx * len - nx, y: y + dy * len - ny },
      { x: x - nx, y: y - ny },
    ];
    g.fillStyle(f.deep, fillAlpha);
    g.fillPoints(strip(length), true);
    g.fillStyle(f.color, T.coreAlpha);
    g.fillPoints(strip(length * progress), true);
    for (const side of [-1, 1]) {
      dottedLine(g, x + nx * side, y + ny * side, x + dx * length + nx * side, y + dy * length + ny * side, f.color, edgeAlpha);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
