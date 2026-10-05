import Phaser from 'phaser';
import { SOVEREIGN } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Sovereign } from '../entities/Sovereign';
import { EnemyView, type EnemyArt } from './EnemyView';
import { drawOrb } from './HostileSpellView';
import { easeOut, popEase, smoothLine, smoothStrip, stripPoints } from './pixelDraw';

const TAU = Math.PI * 2;

/**
 * The Sovereign (indigo-black slime, silver diadem). On top of the shared enemy
 * view, eased rather than snapped:
 *
 *   - her body hovers and sways; through a cast she draws up tall, and
 *     squashes as the spell leaves
 *   - two small dark orbs circling her head, winding up to speed while she
 *     casts and back down after
 *   - a sphere she holds with Force of Will, floating over her head / in
 *     flight on a thin tether, its shadow on the ground under it (a held
 *     slime draws itself)
 *   - Scatter's exit lines: from every sphere it will fling, the red strip it
 *     will fly along under a smooth lavender outline, an arrowhead at its end
 *
 * Reads the entity only; never changes gameplay.
 */
export class SovereignView extends EnemyView {
  private readonly over: Phaser.GameObjects.Graphics;
  /** Plain readouts, for inspection. */
  readonly exits = { count: 0 };
  readonly heldSphere = { visible: false };

  /** Where the orbs are in their turn, in radians, and how fast they are going (1 = resting speed). */
  private spin = 0;
  private spinSpeed = 1;
  private wasCasting = false;
  /** Visual ms since the last cast ended, for the release squash. */
  private releaseAge = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, private readonly sovereign: Sovereign, art: EnemyArt) {
    super(scene, sovereign, art);
    this.over = scene.add.graphics().setDepth(THEME.depth.fx);
  }

  protected override animate(nowMs: number, deltaSeconds: number): void {
    const M = THEME.sovereign.motion;
    const O = THEME.sovereign.orbs;
    const body = this.body;
    const progress = this.sovereign.castProgress(nowMs);
    const casting = progress >= 0;
    if (this.wasCasting && !casting) this.releaseAge = 0;
    this.wasCasting = casting;
    this.releaseAge += deltaSeconds * 1000;

    // The orbs wind up and down instead of jumping between two speeds.
    this.spinSpeed += ((casting ? O.castSpin : 1) - this.spinSpeed) * (1 - Math.exp(-O.spinEase * deltaSeconds));
    this.spin = (this.spin + (deltaSeconds * 1000 / O.spinMs) * TAU * this.spinSpeed) % TAU;

    const hover = Math.sin((this.visualMs / M.hoverMs) * TAU);
    body.dy = -M.hoverPx * (0.5 + 0.5 * hover);
    body.dx = M.swayPx * Math.sin((this.visualMs / M.hoverMs) * Math.PI);
    body.sy = 1 + M.breathe * hover;
    body.sx = 1 - M.breathe * hover;

    if (casting) {
      const e = easeOut(progress * 2.5);
      body.sy += M.rise * e;
      body.sx -= M.rise * 0.5 * e;
    } else if (this.releaseAge < M.releaseMs) {
      const squash = M.releaseSquash * (1 - popEase(this.releaseAge / M.releaseMs));
      body.sy -= squash;
      body.sx += squash * 0.7;
    }
  }

  protected override drawExtras(nowMs: number, bx: number, by: number): void {
    const T = THEME.sovereign;
    const D = THEME.darkSphere;
    const s = this.sovereign;
    const top = by + this.body.dy - this.sprite.displayHeight * this.art.originY;
    const g = this.over;
    g.clear();

    // Orbiting orbs: a tilted ring around her head, the far one smaller.
    const O = T.orbs;
    for (let i = 0; i < O.count; i++) {
      const a = this.spin + (i * TAU) / O.count;
      const depth = Math.sin(a);
      drawOrb(g, bx + this.body.dx + Math.cos(a) * O.orbitPx, top + O.liftPx + depth * 5, O.radius * (0.9 + 0.12 * depth), 1, 0.7 + 0.3 * this.spinSpeed / O.castSpin);
    }

    // A sphere in her grip, or in flight: on a tether, its shadow under it.
    if (s.heldSpherePos) {
      const { x, y } = s.heldSpherePos;
      const K = T.tether;
      if (s.state === 'grab') {
        smoothLine(g, bx, top + 4, x, y, K.color, K.alpha * (0.6 + 0.4 * Math.sin(this.visualMs / 45)), K.width);
      }
      drawOrb(g, x, y, D.radius * (1 + 0.08 * Math.sin(this.visualMs / 60)), 1, 1.4);
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
      this.overlay.fillStyle(E.fill, Phaser.Math.Linear(E.fillAlphaStart, E.fillAlphaEnd, t));
      this.overlay.fillPoints(stripPoints(line.x, line.y, line.angle, L.range, L.radius), true);
      smoothStrip(this.overlay, line.x, line.y, line.angle, L.range, L.radius, E.color, 0.5 + 0.5 * t, E.width);
      // An arrowhead on the far end: which way it flies.
      const tipX = line.x + dx * (L.range + 14);
      const tipY = line.y + dy * (L.range + 14);
      const wing = L.radius + 5;
      this.overlay.fillStyle(E.color, 0.5 + 0.5 * t);
      this.overlay.fillTriangle(
        tipX, tipY,
        tipX - dx * 16 - dy * wing, tipY - dy * 16 + dx * wing,
        tipX - dx * 16 + dy * wing, tipY - dy * 16 - dx * wing,
      );
      // The sphere strains at its spot before it goes.
      smoothLine(this.overlay, line.x, line.y, line.x + dx * 26 * t, line.y + dy * 26 * t, D.rim, 0.9 * t, 3);
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
