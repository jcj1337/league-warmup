import Phaser from 'phaser';
import { SOVEREIGN } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Sovereign } from '../entities/Sovereign';
import { EnemyView, type EnemyArt } from './EnemyView';
import { dottedLine, pixelDisc } from './pixelDraw';

/**
 * The Sovereign (indigo-black slime, silver diadem). On top of the shared enemy
 * view:
 *
 *   - two small dark orbs circling her head (faster while she casts)
 *   - a sphere she holds with Force of Will, floating over her head / in flight
 *     (a held slime draws itself)
 *   - Scatter's exit lines: from every sphere it will fling, the red strip it
 *     will fly along, edged in void lavender
 *
 * Reads the entity only; never changes gameplay.
 */
export class SovereignView extends EnemyView {
  private readonly over: Phaser.GameObjects.Graphics;
  /** Plain readouts, for inspection. */
  readonly exits = { count: 0 };
  readonly heldSphere = { visible: false };

  constructor(scene: Phaser.Scene, private readonly sovereign: Sovereign, art: EnemyArt) {
    super(scene, sovereign, art);
    this.over = scene.add.graphics().setDepth(THEME.depth.fx);
  }

  protected override drawExtras(nowMs: number, bx: number, by: number): void {
    const T = THEME.sovereign;
    const D = THEME.darkSphere;
    const s = this.sovereign;
    const casting = s.castProgress(nowMs) >= 0;
    const top = by - this.sprite.displayHeight * this.art.originY;
    this.over.clear();

    // Orbiting orbs.
    const O = T.orbs;
    const spin = (this.visualMs / (casting ? O.spinMs / 3 : O.spinMs)) * Math.PI * 2;
    for (let i = 0; i < O.count; i++) {
      const a = spin + (i * Math.PI * 2) / O.count;
      const x = bx + Math.cos(a) * O.orbitPx;
      const y = top + O.liftPx + Math.sin(a) * 5;
      pixelDisc(this.over, x, y, O.radius, D.rim, 1, 3);
      pixelDisc(this.over, x, y, O.radius - 2, D.core, 1, 3);
    }

    // A sphere in her grip, or in flight.
    if (s.heldSpherePos) {
      const { x, y } = s.heldSpherePos;
      pixelDisc(this.over, x, y, D.radius + 4, D.glow, 0.4, 3);
      pixelDisc(this.over, x, y, D.radius, D.rim, 1, 3);
      pixelDisc(this.over, x, y, D.radius - 3, D.core, 1, 3);
      this.heldSphere.visible = true;
    } else {
      this.heldSphere.visible = false;
    }

    // Scatter: where each sphere will fly.
    const E = T.exitLine;
    const L = SOVEREIGN.scatter.launch;
    const t = Math.max(0, s.castProgress(nowMs));
    for (const line of s.exitLines) {
      const dx = Math.cos(line.angle);
      const dy = Math.sin(line.angle);
      const nx = -dy * L.radius;
      const ny = dx * L.radius;
      const ex = line.x + dx * L.range;
      const ey = line.y + dy * L.range;
      this.overlay.fillStyle(E.fill, Phaser.Math.Linear(E.fillAlphaStart, E.fillAlphaEnd, t));
      this.overlay.fillPoints([
        { x: line.x + nx, y: line.y + ny }, { x: ex + nx, y: ey + ny },
        { x: ex - nx, y: ey - ny }, { x: line.x - nx, y: line.y - ny },
      ], true);
      dottedLine(this.overlay, line.x + nx, line.y + ny, ex + nx, ey + ny, E.color, 0.5 + 0.5 * t);
      dottedLine(this.overlay, line.x - nx, line.y - ny, ex - nx, ey - ny, E.color, 0.5 + 0.5 * t);
    }
    this.exits.count = s.exitLines.length;
  }

  protected override hideExtras(): void {
    this.over.clear();
    this.exits.count = 0;
    this.heldSphere.visible = false;
  }

  override destroy(): void {
    this.over.destroy();
    super.destroy();
  }
}
