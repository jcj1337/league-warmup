import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import type { DarkSphere, SpellZone } from '../systems/HostileSpellSystem';
import { easeOut, popEase, smoothLine, smoothRing, smoothStrip, smoothWedge, stripPoints, wedgePoints } from './pixelDraw';

const TAU = Math.PI * 2;

/**
 * Draws every placed hostile zone on the ground, in the one hostile language:
 * red ground that warms up across the delay, under a smooth outline in the
 * caster's colour (the Magus's arcane gold, or the Sovereign's void lavender),
 * with a second fill racing across it as the countdown. A pure read of the
 * zone list and its deadlines.
 *
 *   line:    a strip filling from the caster outward, a bright seam down its
 *            middle thickening as it charges; it lands as the fill reaches the
 *            far end
 *   circle:  a disc with a ring closing in from the edge. Arcane: a sigil of
 *            arcs turning inside it, and the Eye's sweet spot ringed in
 *            white-hot. Void: a Dark Sphere dropping onto it, its shadow
 *            growing underneath
 *   cone:    a wedge from the caster, filling outward
 *
 * It also draws the Sovereign's Dark Spheres resting on the ground: near-black
 * orbs with a pale rim that pop open where they land, breathe, and shrink
 * through their last second.
 */
export class HostileSpellView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly sphereGfx: Phaser.GameObjects.Graphics;
  /** In the air: a sphere on its way down. */
  private readonly air: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
    // Spheres sit above the ground overlays but beneath every unit and shot.
    this.sphereGfx = scene.add.graphics().setDepth(THEME.depth.groundFx + 0.5);
    this.air = scene.add.graphics().setDepth(THEME.depth.hostileProjectiles);
  }

  draw(zones: readonly SpellZone[], spheres: readonly DarkSphere[], nowMs: number): void {
    const g = this.gfx;
    const Z = THEME.spellZone;
    g.clear();
    this.air.clear();

    for (const zone of zones) {
      const span = zone.resolveAt - zone.placedAt;
      const t = span > 0 ? Phaser.Math.Clamp((nowMs - zone.placedAt) / span, 0, 1) : 1;
      const fillAlpha = Phaser.Math.Linear(Z.fillAlphaStart, Z.fillAlphaEnd, t);
      const edgeAlpha = Phaser.Math.Linear(Z.edgeAlphaStart, Z.edgeAlphaEnd, t);
      const isVoid = zone.style === 'void';
      const edge = isVoid ? Z.voidEdge : Z.edge;
      const core = isVoid ? Z.voidStrike.core : Z.strike.core;

      if (zone.kind === 'line') {
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(stripPoints(zone.x, zone.y, zone.angle, zone.length, zone.halfWidth), true);
        // The fill racing to the far end is the countdown.
        g.fillStyle(Z.fill, Z.sweepAlpha);
        g.fillPoints(stripPoints(zone.x, zone.y, zone.angle, zone.length * t, zone.halfWidth), true);
        smoothStrip(g, zone.x, zone.y, zone.angle, zone.length, zone.halfWidth, edge, edgeAlpha, Z.edgeWidth);
        // The seam the beam will come down: thin, then thick and bright.
        const ex = zone.x + Math.cos(zone.angle) * zone.length;
        const ey = zone.y + Math.sin(zone.angle) * zone.length;
        smoothLine(g, zone.x, zone.y, ex, ey, edge, 0.25 + 0.5 * t, 1 + Z.seamWidth * t * t);
        smoothLine(g, zone.x, zone.y, ex, ey, core, t * t, Math.max(1, Z.seamWidth * 0.4 * t));
        continue;
      }

      if (zone.kind === 'cone') {
        g.fillStyle(Z.fill, fillAlpha);
        g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius, 20), true);
        g.fillStyle(Z.fill, Z.sweepAlpha);
        g.fillPoints(wedgePoints(zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius * t, 20), true);
        smoothWedge(g, zone.x, zone.y, zone.angle, zone.halfAngle, zone.radius, edge, edgeAlpha, Z.edgeWidth);
        // The front of the fill, as an arc sweeping out.
        smoothRing(g, zone.x, zone.y, zone.radius * t, core, 0.35 + 0.4 * t, Z.edgeWidth, zone.angle - zone.halfAngle, zone.angle + zone.halfAngle);
        continue;
      }

      const cx = zone.x;
      const cy = zone.y;
      const inner = zone.centre ? zone.centre.radius : 0;
      g.fillStyle(Z.fill, fillAlpha);
      g.fillCircle(cx, cy, zone.radius);
      smoothRing(g, cx, cy, zone.radius, edge, edgeAlpha, Z.edgeWidth);
      // A ring closing in from the edge: it lands as it reaches the middle.
      smoothRing(g, cx, cy, Phaser.Math.Linear(zone.radius, inner + 4, t), Z.fill, 0.45 + 0.55 * t, Z.edgeWidth);

      if (isVoid) {
        this.drawFallingSphere(cx, cy, zone.radius, t, zone.leaveSphere !== undefined);
      } else {
        // An arcane sigil: arcs turning inside the circle, tightening as it charges.
        const S = Z.sigil;
        const turn = (nowMs / S.turnMs) * TAU;
        const r = zone.radius * Phaser.Math.Linear(S.radiusStart, S.radiusEnd, t);
        for (let k = 0; k < S.arcs; k++) {
          const a = turn + (k * TAU) / S.arcs;
          smoothRing(g, cx, cy, r, edge, edgeAlpha * 0.7, Z.edgeWidth, a, a + (TAU / S.arcs) * S.arcFill);
        }
        for (let k = 0; k < S.arcs; k++) {
          const a = -turn * 1.6 + (k * TAU) / S.arcs;
          smoothRing(g, cx, cy, r * 0.62, core, edgeAlpha * 0.5, Z.edgeWidth, a, a + (TAU / S.arcs) * S.arcFill * 0.6);
        }
      }
      if (zone.centre) {
        g.fillStyle(Z.centre, 0.05 + 0.13 * t);
        g.fillCircle(cx, cy, zone.centre.radius);
        smoothRing(g, cx, cy, zone.centre.radius, Z.centre, edgeAlpha, Z.edgeWidth);
      }
    }

    this.drawSpheres(spheres, nowMs);
  }

  /**
   * A void circle's read: a Dark Sphere dropping onto its centre, slow then
   * fast, its shadow gathering on the ground beneath. A thrown thing (Force of
   * Will) is already drawn in flight by its thrower, so it gets only the shadow.
   */
  private drawFallingSphere(cx: number, cy: number, radius: number, t: number, sphere: boolean): void {
    const D = THEME.darkSphere;
    const g = this.gfx;
    g.fillStyle(D.core, 0.15 + 0.45 * t);
    g.fillEllipse(cx, cy, radius * (0.25 + 0.4 * t) * 2, radius * (0.25 + 0.4 * t) * 1.3);
    if (!sphere) return;
    const h = D.dropPx * (1 - t * t);
    drawOrb(this.air, cx, cy - h, D.radius * (0.7 + 0.3 * t), 1, 1 - 0.5 * (h / D.dropPx));
  }

  private drawSpheres(spheres: readonly DarkSphere[], nowMs: number): void {
    const g = this.sphereGfx;
    const S = THEME.darkSphere;
    g.clear();
    for (const s of spheres) {
      const left = s.expiresAt - nowMs;
      const age = nowMs - s.landedAt;
      // It pops open where it lands, breathes, and shrinks away through its last second.
      const pop = popEase(age / S.popMs);
      const fade = left < S.warnMs ? Math.max(0, left / S.warnMs) : 1;
      const flicker = left < S.warnMs ? 0.75 + 0.25 * Math.sin(left / 28) : 1;
      const pulse = 1 + 0.07 * Math.sin((age / S.pulseMs) * TAU);
      drawOrb(g, s.x, s.y, S.radius * pop * pulse * (0.45 + 0.55 * easeOut(fade)), flicker, 1);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.sphereGfx.destroy();
    this.air.destroy();
  }
}

/**
 * One Dark Sphere: a soft lavender glow, a pale rim, a near-black core and a
 * small highlight. Shared by the ground spheres, the one dropping in, the one
 * in the Sovereign's grip and the ones circling her head.
 */
export function drawOrb(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, alpha = 1, glow = 1): void {
  if (radius <= 0.5 || alpha <= 0) return;
  const S = THEME.darkSphere;
  g.fillStyle(S.glow, 0.28 * alpha * glow);
  g.fillCircle(x, y, radius + 5);
  g.fillStyle(S.rim, alpha);
  g.fillCircle(x, y, radius);
  g.fillStyle(S.core, alpha);
  g.fillCircle(x, y, Math.max(1, radius - 2.5));
  g.fillStyle(S.glow, 0.7 * alpha);
  g.fillCircle(x - radius * 0.3, y - radius * 0.32, Math.max(1, radius * 0.2));
}
