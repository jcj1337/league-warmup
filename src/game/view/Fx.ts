import Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { mulberry32 } from '../art/pixel';
import { pixelText } from '../art/font';
import { TEX } from '../art/textures';
import { dottedRing } from './pixelDraw';

interface Particle {
  img: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  drag: number;
  gravity: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  r0: number;
  r1: number;
  age: number;
  life: number;
  color: number;
  alpha: number;
  dot: number;
  from: number;
  to: number;
}

interface Popup {
  text: Phaser.GameObjects.BitmapText;
  active: boolean;
  x: number;
  y: number;
  age: number;
  life: number;
  rise: number;
}

export interface ParticleOptions {
  vx?: number;
  vy?: number;
  life: number;
  /** Fraction of velocity kept per second (0.05 = heavy drag). */
  drag?: number;
  gravity?: number;
  scale?: number;
  scaleTo?: number;
  alpha?: number;
  alphaTo?: number;
  tint?: number;
  depth?: number;
  rotation?: number;
}

export type ShotFx = 'auto' | 'q' | 'w' | 'e';

const TAU = Math.PI * 2;
const REGISTRY = new WeakMap<Phaser.Scene, Fx>();

/**
 * Lightweight combat effects: pooled pixel particles, dotted pixel rings and
 * floating text, all advanced by the scene's frame (so they freeze with the
 * pause, like everything else). Purely decorative: nothing here is ever read
 * back by gameplay, and effect timing never gates a mechanic.
 *
 * Particles and popups are recycled rather than created per effect; all rings
 * share one Graphics that is redrawn each frame.
 */
export class Fx {
  private readonly particles: Particle[] = [];
  private readonly freeParticles: Particle[] = [];
  private readonly rings: Ring[] = [];
  private readonly popups: Popup[] = [];
  private readonly ringGfx: Phaser.GameObjects.Graphics;
  /** Decorative RNG, never shared with gameplay. */
  private readonly rand = mulberry32(0xf00d);

  constructor(private readonly scene: Phaser.Scene) {
    this.ringGfx = scene.add.graphics().setDepth(THEME.depth.fx);
    REGISTRY.set(scene, this);
  }

  /** The effects layer of the scene currently simulating. */
  static of(scene: Phaser.Scene): Fx {
    const fx = REGISTRY.get(scene);
    if (!fx) throw new Error('Fx used before the scene created it');
    return fx;
  }

  get activeParticles(): number {
    return this.particles.length - this.freeParticles.length;
  }

  // ------------------------------------------------------------- primitives

  particle(key: string, x: number, y: number, o: ParticleOptions): void {
    let p = this.freeParticles.pop();
    if (!p) {
      p = {
        img: this.scene.add.image(0, 0, key),
        active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, drag: 1, gravity: 0, s0: 1, s1: 1, a0: 1, a1: 0,
      };
      this.particles.push(p);
    }
    const scale = o.scale ?? THEME.art.scale;
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.age = 0;
    p.life = Math.max(1, o.life);
    p.drag = o.drag ?? 1;
    p.gravity = o.gravity ?? 0;
    p.s0 = scale;
    p.s1 = o.scaleTo ?? scale;
    p.a0 = o.alpha ?? 1;
    p.a1 = o.alphaTo ?? 0;
    p.img
      .setTexture(key)
      .setActive(true)
      .setVisible(true)
      .setPosition(Math.round(x), Math.round(y))
      .setScale(scale)
      .setAlpha(p.a0)
      .setRotation(o.rotation ?? 0)
      .setDepth(o.depth ?? THEME.depth.fx);
    if (o.tint === undefined) p.img.clearTint();
    else p.img.setTint(o.tint);
  }

