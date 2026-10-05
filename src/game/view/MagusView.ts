import Phaser from 'phaser';
import { MAGUS } from '../../config/balance';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../art/textures';
import type { Magus } from '../entities/Magus';
import { EnemyView, type EnemyArt } from './EnemyView';
import { easeOut, popEase, smoothLine, smoothRing, smoothStrip, stripPoints } from './pixelDraw';

const TAU = Math.PI * 2;

/**
 * The Magus (brass-masked slate slime). On top of the shared enemy view it
 * adds the spellcaster read, all of it eased rather than snapped:
 *
 *   - its body hovers and breathes; through a cast it draws up tall and
 *     trembles, and squashes as the spell leaves
 *   - two brass rune tablets floating at its sides; mid-cast they ease up and
 *     in, a glow swelling behind them
 *   - arcane energy gathering over its crest while it casts: a swelling glow
 *     with motes spiralling into it
 *   - its three aim indicators, drawn alike: the spell's own shape at full
 *     size from the first frame, which only travels (at the Magus's aim
 *     speed) and brightens as the cast runs. Nothing grows, spins or pulses.
 *       the Lance charge: its strip (the locked line is drawn by the
 *         HostileSpellView once it is placed)
 *       the Eye: its circle and hot centre, with a crosshair
 *       the Orb windup: its strip, then a red strip once the aim locks
 *
 * Reads the entity only; never changes gameplay.
 */
export class MagusView extends EnemyView {
  readonly runes: Phaser.GameObjects.Image[];
  private readonly over: Phaser.GameObjects.Graphics;
  /** Plain readout of the Lance charge line, for inspection. */
  readonly charge = { visible: false, length: 0, angle: 0 };
  /** Plain readout of the Eye targeting reticle, for inspection. */
  readonly reticle = { visible: false, x: 0, y: 0 };
  /** Plain readout of the Orb aim line, for inspection. */
  readonly orbAim = { visible: false, locked: false, angle: 0 };

