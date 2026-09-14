import Phaser from 'phaser';
import { ARENA, BLINK_E, FLASH } from '../../config/balance';
import { THEME } from '../../config/theme';
import { AutoAttackMissile } from '../entities/AutoAttackMissile';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { AbilityCooldowns } from './AbilityCooldowns';

interface BlinkCallbacks {
  /** The E bolt connected: damage resolution + passive stack live in the scene. */
  onBoltHit: (target: Enemy, damage: number, killed: boolean) => void;
  /**
   * Any blink is about to happen. The scene uses this to cancel an uncommitted
   * auto windup, exactly as a move order would.
   */
  onBeforeBlink: () => void;
}

/**
 * E (Arcane-Shift-flavoured blink + homing bolt) and F (Flash).
 *
 * Both are instant repositioning: destination = cursor if it is inside range,
 * otherwise the point at max range along the cursor direction, clamped to the
 * arena. Neither has a cast time, so control is never taken away.
 *
 * E additionally looks for something to shoot once it arrives. The search runs
 * AFTER the blink, from the new position, which is what makes E a gap-closer
 * that immediately threatens rather than a pure escape.
 */
export class BlinkSystem {
  private readonly bolts: AutoAttackMissile[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly cooldowns: AbilityCooldowns,
    private readonly callbacks: BlinkCallbacks,
  ) {}

  get boltsInFlight(): number {
    return this.bolts.length;
  }

  canBlink(): boolean {
    return this.cooldowns.isReady('e');
  }

  /**
   * The destination E would blink to right now. Committed by the caller when
   * the cast STARTS, so mousing around during the window cannot move it.
   */
  blinkDestination(worldX: number, worldY: number): { x: number; y: number } {
    return this.destinationFor(worldX, worldY, BLINK_E.range);
  }

  /**
   * Perform the blink and fire the bolt. Called when the cast window elapses;
   * the cooldown was already started at cast start.
   *
   * Ordering matters: relocate first, THEN acquire, so the bolt is chosen from
   * the new position rather than the one you left.
   */
  executeBlink(to: { x: number; y: number }, enemies: Enemy[], nowMs: number): void {
    const from = { x: this.player.x, y: this.player.y };

    this.callbacks.onBeforeBlink();
    this.player.blinkTo(to.x, to.y);

    this.showBlinkVisual(from, to, THEME.projectiles.eColor);
    this.fireBolt(enemies, nowMs);
  }

  /**
   * F: the same blink geometry, with none of E's payload — no bolt, no damage,
   * no passive stack, and Q never refunds its cooldown.
   */
  castFlash(worldX: number, worldY: number): boolean {
    if (!this.cooldowns.isReady('flash')) return false;

    const from = { x: this.player.x, y: this.player.y };
    const to = this.destinationFor(worldX, worldY, FLASH.range);

    this.callbacks.onBeforeBlink();
    this.player.blinkTo(to.x, to.y);
    this.cooldowns.start('flash');

    this.showFlashBurst(from);
    this.showFlashBurst(to);
    return true;
  }

  /**
   * Cursor inside range -> land on the cursor. Beyond it -> travel exactly max
   * range along that direction. Either way the result is clamped so the player
   * can never end up partly outside the arena.
   */
  private destinationFor(worldX: number, worldY: number, range: number): { x: number; y: number } {
    const dx = worldX - this.player.x;
    const dy = worldY - this.player.y;
    const dist = Math.hypot(dx, dy);

    let x = worldX;
    let y = worldY;
    if (dist > range && dist > 0) {
      x = this.player.x + (dx / dist) * range;
      y = this.player.y + (dy / dist) * range;
    }

    const m = ARENA.padding + this.player.radius;
    return {
      x: Phaser.Math.Clamp(x, m, ARENA.width - m),
      y: Phaser.Math.Clamp(y, m, ARENA.height - m),
    };
  }

