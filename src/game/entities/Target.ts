import Phaser from 'phaser';
import { ARENA, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { EnemyView, type EnemyArt } from '../view/EnemyView';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import type { GameClock } from '../systems/GameClock';

const ART: EnemyArt = {
  idle: TEX.basic.frames,
  move: TEX.basic.frames,
  frameMs: THEME.basic.frameMs,
  originY: THEME.basic.originY,
  shadow: TEX.shadow.m,
  shadowOffsetY: THEME.basic.shadowOffsetY,
  hpBarOffsetY: THEME.basic.hpBarOffsetY,
  burst: THEME.basic.burst,
};

/**
 * The basic enemy: a small red slime.
 *
 * It does not shoot back and does not chase — it only drifts, so you have to
 * keep kiting rather than parking at max range. Hits, death and the mark
 * live in `Enemy`; the look lives in its view.
 */
export class Target extends Enemy {
  readonly archetype: EnemyArchetype = 'basic';

  private wanderX: number;
  private wanderY: number;
  private nextWanderAt = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number) {
    super(scene, clock, x, y, { radius: TARGETS.radius, maxHp: pips, scoreMultiplier: 1 });
    this.wanderX = x;
    this.wanderY = y;
    this.view = new EnemyView(scene, this, ART);
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, _ctx: EnemyContext): void {
    this.pose.moving = false;
    if (TARGETS.driftSpeed <= 0) return;

    if (nowMs >= this.nextWanderAt) this.pickWanderPoint(nowMs);

    const dx = this.wanderX - this.x;
    const dy = this.wanderY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = Math.min(TARGETS.driftSpeed * deltaSeconds, dist);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.pose.moving = true;
      if (Math.abs(dx) > 2) this.pose.facing = dx >= 0 ? 1 : -1;
    }
  }

  private pickWanderPoint(nowMs: number): void {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    this.wanderX = Phaser.Math.Clamp(this.x + Phaser.Math.Between(-160, 160), margin, ARENA.width - margin);
    this.wanderY = Phaser.Math.Clamp(this.y + Phaser.Math.Between(-160, 160), margin, ARENA.height - margin);
    this.nextWanderAt = nowMs + TARGETS.driftRetargetMs;
  }
}
