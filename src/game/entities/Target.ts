import Phaser from 'phaser';
import { ARENA, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { BasicView, type EnemyArt } from '../view/EnemyView';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import { projectileSpeed, scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';

const ART: EnemyArt = {
  idle: TEX.basic.frames,
  move: TEX.basic.frames,
  windup: TEX.basic.spit,
  frameMs: THEME.basic.frameMs,
  originY: THEME.basic.originY,
  shadow: TEX.shadow.m,
  shadowOffsetY: THEME.basic.shadowOffsetY,
  hpBarOffsetY: THEME.basic.hpBarOffsetY,
  burst: THEME.basic.burst,
};

/**
 * Basic AI modes, re-decided at each plan tick.
 *
 *   APPROACH — outside the pressure band: head for the band edge nearest the
 *              player, re-reading the player often
 *   RETREAT  — inside the band's inner edge: ease back out to it
 *   STRAFE   — in the band: sidestep around the player, sometimes reversing
 */
export type BasicMode = 'approach' | 'retreat' | 'strafe';

/**
 * The basic enemy: a small red slime.
 *
 * Always aggroed. It walks toward the player, then hovers in a pressure band
 * inside the player's attack range and shuffles sideways, so it crowds spacing
 * and target selection without becoming a second melee threat — that job
 * belongs to the Pursuer.
 *
 * From TARGETS.spit.fromStage it also spits: rooted for a short windup (only
 * while holding one of the shared attack tokens), then a slow glob at where
 * the player is at that instant. A crowd of them is a dodging drill from
 * every direction, never all at once.
 *
 * Movement steers toward one goal point (`goalX/goalY`) chosen at each plan
 * tick (`nextPlanAt`), so the slime reacts with a short, readable delay rather
 * than tracking the player frame-perfectly. Hits, death and the mark live in
 * `Enemy`; the look lives in its view.
 */
export class Target extends Enemy {
  readonly archetype: EnemyArchetype = 'basic';
  declare view: BasicView;

  /** Whether it spits at all: set from the stage it spawned on. */
  canSpit: boolean;
  /** Its stage's spit cooldown and glob speed (see DIFFICULTY). */
  readonly spitCooldownMs: number;
  readonly spitSpeed: number;
  /** True while rooted in a spit windup. A readout for the view; only the AI writes it. */
  spitting = false;
  /** Where the spit points, in radians. Tracks the player through the windup. */
  spitAngle = 0;
  private spitStartedAt = 0;
  private spitEndsAt = 0;
  /** Earliest time of the next windup. Negative = not scheduled yet (first active frame). */
  private nextSpitAt = -1;

  /** What the last plan tick decided. A readout for inspection and visuals; only the AI writes it. */
  mode: BasicMode = 'approach';
  private goalX: number;
  private goalY: number;
  /** Clock time of the next plan tick. 0 = plan on the first active frame. */
  private nextPlanAt = 0;
  private moveSpeed: number = TARGETS.approachSpeed;
  /** Strafe direction around the player: 1 = counter-clockwise, -1 = clockwise. */
  private strafeDir = Math.random() < 0.5 ? 1 : -1;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number) {
    super(scene, clock, x, y, { radius: TARGETS.radius, maxHp: pips, scoreMultiplier: 1, stage });
    this.goalX = x;
    this.goalY = y;
    this.canSpit = stage >= TARGETS.spit.fromStage;
    this.spitCooldownMs = scaled(TARGETS.scaling.spitCooldownMs, stage, TARGETS.spit.cooldownMs);
    this.spitSpeed = projectileSpeed(TARGETS.spit.speed, stage);
    this.view = new BasicView(scene, this, ART);
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    this.pose.moving = false;
    // Always face the player: it is aggroed even while sidestepping.
    if (Math.abs(ctx.player.x - this.x) > 2) this.pose.facing = ctx.player.x >= this.x ? 1 : -1;
    if (this.updateSpit(nowMs, ctx)) return;
    if (this.moveSpeed <= 0) return;

    if (nowMs >= this.nextPlanAt) this.plan(nowMs, ctx);

    const dx = this.goalX - this.x;
    const dy = this.goalY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = Math.min(this.moveSpeed * this.slowFactor * deltaSeconds, dist);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.pose.moving = true;
    }

    // Never walk (or get shoved) out of the arena.
    const m = ARENA.padding + this.radius;
    this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
    this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
  }

  /**
   * The spit cycle: wait out the cooldown, take a token, wind up rooted, fire
   * at where the player is now, hand the token back.
   * @returns true while rooted in the windup.
   */
  private updateSpit(nowMs: number, ctx: EnemyContext): boolean {
    if (!this.canSpit) return false;
    const S = TARGETS.spit;
    const dx = ctx.player.x - this.x;
    const dy = ctx.player.y - this.y;
    // First active frame: stagger the opening spit so a fresh wave never fires in unison.
    if (this.nextSpitAt < 0) this.nextSpitAt = nowMs + this.spitCooldownMs * Phaser.Math.FloatBetween(0.3, 1);

    if (this.spitting) {
      this.spitAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
      if (nowMs < this.spitEndsAt) {
        this.pose.windup = Phaser.Math.Clamp((nowMs - this.spitStartedAt) / S.windupMs, 0, 1);
        return true;
      }
      ctx.spells.fireGlob({
        source: this.archetype,
        x: this.x + Math.cos(this.spitAngle) * this.radius,
        y: this.y + Math.sin(this.spitAngle) * this.radius,
        angle: this.spitAngle,
        speed: this.spitSpeed,
        radius: S.radius,
        range: S.range,
        damage: S.damage,
      });
      ctx.attackTokens.release(this);
      this.spitting = false;
      this.pose.windup = -1;
      this.nextSpitAt = nowMs + this.spitCooldownMs * Phaser.Math.FloatBetween(1 - S.cooldownJitter, 1 + S.cooldownJitter);
      return false;
    }

    if (nowMs < this.nextSpitAt || Math.hypot(dx, dy) > S.range || !ctx.attackTokens.tryTake(this)) return false;
    this.spitting = true;
    this.spitStartedAt = nowMs;
    this.spitEndsAt = nowMs + S.windupMs;
    this.spitAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
    this.pose.windup = 0;
    return true;
  }

  /** Pick this tick's mode, goal point and speed from where the player is now. */
  private plan(nowMs: number, ctx: EnemyContext): void {
    const band = TARGETS.pressureBand;
    const px = ctx.player.x;
    const py = ctx.player.y;
    const dist = Math.hypot(this.x - px, this.y - py);
    // Bearing from the player out to this slime.
    const bearing = Math.atan2(this.y - py, this.x - px);

    if (dist > band.max) {
      this.mode = 'approach';
      this.moveSpeed = TARGETS.approachSpeed * this.moveScale;
      this.nextPlanAt = nowMs + TARGETS.approachReplanMs;
      this.setGoal(px, py, [bearing], band.max - 10);
    } else if (dist < band.min) {
      this.mode = 'retreat';
      this.moveSpeed = TARGETS.strafeSpeed * this.moveScale;
      this.nextPlanAt = nowMs + TARGETS.approachReplanMs;
      // Straight back out if there is room; pinned against a wall, back off at an angle.
      this.setGoal(px, py, [bearing, bearing + 0.7, bearing - 0.7, bearing + 1.4, bearing - 1.4], band.min + 10);
    } else {
      this.mode = 'strafe';
      this.moveSpeed = TARGETS.strafeSpeed * this.moveScale;
      this.nextPlanAt = nowMs + Phaser.Math.Between(TARGETS.strafeReplanMs.min, TARGETS.strafeReplanMs.max);
      if (Math.random() < TARGETS.strafeFlipChance) this.strafeDir *= -1;
      const arc = Phaser.Math.DegToRad(TARGETS.strafeArcDegrees) * this.strafeDir;
      const radius = Phaser.Math.FloatBetween(band.min, band.max);
      // A wall one way: sidestep the other way instead.
      if (!this.setGoal(px, py, [bearing + arc], radius)) {
        this.strafeDir *= -1;
        this.setGoal(px, py, [bearing - arc, bearing], radius);
      }
    }
  }

  /**
   * Aim at the first point `radius` from the player along one of `angles` that
   * lies inside the arena, so a wall cannot squeeze the slime into melee. With
   * none in bounds, falls back to the first angle, clamped.
   * @returns whether an in-bounds point was found.
   */
  private setGoal(px: number, py: number, angles: number[], radius: number): boolean {
    const m = ARENA.padding + TARGETS.edgeMargin * 0.5;
    for (const a of angles) {
      const x = px + Math.cos(a) * radius;
      const y = py + Math.sin(a) * radius;
      if (x >= m && x <= ARENA.width - m && y >= m && y <= ARENA.height - m) {
        this.goalX = x;
        this.goalY = y;
        return true;
      }
    }
    this.goalX = Phaser.Math.Clamp(px + Math.cos(angles[0]) * radius, m, ARENA.width - m);
    this.goalY = Phaser.Math.Clamp(py + Math.sin(angles[0]) * radius, m, ARENA.height - m);
    return false;
  }
}
