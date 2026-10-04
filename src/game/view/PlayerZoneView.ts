import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { PlacedCloud, PlacedZone } from '../systems/PlayerZoneSystem';
import { dottedLine, dottedRing, pixelDisc } from './pixelDraw';

/**
 * Draws the player's ground spells: a telegraph that fills over its delay in
 * the champion's colour (never the red of hostile ground, which always means
 * "this hurts you"), and lingering clouds as soft discs with drifting motes.
 * A pure read of the zone and cloud lists.
 */
export class PlayerZoneView {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
  }

  draw(zones: readonly PlacedZone[], clouds: readonly PlacedCloud[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    g.clear();

    for (const cloud of clouds) {
      const life = cloud.expiresAt - cloud.placedAt;
      const t = life > 0 ? Phaser.Math.Clamp((nowMs - cloud.placedAt) / life, 0, 1) : 1;
      const fade = t > 0.75 ? (1 - t) / 0.25 : 1;
      const pulse = 1 + 0.05 * Math.sin(((nowMs - cloud.placedAt) / Z.cloudPulseMs) * Math.PI * 2);
      g.fillStyle(Z.cloudFill, Z.cloudFillAlpha * fade);
      g.fillCircle(Math.round(cloud.x), Math.round(cloud.y), cloud.radius * pulse);
      dottedRing(g, cloud.x, cloud.y, cloud.radius * pulse, Z.edge, Z.cloudEdgeAlpha * fade, 3);
      // A few motes drifting up through the cloud.
      for (let i = 0; i < Z.cloudMotes; i++) {
        const phase = ((nowMs - cloud.placedAt) / Z.moteRiseMs + i / Z.cloudMotes) % 1;
        const a = i * 2.4;
        const r = cloud.radius * (0.25 + 0.5 * ((i * 7) % 5) / 5);
        pixelDisc(g, cloud.x + Math.cos(a) * r, cloud.y + Math.sin(a) * r * 0.6 - phase * 18, 2, Z.mote, (1 - phase) * fade, 3);
      }
    }

    for (const zone of zones) {
      const span = zone.resolveAt - zone.placedAt;
      const t = span > 0 ? Phaser.Math.Clamp((nowMs - zone.placedAt) / span, 0, 1) : 1;
      const fillAlpha = Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, t);
      const edgeAlpha = Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, t);

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
        dottedRing(g, zone.x, zone.y, zone.radius, Z.edge, edgeAlpha, 3, zone.angle - zone.halfAngle, zone.angle + zone.halfAngle);
        for (const side of [-1, 1]) {
          const a = zone.angle + side * zone.halfAngle;
          dottedLine(g, zone.x, zone.y, zone.x + Math.cos(a) * zone.radius, zone.y + Math.sin(a) * zone.radius, Z.edge, edgeAlpha);
        }
        continue;
      }

      const cx = Math.round(zone.x);
      const cy = Math.round(zone.y);
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      dottedRing(g, cx, cy, zone.radius, Z.edge, edgeAlpha, 3);
      dottedRing(g, cx, cy, Phaser.Math.Linear(zone.radius, 4, t), Z.fill, 0.4 + 0.6 * t, 3);
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