  /** 0 at rest → 1 mid-cast, eased both ways: what the runes and the glow follow. */
  private castEase = 0;
  private wasCasting = false;
  /** Visual ms since the last cast ended, for the release squash. */
  private releaseAge = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, private readonly magus: Magus, art: EnemyArt) {
    super(scene, magus, art);
    const S = THEME.art.scale;
    this.runes = [0, 1].map(() => scene.add.image(magus.x, magus.y, TEX.magus.rune).setScale(S).setVisible(false));
    this.over = scene.add.graphics().setDepth(THEME.depth.fx);
  }

  protected override animate(nowMs: number, deltaSeconds: number): void {
    const M = THEME.magus.motion;
    const body = this.body;
    const progress = this.magus.castProgress(nowMs);
    const casting = progress >= 0;
    if (this.wasCasting && !casting) this.releaseAge = 0;
    this.wasCasting = casting;
    this.releaseAge += deltaSeconds * 1000;
    this.castEase += ((casting ? 1 : 0) - this.castEase) * (1 - Math.exp(-THEME.magus.runes.follow * deltaSeconds));

    const hover = Math.sin((this.visualMs / M.hoverMs) * TAU);
    body.dy = -M.hoverPx * (0.5 + 0.5 * hover);
    body.sy = 1 + M.breathe * hover;
    body.sx = 1 - M.breathe * hover;

    if (casting) {
      const e = easeOut(progress * 2.5);
      body.sy += M.rise * e;
      body.sx -= M.rise * 0.5 * e;
      if (progress > 0.7) body.dx = Math.floor(this.visualMs / THEME.motion.trembleMs) % 2 === 0 ? M.tremblePx : -M.tremblePx;
    } else if (this.releaseAge < M.releaseMs) {
      // The spell leaves: it drops flat and springs back.
      const squash = M.releaseSquash * (1 - popEase(this.releaseAge / M.releaseMs));
      body.sy -= squash;
      body.sx += squash * 0.7;
    }
  }

  protected override drawExtras(nowMs: number, bx: number, by: number): void {
    const T = THEME.magus;
    const m = this.magus;
    const progress = m.castProgress(nowMs);
    const casting = progress >= 0;
    const lift = this.castEase;
    const top = by + this.body.dy - this.sprite.displayHeight * this.art.originY;
    const g = this.over;
    g.clear();

    // Rune tablets: bobbing out of step at its sides; eased up and in mid-cast, a glow behind them.
    const R = T.runes;
    const side = R.sidePx * Phaser.Math.Linear(1, R.castPull, lift);
    this.runes.forEach((rune, i) => {
      const dir = i === 0 ? -1 : 1;
      const bob = Math.sin((this.visualMs / R.bobMs) * TAU + i * Math.PI) * R.bobPx;
      const rx = Math.round(bx + dir * side);
      const ry = Math.round(by - R.liftPx - R.castRisePx * lift + bob);
      rune.setVisible(true).setPosition(rx, ry).setDepth(actorDepth(m.y) + 0.00005);
      if (lift > 0.02) {
        const pulse = 0.75 + 0.25 * Math.sin(this.visualMs / 70 + i * 2);
        g.fillStyle(T.castGlow.color, 0.3 * lift * pulse);
        g.fillCircle(rx, ry, R.glowRadius * (0.6 + 0.4 * lift));
        g.fillStyle(T.castGlow.core, 0.35 * lift * pulse);
        g.fillCircle(rx, ry, R.glowRadius * 0.45 * lift);
      }
      if (casting && progress > 0.8) rune.setTintFill(T.castGlow.core);
      else rune.clearTint();
    });

    if (!casting) {
      this.charge.visible = false;
      this.reticle.visible = false;
      this.orbAim.visible = false;
      return;
    }

    // Energy gathering over the crest: motes spiral in, the glow swells.
    const G = T.castGlow;
    const gx = bx;
    const gy = top - G.liftPx * 0.25;
    for (let k = 0; k < G.motes; k++) {
      const u = (this.visualMs / G.moteTurnMs + k / G.motes) % 1;
      const a = u * TAU * 1.5 + k * 1.7;
      const r = G.moteOrbitPx * (1 - u);
      g.fillStyle(k % 2 ? G.color : G.core, 0.9 * u);
      g.fillCircle(gx + Math.cos(a) * r, gy + Math.sin(a) * r * 0.7, 1.5 + 1.5 * u);
    }
    const swell = easeOut(progress);
    const flicker = 1 + 0.08 * Math.sin(this.visualMs / 40);
    g.fillStyle(G.color, 0.25 + 0.2 * swell);
    g.fillCircle(gx, gy, (4 + G.radius * 1.4 * swell) * flicker);
    g.fillStyle(G.color, 0.6 + 0.4 * swell);
    g.fillCircle(gx, gy, (2 + G.radius * swell) * flicker);
    g.fillStyle(G.core, 1);
    g.fillCircle(gx, gy, 1 + (G.radius / 2) * swell);

    // The aim indicators share one look: a faint fill and a steady outline that brighten with the cast.
    const A = T.aim;
    const alpha = Phaser.Math.Linear(A.alphaStart, A.alphaEnd, progress);
    const fillAlpha = Phaser.Math.Linear(A.fillStart, A.fillEnd, progress);

    // Eye targeting: the circle it will put down, travelling to where it will land.
    if (m.state === 'eye' && m.eyeTarget) {
      const C = A;
      const { x, y } = m.eyeTarget;
      this.overlay.fillStyle(C.color, fillAlpha);
      this.overlay.fillCircle(x, y, MAGUS.eye.radius);
      smoothRing(this.overlay, x, y, MAGUS.eye.radius, C.color, alpha, C.width);
      smoothRing(this.overlay, x, y, MAGUS.eye.centreRadius, C.core, alpha * 0.8, C.width);
      smoothLine(this.overlay, x - 9, y, x + 9, y, C.core, alpha, C.width);
      smoothLine(this.overlay, x, y - 9, x, y + 9, C.core, alpha, C.width);
      Object.assign(this.reticle, { visible: true, x, y });
    } else {
      this.reticle.visible = false;
    }

    // Lance charge: the strip it will land as, sweeping after the player.
    if (m.state === 'lance') {
      const { length, halfWidth } = MAGUS.lance;
      this.overlay.fillStyle(A.color, fillAlpha);
      this.overlay.fillPoints(stripPoints(m.x, m.y, m.aimAngle, length, halfWidth), true);
      smoothStrip(this.overlay, m.x, m.y, m.aimAngle, length, halfWidth, A.color, alpha, A.width);
      Object.assign(this.charge, { visible: true, length, angle: m.aimAngle });
    } else {
      this.charge.visible = false;
    }

    // Orb windup: the strip the orb will fly down, sweeping after you; it locks into a red strip.
    if (m.state === 'orb') {
      const L = T.orbAim;
      const O = MAGUS.orb;
      const locked = m.orbLocked(nowMs);
      const sx = m.x + Math.cos(m.aimAngle) * m.radius;
      const sy = m.y + Math.sin(m.aimAngle) * m.radius;
      if (locked) {
        this.overlay.fillStyle(L.lockFill, L.lockFillAlpha);
        this.overlay.fillPoints(stripPoints(sx, sy, m.aimAngle, O.range, O.radius), true);
        smoothStrip(this.overlay, sx, sy, m.aimAngle, O.range, O.radius, L.lockEdge, 0.9, 2);
      } else {
        this.overlay.fillStyle(A.color, fillAlpha);
        this.overlay.fillPoints(stripPoints(sx, sy, m.aimAngle, O.range, O.radius), true);
        smoothStrip(this.overlay, sx, sy, m.aimAngle, O.range, O.radius, A.color, alpha, A.width);
      }
      Object.assign(this.orbAim, { visible: true, locked, angle: m.aimAngle });
    } else {
      this.orbAim.visible = false;
    }
  }

  protected override hideExtras(): void {
    for (const rune of this.runes) rune.setVisible(false);
    this.over.clear();
    this.charge.visible = false;
    this.reticle.visible = false;
    this.orbAim.visible = false;
  }

  override destroy(): void {
    for (const rune of this.runes) rune.destroy();
    this.over.destroy();
    super.destroy();
  }
}
