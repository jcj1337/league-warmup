import Phaser from 'phaser';
import { DEBUG } from '../../config/balance';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../art/textures';
import type { Enemy } from '../entities/Enemy';
import { Fx } from './Fx';
import { PipBar } from './PipBar';
import { dottedRing } from './pixelDraw';

/** How one archetype looks. Gameplay radius and reach live on the entity, not here. */
export interface EnemyArt {
  idle: readonly string[];
  move: readonly string[];
  /** Body frame held through an attack windup, if the archetype has one. */
  windup?: string;
  frameMs: number;
  originY: number;
  shadow: string;
  shadowOffsetY: number;
  hpBarOffsetY: number;
  burst: readonly number[];
}

/**
 * Sprite, shadow, segmented pip bar, W mark and hit/death feedback for one enemy.
 *
 * Observes the entity (`Enemy.x/y/hp/active`, its `pose`, mark timing) and is
 * told about hits and deaths as events. It never changes gameplay: a kill has
 * already registered by the time the death pop plays.
 */
export class EnemyView {
  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly markIcon: Phaser.GameObjects.Image;
  readonly hpBar: PipBar;
  /** Ground overlays under the enemy: mark ring, attack telegraph. */
  protected readonly overlay: Phaser.GameObjects.Graphics;

  /** True while the death pop is playing. */
  dying = false;

  protected visualMs = 0;
  private hitAge = Number.POSITIVE_INFINITY;
  private deathAge = 0;

  constructor(
    protected readonly scene: Phaser.Scene,
    protected readonly enemy: Enemy,
    protected readonly art: EnemyArt,
  ) {
    const S = THEME.art.scale;
    this.shadow = scene.add.image(enemy.x, enemy.y, art.shadow).setScale(S).setDepth(THEME.depth.shadow);
    this.overlay = scene.add.graphics().setDepth(THEME.depth.groundFx);
    this.sprite = scene.add.image(enemy.x, enemy.y, art.idle[0]).setOrigin(0.5, art.originY).setScale(S);
    this.markIcon = scene.add.image(enemy.x, enemy.y, TEX.mark).setScale(S).setDepth(THEME.depth.mark).setVisible(false);
    this.hpBar = new PipBar(scene);
  }

  /** The enemy lost a pip (lethal or not). */
  onHit(): void {
    this.hitAge = 0;
    const fx = Fx.of(this.scene);
    fx.hit(this.enemy.x, this.enemy.y, this.art.burst);
    if (DEBUG.showDamageNumbers) {
      fx.popup(this.enemy.x, this.enemy.y - this.enemy.radius - 6, '-1', THEME.enemy.damageNumber);
    }
  }

  /** The enemy just died. The kill is already counted; this is the pop. */
  onDeath(): void {
    this.dying = true;
    this.deathAge = 0;
    Fx.of(this.scene).death(this.enemy.x, this.enemy.y, this.enemy.radius, this.art.burst);
  }

  sync(nowMs: number, deltaSeconds: number): void {
    const S = THEME.art.scale;
    const ms = deltaSeconds * 1000;
    const e = this.enemy;
    this.visualMs += ms;
    this.hitAge += ms;

    const bx = Math.round(e.x);
    const by = Math.round(e.y);

    if (e.spawning) {
      // Placeholder arrival cue on the fixed spawn spot. It only reads the
      // gameplay arrival progress; activation never waits on it.
      const t = e.arrivalProgress(nowMs);
      const cue = THEME.enemy.spawnCue;
      this.sprite.setVisible(false);
      this.shadow.setVisible(false);
      this.markIcon.setVisible(false);
      this.hpBar.setVisible(false);
      this.overlay.clear();
      dottedRing(
        this.overlay, bx, by,
        e.radius * Phaser.Math.Linear(cue.startRadiusScale, 1, t),
        cue.color, Phaser.Math.Linear(cue.alphaStart, cue.alphaEnd, t), 3,
      );
      this.hideExtras();
      return;
    }

    if (e.dead) {
      this.deathAge += ms;
      const t = this.deathAge / THEME.enemy.deathAnimMs;
      this.dying = t < 1;
      if (this.dying) {
        // A bright pop, then shrink and fade.
        const pop = Math.min(1, t / 0.2);
        const after = Math.max(0, (t - 0.2) / 0.8);
        this.sprite
          .setVisible(true)
          .setPosition(bx, by)
          .setScale(S * (t < 0.2 ? 1 + 0.25 * pop : 1.25 - 0.9 * after))
          .setAlpha(t < 0.2 ? 1 : 1 - after)
          .setTintFill(THEME.fx.hit.color);
      } else {
        this.sprite.setVisible(false);
      }
      this.shadow.setVisible(false);
      this.markIcon.setVisible(false);
      this.hpBar.setVisible(false);
      this.overlay.clear();
      this.hideExtras();
      return;
    }

    const pose = e.pose;
    const frames = pose.moving ? this.art.move : this.art.idle;
    const frameMs = pose.moving ? this.art.frameMs : this.art.frameMs * 2;
    const frame = pose.windup >= 0 && this.art.windup ? this.art.windup : frames[Math.floor(this.visualMs / frameMs) % frames.length];

    const flash = Math.max(0, 1 - this.hitAge / THEME.enemy.hitFlashMs);
    this.sprite
      .setVisible(true)
      .setTexture(frame)
      .setFlipX(pose.facing < 0)
      .setPosition(bx, by)
      .setAlpha(1)
      .setScale(S * (1 + 0.12 * flash))
      .setDepth(actorDepth(e.y));
    if (flash > 0.45) this.sprite.setTintFill(THEME.fx.hit.color);
    else this.sprite.clearTint();

    this.shadow.setVisible(true).setPosition(bx, by + this.art.shadowOffsetY);

    this.hpBar.setVisible(true);
    this.hpBar.update(e.x, e.y + this.art.hpBarOffsetY, e.hp, e.maxHp, deltaSeconds);

    this.overlay.clear();
    this.drawMark(nowMs, bx, by);
    this.drawExtras(nowMs, bx, by, deltaSeconds);
  }

