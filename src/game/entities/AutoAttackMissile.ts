import Phaser from 'phaser';
import { ATTACK } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { Enemy } from './Enemy';

/**
 * The player's basic-attack projectile.
 *
 * It exists purely to make the attack readable and to delay the damage until it
 * visibly connects. It carries NO authority over the attack cycle: the auto is
 * already committed and the cooldown already running by the time this is
 * constructed, so travel time never gates the next attack.
 *
 * It tracks its target (League autos do not miss), and fizzles harmlessly if
 * the target dies or is recycled before it lands.
 */
/** Per-ability look and speed, so autos and the E bolt share one missile. */
export interface HomingMissileSpec {
  speed: number;
  radius: number;
  color: number;
  coreColor: number;
}

/** The player's basic attack missile spec. */
export const AUTO_MISSILE_SPEC = (): HomingMissileSpec => ({
  speed: ATTACK.projectileSpeed,
  radius: ATTACK.projectileRadius,
  color: THEME.projectiles.autoColor,
  coreColor: THEME.projectiles.autoCore,
});

export class AutoAttackMissile {
  public alive = true;

  private x: number;
  private y: number;

  private readonly body: Phaser.GameObjects.Polygon;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly trail: Phaser.GameObjects.Line;
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    startX: number,
    startY: number,
    private readonly target: Enemy,
    /** Identifies the specific life of the target, so a respawn is not hit. */
    private readonly targetSpawnId: number,
    private readonly damage: number,
    private readonly onHit: (target: Enemy, damage: number) => void,
    private readonly spec: HomingMissileSpec = AUTO_MISSILE_SPEC(),
  ) {
    this.scene = scene;
    this.x = startX;
    this.y = startY;

    // Streak behind the bolt, redrawn from the previous position each frame.
    // The colour is per-ability, so autos (cyan) and the E bolt (pink) stay
    // distinguishable even though they share this class.
    this.trail = scene.add
      .line(0, 0, 0, 0, 0, 0, spec.color, 0.4)
      .setOrigin(0, 0)
      .setLineWidth(spec.radius * 0.5)
      .setDepth(11);

    // An elongated dart rather than a ball — direction is readable in a still.
    const r = spec.radius;
    this.body = scene.add
      .polygon(startX, startY, [r * 2.1, 0, -r, r * 0.85, -r * 0.4, 0, -r, -r * 0.85], spec.color)
      .setOrigin(0, 0)
      .setDepth(12);
    this.body.setStrokeStyle(1, 0xffffff, 0.6);

    this.core = scene.add.circle(startX, startY, r * 0.42, spec.coreColor, 0.95).setDepth(13);
  }

  update(deltaSeconds: number): void {
    if (!this.alive) return;

    // The target may have died (or respawned) mid-flight — fizzle quietly.
    if (!this.target.active || this.target.spawnId !== this.targetSpawnId) {
      this.kill();
      return;
    }

    const prevX = this.x;
    const prevY = this.y;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const step = this.spec.speed * deltaSeconds;

    if (step >= dist - this.target.radius) {
      this.playImpact(this.target.x, this.target.y);
      this.onHit(this.target, this.damage);
      this.kill();
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;

    this.body.setPosition(this.x, this.y).setRotation(Math.atan2(dy, dx));
    this.core.setPosition(this.x, this.y);
    this.trail.setTo(prevX, prevY, this.x, this.y);
  }

  kill(): void {
    this.alive = false;
    this.body.destroy();
    this.core.destroy();
    this.trail.destroy();
  }

  /** Small expanding ring where the bolt connects. */
  private playImpact(x: number, y: number): void {
    const ring = this.scene.add
      .circle(x, y, this.spec.radius, 0x000000, 0)
      .setStrokeStyle(2.5, this.spec.color, 0.95)
      .setDepth(14);

    this.scene.tweens.add({
      targets: ring,
      radius: 22,
      alpha: 0,
      duration: 190,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}