  /** Square pixel sparks thrown out in random directions (or a cone around `angle`). */
  sparks(
    x: number,
    y: number,
    colors: readonly number[],
    count: number,
    speed: number,
    life: number,
    size = 3,
    angle?: number,
    spread = TAU,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = angle === undefined ? this.rand() * TAU : angle + (this.rand() - 0.5) * spread;
      const v = speed * (0.45 + this.rand() * 0.75);
      this.particle(TEX.px, x, y, {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.7 + this.rand() * 0.5),
        drag: 0.04,
        scale: size,
        scaleTo: size,
        alpha: 1,
        alphaTo: 0,
        tint: colors[i % colors.length],
      });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, life: number, color: number, alpha = 1, dot = 3, from = 0, to = TAU): void {
    let ring = this.rings.find((r) => !r.active);
    if (!ring) {
      ring = { active: false, x: 0, y: 0, r0: 0, r1: 0, age: 0, life: 1, color: 0, alpha: 1, dot: 3, from: 0, to: TAU };
      this.rings.push(ring);
    }
    Object.assign(ring, { active: true, x, y, r0, r1, age: 0, life: Math.max(1, life), color, alpha, dot, from, to });
  }

  /** Floating pixel text: damage numbers, the CANCEL tag. */
  popup(x: number, y: number, message: string, color: number, life: number = THEME.enemy.damageNumberRiseMs, rise = 26): void {
    let p = this.popups.find((q) => !q.active);
    if (!p) {
      p = {
        text: pixelText(this.scene, 0, 0, '', 2).setOrigin(0.5, 1).setDepth(THEME.depth.text),
        active: false, x: 0, y: 0, age: 0, life: 1, rise: 0,
      };
      this.popups.push(p);
    }
    Object.assign(p, { active: true, x, y, age: 0, life, rise });
    p.text.setText(message).setTint(color).setAlpha(1).setVisible(true).setPosition(Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------ vocabulary

  ping(x: number, y: number, kind: 'move' | 'attack-move'): void {
    const S = THEME.art.scale;
    const move = kind === 'move';
    this.particle(move ? TEX.fx.pingMove : TEX.fx.pingAttack, x, y, {
      life: THEME.fx.ping.durationMs,
      scale: move ? S : S - 1,
      scaleTo: move ? S - 1.5 : S + 1,
      alpha: 1,
      alphaTo: 0,
      depth: THEME.depth.ping,
    });
  }

  impact(kind: ShotFx, x: number, y: number): void {
    const f = THEME.fx[kind];
    this.ring(x, y, 4, f.impactRadius, f.impactMs, f.color, 1);
    this.sparks(x, y, [f.core, f.color, f.color], f.sparks, 170, f.impactMs * 1.2);
  }

  castFlash(kind: 'q' | 'w', x: number, y: number, angle: number): void {
    const f = THEME.fx[kind];
    this.ring(x, y, 6, f.castFlashRadius, f.castFlashMs, f.core, 0.9, 3, angle - 0.9, angle + 0.9);
    this.sparks(x, y, [f.core, f.color], kind === 'q' ? 6 : 8, 220, f.castFlashMs * 1.6, 3, angle, 0.9);
  }

  detonation(x: number, y: number): void {
    const d = THEME.fx.detonation;
    this.ring(x, y, 8, d.radius, d.ms, d.color, 1, 6);
    this.ring(x, y, 4, d.radius * 0.6, d.ms * 0.8, d.accent, 1, 3);
    this.sparks(x, y, [d.color, d.accent, d.deep], d.shards, 260, d.ms * 1.4, 6);
    this.particle(TEX.mark, x, y - 4, { life: d.ms, scale: THEME.art.scale, scaleTo: THEME.art.scale * 2, alpha: 1, alphaTo: 0, depth: THEME.depth.mark });
  }

  blink(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const e = THEME.fx.e;
    this.ring(from.x, from.y, 26, 4, e.blinkMs, e.color, 0.9);
    this.ring(to.x, to.y, 4, 30, e.blinkMs, e.blue, 1);
    this.ring(to.x, to.y, 2, 18, e.blinkMs * 0.8, e.core, 1);
    this.sparks(from.x, from.y, [e.color, e.blue], 6, 90, e.blinkMs * 1.4);
    this.sparks(to.x, to.y, [e.core, e.color, e.blue], 8, 160, e.blinkMs * 1.4);
    // A few fading motes along the path — short-lived, never a tether.
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.floor(dist / 36);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      this.particle(TEX.px, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, {
        life: e.blinkMs * (0.4 + 0.6 * t),
        scale: 3,
        tint: i % 2 ? e.color : e.blue,
      });
    }
  }

  flashBurst(x: number, y: number): void {
    const f = THEME.fx.flash;
    const S = THEME.art.scale;
    this.particle(TEX.fx.flashStar, x, y, { life: f.burstMs, scale: S, scaleTo: S + 2, alpha: 1, alphaTo: 0 });
    this.ring(x, y, 6, 30, f.burstMs, f.color, 1);
    this.sparks(x, y, [f.core, f.color], 8, 200, f.burstMs);
  }

  hit(x: number, y: number, colors: readonly number[]): void {
    this.sparks(x, y, [THEME.fx.hit.color, ...colors], 5, 140, 180);
  }

  death(x: number, y: number, radius: number, colors: readonly number[]): void {
    const n = THEME.enemy.deathShards;
    this.ring(x, y, radius * 0.6, radius * 2.2, THEME.enemy.deathAnimMs + 60, THEME.fx.hit.color, 0.9);
    this.sparks(x, y, colors, n, 240, THEME.enemy.deathAnimMs + 180, 6);
    this.sparks(x, y, [THEME.fx.hit.color], 5, 300, THEME.enemy.deathAnimMs, 3);
  }

  passivePulse(x: number, y: number, radius: number, maxed: boolean): void {
    this.ring(x, y, radius + 2, radius + (maxed ? 34 : 24), 320, THEME.fx.passive, 0.9, maxed ? 6 : 3);
  }

  castRelease(x: number, y: number, kind: 'q' | 'w' | 'e'): void {
    const f = THEME.fx[kind];
    this.ring(x, y, 12, THEME.cast.releaseFlashRadius, THEME.cast.releaseFlashMs * 1.6, f.core, 1);
  }

  slash(x: number, y: number, angle: number, reach: number, color: number): void {
    this.ring(x, y, reach * 0.55, reach * 1.05, 220, color, 1, 6, angle - 1, angle + 1);
    this.ring(x, y, reach * 0.4, reach * 0.8, 180, THEME.pursuer.telegraph.color, 0.9, 3, angle - 0.8, angle + 0.8);
  }

  trail(x: number, y: number, style: { color: number; life: number; size: number }): void {
    this.particle(TEX.px, x, y, {
      life: style.life,
      scale: style.size,
      scaleTo: Math.max(1, style.size - 2),
      alpha: 0.85,
      alphaTo: 0,
      tint: style.color,
      depth: THEME.depth.projectiles - 0.5,
    });
  }

  // ----------------------------------------------------------------- frame

  update(deltaSeconds: number): void {
    const ms = deltaSeconds * 1000;

    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += ms;
      if (p.age >= p.life) {
        p.active = false;
        p.img.setActive(false).setVisible(false);
        this.freeParticles.push(p);
        continue;
      }
      const t = p.age / p.life;
      const keep = Math.pow(p.drag, deltaSeconds);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * deltaSeconds;
      p.x += p.vx * deltaSeconds;
      p.y += p.vy * deltaSeconds;
      p.img
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setScale(p.s0 + (p.s1 - p.s0) * t)
        .setAlpha(p.a0 + (p.a1 - p.a0) * t);
    }

    const g = this.ringGfx;
    g.clear();
    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += ms;
      if (r.age >= r.life) {
        r.active = false;
        continue;
      }
      const t = r.age / r.life;
      const eased = 1 - (1 - t) * (1 - t);
      dottedRing(g, r.x, r.y, r.r0 + (r.r1 - r.r0) * eased, r.color, r.alpha * (1 - t), r.dot, r.from, r.to);
    }

    for (const p of this.popups) {
      if (!p.active) continue;
      p.age += ms;
      if (p.age >= p.life) {
        p.active = false;
        p.text.setVisible(false);
        continue;
      }
      const t = p.age / p.life;
      p.text.setPosition(Math.round(p.x), Math.round(p.y - p.rise * (1 - (1 - t) * (1 - t)))).setAlpha(t < 0.5 ? 1 : 2 - t * 2);
    }
  }

  /** Drop every live effect (restart). */
  clear(): void {
    for (const p of this.particles) {
      if (p.active) {
        p.active = false;
        p.img.setActive(false).setVisible(false);
        this.freeParticles.push(p);
      }
    }
    for (const r of this.rings) r.active = false;
    for (const p of this.popups) {
      p.active = false;
      p.text.setVisible(false);
    }
    this.ringGfx.clear();
  }
}
