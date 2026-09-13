import Phaser from 'phaser';
import { ARENA, ENEMY_PROJECTILES } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Projectile } from '../entities/Projectile';
import type { Player } from '../entities/Player';
import type { DifficultyManager } from './DifficultyManager';

interface EnemyProjectileCallbacks {
  onPlayerHit: (damage: number) => void;
}

/**
 * Spawns the dodging pressure.
 *
 * Shots originate on the arena border and are aimed at the player's position at
 * the moment of firing — they never re-aim, so every shot is dodgeable if you
 * read it early. Spawn rate, speed, size and damage all come from the
 * DifficultyManager ramp.
 */
export class EnemyProjectileSystem {
  private readonly missiles: Projectile[] = [];
  private nextSpawnAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly difficulty: DifficultyManager,
    private readonly callbacks: EnemyProjectileCallbacks,
  ) {}

  get activeCount(): number {
    return this.missiles.length;
  }

  update(deltaSeconds: number, nowMs: number): void {
    if (nowMs >= this.nextSpawnAt) {
      this.spawnVolley();
      this.nextSpawnAt = nowMs + this.difficulty.spawnIntervalMs;
    }

    for (const missile of this.missiles) {
      missile.update(deltaSeconds);
      if (!missile.alive) continue;

      if (missile.hits(this.player.x, this.player.y, this.player.radius)) {
        this.callbacks.onPlayerHit(missile.damage);
        missile.kill();
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (!this.missiles[i].alive) this.missiles.splice(i, 1);
    }
  }

  private spawnVolley(): void {
    const size = this.difficulty.volleySize;
    // Whole part fires for sure, fractional part is a coin flip.
    let shots = Math.floor(size);
    if (Math.random() < size - shots) shots++;

    for (let i = 0; i < shots; i++) this.spawnOne();
  }

  private spawnOne(): void {
    const { x, y } = this.randomEdgePoint();

    const jitter = Phaser.Math.DegToRad(
      Phaser.Math.FloatBetween(-ENEMY_PROJECTILES.aimJitterDegrees, ENEMY_PROJECTILES.aimJitterDegrees),
    );
    const angle = Math.atan2(this.player.y - y, this.player.x - x) + jitter;

    this.missiles.push(
      new Projectile(this.scene, {
        x,
        y,
        angle,
        speed: this.difficulty.projectileSpeed,
        radius: this.difficulty.projectileRadius,
        damage: this.difficulty.projectileDamage,
        color: THEME.projectiles.enemyColor,
        team: 'enemy',
        heavyOutline: true,
      }),
    );
  }

  /** Uniform-ish point on the arena border, slightly outside so it flies in. */
  private randomEdgePoint(): { x: number; y: number } {
    const pad = ARENA.padding;
    const left = pad;
    const right = ARENA.width - pad;
    const top = pad;
    const bottom = ARENA.height - pad;
    const offset = 12;

    switch (Phaser.Math.Between(0, 3)) {
      case 0:
        return { x: Phaser.Math.Between(left, right), y: top - offset };
      case 1:
        return { x: Phaser.Math.Between(left, right), y: bottom + offset };
      case 2:
        return { x: left - offset, y: Phaser.Math.Between(top, bottom) };
      default:
        return { x: right + offset, y: Phaser.Math.Between(top, bottom) };
    }
  }

  clear(): void {
    for (const m of this.missiles) m.kill();
    this.missiles.length = 0;
  }
}
