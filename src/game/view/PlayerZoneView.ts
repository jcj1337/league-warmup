import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { PlacedCloud, PlacedZone } from '../systems/PlayerZoneSystem';
import { dottedLine, dottedRing, pixelDisc } from './pixelDraw';

/**
 * Draws the player's ground spells: a telegraph that fills from its centre
 * over its delay in the champion's colour (never the red of hostile ground,
 * which always means "this hurts you") and splashes when it lands, and
 * lingering clouds as overlapping puffs with dark blotches and drifting
 * motes. A read of the zone and cloud lists, plus the splashes it was told of.
 */
export class PlayerZoneView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** Circles that just landed, splashing out for THEME.playerZone.splashMs. */
  private readonly splashes: { x: number; y: number; radius: number; at: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
  }

  draw(zones: readonly PlacedZone[], clouds: readonly PlacedCloud[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    g.clear();

    for (const cloud of clouds) {
      const life = cloud.expiresAt - cloud.placedAt;
      const age = nowMs - cloud.placedAt;
      const t = life > 0 ? Phaser.Math.Clamp(age / life, 0, 1) : 1;
      // Over the last quarter the cloud shrinks away; the motes fade with it.
      const fade = t > 0.75 ? (1 - t) / 0.25 : 1;
      // Each puff breathes on its own phase, so the field reads as a lumpy mass, not seven circles.
      const sizes = cloud.puffs.map((_, i) => cloud.radius * fade * (1 + 0.06 * Math.sin((age / Z.cloudPulseMs + i * 0.37) * Math.PI * 2)));
      // The rim first, under every puff, so only the field's outer edge shows it.
      g.fillStyle(Z.cloudRim, 1);
      cloud.puffs.forEach((p, i) => g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i] + Z.cloudRimPx * fade));
      g.fillStyle(Z.cloudFill, 1);
      cloud.puffs.forEach((p, i) => g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i]));
      cloud.puffs.forEach((p, i) => {
        // Dark blotches, fixed per puff.
        const a = i * 2.1 + 0.7;
        pixelDisc(g, p.x + Math.cos(a) * sizes[i] * 0.35, p.y + Math.sin(a) * sizes[i] * 0.3, sizes[i] * 0.4, Z.blotch, Z.blotchAlpha, 3);
        // A few motes drifting up through the cloud.
        for (let m = 0; m < Z.cloudMotes; m++) {
          const k = i * Z.cloudMotes + m;
          const phase = (age / Z.moteRiseMs + k * 0.29) % 1;
          const ma = k * 2.4;
          const r = cloud.radius * (0.2 + 0.5 * ((k * 7) % 5) / 5);
          pixelDisc(g, p.x + Math.cos(ma) * r, p.y + Math.sin(ma) * r * 0.6 - phase * 18, 2, Z.mote, (1 - phase) * fade, 3);
        }
      });
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

      // The countdown is a disc swelling from the centre to the edge, then the splash.
      const cx = Math.round(zone.x);
      const cy = Math.round(zone.y);
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      g.fillStyle(Z.core, Z.coreAlpha);
      g.fillCircle(cx, cy, zone.radius * t);
      dottedRing(g, cx, cy, zone.radius, Z.edge, edgeAlpha, 3);
    }

    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      const t = (nowMs - s.at) / Z.splashMs;
      if (t >= 1 || t < 0) {
        this.splashes.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - t) ** 2;
      g.fillStyle(Z.core, Z.coreAlpha * 1.6 * (1 - t));
      g.fillCircle(Math.round(s.x), Math.round(s.y), s.radius);
      dottedRing(g, s.x, s.y, s.radius * (1 + 0.25 * ease), Z.splash, 1 - t, 3);
      for (let d = 0; d < Z.splashDrops; d++) {
        const a = (d / Z.splashDrops) * Math.PI * 2 + 0.4;
        const r = s.radius * (0.6 + 0.7 * ease);
        pixelDisc(g, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 2, Z.splash, 1 - t, 3);
      }
    }
  }

  /** A zone landed: a circle splashes out; a cone just resolves. */
  landed(zone: PlacedZone, nowMs: number): void {
    if (zone.kind === 'circle') this.splashes.push({ x: zone.x, y: zone.y, radius: zone.radius, at: nowMs });
  }

  clearSplashes(): void {
    this.splashes.length = 0;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
