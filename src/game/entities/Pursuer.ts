import Phaser from 'phaser';
import { ARENA, PLAYER, PURSUER } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { PursuerView, type EnemyArt } from '../view/EnemyView';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import { scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';

/**
 * Pursuer AI states.
 *
 *   CHASE       — walk at the player's CURRENT position; swing when close and
 *                 off cooldown; dash when in the dash band and off cooldown
 *   WINDUP      — rooted, telegraphing; the swing lands at the end
 *   DASH_WINDUP — rooted, crouched, its path LOCKED and drawn on the ground
 *   DASH        — the lunge along the locked path; stops early once in reach
 *
 * There is no separate recovery state: the cooldowns are timestamps checked
 * from CHASE, so the Pursuer keeps walking between attacks instead of standing idle.
 */
export type PursuerState = 'chase' | 'windup' | 'dashWindup' | 'dash';

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

  /** What it is doing. A readout for the view and tests; only the AI writes it. */
  state: PursuerState = 'chase';
  /** Whether it dashes at all: set from the stage it spawned on. */
  canDash: boolean;
  /** Its stage's numbers (see DIFFICULTY): speed as a fraction of yours, and the two cooldowns. */
  readonly speedFraction: number;
  readonly dashCooldownMs: number;
  readonly attackCooldownMs: number;
  /** The locked dash direction, in radians. */
  dashAngle = 0;
  private dashStartedAt = 0;
  private dashEndsAt = 0;
  private dashTravelled = 0;
  /** Dash cooldown gate, measured from the START of the previous dash. Negative = first active frame. */
  private nextDashAt = -1;
  /** Set when a swing starts; the hit lands here. */
  private windupEndsAt = 0;
  /** Cooldown gate, measured from the START of the previous swing. */
  private nextAttackAt = 0;
  /** Smoothed heading, so it turns toward the player instead of snapping. */
  private facing = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number) {
    super(scene, clock, x, y, { radius: PURSUER.radius, maxHp: pips, scoreMultiplier: PURSUER.scoreMultiplier, stage });
    this.canDash = stage >= PURSUER.dash.fromStage;
    this.speedFraction = Math.min(PURSUER.maxSpeedFraction, PURSUER.moveSpeedFraction * this.moveScale);
    this.dashCooldownMs = scaled(PURSUER.scaling.dashCooldownMs, stage, PURSUER.dash.cooldownMs);
    this.attackCooldownMs = scaled(PURSUER.scaling.attackCooldownMs, stage, PURSUER.attackCooldownMs);
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
    if (this.state === 'dashWindup') {
      if (nowMs >= this.dashEndsAt) this.beginLunge(nowMs);
      return;
    }
    if (this.state === 'dash') {
      this.lunge(deltaSeconds, ctx, reach);
      return;
    }

    // A fresh Pursuer waits one second before its first dash.
    if (this.nextDashAt < 0) this.nextDashAt = nowMs + 1000;
    const D = PURSUER.dash;
    if (this.canDash && nowMs >= this.nextDashAt && !ctx.player.stunned && dist >= D.minRange && dist <= D.maxRange) {
      this.state = 'dashWindup';
      this.dashAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
      this.dashStartedAt = nowMs;
      this.dashEndsAt = nowMs + D.windupMs;
      this.nextDashAt = nowMs + this.dashCooldownMs;
      this.pose.moving = false;
      return;
    }

    // CHASE: walk down the player's *current* position — no stale targeting.
    if (dist > reach) {
      const speed = PLAYER.referenceMoveSpeed * this.speedFraction * this.slowFactor;
      // Close to 1px inside reach: stopping exactly AT reach lets float error
      // strand it a hair outside, where it would never swing.
      const step = Math.min(speed * deltaSeconds, dist - (reach - 1));
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

  /** Picked up: a swing or a dash in progress is lost; its cooldown is still spent. */
  protected override onPickedUp(): void {
    this.state = 'chase';
  }

  /** 0..1 through the dash windup, or -1 when not crouched. Read by the view. */
  dashWindupProgress(nowMs: number): number {
    if (this.state !== 'dashWindup') return -1;
    return Phaser.Math.Clamp((nowMs - this.dashStartedAt) / PURSUER.dash.windupMs, 0, 1);
  }

  private beginLunge(nowMs: number): void {
    this.state = 'dash';
    this.dashTravelled = 0;
    this.dashEndsAt = nowMs + PURSUER.dash.durationMs;
  }

  /** Move along the locked path; back to CHASE at full distance or once the player is in reach. */
  private lunge(deltaSeconds: number, ctx: EnemyContext, reach: number): void {
    const D = PURSUER.dash;
    const step = Math.min((D.distance / D.durationMs) * 1000 * deltaSeconds, D.distance - this.dashTravelled);
    this.x += Math.cos(this.dashAngle) * step;
    this.y += Math.sin(this.dashAngle) * step;
    this.dashTravelled += step;
    this.pose.moving = true;

    const m = ARENA.padding + this.radius;
    this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
    this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);

    const inReach = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) <= reach;
    if (inReach || this.dashTravelled >= D.distance - 0.01) this.state = 'chase';
  }

  private beginSwing(nowMs: number): void {
    this.state = 'windup';
    this.windupEndsAt = nowMs + PURSUER.windupMs;
    // Cooldown runs from the START of the swing, like the player's attack cycle.
    this.nextAttackAt = nowMs + this.attackCooldownMs;
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
    if (landed) ctx.damagePlayer(PURSUER.attackDamage, this.archetype);
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
