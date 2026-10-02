import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { SpellZone } from '../systems/HostileSpellSystem';
import { dottedLine, dottedRing } from './pixelDraw';

/**
 * Draws every placed hostile zone on the ground, in the Pursuer's telegraph
 * language: red ground that warms up across the delay, edged in the Magus's
 * arcane gold. A pure read of the zone list and its deadlines.
 *
 *   line   — a red strip that fills from the caster outward; it lands as the
 *            fill reaches the far end
 *   circle — a red disc with a ring closing in from the edge; the Eye's sweet
 *            spot is ringed separately in white-hot
 */
export class HostileSpellView {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
  }

  draw(zones: readonly SpellZone[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.spellZone;
    g.clear();

    for (const zone of zones) {
      const span = zone.resolveAt - zone.placedAt;
      const t = span > 0 ? Phaser.Math.Clamp((nowMs - zone.placedAt) / span, 0, 1) : 1;
      const fillAlpha = Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, t);
      const edgeAlpha = Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, t);

      if (zone.kind === 'line') {
        const dx = Math.cos(zone.angle);
        const dy = Math.sin(zone.angle);
        // Perpendicular, for the strip's two long edges.
        const nx = -dy * zone.halfWidth;
        const ny = dx * zone.halfWidth;
        const ex = zone.x + dx * zone.length;
        const ey = zone.y + dy * zone.length;
        const strip = (len: number) => [
          { x: zone.x + nx, y: zone.y + ny },
          { x: zone.x + dx * len + nx, y: zone.y + dy * len + ny },
          { x: zone.x + dx * len - nx, y: zone.y + dy * len - ny },
          { x: zone.x - nx, y: zone.y - ny },
        ];
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(strip(zone.length), true);
        // The fill racing to the far end is the countdown.
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(strip(zone.length * t), true);
        dottedLine(g, zone.x + nx, zone.y + ny, ex + nx, ey + ny, Z.edge, edgeAlpha);
        dottedLine(g, zone.x - nx, zone.y - ny, ex - nx, ey - ny, Z.edge, edgeAlpha);
        continue;
      }

      const cx = Math.round(zone.x);
      const cy = Math.round(zone.y);
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      dottedRing(g, cx, cy, zone.radius, Z.edge, edgeAlpha, 3);
      const inner = zone.centre ? zone.centre.radius : 0;
      dottedRing(g, cx, cy, Phaser.Math.Linear(zone.radius, inner + 4, t), Z.fill, 0.4 + 0.6 * t, 3);
      if (zone.centre) dottedRing(g, cx, cy, zone.centre.radius, Z.centre, edgeAlpha, 3);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
