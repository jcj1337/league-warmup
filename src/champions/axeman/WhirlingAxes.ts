import type Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Enemy } from '../../game/entities/Enemy';
import { Fx } from '../../game/view/Fx';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import { ProjectileView } from '../../game/view/ProjectileView';

export type WhirlLeg = 'out' | 'back';

/**
 * His R in flight: axes that cross the arena in a straight line, turn at its
 * edge, and fly back to him wherever he is. They pass through everything,
 * hitting each enemy once on the way out and once on the way back.
 */
export class WhirlingAxes {
  alive = true;
  leg: WhirlLeg = 'out';
  x: number;
  y: number;
  private travelled = 0;
  private readonly struck = new Set<Enemy>();
  private readonly view: ProjectileView;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private angle: number,
    private readonly spec: { speed: number; radius: number; maxRange: number },
    private readonly onHit: (target: Enemy, leg: WhirlLeg) => void,
  ) {
    this.x = x;
    this.y = y;
    this.view = new ProjectileView(scene, PROJECTILE_ART.cleave, x, y, angle, THEME.axeman.whirlScale);
  }

  update(deltaSeconds: number, enemies: readonly Enemy[], home: { x: number; y: number; radius: number }): void {
    if (!this.alive) return;
    const step = this.spec.speed * deltaSeconds;

    if (this.leg === 'out') {
      this.x += Math.cos(this.angle) * step;
      this.y += Math.sin(this.angle) * step;
      this.travelled += step;
      const outside = this.x < ARENA.padding || this.x > ARENA.width - ARENA.padding
        || this.y < ARENA.padding || this.y > ARENA.height - ARENA.padding;
      if (outside || this.travelled >= this.spec.maxRange) {
        // The turn: everything it passed can be hit again on the way home.
        this.leg = 'back';
        this.struck.clear();
      }
    } else {
      const dx = home.x - this.x;
      const dy = home.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step + home.radius) {
        this.kill();
        return;
      }
      this.angle = Math.atan2(dy, dx);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }

    for (const target of enemies) {
      if (!target.active || this.struck.has(target)) continue;
      if (Math.hypot(target.x - this.x, target.y - this.y) > this.spec.radius + target.radius) continue;
      this.struck.add(target);
      Fx.of(this.scene).impact('axe', target.x, target.y);
      this.onHit(target, this.leg);
    }
    this.view.sync(this.x, this.y, deltaSeconds, this.angle);
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.view.destroy();
  }
}
