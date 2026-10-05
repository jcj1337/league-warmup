import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { BurstStyle, PlacedCloud, PlacedZone } from '../systems/PlayerZoneSystem';
import { pixelDisc, popEase, smoothRing, smoothWedge, wedgePoints } from './pixelDraw';

type Point = { x: number; y: number };

/** A burst being drawn: puffs popping open where something landed, then shrinking away. */
interface Burst {
  x: number;
  y: number;
  radius: number;
  style: BurstStyle;
  at: number;
}

/**
 * Draws the player's ground spells, all in one language: venom that leaves
 * the caster's body, arcs through the air with its shadow on the ground, and
 * bursts open where it lands into soft, opaque, blotchy puffs that overshoot
 * a little, splatter droplets, and shrink away.
 *
 *   circle         (Snake Lady's Q) venom welling up in place: the ring fills
 *                  from its centre while puffs bubble up inside it, then it
 *                  bursts into a cluster of puffs
 *   cone           a telegraph, then a wave of puffs sweeping out to its edge
 *   cloud          (her W) bolts lobbed onto each puff, which pops open and
 *                  lingers, breathing, with motes drifting up
 *   burst          a puff cluster on its own, where a kit asks (a bite, a gaze)
 *
 * Outlines are smooth, solid lines. Never the red of hostile ground, which
 * always means "this hurts you". A read of the zone and cloud lists, plus the
 * landings and bursts it was told of.
 */
