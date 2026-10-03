import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { DarkSphere, SpellZone } from '../systems/HostileSpellSystem';
import { dottedLine, dottedRing, pixelDisc } from './pixelDraw';

/**
 * Draws every placed hostile zone on the ground, in the Pursuer's telegraph
 * language: red ground that warms up across the delay, edged in the caster's
 * colour (the Magus's arcane gold, or the Sovereign's void lavender). A pure
 * read of the zone list and its deadlines.
 *
 *   line   — a red strip that fills from the caster outward; it lands as the
 *            fill reaches the far end
 *   circle — a red disc with a ring closing in from the edge; the Eye's sweet
 *            spot is ringed separately in white-hot
 *   cone   — a red wedge from the caster, filling outward
 *
 * It also draws the Sovereign's Dark Spheres resting on the ground: near-black
 * orbs with a pale rim, pulsing, flickering through their last second.
 */
export class HostileSpellView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly sphereGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
    // Spheres sit above the ground overlays but beneath every unit and shot.
    this.sphereGfx = scene.add.graphics().setDepth(THEME.depth.groundFx + 0.5);
  }

  draw(zones: readonly SpellZone[], spheres: readonly DarkSphere[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.spellZone;
    g.clear();

    for (const zone of zones) {
      const span = zone.resolveAt - zone.placedAt;
      const t = span > 0 ? Phaser.Math.Clamp((nowMs - zone.placedAt) / span, 0, 1) : 1;
      const fillAlpha = Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, t);
      const edgeAlpha = Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, t);
      const edge = zone.style === 'void' ? Z.voidEdge : Z.edge;

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
        dottedLine(g, zone.x + nx, zone.y + ny, ex + nx, ey + ny, edge, edgeAlpha);
        dottedLine(g, zone.x - nx, zone.y - ny, ex - nx, ey - ny, edge, edgeAlpha);
        continue;
      }

      if (zone.kind === 'cone') {
        const wedge = (r: number) => {
          const pts = [{ x: zone.x, y: zone.y }];
          const steps = 12;
          for (let i = 0; i <= steps; i++) {
            const a = zone.angle - zone.halfAngle + (2 * zone.halfAngle * i) / steps;
            pts.push({ x: zone.x + Math.cos(a) * r, y: zone.y + Math.sin(a) * r });
          }
          return pts;
        };
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(wedge(zone.radius), true);
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(wedge(zone.radius * t), true);
        dottedRing(g, zone.x, zone.y, zone.radius, edge, edgeAlpha, 3, zone.angle - zone.halfAngle, zone.angle + zone.halfAngle);
        for (const side of [-1, 1]) {
          const a = zone.angle + side * zone.halfAngle;
          dottedLine(g, zone.x, zone.y, zone.x + Math.cos(a) * zone.radius, zone.y + Math.sin(a) * zone.radius, edge, edgeAlpha);
        }
        continue;
      }

      const cx = Math.round(zone.x);
      const cy = Math.round(zone.y);
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      dottedRing(g, cx, cy, zone.radius, edge, edgeAlpha, 3);
      const inner = zone.centre ? zone.centre.radius : 0;
      dottedRing(g, cx, cy, Phaser.Math.Linear(zone.radius, inner + 4, t), Z.fill, 0.4 + 0.6 * t, 3);
      if (zone.centre) dottedRing(g, cx, cy, zone.centre.radius, Z.centre, edgeAlpha, 3);
    }

    this.drawSpheres(spheres, nowMs);
  }

  private drawSpheres(spheres: readonly DarkSphere[], nowMs: number): void {
    const g = this.sphereGfx;
    const S = THEME.darkSphere;
    g.clear();
    for (const s of spheres) {
      const left = s.expiresAt - nowMs;
      if (left < S.warnMs && Math.floor(left / 90) % 2 === 0) continue;   // flicker out
      const pulse = 1 + 0.12 * Math.sin(((nowMs - s.landedAt) / S.pulseMs) * Math.PI * 2);
      pixelDisc(g, s.x, s.y, (S.radius + 4) * pulse, S.glow, 0.35, 3);
      pixelDisc(g, s.x, s.y, S.radius, S.rim, 1, 3);
      pixelDisc(g, s.x, s.y, S.radius - 3, S.core, 1, 3);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.sphereGfx.destroy();
  }
}
