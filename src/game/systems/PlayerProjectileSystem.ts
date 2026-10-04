import Phaser from 'phaser';
import { Projectile } from '../entities/Projectile';
import type { FxKey } from '../../champions/types';
import { Fx } from '../view/Fx';
import type { ProjectileArt } from '../view/ProjectileView';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

/** One linear shot: its flight, its look, and what happens to the first enemy it touches. */
export interface ShotSpec {
  speed: number;
  /** Collision half-width (circle-vs-circle against the target's radius). */
  radius: number;
  /** Hard cap on travel; the missile dies here. */
  maxRange: number;
  art: ProjectileArt;
  /** Which THEME.fx entry colours the cast flash and the impact. */
  fx: FxKey;
  /** The missile touched an active enemy. The spec decides what that means (a pip, a mark, ...). */
  onHit: (target: Enemy) => void;
  /** Passes through every enemy it touches, each once, instead of stopping on the first. */
  pierce?: boolean;
}

/**
 * The player's linear projectiles, whichever champion fired them.
 *
 * Aim is a direction from the player toward a world point. The missile stops
 * on the first enemy it touches, unless its spec pierces: then it hits each
 * enemy it passes through once. Cast windows and cooldowns are the engine's;
 * a kit calls `fire` when its cast resolves.
 */
export class PlayerProjectileSystem {
  readonly missiles: Array<{ projectile: Projectile; kind: FxKey; spec: ShotSpec; struck: Set<Enemy> }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
  ) {}

  get missilesInFlight(): number {
    return this.missiles.length;
  }

  /**
   * Spawn a shot toward (worldX, worldY), with its cast flash at the slime's
   * edge. From the player, or from `from` (an anchored cast: where the player
   * stood when the key went down).
   */
  fire(spec: ShotSpec, worldX: number, worldY: number, from: { x: number; y: number } = this.player): void {
    const angle = Math.atan2(worldY - from.y, worldX - from.x);

    this.missiles.push({
      kind: spec.fx,
      spec,
      struck: new Set(),
      projectile: new Projectile(this.scene, {
        x: from.x,
        y: from.y,
        angle,
        speed: spec.speed,
        radius: spec.radius,
        team: 'player',
        maxRange: spec.maxRange,
        art: spec.art,
      }),
    });

    Fx.of(this.scene).castFlash(
      spec.fx,
      from.x + Math.cos(angle) * this.player.radius,
      from.y + Math.sin(angle) * this.player.radius,
      angle,
    );
  }

  update(deltaSeconds: number, _nowMs: number, targets: readonly Enemy[]): void {
    for (const entry of this.missiles) {
      const missile = entry.projectile;
      missile.update(deltaSeconds);
      if (!missile.alive) continue;

      for (const target of targets) {
        if (!target.active || entry.struck.has(target)) continue;
        if (!missile.hits(target.x, target.y, target.radius)) continue;

        entry.struck.add(target);
        if (entry.spec.pierce) {
          // A piercing shot bursts on each enemy it passes through, and flies on.
          Fx.of(this.scene).impact(entry.kind, target.x, target.y);
          entry.spec.onHit(target);
          continue;
        }
        Fx.of(this.scene).impact(entry.kind, missile.x, missile.y);
        entry.spec.onHit(target);
        // No pierce: the missile is spent on the first enemy it touches.
        missile.kill();
        break;
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (!this.missiles[i].projectile.alive) this.missiles.splice(i, 1);
    }
  }

  clear(): void {
    for (const m of this.missiles) m.projectile.kill();
    this.missiles.length = 0;
  }
}
