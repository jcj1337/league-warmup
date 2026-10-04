import Phaser from 'phaser';
import type { CastTelegraph } from '../../champions/types';
import { THEME } from '../../config/theme';
import { dottedWedge, wedgePoints } from './pixelDraw';

/**
 * A slot's cast telegraph (AbilityDef.telegraph): the shape the spell will
 * strike, drawn on the ground from the player toward the aim for as long as
 * the cast window runs, its fill sweeping out with the cast's progress. A pure
 * read of the cast: the scene hands it the live aim (which a mid-cast Flash
 * carries along) every frame.
 */
export class CastTelegraphView {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
  }

  draw(telegraph: CastTelegraph | null, x: number, y: number, aimX: number, aimY: number, progress: number): void {
    const g = this.gfx;
    g.clear();
    if (!telegraph) return;
    const Z = THEME.playerZone;
    const angle = Math.atan2(aimY - y, aimX - x);
    const radius = telegraph.radius();
    const half = telegraph.halfAngle();
    g.fillStyle(Z.fill, Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, progress));
    g.fillPoints(wedgePoints(x, y, angle, half, radius), true);
    g.fillStyle(Z.core, Z.coreAlpha);
    g.fillPoints(wedgePoints(x, y, angle, half, radius * progress), true);
    dottedWedge(g, x, y, angle, half, radius, Z.edge, Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, progress));
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
