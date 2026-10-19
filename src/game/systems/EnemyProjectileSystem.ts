import Phaser from 'phaser';
import { ARENA, ENEMY_PROJECTILES } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Projectile } from '../entities/Projectile';
import { PROJECTILE_ART } from '../view/projectileArt';
import type { Player } from '../entities/Player';

type Ramp = { start: number; end: number };

/** Source size of the hostile fireball sprite, in art pixels. */
const HOSTILE_SPRITE_PX = 7;

/** What enemy fire needs to know about the run. The WaveDirector provides it. */
export interface EnemyFirePressure {
  /** Fire only while a wave is being fought, never during a breather. */
  readonly isWaveActive: boolean;
  /** 0..1 position on the ENEMY_PROJECTILES start → end ramps, set per stage. */
  readonly fireIntensity: number;
}

interface EnemyProjectileCallbacks {
  onPlayerHit: (damage: number) => void;
}

/**
 * Spawns the dodging pressure.
 *
 * Shots originate on the arena border and are aimed at the player's position at
 * the moment of firing. They never re-aim, so every shot is dodgeable if you
 * read it early. No individual enemy fires them: the volleys belong to the wave
 * being fought. Spawn rate, speed, size and damage come from the current
 * stage's fire intensity.
 *
 * Wave boundaries: as soon as a wave is cleared, every hostile shot in flight is
 * removed before this frame's collision test, and nothing new is scheduled.
 * The next wave's first volley comes one full spawn interval after it starts.
 * A cleared wave can therefore never damage the player during the breather.
 */
export class EnemyProjectileSystem {
  private readonly missiles: Projectile[] = [];
  /** Clock time of the next volley; null while no wave is being fought. */
  private nextSpawnAt: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly pressure: EnemyFirePressure,
    private readonly callbacks: EnemyProjectileCallbacks,
  ) {}

  get activeCount(): number {
    return this.missiles.length;
  }

  get spawnIntervalMs(): number {
    return this.ramp(ENEMY_PROJECTILES.spawnIntervalMs);
  }

  get projectileSpeed(): number {
    return this.ramp(ENEMY_PROJECTILES.speed);
  }

  get projectileRadius(): number {
    return this.ramp(ENEMY_PROJECTILES.radius);
  }

  get projectileDamage(): number {
    return this.ramp(ENEMY_PROJECTILES.damage);
  }

  /**
   * Fractional volley size: 2.4 means "2 shots, plus a 40% chance of a third".
   * Keeps the ramp smooth instead of jumping a whole projectile at a time.
   */
  get volleySize(): number {
    return this.ramp(ENEMY_PROJECTILES.volleySize);
  }

  update(deltaSeconds: number, nowMs: number): void {
    if (!this.pressure.isWaveActive) {
      // The wave was cleared: its shots fizzle before they can reach the player,
      // and no volley is queued until the next wave begins.
      if (this.missiles.length > 0) this.clear();
      this.nextSpawnAt = null;
      return;
    }

    if (this.nextSpawnAt === null) {
      this.nextSpawnAt = nowMs + this.spawnIntervalMs;
    }
    if (nowMs >= this.nextSpawnAt) {
      this.spawnVolley();
      this.nextSpawnAt = nowMs + this.spawnIntervalMs;
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

  private ramp(ramp: Ramp): number {
    return Phaser.Math.Linear(ramp.start, ramp.end, Phaser.Math.Clamp(this.pressure.fireIntensity, 0, 1));
  }

  private spawnVolley(): void {
    const size = this.volleySize;
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
    const radius = this.projectileRadius;

    this.missiles.push(
      new Projectile(this.scene, {
        x,
        y,
        angle,
        speed: this.projectileSpeed,
        radius,
        damage: this.projectileDamage,
        team: 'enemy',
        art: PROJECTILE_ART.hostile,
        // Whole-pixel sprite scale that tracks the (stage-scaled) collision size.
        artScale: Math.max(THEME.art.scale, Math.round((radius * 2) / HOSTILE_SPRITE_PX)),
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
