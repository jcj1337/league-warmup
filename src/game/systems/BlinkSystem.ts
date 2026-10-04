import Phaser from 'phaser';
import { ARENA, FLASH } from '../../config/balance';
import { Fx } from '../view/Fx';
import type { Player } from '../entities/Player';
import type { AbilityCooldowns } from './AbilityCooldowns';

interface BlinkCallbacks {
  /**
   * Any blink is about to happen. The scene uses this to cancel an uncommitted
   * auto windup, exactly as a move order would.
   */
  onBeforeBlink: () => void;
}

/**
 * Relocation: the geometry every blink shares, and Flash.
 *
 * Destination = cursor if it is inside range, otherwise the point at max
 * range along the cursor direction, clamped to the arena. A champion's blink
 * slot commits its destination through `destinationFor` at keypress and
 * relocates through `blinkTo` when its cast resolves; Flash is instant and
 * carries no payload of any kind.
 */
export class BlinkSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly cooldowns: AbilityCooldowns,
    private readonly callbacks: BlinkCallbacks,
  ) {}

  /**
   * Cursor inside range -> land on the cursor. Beyond it -> travel exactly max
   * range along that direction. Either way the result is clamped so the player
   * can never end up partly outside the arena.
   */
  destinationFor(worldX: number, worldY: number, range: number): { x: number; y: number } {
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

  /** Relocate to `to` with the blink effect. The caller owns the cooldown. */
  blinkTo(to: { x: number; y: number }): void {
    const from = { x: this.player.x, y: this.player.y };
    this.callbacks.onBeforeBlink();
    this.player.blinkTo(to.x, to.y);
    Fx.of(this.scene).blink(from, { x: this.player.x, y: this.player.y });
  }

  /**
   * F: the same blink geometry with no payload — no hit, no passive stack, and
   * no champion ability ever refunds its cooldown.
   */
  castFlash(worldX: number, worldY: number): boolean {
    if (!this.cooldowns.isReady('flash')) return false;

    const from = { x: this.player.x, y: this.player.y };
    const to = this.destinationFor(worldX, worldY, FLASH.range);

    this.callbacks.onBeforeBlink();
    this.player.blinkTo(to.x, to.y);
    this.cooldowns.start('flash');

    const fx = Fx.of(this.scene);
    fx.flashBurst(from.x, from.y);
    fx.flashBurst(this.player.x, this.player.y);
    return true;
  }
}
