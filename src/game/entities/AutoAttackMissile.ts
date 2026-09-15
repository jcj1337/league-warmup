import Phaser from 'phaser';
import { ATTACK } from '../../config/balance';
import { Fx, type ShotFx } from '../view/Fx';
import { PROJECTILE_ART } from '../view/projectileArt';
import { ProjectileView, type ProjectileArt } from '../view/ProjectileView';
import type { Enemy } from './Enemy';

/** Per-ability speed and look, so autos and the E bolt share one missile. */
export interface HomingMissileSpec {
  speed: number;
  radius: number;
  art: ProjectileArt;
  /** Which impact effect plays on arrival. */
  impact: ShotFx;
}

/** The player's basic attack missile spec. */
export const AUTO_MISSILE_SPEC = (): HomingMissileSpec => ({
  speed: ATTACK.projectileSpeed,
  radius: ATTACK.projectileRadius,
  art: PROJECTILE_ART.auto,
  impact: 'auto',
});

/**
 * The player's homing projectile (autos and the E bolt).
 *
 * It exists to make the attack readable and to delay the hit until it
 * visibly connects. It carries NO authority over the attack cycle: the auto is
 * already committed and the cooldown already running by the time this is
 * constructed, so travel time never gates the next attack.
 *
 * It tracks its target (League autos do not miss), and fizzles harmlessly if
 * the target dies before it lands.
 */
export class AutoAttackMissile {
  public alive = true;

  private x: number;
  private y: number;
  private readonly view: ProjectileView;

  constructor(
    private readonly scene: Phaser.Scene,
    startX: number,
    startY: number,
    private readonly target: Enemy,
    /** Identifies the specific life of the target. */
    private readonly targetSpawnId: number,
    private readonly onHit: (target: Enemy) => void,
    private readonly spec: HomingMissileSpec = AUTO_MISSILE_SPEC(),
  ) {
    this.x = startX;
    this.y = startY;
    this.view = new ProjectileView(scene, spec.art, startX, startY, Math.atan2(target.y - startY, target.x - startX));
  }

  update(deltaSeconds: number): void {
    if (!this.alive) return;

    // The target may have died mid-flight — fizzle quietly.
    if (!this.target.active || this.target.spawnId !== this.targetSpawnId) {
      this.kill();
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const step = this.spec.speed * deltaSeconds;

    if (step >= dist - this.target.radius) {
      Fx.of(this.scene).impact(this.spec.impact, this.target.x, this.target.y);
      this.onHit(this.target);
      this.kill();
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.view.sync(this.x, this.y, deltaSeconds, Math.atan2(dy, dx));
  }

  kill(): void {
    this.alive = false;
    this.view.destroy();
  }
}
