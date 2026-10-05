import type Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import { Fx } from '../../game/view/Fx';

/**
 * A thrown axe on its way back down: where it will land, when, and whether
 * it was caught. The kit decides the catch (it knows where he stands); this
 * holds the state and draws it.
 *
 *   air ──(landsAt)──► ground ──(goneAt)──► done (missed)
 *     └────────────── caught at either ─────► done
 *
 * Drawn as a circle on the ground at the catch radius, filling as the axe
 * comes down, and the axe itself turning through a high arc from the enemy it
 * bounced off to the spot.
 */
export class AxeDrop {
  state: 'air' | 'ground' | 'done' = 'air';
  caught = false;
  /** Clock time a missed axe stops being there to pick up. */
  goneAt = Number.POSITIVE_INFINITY;

  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly axe: Phaser.GameObjects.Image;
  private turn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fromX: number,
    private readonly fromY: number,
    /** Where it lands. The kit may still move it for a moment after the throw (moveTo). */
    public x: number,
    public y: number,
    private readonly thrownAt: number,
    /** Clock time it lands. */
    readonly landsAt: number,
    readonly radius: number,
  ) {
    this.ring = scene.add.graphics().setDepth(THEME.depth.groundFx);
    this.axe = scene.add.image(fromX, fromY, TEX.proj.spinAxe).setScale(THEME.art.scale).setDepth(THEME.depth.fx);
  }

  /** Steer the landing spot (only while the kit still allows it). */
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** 0..1 through the fall. */
  progress(nowMs: number): number {
    const span = this.landsAt - this.thrownAt;
    return span > 0 ? Math.min(1, Math.max(0, (nowMs - this.thrownAt) / span)) : 1;
  }

  /** It came down with nobody under it: it lies there until `goneAt`. */
  land(nowMs: number, groundMs: number): void {
    this.state = 'ground';
    this.goneAt = nowMs + groundMs;
  }

  /** Caught, or gone. Either way it leaves the ground. */
  finish(caught: boolean): void {
    if (this.state === 'done') return;
    this.state = 'done';
    this.caught = caught;
    const D = THEME.axeman.drop;
    const fx = Fx.of(this.scene);
    if (caught) {
      fx.ring(this.x, this.y, this.radius * 0.4, this.radius * 1.25, D.catchMs, D.ring, 1);
      fx.sparks(this.x, this.y, [THEME.fx.axe.core, THEME.fx.axe.color, THEME.fx.axe.deep], D.catchSparks, 180, D.catchMs * 1.4);
    } else {
      fx.sparks(this.x, this.y, [D.missColor], 5, 70, 320);
    }
    this.destroy();
  }

  /** Draw this frame. */
  sync(nowMs: number, deltaSeconds: number): void {
    if (this.state === 'done') return;
    const D = THEME.axeman.drop;
    const t = this.progress(nowMs);
    const g = this.ring;
    g.clear();
    if (this.state === 'air') {
      g.fillStyle(D.fill, D.fillAlpha);
      g.fillCircle(this.x, this.y, this.radius * t);
      g.lineStyle(D.ringWidth, D.ring, D.ringAlpha);
      g.strokeCircle(this.x, this.y, this.radius);
      this.turn += deltaSeconds * D.turnsPerSecond * Math.PI * 2;
      const lift = 4 * D.arcPx * t * (1 - t);
      this.axe
        .setPosition(Math.round(this.fromX + (this.x - this.fromX) * t), Math.round(this.fromY + (this.y - this.fromY) * t - lift))
        .setRotation(this.turn);
    } else {
      // On the ground: stuck where it fell, the circle fading with the time left to grab it.
      const left = Math.max(0, Math.min(1, (this.goneAt - nowMs) / Math.max(1, this.goneAt - this.landsAt)));
      g.lineStyle(D.ringWidth, D.ring, D.ringAlpha * left);
      g.strokeCircle(this.x, this.y, this.radius);
      this.axe.setPosition(Math.round(this.x), Math.round(this.y)).setRotation(Math.PI * 0.75).setAlpha(0.4 + 0.6 * left);
    }
  }

  destroy(): void {
    this.state = 'done';
    this.ring.destroy();
    this.axe.destroy();
  }
}
