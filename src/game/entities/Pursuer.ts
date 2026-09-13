import Phaser from 'phaser';
import { ARENA, PLAYER, PURSUER } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import type { GameClock } from '../systems/GameClock';

/**
 * Pursuer AI states.
 *
 *   CHASE  — walk at the player's CURRENT position; swing when close and off
 *            cooldown
 *   WINDUP — rooted, telegraphing; the swing lands at the end
 *
 * There is no separate recovery state: the cooldown is a timestamp checked from
 * CHASE, so the Pursuer keeps walking between swings instead of standing idle.
 */
type PursuerState = 'chase' | 'windup';

/**
 * The Pursuer: a heavy, slower-than-you melee stalker.
 *
 * Its whole job is to punish standing still. It is deliberately slower than the
 * player (see PURSUER.moveSpeedFraction), so correct kiting always maintains
 * spacing — but ignoring it costs HP.
 *
 * It is a normal `Enemy`, so autos, Q, attack-move, right-click, scoring and the
 * passive all work on it with no special-casing anywhere.
 */
export class Pursuer extends Enemy {
  readonly archetype: EnemyArchetype = 'pursuer';

  private state: PursuerState = 'chase';
  /** Set when a swing starts; the hit lands here. */
  private windupEndsAt = 0;
  /** Cooldown gate, measured from the START of the previous swing. */
  private nextAttackAt = 0;
  /** Smoothed heading, so it banks toward the player instead of snapping. */
  private facing = 0;
  /** Drives the idle "tread" wobble. */
  private gait = 0;

  private readonly hull: Phaser.GameObjects.Polygon;
  private readonly innerPlate: Phaser.GameObjects.Polygon;
  private readonly eye: Phaser.GameObjects.Arc;
  /** Telegraph ring: appears only while winding up a swing. */
  private readonly windupRing: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, maxHp: number) {
    super(scene, clock, x, y, {
      radius: PURSUER.radius,
      maxHp,
      scoreMultiplier: PURSUER.scoreMultiplier,
      hpBarWidth: PURSUER.hpBarWidth,
      hpBarHeight: PURSUER.hpBarHeight,
      hpBarOffsetY: PURSUER.hpBarOffsetY,
      burstColor: THEME.pursuer.accent,
      shadowAlpha: THEME.pursuer.shadowAlpha,
    });

    const r = this.radius;

    // An arrowhead with swept-back barbs: heavier and more aggressive than the
    // basic target's neat hexagon, and its point shows which way it is coming.
    this.hull = scene.add
      .polygon(
        0,
        0,
        [
          r * 1.15, 0,
          -r * 0.25, r * 0.95,
          -r * 0.85, r * 0.55,
          -r * 0.55, 0,
          -r * 0.85, -r * 0.55,
          -r * 0.25, -r * 0.95,
        ],
        THEME.pursuer.core,
      )
      .setOrigin(0, 0);
    this.hull.setStrokeStyle(3, THEME.pursuer.outline, 0.95);

    this.innerPlate = scene.add
      .polygon(0, 0, [r * 0.5, 0, -r * 0.2, r * 0.42, -r * 0.2, -r * 0.42], THEME.pursuer.coreDark, 0.9)
      .setOrigin(0, 0);

    this.eye = scene.add.circle(r * 0.45, 0, r * 0.16, THEME.pursuer.eye, 0.95);

    this.windupRing = scene.add
      .circle(x, y, r + 10, 0x000000, 0)
      .setStrokeStyle(3, THEME.pursuer.windupColor, 0.9)
      .setDepth(7)
      .setVisible(false);

    this.body = scene.add.container(x, y, [this.hull, this.innerPlate, this.eye]).setDepth(8);
  }

  /** Centre-to-centre distance at which its swing connects. */
  private reachTo(ctx: EnemyContext): number {
    return this.radius + ctx.player.radius + PURSUER.attackRange;
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    const dx = ctx.player.x - this.x;
    const dy = ctx.player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const reach = this.reachTo(ctx);

    // Always bank toward the player, even mid-swing, so the telegraph points at
    // you and the threat direction is readable.
    this.facing = Phaser.Math.Angle.RotateTo(this.facing, Math.atan2(dy, dx), 0.12);

    if (this.state === 'windup') {
      if (nowMs >= this.windupEndsAt) this.resolveSwing(ctx, reach);
      return;
    }

    // CHASE: walk down the player's *current* position — no stale targeting.
    if (dist > reach) {
      const speed = PLAYER.moveSpeed * PURSUER.moveSpeedFraction;
      const step = Math.min(speed * deltaSeconds, dist - reach);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.gait += deltaSeconds * 9;

      // Never walk out of the arena.
      const m = ARENA.padding + this.radius;
      this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
      this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
    } else if (nowMs >= this.nextAttackAt) {
      this.beginSwing(nowMs);
    }
  }

  private beginSwing(nowMs: number): void {
    this.state = 'windup';
    this.windupEndsAt = nowMs + PURSUER.windupMs;
    // Cooldown runs from the START of the swing, like the player's attack cycle.
    this.nextAttackAt = nowMs + PURSUER.attackCooldownMs;
  }

  /**
   * The swing lands. Damage is only applied if the player is STILL in reach —
   * walking out during the telegraph is the intended counterplay.
   */
  private resolveSwing(ctx: EnemyContext, reach: number): void {
    this.state = 'chase';

    const dist = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y);
    if (dist <= reach) {
      ctx.damagePlayer(PURSUER.attackDamage);
      this.playStrike(ctx);
    }
  }

  /** Quick slash arc thrown out in the facing direction when a swing connects. */
  private playStrike(ctx: EnemyContext): void {
    const slash = this.scene.add
      .circle(this.x, this.y, this.radius + 6, 0x000000, 0)
      .setStrokeStyle(4, THEME.pursuer.windupColor, 0.95)
      .setDepth(12);

    this.scene.tweens.add({
      targets: slash,
      radius: this.radius + 26,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => slash.destroy(),
    });
    void ctx;
  }

  protected syncBody(nowMs: number, flash: number): void {
    // Heavy tread: a slight side-to-side roll while walking.
    const roll = Math.sin(this.gait) * 0.05;

    this.body
      .setPosition(this.x, this.y)
      .setRotation(this.facing + roll)
      .setScale(1 + 0.18 * flash);

    const windingUp = this.state === 'windup';
    this.hull.setFillStyle(
      flash > 0.35 ? THEME.pursuer.accent : windingUp ? THEME.pursuer.windupColor : THEME.pursuer.core,
    );
    this.eye.setFillStyle(windingUp ? 0xffffff : THEME.pursuer.eye);

    // Telegraph ring contracts onto the body across the windup — the same
    // language as the player's own charge ring.
    if (windingUp) {
      const remaining = Math.max(0, this.windupEndsAt - nowMs);
      const t = 1 - remaining / PURSUER.windupMs;
      this.windupRing
        .setVisible(true)
        .setPosition(this.x, this.y)
        .setRadius(this.radius + 16 - 12 * t)
        .setStrokeStyle(2 + 2 * t, THEME.pursuer.windupColor, 0.45 + 0.5 * t);
    } else {
      this.windupRing.setVisible(false);
    }
  }

  override destroy(): void {
    this.windupRing.destroy();
    super.destroy();
  }
}
