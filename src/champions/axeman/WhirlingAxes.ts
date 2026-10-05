import type Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Enemy } from '../../game/entities/Enemy';
import { Fx } from '../../game/view/Fx';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import { ProjectileView } from '../../game/view/ProjectileView';

export type WhirlLeg = 'out' | 'back';

/**
 * His R in flight: axes that fly out in a straight line, turn, and fly back
 * to him wherever he is. They turn a little past the first enemy they hit
 * (`overshootPx`), at once when recalled, or at the arena's edge. They pass
 * through everything, hitting each enemy once on the way out and once on the
 * way back.
 */
export class WhirlingAxes {
  alive = true;
  leg: WhirlLeg = 'out';
  x: number;
  y: number;
  private travelled = 0;
  /** Px left to fly before turning, once it has hit something. Null until then. */
  private turnIn: number | null = null;
  private readonly struck = new Set<Enemy>();
  private readonly view: ProjectileView;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private angle: number,
    private readonly spec: { speed: number; radius: number; maxRange: number; overshootPx: number },
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
      if (this.turnIn !== null) this.turnIn -= step;
      const outside = this.x < ARENA.padding || this.x > ARENA.width - ARENA.padding
        || this.y < ARENA.padding || this.y > ARENA.height - ARENA.padding;
      if (outside || this.travelled >= this.spec.maxRange || (this.turnIn !== null && this.turnIn <= 0)) this.recall();
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
      // The first thing it hits on the way out starts the turn: a little further, then home.
      if (this.leg === 'out' && this.turnIn === null) this.turnIn = this.spec.overshootPx;
      this.onHit(target, this.leg);
    }
    this.view.sync(this.x, this.y, deltaSeconds, this.angle);
  }

  /** Turn for home now. Everything it passed can be hit again on the way. */
  recall(): void {
    if (this.leg !== 'out') return;
    this.leg = 'back';
    this.struck.clear();
  }

  kill(): void {
    if (!this.alive) return;
    this.alive = false;
    this.view.destroy();
  }
}
