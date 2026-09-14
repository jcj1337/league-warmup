import Phaser from 'phaser';
import { SKILLSHOT_Q, SKILLSHOT_W } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Projectile } from '../entities/Projectile';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { AbilityCooldowns } from './AbilityCooldowns';

/** Which linear skillshot a missile belongs to. */
type ShotKind = 'q' | 'w';

interface SkillshotCallbacks {
  /** Q damage landed on an enemy. */
  onQHit: (target: Enemy, damage: number, killed: boolean) => void;
  /** W touched an enemy and should mark it. */
  onWHit: (target: Enemy) => void;
}

/** Per-ability projectile setup, so one system can run both shots. */
const SPECS = {
  q: {
    speed: () => SKILLSHOT_Q.speed,
    radius: () => SKILLSHOT_Q.radius,
    maxRange: () => SKILLSHOT_Q.maxRange,
    color: () => THEME.projectiles.qColor,
    coreColor: () => THEME.projectiles.qCore,
    shape: 'bolt' as const,
    boltLength: () => SKILLSHOT_Q.boltLength,
    castFlashRadius: () => SKILLSHOT_Q.castFlashRadius,
    castFlashMs: () => SKILLSHOT_Q.castFlashMs,
    impactRadius: () => SKILLSHOT_Q.impactRadius,
    impactMs: () => SKILLSHOT_Q.impactMs,
  },
  w: {
    speed: () => SKILLSHOT_W.speed,
    radius: () => SKILLSHOT_W.radius,
    maxRange: () => SKILLSHOT_W.maxRange,
    color: () => THEME.projectiles.wColor,
    coreColor: () => THEME.projectiles.wCore,
    // An orb, not a dart: W reads as a heavier, slower shot than Q.
    shape: 'orb' as const,
    boltLength: () => 0,
    castFlashRadius: () => SKILLSHOT_W.castFlashRadius,
    castFlashMs: () => SKILLSHOT_W.castFlashMs,
    impactRadius: () => SKILLSHOT_W.impactRadius,
    impactMs: () => SKILLSHOT_W.impactMs,
  },
};

/**
 * The player's linear skillshots: Q (damage) and W (mark).
 *
 * Both are quick-cast — press the key and the missile leaves toward the cursor
 * that frame. No targeting mode, no confirming click, no aim indicator.
 * Neither roots the player, so both can be woven into a kite.
 *
 * The two differ only in their config block and their on-hit effect, so they
 * share this one projectile/collision loop. Cooldowns live in AbilityCooldowns
 * so a landed Q can refund them all in one call.
 */
export class SkillshotSystem {
  /** Stats for the end screen (Q only — W deals no damage). */
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
   * Quick-cast: check the cooldown, start it, and fire in one step. Used by Q,
   * which has no cast time.
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
   * Spawn the projectile, unconditionally.
   *
   * Split out from `cast()` so an ability with a cast time can start its
   * cooldown at cast START and only spawn the missile when the CastSystem timer
   * says the window has elapsed.
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
        // W deals no damage on contact; its payload is the mark.
        damage: kind === 'q' ? SKILLSHOT_Q.damage : 0,
        color: spec.color(),
        team: 'player',
        maxRange: spec.maxRange(),
        trail: true,
        shape: spec.shape,
        boltLength: spec.boltLength(),
      }),
    });

    this.showCastFlash(kind, angle);
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

        this.showImpact(entry.kind, missile.x, missile.y);

        if (entry.kind === 'q') {
          const killed = target.takeDamage(missile.damage);
          this.shotsHit++;
          this.callbacks.onQHit(target, missile.damage, killed);
        } else {
          // W applies its mark; the damage comes later, on detonation.
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

  /** Short wedge of light thrown out of the player in the cast direction. */
  private showCastFlash(kind: ShotKind, angle: number): void {
    const spec = SPECS[kind];
    const flash = this.scene.add
      .circle(
        this.player.x + Math.cos(angle) * this.player.radius,
        this.player.y + Math.sin(angle) * this.player.radius,
        this.player.radius * 0.7,
        spec.coreColor(),
        0.85,
      )
      .setDepth(13);

    this.scene.tweens.add({
      targets: flash,
      radius: spec.castFlashRadius(),
      alpha: 0,
      duration: spec.castFlashMs(),
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  /** Expanding ring where the missile connects. */
  private showImpact(kind: ShotKind, x: number, y: number): void {
    const spec = SPECS[kind];
    const ring = this.scene.add
      .circle(x, y, spec.radius(), 0x000000, 0)
      .setStrokeStyle(3, spec.color(), 0.95)
      .setDepth(14);

    this.scene.tweens.add({
      targets: ring,
      radius: spec.impactRadius(),
      alpha: 0,
      duration: spec.impactMs(),
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  clear(): void {
    for (const m of this.missiles) m.projectile.kill();
    this.missiles.length = 0;
  }
}
