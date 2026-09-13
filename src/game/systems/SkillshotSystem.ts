import Phaser from 'phaser';
import { SKILLSHOT_Q } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Projectile } from '../entities/Projectile';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';

interface SkillshotCallbacks {
  onHit: (target: Enemy, damage: number, killed: boolean) => void;
  /**
   * A Q actually connected. This is the authoritative hit event: the passive
   * stack and the cooldown refund both hang off it, and a miss fires nothing.
   */
  onLanded: () => void;
}

/**
 * The player's Q: a quick-cast linear skillshot.
 *
 * Flow: press Q -> a bolt leaves the player toward the cursor, that frame.
 * There is no targeting mode, no confirming click and no aim indicator — the
 * only feedback is the muzzle flash and the missile itself.
 *
 * Casting does not root the player or interact with the attack state machine,
 * so you can Q mid-kite without losing a step.
 *
 * To add a second ability later, instantiate another SkillshotSystem with a
 * different config block from balance.ts.
 */
export class SkillshotSystem {
  /** Stats for the end screen. */
  public shotsFired = 0;
  public shotsHit = 0;

  private readyAt = 0;
  private now = 0;
  private readonly missiles: Projectile[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly callbacks: SkillshotCallbacks,
  ) {}

  get isReady(): boolean {
    return this.now >= this.readyAt;
  }

  get cooldownRemainingMs(): number {
    return Math.max(0, this.readyAt - this.now);
  }

  get missilesInFlight(): number {
    return this.missiles.length;
  }

  /**
   * Quick-cast toward a world point (the cursor). Fires immediately.
   * On cooldown it is simply a no-op — the HUD already shows the remaining time.
   *
   * @returns true if a missile was actually fired.
   */
  castToward(worldX: number, worldY: number): boolean {
    if (!this.isReady) return false;

    const angle = Math.atan2(worldY - this.player.y, worldX - this.player.x);

    this.missiles.push(
      new Projectile(this.scene, {
        x: this.player.x,
        y: this.player.y,
        angle,
        speed: SKILLSHOT_Q.speed,
        radius: SKILLSHOT_Q.radius,
        damage: SKILLSHOT_Q.damage,
        color: THEME.projectiles.qColor,
        team: 'player',
        maxRange: SKILLSHOT_Q.maxRange,
        trail: true,
        shape: 'bolt',
        boltLength: SKILLSHOT_Q.boltLength,
      }),
    );

    this.showCastFlash(angle);
    this.shotsFired++;
    this.readyAt = this.now + SKILLSHOT_Q.cooldownMs;
    return true;
  }

  update(deltaSeconds: number, nowMs: number, targets: Enemy[]): void {
    this.now = nowMs;

    for (const missile of this.missiles) {
      missile.update(deltaSeconds);
      if (!missile.alive) continue;

      for (const target of targets) {
        if (!target.active) continue;
        if (!missile.hits(target.x, target.y, target.radius)) continue;

        const killed = target.takeDamage(missile.damage);
        this.shotsHit++;
        this.showImpact(missile.x, missile.y);

        // A landed Q shaves the REMAINING cooldown — it never restarts it, so
        // the refund can bring Q straight back up.
        this.readyAt = Math.max(this.now, this.readyAt - SKILLSHOT_Q.hitCooldownReductionMs);

        this.callbacks.onHit(target, missile.damage, killed);
        this.callbacks.onLanded();
        // No pierce: the bolt is spent on the first enemy it touches.
        if (SKILLSHOT_Q.stopsOnFirstHit) missile.kill();
        break;
      }
    }

    // Drop dead missiles.
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (!this.missiles[i].alive) this.missiles.splice(i, 1);
    }
  }

  /** Short wedge of light thrown out of the player in the cast direction. */
  private showCastFlash(angle: number): void {
    const flash = this.scene.add
      .circle(
        this.player.x + Math.cos(angle) * this.player.radius,
        this.player.y + Math.sin(angle) * this.player.radius,
        this.player.radius * 0.7,
        THEME.projectiles.qCore,
        0.85,
      )
      .setDepth(13);

    this.scene.tweens.add({
      targets: flash,
      radius: SKILLSHOT_Q.castFlashRadius,
      alpha: 0,
      duration: SKILLSHOT_Q.castFlashMs,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  /** Expanding ring where the bolt connects. */
  private showImpact(x: number, y: number): void {
    const ring = this.scene.add
      .circle(x, y, SKILLSHOT_Q.radius, 0x000000, 0)
      .setStrokeStyle(3, THEME.projectiles.qColor, 0.95)
      .setDepth(14);

    this.scene.tweens.add({
      targets: ring,
      radius: SKILLSHOT_Q.impactRadius,
      alpha: 0,
      duration: SKILLSHOT_Q.impactMs,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  clear(): void {
    for (const m of this.missiles) m.kill();
    this.missiles.length = 0;
  }
}
