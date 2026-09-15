import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { snapAngle } from '../art/pixel';
import { Fx } from './Fx';

export interface TrailStyle {
  color: number;
  /** Drop one puff every this many pixels travelled. */
  spacing: number;
  life: number;
  size: number;
}

/** How a projectile looks. Gameplay size (radius) is separate and unaffected. */
export interface ProjectileArt {
  frames: readonly string[];
  frameMs?: number;
  /** Rotate the sprite to its heading (bolts) or keep it upright (orbs). */
  rotate: boolean;
  trail?: TrailStyle;
  depth: number;
}

/** The sprite + trail for one projectile. Reads position from the projectile each frame. */
export class ProjectileView {
  readonly sprite: Phaser.GameObjects.Image;
  private age = 0;
  private sinceTrail = 0;
  private lastX: number;
  private lastY: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly art: ProjectileArt,
    x: number,
    y: number,
    angle: number,
    scale: number = THEME.art.scale,
  ) {
    this.lastX = x;
    this.lastY = y;
    this.sprite = scene.add
      .image(Math.round(x), Math.round(y), art.frames[0])
      .setScale(scale)
      .setDepth(art.depth)
      .setRotation(art.rotate ? snapAngle(angle, 32) : 0);
  }

  get textureKey(): string {
    return this.sprite.texture.key;
  }

  sync(x: number, y: number, deltaSeconds: number, heading?: number): void {
    this.age += deltaSeconds * 1000;
    if (this.art.frames.length > 1) {
      const i = Math.floor(this.age / (this.art.frameMs ?? 100)) % this.art.frames.length;
      this.sprite.setTexture(this.art.frames[i]);
    }
    this.sprite.setPosition(Math.round(x), Math.round(y));
    if (this.art.rotate && heading !== undefined) this.sprite.setRotation(snapAngle(heading, 32));

    const trail = this.art.trail;
    if (trail) {
      this.sinceTrail += Math.hypot(x - this.lastX, y - this.lastY);
      if (this.sinceTrail >= trail.spacing) {
        this.sinceTrail = 0;
        Fx.of(this.scene).trail(this.lastX, this.lastY, trail);
      }
    }
    this.lastX = x;
    this.lastY = y;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
