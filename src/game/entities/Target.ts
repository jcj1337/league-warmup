import Phaser from 'phaser';
import { ARENA, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import type { GameClock } from '../systems/GameClock';

/** Flat-top hexagon points, centred on (0,0). */
function hexPoints(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/**
 * The basic target dummy: a compact red hexagon.
 *
 * It does not shoot back and does not chase — it only drifts, so you have to
 * keep kiting rather than parking at max range. Everything about damage, death,
 * health bars and feedback lives in `Enemy`.
 */
export class Target extends Enemy {
  readonly archetype: EnemyArchetype = 'basic';

  private wanderX: number;
  private wanderY: number;
  private nextWanderAt = 0;

  private readonly hull: Phaser.GameObjects.Polygon;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, maxHp: number) {
    super(scene, clock, x, y, {
      radius: TARGETS.radius,
      maxHp,
      scoreMultiplier: 1,
      hpBarWidth: TARGETS.hpBarWidth,
      hpBarHeight: TARGETS.hpBarHeight,
      hpBarOffsetY: TARGETS.hpBarOffsetY,
      burstColor: THEME.target.plateColor,
      shadowAlpha: THEME.target.shadowAlpha,
    });

    this.wanderX = x;
    this.wanderY = y;

    // Hostiles are hexagons: a completely different silhouette from the
    // player's dart, so friend/foe reads instantly even at the edge of vision.
    this.hull = scene.add
      .polygon(0, 0, hexPoints(this.radius), THEME.target.core)
      .setOrigin(0, 0);
    this.hull.setStrokeStyle(2.5, THEME.target.outline, 0.95);

    const innerPlate = scene.add
      .polygon(0, 0, hexPoints(this.radius * 0.62), THEME.target.coreDark, 0.85)
      .setOrigin(0, 0);
    const eye = scene.add.circle(0, 0, this.radius * 0.22, THEME.target.plateColor, 0.95);

    this.body = scene.add.container(x, y, [this.hull, innerPlate, eye]).setDepth(8);
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, _ctx: EnemyContext): void {
    if (TARGETS.driftSpeed <= 0) return;

    if (nowMs >= this.nextWanderAt) this.pickWanderPoint(nowMs);

    const dx = this.wanderX - this.x;
    const dy = this.wanderY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = Math.min(TARGETS.driftSpeed * deltaSeconds, dist);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  private pickWanderPoint(nowMs: number): void {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    this.wanderX = Phaser.Math.Clamp(this.x + Phaser.Math.Between(-160, 160), margin, ARENA.width - margin);
    this.wanderY = Phaser.Math.Clamp(this.y + Phaser.Math.Between(-160, 160), margin, ARENA.height - margin);
    this.nextWanderAt = nowMs + TARGETS.driftRetargetMs;
  }

  protected syncBody(nowMs: number, flash: number): void {
    // Slow spin, plus a brief squash + brightening on hit.
    this.body
      .setPosition(this.x, this.y)
      .setScale(1 + 0.22 * flash)
      .setRotation(nowMs * THEME.target.spinSpeed);
    this.hull.setFillStyle(flash > 0.35 ? THEME.target.hitFlashColor : THEME.target.core);
  }
}
