import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { PlacedCloud, PlacedZone } from '../systems/PlayerZoneSystem';
import { dottedRing, dottedWedge, pixelDisc, wedgePoints } from './pixelDraw';

/**
 * Draws the player's ground spells: a telegraph that fills from its centre
 * over its delay in the champion's colour (never the red of hostile ground,
 * which always means "this hurts you") and splashes when it lands, a cone
 * that flashes as it strikes, and lingering clouds as overlapping puffs with
 * dark blotches and drifting motes. A thrown cloud's bolts are lobbed from
 * the caster, each puff bursting open where its bolt lands. A read of the
 * zone and cloud lists, plus the landings it was told of.
 */
export class PlayerZoneView {
  /** Ground level: telegraphs, clouds, splashes, the bolts' shadows. */
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** In the air: the bolts themselves, over the units they fly past. */
  private readonly air: Phaser.GameObjects.Graphics;
  /** Zones that just landed, splashing out for THEME.playerZone.splashMs. */
  private readonly splashes: { zone: PlacedZone; at: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
    this.air = scene.add.graphics().setDepth(THEME.depth.projectiles);
  }

  draw(zones: readonly PlacedZone[], clouds: readonly PlacedCloud[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    g.clear();
    this.air.clear();

    for (const cloud of clouds) this.drawCloud(cloud, nowMs);

    for (const zone of zones) {
      const span = zone.resolveAt - zone.placedAt;
      const t = span > 0 ? Phaser.Math.Clamp((nowMs - zone.placedAt) / span, 0, 1) : 1;
      const fillAlpha = Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, t);
      const edgeAlpha = Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, t);

      if (zone.kind === 'cone') {
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius), true);
        g.fillStyle(Z.core, Z.coreAlpha);
        g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius * t), true);
        dottedWedge(g, zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius, Z.edge, edgeAlpha);
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
      const { zone, at } = this.splashes[i];
      const t = (nowMs - at) / Z.splashMs;
      if (t >= 1 || t < 0) {
        this.splashes.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - t) ** 2;
      if (zone.kind === 'cone') {
        // The gaze: the whole cone flashes, and a bright edge runs out past it.
        g.fillStyle(Z.splash, 0.55 * (1 - t));
        g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius), true);
        dottedWedge(g, zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius * (1 + 0.08 * ease), Z.splash, 1 - t);
        continue;
      }
      g.fillStyle(Z.core, Z.coreAlpha * 1.6 * (1 - t));
      g.fillCircle(Math.round(zone.x), Math.round(zone.y), zone.radius);
      dottedRing(g, zone.x, zone.y, zone.radius * (1 + 0.25 * ease), Z.splash, 1 - t, 3);
      this.drops(zone.x, zone.y, zone.radius * (0.6 + 0.7 * ease), Z.splashDrops, 1 - t, 0.4);
    }
  }

  private drawCloud(cloud: PlacedCloud, nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    const life = cloud.expiresAt - cloud.landsAt;
    const age = nowMs - cloud.placedAt;
    const t = life > 0 ? Phaser.Math.Clamp((nowMs - cloud.landsAt) / life, 0, 1) : 1;
    // Over the last quarter the cloud shrinks away; the motes fade with it.
    const fade = t > 0.75 ? (1 - t) / 0.25 : 1;

    // Each puff bursts open where its bolt lands, overshooting a little, then
    // breathes on its own phase, so the field reads as a lumpy mass.
    const sizes = cloud.puffs.map((_, i) => {
      const since = nowMs - cloud.puffLandsAt[i];
      if (since < 0) return 0;
      const pop = since >= Z.puffPopMs ? 1 : popEase(since / Z.puffPopMs);
      return cloud.radius * fade * pop * (1 + 0.06 * Math.sin((age / Z.cloudPulseMs + i * 0.37) * Math.PI * 2));
    });

    // The rim first, under every puff, so only the field's outer edge shows it.
    // Opaque: translucent puffs would stack where they overlap (see THEME.playerZone).
    g.fillStyle(Z.cloudRim, 1);
    cloud.puffs.forEach((p, i) => sizes[i] > 0 && g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i] + Z.cloudRimPx * fade));
    g.fillStyle(Z.cloudFill, 1);
    cloud.puffs.forEach((p, i) => sizes[i] > 0 && g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i]));

    cloud.puffs.forEach((p, i) => {
      const since = nowMs - cloud.puffLandsAt[i];
      if (since < 0) {
        this.drawBolt(cloud, i, nowMs);
        return;
      }
      // Dark blotches, fixed per puff.
      const a = i * 2.1 + 0.7;
      pixelDisc(g, p.x + Math.cos(a) * sizes[i] * 0.35, p.y + Math.sin(a) * sizes[i] * 0.3, sizes[i] * 0.4, Z.blotch, Z.blotchAlpha, 3);
      // The bolt's splat: droplets thrown out as the puff opens.
      if (since < Z.puffSplatMs) {
        const s = since / Z.puffSplatMs;
        this.drops(p.x, p.y, cloud.radius * (0.5 + 0.9 * (1 - (1 - s) ** 2)), Z.puffSplatDrops, 1 - s, i * 0.9);
      }
      // A few motes drifting up through the cloud.
      for (let m = 0; m < Z.cloudMotes; m++) {
        const k = i * Z.cloudMotes + m;
        const phase = (age / Z.moteRiseMs + k * 0.29) % 1;
        const ma = k * 2.4;
        const r = cloud.radius * (0.2 + 0.5 * ((k * 7) % 5) / 5);
        pixelDisc(g, p.x + Math.cos(ma) * r, p.y + Math.sin(ma) * r * 0.6 - phase * 18, 2, Z.mote, (1 - phase) * fade * Math.min(1, sizes[i] / cloud.radius), 3);
      }
    });
  }

  /**
   * One venom bolt in flight: from her mouth up into a lob and down onto its
   * puff. Its shadow runs along the ground below it, so the landing spot reads
   * before the bolt gets there.
   */
  private drawBolt(cloud: PlacedCloud, i: number, nowMs: number): void {
    const from = cloud.thrownFrom;
    if (!from) return;
    const Z = THEME.playerZone;
    const p = cloud.puffs[i];
    const flight = cloud.puffLandsAt[i] - cloud.placedAt;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    const peak = Z.boltArcPx + dist * Z.boltArcPerPx;
    const at = (s: number) => ({
      x: from.x + (p.x - from.x) * s,
      y: from.y + (p.y - from.y) * s,
      h: Z.boltMouthPx * (1 - s) + 4 * peak * s * (1 - s),
    });
    const s = flight > 0 ? Phaser.Math.Clamp((nowMs - cloud.placedAt) / flight, 0, 1) : 1;
    const now = at(s);
    pixelDisc(this.gfx, now.x, now.y, 3, Z.boltShadow, Z.boltShadowAlpha * (0.4 + 0.6 * s), 3);
    // A short trail of venom behind the head of the bolt.
    for (let k = Z.boltTrail; k >= 1; k--) {
      const back = at(Math.max(0, s - k * Z.boltTrailStep));
      pixelDisc(this.air, back.x, back.y - back.h, Z.boltRadius * (1 - k / (Z.boltTrail + 1)), Z.bolt, 0.9 - k * 0.2, 3);
    }
    pixelDisc(this.air, now.x, now.y - now.h, Z.boltRadius, Z.bolt, 1, 3);
    pixelDisc(this.air, now.x - 1, now.y - now.h - 1, Z.boltRadius / 2, Z.boltCore, 1, 3);
  }

  private drops(x: number, y: number, r: number, n: number, alpha: number, turn: number): void {
    const Z = THEME.playerZone;
    for (let d = 0; d < n; d++) {
      const a = (d / n) * Math.PI * 2 + turn;
      pixelDisc(this.gfx, x + Math.cos(a) * r, y + Math.sin(a) * r, 2, Z.splash, alpha, 3);
    }
  }

  /** A zone landed: a circle splashes out, a cone flashes. */
  landed(zone: PlacedZone, nowMs: number): void {
    this.splashes.push({ zone, at: nowMs });
  }

  clearSplashes(): void {
    this.splashes.length = 0;
  }

  destroy(): void {
    this.gfx.destroy();
    this.air.destroy();
  }
}

/** 0 → 1 with a little overshoot: the puff bursts open past its size and settles. */
function popEase(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
