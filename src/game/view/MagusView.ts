import Phaser from 'phaser';
import { MAGUS } from '../../config/balance';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../art/textures';
import type { Magus } from '../entities/Magus';
import { EnemyView, type EnemyArt } from './EnemyView';
import { dottedLine, pixelDisc } from './pixelDraw';

/**
 * The Magus (brass-masked slate slime). On top of the shared enemy view it
 * adds the spellcaster read:
 *
 *   - two brass rune tablets floating at its sides; mid-cast they rise, draw
 *     in and flare
 *   - arcane energy gathering over its crest while it casts
 *   - the Lance charge: a dotted line that tracks you and stretches to full
 *     length as the charge completes (the locked line is drawn by the
 *     HostileSpellView once it is placed)
 *
 * Reads the entity only; never changes gameplay.
 */
export class MagusView extends EnemyView {
  readonly runes: Phaser.GameObjects.Image[];
  private readonly over: Phaser.GameObjects.Graphics;
  /** Plain readout of the Lance charge line, for inspection. */
  readonly charge = { visible: false, length: 0, angle: 0 };

  constructor(scene: Phaser.Scene, private readonly magus: Magus, art: EnemyArt) {
    super(scene, magus, art);
    const S = THEME.art.scale;
    this.runes = [0, 1].map(() => scene.add.image(magus.x, magus.y, TEX.magus.rune).setScale(S).setVisible(false));
    this.over = scene.add.graphics().setDepth(THEME.depth.fx);
  }

  protected override drawExtras(nowMs: number, bx: number, by: number): void {
    const T = THEME.magus;
    const m = this.magus;
    const progress = m.castProgress(nowMs);
    const casting = progress >= 0;
    const top = by - this.sprite.displayHeight * this.art.originY;

    // Rune tablets: bobbing out of step at its sides; risen, drawn in and flaring mid-cast.
    const R = T.runes;
    const side = R.sidePx * (casting ? R.castPull : 1);
    const rise = casting ? R.castRisePx * Math.min(1, progress * 3) : 0;
    this.runes.forEach((rune, i) => {
      const dir = i === 0 ? -1 : 1;
      const bob = Math.round(Math.sin((this.visualMs / R.bobMs) * Math.PI * 2 + i * Math.PI) * R.bobPx);
      rune
        .setVisible(true)
        .setPosition(Math.round(bx + dir * side), Math.round(by - R.liftPx - rise + bob))
        .setDepth(actorDepth(m.y) + 0.00005);
      if (casting && Math.floor(this.visualMs / 80) % 2 === 0) rune.setTintFill(T.castGlow.core);
      else rune.clearTint();
    });

    this.over.clear();
    if (!casting) {
      this.charge.visible = false;
      return;
    }

    // Energy gathering over the crest.
    const G = T.castGlow;
    const gx = bx;
    const gy = Math.round(top - G.liftPx * 0.25);
    pixelDisc(this.over, gx, gy, 2 + G.radius * progress, G.color, 0.5 + 0.5 * progress, 3);
    pixelDisc(this.over, gx, gy, 1 + (G.radius / 2) * progress, G.core, 1, 3);

    // Lance charge: tracks the player and reaches full length as the charge completes.
    if (m.state === 'lance') {
      const C = T.lanceCharge;
      const length = MAGUS.lance.length * Math.pow(progress, 0.6);
      const ex = m.x + Math.cos(m.aimAngle) * length;
      const ey = m.y + Math.sin(m.aimAngle) * length;
      dottedLine(this.overlay, m.x, m.y, ex, ey, C.color, Phaser.Math.Linear(C.alphaStart, C.alphaEnd, progress), 3, 10);
      Object.assign(this.charge, { visible: true, length, angle: m.aimAngle });
    } else {
      this.charge.visible = false;
    }
  }

  protected override hideExtras(): void {
    for (const rune of this.runes) rune.setVisible(false);
    this.over.clear();
    this.charge.visible = false;
  }

  override destroy(): void {
    for (const rune of this.runes) rune.destroy();
    this.over.destroy();
    super.destroy();
  }
}
