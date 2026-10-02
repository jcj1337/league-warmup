import Phaser from 'phaser';
import { ARENA, PLAYER, PURSUER } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { PursuerView, type EnemyArt } from '../view/EnemyView';
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

const ART: EnemyArt = {
  idle: TEX.pursuer.walk.slice(0, 1),
  move: TEX.pursuer.walk,
  windup: TEX.pursuer.windup,
  frameMs: THEME.pursuer.frameMs,
  originY: THEME.pursuer.originY,
  shadow: TEX.shadow.l,
  shadowOffsetY: THEME.pursuer.shadowOffsetY,
  hpBarOffsetY: THEME.pursuer.hpBarOffsetY,
  burst: THEME.pursuer.burst,
};

/**
 * The Pursuer: a heavy, slower-than-you melee brute (a horned purple slime).
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
  declare view: PursuerView;

  private state: PursuerState = 'chase';
  /** Set when a swing starts; the hit lands here. */
  private windupEndsAt = 0;
  /** Cooldown gate, measured from the START of the previous swing. */
  private nextAttackAt = 0;
  /** Smoothed heading, so it turns toward the player instead of snapping. */
  private facing = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number) {
    super(scene, clock, x, y, { radius: PURSUER.radius, maxHp: pips, scoreMultiplier: PURSUER.scoreMultiplier });
    this.view = new PursuerView(scene, this, ART);
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

    // Always turn toward the player, even mid-swing, so the threat direction is readable.
    this.facing = Phaser.Math.Angle.RotateTo(this.facing, Math.atan2(dy, dx), 0.12);
    this.publishPose(nowMs, reach, false);

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
      this.pose.moving = true;

      // Never walk out of the arena.
      const m = ARENA.padding + this.radius;
      this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
      this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
    } else if (nowMs >= this.nextAttackAt && !ctx.player.stunned) {
      // Never starts a swing on a stunned player: a Magus stun must not turn
      // into a guaranteed hit you had no way to walk out of.
      this.beginSwing(nowMs);
      this.publishPose(nowMs, reach, false);
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
    this.pose.windup = -1;

    const dist = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y);
    const landed = dist <= reach;
    if (landed) ctx.damagePlayer(PURSUER.attackDamage);
    this.view.strike(landed, ctx.player.x, ctx.player.y, reach);
  }

  /** Publish what the AI is doing for the view. Visual readout only. */
  private publishPose(nowMs: number, reach: number, moving: boolean): void {
    this.pose.moving = moving;
    this.pose.reach = reach;
    if (Math.abs(Math.cos(this.facing)) > 0.2) this.pose.facing = Math.cos(this.facing) >= 0 ? 1 : -1;
    this.pose.windup = this.state === 'windup'
      ? Phaser.Math.Clamp(1 - (this.windupEndsAt - nowMs) / PURSUER.windupMs, 0, 1)
      : -1;
  }
}
