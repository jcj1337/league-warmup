import Phaser from 'phaser';
import { statusLooks } from './statusLooks';
import { DEBUG, PURSUER } from '../../config/balance';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../art/textures';
import type { Enemy } from '../entities/Enemy';
import type { Pursuer } from '../entities/Pursuer';
import type { Target } from '../entities/Target';
import { Fx } from './Fx';
import { PipBar } from './PipBar';
import { dottedLine, dottedRing } from './pixelDraw';

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
  /** Pip bar width, for a mob with too many pips for the shared one (THEME.pipBar.width). */
  hpBarWidth?: number;
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
  /** One icon per status the enemy has worn, by status id (see statusLooks). */
  private readonly statusIcons = new Map<string, Phaser.GameObjects.Image>();
  readonly hpBar: PipBar;
  /** Ground overlays under the enemy: mark ring, attack telegraph. */
  protected readonly overlay: Phaser.GameObjects.Graphics;

  /** True while the death pop is playing. */
  dying = false;

  protected visualMs = 0;
  /**
   * How the body is squashed, stretched and nudged this frame, on top of its
   * frame: reset every frame, then set by `animate()`. Scaling keeps the feet
   * planted. Pure presentation.
   */
  protected readonly body = { sx: 1, sy: 1, dx: 0, dy: 0 };
  private hitAge = Number.POSITIVE_INFINITY;
  private deathAge = 0;

  constructor(
    protected readonly scene: Phaser.Scene,
    protected readonly enemy: Enemy,
    protected art: EnemyArt,
  ) {
    const S = THEME.art.scale;
    this.shadow = scene.add.image(enemy.x, enemy.y, art.shadow).setScale(S).setDepth(THEME.depth.shadow);
    this.overlay = scene.add.graphics().setDepth(THEME.depth.groundFx);
    this.sprite = scene.add.image(enemy.x, enemy.y, art.idle[0]).setOrigin(0.5, art.originY).setScale(S);
    this.hpBar = new PipBar(scene, THEME.depth.bars, art.hpBarWidth);
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
      this.hideStatusIcons();
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
      this.hideStatusIcons();
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
    const body = this.body;
    body.sx = 1;
    body.sy = 1;
    body.dx = 0;
    body.dy = 0;
    this.animate(nowMs, deltaSeconds);
    const pop = S * (1 + 0.12 * flash);
    this.sprite.setTexture(frame);
    // Feet planted: a squashed body sinks onto them, a stretched one rises from them.
    const plant = this.sprite.height * (1 - this.art.originY) * S * (1 - body.sy);
    this.sprite
      .setVisible(true)
      .setFlipX(pose.facing < 0)
      .setPosition(bx + Math.round(body.dx), by + Math.round(body.dy + plant))
      .setAlpha(1)
      .setScale(pop * body.sx, pop * body.sy)
      .setDepth(actorDepth(e.y));
    if (flash > 0.45) this.sprite.setTintFill(THEME.fx.hit.color);
    else this.sprite.clearTint();

    this.shadow.setVisible(true).setPosition(bx, by + this.art.shadowOffsetY);

    this.hpBar.setVisible(DEBUG.healthBars === 'always' || e.hp < e.maxHp);
    this.hpBar.update(e.x, e.y + this.art.hpBarOffsetY, e.hp, e.maxHp, deltaSeconds);

    this.overlay.clear();
    this.drawStatuses(nowMs, bx, by);
    this.drawExtras(nowMs, bx, by, deltaSeconds);
  }

  /**
   * Every registered status the enemy has: its icon bobbing over the head and
   * a ring at the feet, blinking as it lapses. Loud on purpose.
   */
  private drawStatuses(nowMs: number, bx: number, by: number): void {
    for (const [id, look] of statusLooks()) {
      const remaining = this.enemy.statusRemainingMs(id, nowMs);
      const icon = this.statusIcons.get(id);
      if (remaining <= 0) {
        icon?.setVisible(false);
        continue;
      }
      const blinkOff = remaining < look.warnMs && Math.floor(remaining / 90) % 2 === 0;
      const top = by - this.sprite.displayHeight * this.art.originY;
      const bob = Math.round(Math.sin(this.visualMs * 0.008) * look.bobPx);
      this.statusIcon(id, look.icon).setVisible(!blinkOff).setPosition(bx, Math.round(top - 14 + bob));
      dottedRing(this.overlay, bx, by + 4, this.enemy.radius + 8, look.ringColor, blinkOff ? 0.35 : 0.9, 3);
    }
  }

  private statusIcon(id: string, texture: string): Phaser.GameObjects.Image {
    let icon = this.statusIcons.get(id);
    if (!icon) {
      icon = this.scene.add.image(0, 0, texture).setScale(THEME.art.scale).setDepth(THEME.depth.mark);
      this.statusIcons.set(id, icon);
    }
    return icon;
  }

  private hideStatusIcons(): void {
    for (const icon of this.statusIcons.values()) icon.setVisible(false);
  }

  /** Archetype-specific body motion: write `this.body` (squash, stretch, nudge). Default: none. */
  protected animate(_nowMs: number, _deltaSeconds: number): void {}

  /** Archetype-specific layers (weapon, telegraph). */
  protected drawExtras(_nowMs: number, _bx: number, _by: number, _deltaSeconds: number): void {}

  protected hideExtras(): void {}

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    for (const icon of this.statusIcons.values()) icon.destroy();
    this.overlay.destroy();
    this.hpBar.destroy();
  }
}