export class PlayerZoneView {
  /** Ground level: telegraphs, clouds, bursts, the bolts' shadows. */
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** In the air: the bolts themselves, over the units they fly past. */
  private readonly air: Phaser.GameObjects.Graphics;
  /** Cones that just struck, their wave sweeping out. */
  private readonly sweeps: { zone: PlacedZone & { kind: 'cone' }; at: number }[] = [];
  private readonly bursts: Burst[] = [];

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
        smoothWedge(g, zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius, Z.edge, edgeAlpha, Z.edgeWidth);
        continue;
      }

      // Venom welling up under the target: the fill swells from the centre (the
      // countdown) while puffs bubble up inside the ring, one after another.
      const cx = Math.round(zone.x);
      const cy = Math.round(zone.y);
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      g.fillStyle(Z.core, Z.coreAlpha);
      g.fillCircle(cx, cy, zone.radius * t);
      const centres: Point[] = [];
      const sizes: number[] = [];
      for (let k = 0; k < Z.welling.puffs; k++) {
        const a = k * 2.4 + 0.5;
        const d = zone.radius * Z.welling.spread * (k % 2 ? 1 : 0.55);
        centres.push({ x: zone.x + Math.cos(a) * d, y: zone.y + Math.sin(a) * d * 0.8 });
        const u = (t - k * Z.welling.stagger) / Z.welling.grow;
        sizes.push(u <= 0 ? 0 : zone.radius * Z.welling.size * (u >= 1 ? 1 : popEase(u)));
      }
      this.drawPuffs(centres, sizes, 'venom', 0.5);
      smoothRing(g, cx, cy, zone.radius, Z.edge, edgeAlpha, Z.edgeWidth);
    }

    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const t = (nowMs - this.sweeps[i].at) / Z.sweepMs;
      if (t >= 1 || t < 0) this.sweeps.splice(i, 1);
      else this.drawSweep(this.sweeps[i].zone, t);
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      const since = nowMs - b.at;
      if (since >= Z.burstMs || since < 0) this.bursts.splice(i, 1);
      else this.drawBurst(b, since);
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
    this.drawPuffs(cloud.puffs, sizes, 'venom', fade);

    cloud.puffs.forEach((p, i) => {
      const since = nowMs - cloud.puffLandsAt[i];
      if (since < 0) {
        if (cloud.thrownFrom) {
          const flight = cloud.puffLandsAt[i] - cloud.placedAt;
          this.drawLob(cloud.thrownFrom, p, flight > 0 ? Phaser.Math.Clamp((nowMs - cloud.placedAt) / flight, 0, 1) : 1, Z.boltRadius);
        }
        return;
      }
      // The bolt's splat: droplets thrown out as the puff opens.
      if (since < Z.puffSplatMs) {
        const s = since / Z.puffSplatMs;
        this.drops(p.x, p.y, cloud.radius * (0.5 + 0.9 * (1 - (1 - s) ** 2)), Z.puffSplatDrops, 1 - s, i * 0.9, Z.splash);
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
   * Opaque puffs with a rim and dark blotches: the rim first, under every
   * puff, so only the outer edge shows it. Opaque, because translucent puffs
   * would stack where they overlap (see THEME.playerZone).
   */
  private drawPuffs(centres: readonly Point[], sizes: readonly number[], style: BurstStyle, rimScale = 1): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    const S = Z.styles[style];
    g.fillStyle(S.rim, 1);
    centres.forEach((p, i) => sizes[i] > 0 && g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i] + Z.cloudRimPx * rimScale));
    g.fillStyle(S.fill, 1);
    centres.forEach((p, i) => sizes[i] > 0 && g.fillCircle(Math.round(p.x), Math.round(p.y), sizes[i]));
    centres.forEach((p, i) => {
      if (sizes[i] <= 0) return;
      const a = i * 2.1 + 0.7;
      pixelDisc(g, p.x + Math.cos(a) * sizes[i] * 0.35, p.y + Math.sin(a) * sizes[i] * 0.3, sizes[i] * 0.4, S.blotch, Z.blotchAlpha, 3);
    });
  }

  /**
   * A cluster of puffs bursting open where something landed: a big one in the
   * middle and a ring around it, each popping a beat after the last and
   * overshooting, droplets splattering out, then the lot shrinking away.
   */
  private drawBurst(b: Burst, since: number): void {
    const Z = THEME.playerZone;
    const S = Z.styles[b.style];
    const t = since / Z.burstMs;
    const shrink = t > Z.burstHoldFraction ? (1 - t) / (1 - Z.burstHoldFraction) : 1;
    const centres: Point[] = [{ x: b.x, y: b.y }];
    const sizes: number[] = [];
    const pop = (delay: number) => {
      const s = (since - delay) / Z.puffPopMs;
      return s <= 0 ? 0 : s >= 1 ? 1 : popEase(s);
    };
    sizes.push(b.radius * Z.burstCore * pop(0) * shrink);
    for (let k = 0; k < Z.burstPuffs; k++) {
      const a = (k / Z.burstPuffs) * Math.PI * 2 + 0.3;
      centres.push({ x: b.x + Math.cos(a) * b.radius * Z.burstSpread, y: b.y + Math.sin(a) * b.radius * Z.burstSpread * 0.8 });
      sizes.push(b.radius * Z.burstSide * pop(Z.burstStaggerMs * (k + 1)) * shrink);
    }
    this.drawPuffs(centres, sizes, b.style, shrink);
    // The splat: droplets thrown out past the edge, and a ring running ahead of them.
    const s = Math.min(1, since / Z.burstSplatMs);
    if (s < 1) {
      const ease = 1 - (1 - s) ** 2;
      this.drops(b.x, b.y, b.radius * (0.7 + 0.8 * ease), Z.splashDrops, 1 - s, 0.4, S.drop);
      smoothRing(this.gfx, b.x, b.y, b.radius * (1 + 0.35 * ease), S.drop, (1 - s) * 0.8, Z.edgeWidth);
    }
  }

  /**
   * The gaze: a wave of puffs sweeping out from her to the cone's edge, a
   * pale wash behind it, the front breaking into droplets as it reaches the
   * rim, then shrinking away.
   */
  private drawSweep(zone: PlacedZone & { kind: 'cone' }, t: number): void {
    const g = this.gfx;
    const Z = THEME.playerZone;
    const reach = Math.min(1, t / Z.sweepTravel);
    const front = zone.radius * (1 - (1 - reach) ** 2);
    const shrink = t > Z.sweepTravel ? Math.max(0, (1 - t) / (1 - Z.sweepTravel)) : 1;
    g.fillStyle(Z.splash, Z.sweepWashAlpha * (1 - t));
    g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, front), true);
    const arc = 2 * zone.halfAngle * front;
    const n = Math.max(3, Math.round(arc / Z.sweepPuffSpacing));
    const centres: Point[] = [];
    const sizes: number[] = [];
    for (let i = 0; i <= n; i++) {
      const a = zone.angle - zone.halfAngle + (2 * zone.halfAngle * i) / n;
      centres.push({ x: zone.x + Math.cos(a) * front, y: zone.y + Math.sin(a) * front });
      // Lumpy, not a ruled line: each puff a little bigger or smaller than its neighbours.
      sizes.push(Z.sweepPuffRadius * shrink * (0.75 + 0.25 * Math.sin(i * 2.3)) * (0.5 + 0.5 * reach));
    }
    this.drawPuffs(centres, sizes, 'venom', shrink);
    if (reach >= 1) smoothWedge(g, zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius * (1 + 0.06 * (t - Z.sweepTravel)), Z.splash, shrink, Z.edgeWidth);
  }

  /**
   * Something lobbed from `from` onto `to`, `s` of the way there: up from her
   * mouth into an arc and down. Its shadow runs along the ground below it, so
   * the landing spot reads before it gets there; a short trail follows it.
   */
  private drawLob(from: Point, to: Point, s: number, radius: number): void {
    const Z = THEME.playerZone;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const peak = Z.boltArcPx + dist * Z.boltArcPerPx;
    const at = (u: number) => ({
      x: from.x + (to.x - from.x) * u,
      y: from.y + (to.y - from.y) * u,
      h: Z.boltMouthPx * (1 - u) + 4 * peak * u * (1 - u),
    });
    const now = at(s);
    pixelDisc(this.gfx, now.x, now.y, Math.max(3, radius * 0.5), Z.boltShadow, Z.boltShadowAlpha * (0.4 + 0.6 * s), 3);
    for (let k = Z.boltTrail; k >= 1; k--) {
      const back = at(Math.max(0, s - k * Z.boltTrailStep));
      pixelDisc(this.air, back.x, back.y - back.h, radius * (1 - k / (Z.boltTrail + 1)), Z.bolt, 0.9 - k * 0.2, 3);
    }
    pixelDisc(this.air, now.x, now.y - now.h, radius, Z.bolt, 1, 3);
    pixelDisc(this.air, now.x - 1, now.y - now.h - 1, radius / 2, Z.boltCore, 1, 3);
  }

  private drops(x: number, y: number, r: number, n: number, alpha: number, turn: number, color: number): void {
    for (let d = 0; d < n; d++) {
      const a = (d / n) * Math.PI * 2 + turn;
      pixelDisc(this.gfx, x + Math.cos(a) * r, y + Math.sin(a) * r, 2, color, alpha, 3);
    }
  }

  /** A zone resolved: a circle bursts open, a cone sends its wave out. */
  landed(zone: PlacedZone, nowMs: number): void {
    if (zone.kind === 'cone') this.sweeps.push({ zone, at: nowMs });
    else this.bursts.push({ x: zone.x, y: zone.y, radius: zone.radius, style: 'venom', at: nowMs });
  }

  /** A puff cluster on its own (a kit's bite, a gaze landing on an enemy). */
  burst(x: number, y: number, radius: number, style: BurstStyle, nowMs: number): void {
    this.bursts.push({ x, y, radius, style, at: nowMs });
  }

  clearSplashes(): void {
    this.sweeps.length = 0;
    this.bursts.length = 0;
  }

  destroy(): void {
    this.gfx.destroy();
    this.air.destroy();
  }
}

