import Phaser from 'phaser';
import { ARENA, ENEMY_PROJECTILES } from '../../config/balance';
import { THEME } from '../../config/theme';
import { ProjectileView, type ProjectileArt } from '../view/ProjectileView';

export type ProjectileTeam = 'player' | 'enemy';

export interface ProjectileConfig {
  x: number;
  y: number;
  /** Direction in radians. Projectiles travel dead straight — no homing. */
  angle: number;
  speed: number;
  /** Collision radius. Independent of how big the sprite is drawn. */
  radius: number;
  /** Player damage for enemy shots. Player shots hit enemies for one pip and omit it. */
  damage?: number;
  team: ProjectileTeam;
  /** Optional travel cap (used by Q/W). Undefined = travel until it leaves the arena. */
  maxRange?: number;
  art: ProjectileArt;
  /** Integer sprite scale; defaults to the art scale. */
  artScale?: number;
}

/**
 * A straight-line missile. The player's Q and W and enemy shots all use this,
 * so swapping a skillshot's speed/size/range is a config change only. The
 * sprite is a view; collision is the `radius` circle, full stop.
 */
export class Projectile {
  public x: number;
  public y: number;
  public readonly radius: number;
  public readonly damage: number;
  public readonly team: ProjectileTeam;
  public alive = true;
  public readonly view: ProjectileView;

  private readonly vx: number;
  private readonly vy: number;
  private readonly maxRange: number;
  private travelled = 0;

  constructor(scene: Phaser.Scene, cfg: ProjectileConfig) {
    this.x = cfg.x;
    this.y = cfg.y;
    this.radius = cfg.radius;
    this.damage = cfg.damage ?? 0;
    this.team = cfg.team;
    this.vx = Math.cos(cfg.angle) * cfg.speed;
    this.vy = Math.sin(cfg.angle) * cfg.speed;
    this.maxRange = cfg.maxRange ?? Number.POSITIVE_INFINITY;
    this.view = new ProjectileView(scene, cfg.art, cfg.x, cfg.y, cfg.angle, cfg.artScale ?? THEME.art.scale);
  }

  /** How far it has flown so far. */
  get distanceTravelled(): number {
    return this.travelled;
  }

  update(deltaSeconds: number): void {
    if (!this.alive) return;

    const dx = this.vx * deltaSeconds;
    const dy = this.vy * deltaSeconds;
    this.x += dx;
    this.y += dy;
    this.travelled += Math.hypot(dx, dy);

    if (this.travelled >= this.maxRange || this.isOutOfBounds()) {
      this.kill();
      return;
    }

    this.view.sync(this.x, this.y, deltaSeconds);
  }

  /** Circle-vs-circle overlap. Good enough at these speeds and sizes. */
  hits(cx: number, cy: number, r: number): boolean {
    const rr = this.radius + r;
    return (cx - this.x) ** 2 + (cy - this.y) ** 2 <= rr * rr;
  }

  kill(): void {
    this.alive = false;
    this.view.destroy();
  }

  private isOutOfBounds(): boolean {
    const m = ENEMY_PROJECTILES.cullMargin;
    return this.x < -m || this.y < -m || this.x > ARENA.width + m || this.y > ARENA.height + m;
  }
}
