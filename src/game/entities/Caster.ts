import Phaser from 'phaser';
import { ARENA, PLAYER, TARGETS } from '../../config/balance';
import { Enemy, type EnemyContext, type EnemyOptions } from './Enemy';
import type { GameClock } from '../systems/GameClock';

/** What a caster's spacing and aim read from its config block (MAGUS, SOVEREIGN). */
export interface CasterTuning {
  /** Fraction of PLAYER.referenceMoveSpeed. Below 1, so you can always run it down. */
  moveSpeedFraction: number;
  /** Centre-to-centre band it holds from the player. */
  spacing: { min: number; max: number };
  /** How often it re-reads where to stand. */
  replanMs: number;
  /** Share of the way to where the player will be when a spell lands. */
  aimLead: number;
}

/**
 * Shared ground for the ranged casters (Magus, Sovereign): holding a spacing
 * band around the player, and aiming like a player would — where you're
 * heading when the spell lands (`aimLead`), plus a random offset rolled once
 * per cast (`rollAimOffset`) so the telegraph stays steady.
 */
export abstract class Caster extends Enemy {
  /** This cast's random aim offset, added to every aim point. */
  aimOffset = { x: 0, y: 0 };

  private goalX: number;
  private goalY: number;
  private nextPlanAt = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, opts: EnemyOptions) {
    super(scene, clock, x, y, opts);
    this.goalX = x;
    this.goalY = y;
  }

  protected abstract get tuning(): CasterTuning;

  /**
   * Where it aims: where the player will be `impactMs` from now at their
   * current velocity, `aimLead` of the way, plus this cast's random offset,
   * kept in the arena.
   */
  protected aimPoint(ctx: EnemyContext, impactMs: number, leadFraction = this.tuning.aimLead): { x: number; y: number } {
    const lead = (leadFraction * impactMs) / 1000;
    const m = ARENA.padding + ctx.player.radius;
    return {
      x: Phaser.Math.Clamp(ctx.player.x + ctx.player.vx * lead + this.aimOffset.x, m, ARENA.width - m),
      y: Phaser.Math.Clamp(ctx.player.y + ctx.player.vy * lead + this.aimOffset.y, m, ARENA.height - m),
    };
  }

  /** Pick this cast's aim offset: a uniformly random point within `radius`. */
  rollAimOffset(radius: number): void {
    const r = radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    this.aimOffset = { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  /** Walk toward this plan tick's goal (see plan), staying in the arena. */
  protected reposition(deltaSeconds: number, nowMs: number, ctx: EnemyContext, dist: number): void {
    if (nowMs >= this.nextPlanAt) this.plan(nowMs, ctx, dist);

    const dx = this.goalX - this.x;
    const dy = this.goalY - this.y;
    const toGoal = Math.hypot(dx, dy);
    if (toGoal > 2) {
      const step = Math.min(PLAYER.referenceMoveSpeed * this.tuning.moveSpeedFraction * this.moveScale * deltaSeconds, toGoal);
      this.x += (dx / toGoal) * step;
      this.y += (dy / toGoal) * step;
      this.pose.moving = true;
    }

    const m = ARENA.padding + this.radius;
    this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
    this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
  }

  /**
   * Choose where to stand: walk in when you are beyond the band, back off when
   * you are inside it (sliding along a wall if straight back is blocked), and
   * otherwise hold still. Cornered with nowhere to go, it stands its ground.
   */
  private plan(nowMs: number, ctx: EnemyContext, dist: number): void {
    const { spacing, replanMs } = this.tuning;
    this.nextPlanAt = nowMs + replanMs;
    const { min, max } = spacing;
    const px = ctx.player.x;
    const py = ctx.player.y;
    const bearing = Math.atan2(this.y - py, this.x - px);

    if (dist > max) {
      if (!this.setGoal(px, py, [bearing], max - 20)) {
        const m = ARENA.padding + TARGETS.edgeMargin * 0.5;
        this.goalX = Phaser.Math.Clamp(px + Math.cos(bearing) * (max - 20), m, ARENA.width - m);
        this.goalY = Phaser.Math.Clamp(py + Math.sin(bearing) * (max - 20), m, ARENA.height - m);
      }
    } else if (dist < min) {
      const fan = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8].map((d) => bearing + d);
      if (!this.setGoal(px, py, fan, min + 30)) {
        this.goalX = this.x;
        this.goalY = this.y;
      }
    } else {
      this.goalX = this.x;
      this.goalY = this.y;
    }
  }

  /**
   * Aim at the first point `radius` from the player along one of `angles` that
   * lies inside the arena.
   * @returns whether one was found.
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
    return false;
  }
}