  /**
   * Bolt acquisition, from the player's NEW position.
   *
   * A W-marked enemy always wins, because the mark is a limited-time damage
   * opportunity: E is the tool that guarantees you can cash it in even after
   * the target has walked away from your autos.
   */
  private fireBolt(enemies: Enemy[], nowMs: number): void {
    const inRange = enemies.filter(
      (e) =>
        e.active &&
        Math.hypot(e.x - this.player.x, e.y - this.player.y) <= BLINK_E.boltAcquisitionRange,
    );
    if (inRange.length === 0) return;

    const marked = inRange.filter((e) => e.isMarked(nowMs));
    const pool = marked.length > 0 ? marked : inRange;

    let target = pool[0];
    let best = Infinity;
    for (const e of pool) {
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }

    this.bolts.push(
      new AutoAttackMissile(
        this.scene,
        this.player.x,
        this.player.y,
        target,
        target.spawnId,
        BLINK_E.damage,
        (hit, damage) => this.onBoltImpact(hit, damage),
        {
          speed: BLINK_E.boltSpeed,
          radius: BLINK_E.boltRadius,
          color: THEME.projectiles.eColor,
          coreColor: THEME.projectiles.eCore,
        },
      ),
    );
  }

  private onBoltImpact(target: Enemy, damage: number): void {
    if (!target.active) return;
    const killed = target.takeDamage(damage);
    this.callbacks.onBoltHit(target, damage, killed);
  }

  update(deltaSeconds: number): void {
    for (const bolt of this.bolts) bolt.update(deltaSeconds);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (!this.bolts[i].alive) this.bolts.splice(i, 1);
    }
  }

  /**
   * Departure ring, arrival ring, and a brief streak between them.
   * The streak is explicitly short-lived — it must never read as a tether.
   */
  private showBlinkVisual(from: { x: number; y: number }, to: { x: number; y: number }, color: number): void {
    const depart = this.scene.add
      .circle(from.x, from.y, this.player.radius, 0x000000, 0)
      .setStrokeStyle(3, color, 0.9)
      .setDepth(13);
    this.scene.tweens.add({
      targets: depart,
      radius: this.player.radius + 22,
      alpha: 0,
      duration: BLINK_E.blinkStreakMs + 80,
      ease: 'Quad.easeOut',
      onComplete: () => depart.destroy(),
    });

    const arrive = this.scene.add
      .circle(to.x, to.y, this.player.radius + 20, 0x000000, 0)
      .setStrokeStyle(3, color, 0.95)
      .setDepth(13);
    this.scene.tweens.add({
      targets: arrive,
      radius: this.player.radius + 2,
      alpha: 0,
      duration: BLINK_E.blinkStreakMs + 60,
      ease: 'Quad.easeOut',
      onComplete: () => arrive.destroy(),
    });

    const streak = this.scene.add
      .line(0, 0, from.x, from.y, to.x, to.y, color, 0.55)
      .setOrigin(0, 0)
      .setLineWidth(3)
      .setDepth(12);
    this.scene.tweens.add({
      targets: streak,
      alpha: 0,
      duration: BLINK_E.blinkStreakMs,
      onComplete: () => streak.destroy(),
    });
  }

  /** Flash: a sharper, brighter starburst with no connecting streak. */
  private showFlashBurst(at: { x: number; y: number }): void {
    const ring = this.scene.add
      .circle(at.x, at.y, this.player.radius * 0.6, 0x000000, 0)
      .setStrokeStyle(3, THEME.projectiles.flashColor, 0.95)
      .setDepth(13);
    this.scene.tweens.add({
      targets: ring,
      radius: this.player.radius + 18,
      alpha: 0,
      duration: FLASH.burstMs,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    const spikes = this.scene.add.graphics().setDepth(13);
    spikes.lineStyle(2, THEME.projectiles.flashColor, 0.95);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      spikes.lineBetween(
        at.x + Math.cos(a) * 8,
        at.y + Math.sin(a) * 8,
        at.x + Math.cos(a) * 26,
        at.y + Math.sin(a) * 26,
      );
    }
    this.scene.tweens.add({
      targets: spikes,
      alpha: 0,
      duration: FLASH.burstMs,
      onComplete: () => spikes.destroy(),
    });
  }

  clear(): void {
    for (const b of this.bolts) b.kill();
    this.bolts.length = 0;
  }
}