/**
 * The basic (red slime). Its spit windup shows as the hunkered, glowing-mouth
 * frame (the art's `windup`) plus a short dotted aim tick on the ground
 * pointing where the glob will go.
 */
export class BasicView extends EnemyView {
  /** Plain readout of the aim tick, for inspection. */
  readonly aim = { visible: false, angle: 0 };

  constructor(scene: Phaser.Scene, private readonly basic: Target, art: EnemyArt) {
    super(scene, basic, art);
  }

  protected override drawExtras(): void {
    const b = this.basic;
    if (!b.spitting) {
      this.aim.visible = false;
      return;
    }
    const A = THEME.basic.spitAim;
    const t = Math.max(0, b.pose.windup);
    const dx = Math.cos(b.spitAngle);
    const dy = Math.sin(b.spitAngle);
    const from = b.radius + 4;
    dottedLine(
      this.overlay,
      b.x + dx * from, b.y + dy * from,
      b.x + dx * (from + A.lengthPx), b.y + dy * (from + A.lengthPx),
      A.color, Phaser.Math.Linear(A.alphaStart, A.alphaEnd, t), 3, 7,
    );
    this.aim.visible = true;
    this.aim.angle = b.spitAngle;
  }

  protected override hideExtras(): void {
    this.aim.visible = false;
  }
}

/**
 * The Pursuer (horned purple slime) adds a very loud attack telegraph: across
 * the real 400ms windup it rears up with white-hot eyes, the ground under its
 * actual reach warms up red, a ring contracts onto it and a "!" flashes over
 * its head. When the swing resolves it flattens into a slam, with a slash only
 * if it connected.
 *
 * Its dash reads the same way: crouched low with white-hot eyes while the
 * locked path warms up red on the ground, then afterimages along the lunge.
 */
export class PursuerView extends EnemyView {
  readonly alert: Phaser.GameObjects.Image;
  /** Plain readout of the telegraph, for inspection. */
  readonly telegraph = { visible: false, progress: 0 };
  /** Plain readout of the dash path telegraph, for inspection. */
  readonly dashPath = { visible: false, angle: 0 };
  private swingAge = Number.POSITIVE_INFINITY;

  constructor(scene: Phaser.Scene, private readonly pursuer: Pursuer, art: EnemyArt) {
    super(scene, pursuer, art);
    const S = THEME.art.scale;
    this.alert = scene.add.image(pursuer.x, pursuer.y, TEX.pursuer.alert).setScale(S).setDepth(THEME.depth.mark).setVisible(false);
  }

  /** The swing resolved. `landed` = the player was still in reach. */
  strike(landed: boolean, towardX: number, towardY: number, reach: number): void {
    this.swingAge = 0;
    if (landed) {
      const angle = Math.atan2(towardY - this.enemy.y, towardX - this.enemy.x);
      Fx.of(this.scene).slash(this.enemy.x, this.enemy.y, angle, reach, THEME.pursuer.slashColor);
    }
  }

  protected override drawExtras(nowMs: number, bx: number, by: number, deltaSeconds: number): void {
    const T = THEME.pursuer;
    const pose = this.enemy.pose;
    this.swingAge += deltaSeconds * 1000;
    this.drawDash(nowMs);

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

  /** Dash windup: crouch + the locked path warming up red. Lunge: afterimage puffs. */
  private drawDash(nowMs: number): void {
    const p = this.pursuer;
    const D = THEME.pursuer.dash;
    const t = p.dashWindupProgress(nowMs);
    if (t >= 0) {
      this.sprite.setTexture(TEX.pursuer.crouch);
      const len = PURSUER.dash.distance + p.radius;
      const half = p.radius * 0.8;
      const dx = Math.cos(p.dashAngle);
      const dy = Math.sin(p.dashAngle);
      const nx = -dy * half;
      const ny = dx * half;
      const ex = p.x + dx * len;
      const ey = p.y + dy * len;
      this.overlay.fillStyle(D.color, Phaser.Math.Linear(D.fillAlphaStart, D.fillAlphaEnd, t));
      this.overlay.fillPoints([
        { x: p.x + nx, y: p.y + ny }, { x: ex + nx, y: ey + ny },
        { x: ex - nx, y: ey - ny }, { x: p.x - nx, y: p.y - ny },
      ], true);
      dottedLine(this.overlay, p.x + nx, p.y + ny, ex + nx, ey + ny, D.color, 0.5 + 0.5 * t);
      dottedLine(this.overlay, p.x - nx, p.y - ny, ex - nx, ey - ny, D.color, 0.5 + 0.5 * t);
      Object.assign(this.dashPath, { visible: true, angle: p.dashAngle });
      return;
    }
    this.dashPath.visible = false;
    if (p.state === 'dash') {
      Fx.of(this.scene).trail(p.x, p.y, { color: D.trail, life: 180, size: 9 });
    }
  }

  protected override hideExtras(): void {
    this.alert.setVisible(false);
    this.telegraph.visible = false;
    this.dashPath.visible = false;
  }

  override destroy(): void {
    this.alert.destroy();
    super.destroy();
  }
}
