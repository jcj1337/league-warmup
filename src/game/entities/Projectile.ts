import Phaser from 'phaser';
import { ARENA, ENEMY_PROJECTILES } from '../../config/balance';
import { THEME } from '../../config/theme';

export type ProjectileTeam = 'player' | 'enemy';

export interface ProjectileConfig {
  x: number;
  y: number;
  /** Direction in radians. Projectiles travel dead straight — no homing. */
  angle: number;
  speed: number;
  radius: number;
  damage: number;
  color: number;
  team: ProjectileTeam;
  /** Optional travel cap (used by Q). Undefined = travel until it leaves the arena. */
  maxRange?: number;
  /** Draw a motion streak behind the missile (player abilities). */
  trail?: boolean;
  /** Heavier outline; used to make enemy shots read as "dodge me". */
  heavyOutline?: boolean;
  /**
   * 'orb'  — round, used for incoming enemy fire (a blob to dodge)
   * 'bolt' — narrow dart rotated to its heading, used for the player's Q
   */
  shape?: 'orb' | 'bolt';
  /** Drawn length for 'bolt'. Collision still uses `radius`. */
  boltLength?: number;
}

/**
 * A straight-line missile. Both the player's Q and enemy shots use this, so
 * swapping a skillshot to a different speed/size/range is a config change only.
 */
export class Projectile {
  public x: number;
  public y: number;
  public readonly radius: number;
  public readonly damage: number;
  public readonly team: ProjectileTeam;
  public alive = true;

  private readonly vx: number;
  private readonly vy: number;
  private readonly maxRange: number;
  private travelled = 0;

  private readonly body: Phaser.GameObjects.Arc | Phaser.GameObjects.Polygon;
  private readonly trail: Phaser.GameObjects.Line | null;
  /** Bright centre (player shots) or dark hazard ring (enemy shots). */
  private readonly core: Phaser.GameObjects.Arc;
  private readonly heavy: boolean;
  private readonly isBolt: boolean;

  constructor(scene: Phaser.Scene, cfg: ProjectileConfig) {
    this.x = cfg.x;
    this.y = cfg.y;
    this.radius = cfg.radius;
    this.damage = cfg.damage;
    this.team = cfg.team;
    this.vx = Math.cos(cfg.angle) * cfg.speed;
    this.vy = Math.sin(cfg.angle) * cfg.speed;
    this.maxRange = cfg.maxRange ?? Number.POSITIVE_INFINITY;

    this.trail = cfg.trail
      ? scene.add
          .line(0, 0, 0, 0, 0, 0, cfg.color, 0.4)
          .setOrigin(0, 0)
          .setLineWidth(this.radius * 0.7)
          .setDepth(5)
      : null;

    this.heavy = cfg.heavyOutline === true;
    this.isBolt = cfg.shape === 'bolt';

    if (this.isBolt) {
      // A long thin dart: unmistakably a fired skillshot rather than a floating
      // orb, and its heading is readable even in a single frame.
      const len = cfg.boltLength ?? this.radius * 3;
      const w = this.radius * 0.8;
      this.body = scene.add
        .polygon(this.x, this.y, [len, 0, -len * 0.35, w, -len * 0.15, 0, -len * 0.35, -w], cfg.color)
        .setOrigin(0, 0)
        .setDepth(6);
      this.body.setRotation(cfg.angle);
      this.body.setStrokeStyle(1.5, 0xffffff, 0.7);
    } else {
      this.body = scene.add.circle(this.x, this.y, this.radius, cfg.color).setDepth(6);
      // Enemy shots get a thick dark rim so they never read as friendly fire.
      this.body.setStrokeStyle(
        this.heavy ? 3 : 1.5,
        this.heavy ? THEME.projectiles.enemyRim : 0xffffff,
        this.heavy ? 0.95 : 0.5,
      );
    }

    // Enemy: bright pip in a dark shell (a "warning light"). Player Q: hot core.
    this.core = scene.add
      .circle(
        this.x,
        this.y,
        this.radius * (this.heavy ? 0.34 : 0.42),
        this.heavy ? THEME.projectiles.enemyCore : THEME.projectiles.qCore,
        this.heavy ? 0.9 : 0.95,
      )
      .setDepth(7);
  }

  update(deltaSeconds: number): void {
    if (!this.alive) return;

    const prevX = this.x;
    const prevY = this.y;
    const dx = this.vx * deltaSeconds;
    const dy = this.vy * deltaSeconds;
    this.x += dx;
    this.y += dy;
    this.trail?.setTo(prevX, prevY, this.x, this.y);
    this.travelled += Math.hypot(dx, dy);

    if (this.travelled >= this.maxRange || this.isOutOfBounds()) {
      this.kill();
      return;
    }

    this.body.setPosition(this.x, this.y);
    this.core.setPosition(this.x, this.y);
    // Slow pulse on incoming shots so they read as live hazards.
    if (this.heavy) {
      this.core.setScale(1 + 0.18 * Math.sin(this.travelled * 0.05));
    }
  }

  /** Circle-vs-circle overlap. Good enough at these speeds and sizes. */
  hits(cx: number, cy: number, r: number): boolean {
    const rr = this.radius + r;
    return (cx - this.x) ** 2 + (cy - this.y) ** 2 <= rr * rr;
  }

  kill(): void {
    this.alive = false;
    this.body.destroy();
    this.core.destroy();
    this.trail?.destroy();
  }

  private isOutOfBounds(): boolean {
    const m = ENEMY_PROJECTILES.cullMargin;
    return (
      this.x < -m || this.y < -m || this.x > ARENA.width + m || this.y > ARENA.height + m
    );
  }
}