  /** Rune floating over the head plus a violet ring at the feet. Loud on purpose. */
  private drawMark(nowMs: number, bx: number, by: number): void {
    const remaining = this.enemy.markRemainingMs(nowMs);
    if (remaining <= 0) {
      this.markIcon.setVisible(false);
      return;
    }
    const M = THEME.mark;
    const blinkOff = remaining < M.warnMs && Math.floor(remaining / 90) % 2 === 0;
    const top = by - this.sprite.displayHeight * this.art.originY;
    const bob = Math.round(Math.sin(this.visualMs * 0.008) * M.bobPx);
    this.markIcon.setVisible(!blinkOff).setPosition(bx, Math.round(top - 14 + bob));
    dottedRing(this.overlay, bx, by + 4, this.enemy.radius + 8, M.ringColor, blinkOff ? 0.35 : 0.9, 3);
  }

  /** Archetype-specific layers (weapon, telegraph). */
  protected drawExtras(_nowMs: number, _bx: number, _by: number, _deltaSeconds: number): void {}

  protected hideExtras(): void {}

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.markIcon.destroy();
    this.overlay.destroy();
    this.hpBar.destroy();
  }
}

/**
 * The Pursuer (horned purple slime) adds a very loud attack telegraph: across
 * the real 400ms windup it rears up with white-hot eyes, the ground under its
 * actual reach warms up red, a ring contracts onto it and a "!" flashes over
 * its head. When the swing resolves it flattens into a slam, with a slash only
 * if it connected.
 */
export class PursuerView extends EnemyView {
  readonly alert: Phaser.GameObjects.Image;
  /** Plain readout of the telegraph, for inspection. */
  readonly telegraph = { visible: false, progress: 0 };
  private swingAge = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, enemy: Enemy, art: EnemyArt) {
    super(scene, enemy, art);
    const S = THEME.art.scale;
    this.alert = scene.add.image(enemy.x, enemy.y, TEX.pursuer.alert).setScale(S).setDepth(THEME.depth.mark).setVisible(false);
  }

  /** The swing resolved. `landed` = the player was still in reach. */
  strike(landed: boolean, towardX: number, towardY: number, reach: number): void {
    this.swingAge = 0;
    if (landed) {
      const angle = Math.atan2(towardY - this.enemy.y, towardX - this.enemy.x);
      Fx.of(this.scene).slash(this.enemy.x, this.enemy.y, angle, reach, THEME.pursuer.slashColor);
    }
  }

  protected override drawExtras(_nowMs: number, bx: number, by: number, deltaSeconds: number): void {
    const T = THEME.pursuer;
    const pose = this.enemy.pose;
    this.swingAge += deltaSeconds * 1000;

    // The slam frame holds briefly after a swing resolves (tint is kept by setTexture).
    if (pose.windup < 0 && this.swingAge < T.slamMs) this.sprite.setTexture(TEX.pursuer.slam);

    if (pose.windup >= 0) {
      const t = pose.windup;
      const tel = T.telegraph;
      this.overlay.fillStyle(tel.color, Phaser.Math.Linear(tel.fillAlphaStart, tel.fillAlphaEnd, t));
      this.overlay.fillCircle(Math.round(this.enemy.x), Math.round(this.enemy.y), pose.reach);
      dottedRing(this.overlay, this.enemy.x, this.enemy.y, pose.reach, tel.color, 0.55 + 0.45 * t, 3);
      dottedRing(this.overlay, this.enemy.x, this.enemy.y, Phaser.Math.Linear(pose.reach, this.enemy.radius * 0.5, t), tel.color, 0.4 + 0.6 * t, 3);
      const top = by - this.sprite.displayHeight * this.art.originY;
      this.alert
        .setVisible(t >= tel.alertAt && Math.floor(this.visualMs / 70) % 2 === 0)
        .setPosition(bx, Math.round(top - 16));
      this.telegraph.visible = true;
      this.telegraph.progress = t;
    } else {
      this.alert.setVisible(false);
      this.telegraph.visible = false;
      this.telegraph.progress = 0;
    }
  }

  protected override hideExtras(): void {
    this.alert.setVisible(false);
    this.telegraph.visible = false;
  }

  override destroy(): void {
    this.alert.destroy();
    super.destroy();
  }
}
