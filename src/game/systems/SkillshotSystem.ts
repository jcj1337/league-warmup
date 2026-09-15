import Phaser from 'phaser';
import { SKILLSHOT_Q, SKILLSHOT_W } from '../../config/balance';
import { Projectile } from '../entities/Projectile';
import { Fx } from '../view/Fx';
import { PROJECTILE_ART } from '../view/projectileArt';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { AbilityCooldowns } from './AbilityCooldowns';

/** Which linear skillshot a missile belongs to. */
type ShotKind = 'q' | 'w';

interface SkillshotCallbacks {
  /** Q landed on an enemy and removed one pip. */
  onQHit: (target: Enemy, killed: boolean) => void;
  /** W touched an enemy and should mark it. */
  onWHit: (target: Enemy) => void;
}

/** Per-ability projectile setup, so one system can run both shots. */
const SPECS = {
  q: {
    speed: () => SKILLSHOT_Q.speed,
    radius: () => SKILLSHOT_Q.radius,
    maxRange: () => SKILLSHOT_Q.maxRange,
    art: PROJECTILE_ART.q,
  },
  w: {
    speed: () => SKILLSHOT_W.speed,
    radius: () => SKILLSHOT_W.radius,
    maxRange: () => SKILLSHOT_W.maxRange,
    art: PROJECTILE_ART.w,
  },
};

/**
 * The player's linear skillshots: Q (a hit) and W (mark).
 *
 * Both aim toward the cursor. Their cast windows live in CastSystem; this
 * system only spawns the missile once a cast resolves (`fire`) and runs the
 * shared projectile/collision loop. Cooldowns live in AbilityCooldowns so a
 * landed Q can refund them all in one call.
 */
export class SkillshotSystem {
  /** Stats for the end screen (Q only — W removes no pips). */
  public shotsFired = 0;
  public shotsHit = 0;

  private readonly missiles: Array<{ projectile: Projectile; kind: ShotKind }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly cooldowns: AbilityCooldowns,
    private readonly callbacks: SkillshotCallbacks,
  ) {}

  get cooldownRemainingMs(): number {
    return this.cooldowns.remainingMs('q');
  }

  get missilesInFlight(): number {
    return this.missiles.length;
  }

  canCast(kind: ShotKind): boolean {
    return this.cooldowns.isReady(kind);
  }

  /**
   * Check the cooldown, start it, and fire in one step, bypassing any cast
   * window.
   *
   * @returns true if a missile was actually fired.
   */
  cast(kind: ShotKind, worldX: number, worldY: number): boolean {
    if (!this.cooldowns.isReady(kind)) return false;
    this.cooldowns.start(kind);
    this.fire(kind, worldX, worldY);
    return true;
  }

  /**
   * Spawn the projectile, unconditionally. Called when the CastSystem timer
   * says the cast window has elapsed; the cooldown started at cast start.
   */
  fire(kind: ShotKind, worldX: number, worldY: number): void {
    const spec = SPECS[kind];
    const angle = Math.atan2(worldY - this.player.y, worldX - this.player.x);

    this.missiles.push({
      kind,
      projectile: new Projectile(this.scene, {
        x: this.player.x,
        y: this.player.y,
        angle,
        speed: spec.speed(),
        radius: spec.radius(),
        team: 'player',
        maxRange: spec.maxRange(),
        art: spec.art,
      }),
    });

    Fx.of(this.scene).castFlash(
      kind,
      this.player.x + Math.cos(angle) * this.player.radius,
      this.player.y + Math.sin(angle) * this.player.radius,
      angle,
    );
    if (kind === 'q') this.shotsFired++;
  }

  update(deltaSeconds: number, _nowMs: number, targets: Enemy[]): void {
    for (const entry of this.missiles) {
      const missile = entry.projectile;
      missile.update(deltaSeconds);
      if (!missile.alive) continue;

      for (const target of targets) {
        if (!target.active) continue;
        if (!missile.hits(target.x, target.y, target.radius)) continue;

        Fx.of(this.scene).impact(entry.kind, missile.x, missile.y);

        if (entry.kind === 'q') {
          const killed = target.takeHit();
          this.shotsHit++;
          this.callbacks.onQHit(target, killed);
        } else {
          // W applies its mark; the extra pip comes later, on detonation.
          this.callbacks.onWHit(target);
        }

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
