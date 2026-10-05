import Phaser from 'phaser';
import type { FxKey } from '../../champions/types';
import { THEME } from '../../config/theme';
import { mulberry32 } from '../art/pixel';
import { pixelText } from '../art/font';
import { TEX } from '../art/textures';
import { dottedRing, easeOut, smoothRing, stripPoints, wedgePoints } from './pixelDraw';

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

/**
 * A smooth shape that plays once and fades: a ring running outward (a
 * shockwave), or a flash on the ground where something landed (disc, strip,
 * wedge). The hostile spells' and the Bulwark's impacts are made of these.
 */
interface Shape {
  active: boolean;
  kind: 'wave' | 'disc' | 'strip' | 'wedge';
  x: number;
  y: number;
  /** wave: start and end radius. disc / wedge: `r1` is the radius. strip: `r1` is the length. */
  r0: number;
  r1: number;
  angle: number;
  /** strip: half width. wedge: half angle. wave: half the arc drawn (PI = a full ring). */
  half: number;
  age: number;
  life: number;
  color: number;
  alpha: number;
  width: number;
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

/** Where a popup that follows something sits right now (its base, before the rise). */
export type Anchor = () => { x: number; y: number };

/** A kill-gold popup: a running total and a coin beside the number, riding on its anchor. */
interface GoldPopup extends Popup {
  coin: Phaser.GameObjects.Image;
  amount: number;
  anchor: Anchor;
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

/** What an impact can look like: the auto's own entry or any champion fx key (all carry impact numbers). */
export type ShotFx = 'auto' | FxKey;

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
  private readonly golds: GoldPopup[] = [];
  /** The newest kill-gold popup, which kills inside THEME.killGold.mergeMs add into. */
  private lastGold: GoldPopup | null = null;
  private readonly shapes: Shape[] = [];
  private readonly ringGfx: Phaser.GameObjects.Graphics;
  /** Ground flashes: above the telegraphs, below every unit. */
  private readonly groundGfx: Phaser.GameObjects.Graphics;
  /** Decorative RNG, never shared with gameplay. */
  private readonly rand = mulberry32(0xf00d);

  constructor(private readonly scene: Phaser.Scene) {
    this.ringGfx = scene.add.graphics().setDepth(THEME.depth.fx);
    this.groundGfx = scene.add.graphics().setDepth(THEME.depth.groundFx + 0.6);
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

  private shape(s: Omit<Shape, 'active' | 'age'>): void {
    let shape = this.shapes.find((q) => !q.active);
    if (!shape) {
      shape = { active: false, kind: 'wave', x: 0, y: 0, r0: 0, r1: 0, angle: 0, half: Math.PI, age: 0, life: 1, color: 0, alpha: 1, width: 2 };
      this.shapes.push(shape);
    }
    Object.assign(shape, s, { active: true, age: 0, life: Math.max(1, s.life) });
  }

  /** A smooth ring (or an arc `half` either side of `angle`) running out from r0 to r1 and fading. */
  wave(x: number, y: number, r0: number, r1: number, life: number, color: number, alpha = 1, width = 2, angle = 0, half = Math.PI): void {
    this.shape({ kind: 'wave', x, y, r0, r1, angle, half, life, color, alpha, width });
  }

  /** A disc of light on the ground that swells a little and fades. */
  flashDisc(x: number, y: number, radius: number, life: number, color: number, alpha = 0.6): void {
    this.shape({ kind: 'disc', x, y, r0: 0, r1: radius, angle: 0, half: 0, life, color, alpha, width: 0 });
  }

  /** A strip of light on the ground from (x, y) along `angle`, narrowing onto its centre line as it fades. */
  flashStrip(x: number, y: number, angle: number, length: number, halfWidth: number, life: number, color: number, alpha = 0.6): void {
    this.shape({ kind: 'strip', x, y, r0: 0, r1: length, angle, half: halfWidth, life, color, alpha, width: 0 });
  }

  /** A wedge of light on the ground, fading. */
  flashWedge(x: number, y: number, angle: number, halfAngle: number, radius: number, life: number, color: number, alpha = 0.6): void {
    this.shape({ kind: 'wedge', x, y, r0: 0, r1: radius, angle, half: halfAngle, life, color, alpha, width: 0 });
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

  /**
   * League-style last-hit gold: "+N" with a coin, rising from `anchor`. The
   * anchor is re-read every frame, so the popup rides along with whatever it
   * is over (the slime's head) until it fades. A kill within
   * THEME.killGold.mergeMs of the last one adds into that popup and restarts
   * it, so a multi-kill reads as one number, not a pile.
   */
  goldPopup(anchor: Anchor, amount: number): void {
    const K = THEME.killGold;
    let p = this.lastGold?.active && this.lastGold.age < K.mergeMs ? this.lastGold : null;
    if (p) {
      p.amount += amount;
    } else {
      p = this.golds.find((q) => !q.active) ?? null;
      if (!p) {
        p = {
          text: pixelText(this.scene, 0, 0, '', 2).setOrigin(0.5, 1).setDepth(THEME.depth.text),
          coin: this.scene.add.image(0, 0, TEX.fx.coin).setOrigin(0.5, 1).setScale(K.coinScale).setDepth(THEME.depth.text),
          active: false, x: 0, y: 0, age: 0, life: 1, rise: 0, amount: 0, anchor,
        };
        this.golds.push(p);
      }
      p.amount = amount;
    }
    Object.assign(p, { active: true, anchor, age: 0, life: K.lifeMs, rise: K.risePx });
    p.text.setText(`+${p.amount}`).setTint(K.color).setVisible(true);
    p.coin.setVisible(true);
    this.lastGold = p;
    this.placeGold(p);
  }

  /**
   * Follow the anchor, risen by how far into its life the popup is: number
   * centred over the anchor, coin just left of it, both bottom-aligned.
   */
  private placeGold(p: GoldPopup): void {
    const K = THEME.killGold;
    const t = p.age / p.life;
    const at = p.anchor();
    p.x = at.x;
    p.y = at.y - p.rise * (1 - (1 - t) * (1 - t));
    const y = p.y;
    const textX = Math.round(p.x + (p.coin.displayWidth + K.coinGapPx) / 2);
    p.text.setPosition(textX, Math.round(y));
    p.coin.setPosition(Math.round(textX - p.text.width / 2 - K.coinGapPx - p.coin.displayWidth / 2), Math.round(y));
  }

  /** Kill-gold popups on screen, newest last, where they are drawn right now. */
  get activeGold(): Array<{ amount: number; x: number; y: number; text: string }> {
    return this.golds.filter((p) => p.active).map((p) => ({ amount: p.amount, x: p.x, y: p.y, text: p.text.text }));
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

  castFlash(kind: FxKey, x: number, y: number, angle: number): void {
    const f = THEME.fx[kind];
    const radius = 'castFlashRadius' in f ? f.castFlashRadius : 24;
    const ms = 'castFlashMs' in f ? f.castFlashMs : 120;
    this.ring(x, y, 6, radius, ms, f.core, 0.9, 3, angle - 0.9, angle + 0.9);
    this.sparks(x, y, [f.core, f.color], kind === 'q' ? 6 : 8, 220, ms * 1.6, 3, angle, 0.9);
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

  castRelease(x: number, y: number, kind: FxKey): void {
    const f = THEME.fx[kind];
    this.ring(x, y, 12, THEME.cast.releaseFlashRadius, THEME.cast.releaseFlashMs * 1.6, f.core, 1);
  }

  slash(x: number, y: number, angle: number, reach: number, color: number): void {
    this.ring(x, y, reach * 0.55, reach * 1.05, 220, color, 1, 6, angle - 1, angle + 1);
    this.ring(x, y, reach * 0.4, reach * 0.8, 180, THEME.pursuer.telegraph.color, 0.9, 3, angle - 0.8, angle + 0.8);
  }

  /**
   * A Magus Lance landing: the beam comes down the whole strip at once, white
   * down its seam inside a wider wash of gold, and narrows away; a shockwave
   * and sparks break off its far end.
   */
  arcaneBeam(x: number, y: number, angle: number, length: number, halfWidth = 30): void {
    const f = THEME.spellZone.strike;
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    this.flashStrip(x, y, angle, length, halfWidth, f.ms * 1.5, f.color, 0.55);
    this.flashStrip(x, y, angle, length, halfWidth * 0.45, f.ms, f.core, 0.95);
    this.wave(endX, endY, 6, halfWidth * 1.6, f.ms * 1.2, f.core, 0.9, 2, angle, 1.4);
    this.wave(x, y, 8, halfWidth * 1.2, f.ms, f.color, 0.8, 2);
    const steps = Math.max(2, Math.floor(length / 90));
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * length;
      this.sparks(x + Math.cos(angle) * d, y + Math.sin(angle) * d, [f.core, f.color, f.deep], 3, 150, f.ms * 1.4, 3, angle + Math.PI / 2, Math.PI);
    }
    this.sparks(endX, endY, [f.core, f.color, f.deep], 8, 220, f.ms * 1.3, 3, angle, 1.4);
  }

  /**
   * A Magus Eye / Rite circle landing, or a Sovereign sphere (style 'void'):
   * a flash across the whole circle, a fast pale shockwave and a slower one
   * in the caster's colour running past its edge, and sparks.
   */
  arcaneBurst(x: number, y: number, radius: number, style: 'arcane' | 'void' = 'arcane'): void {
    const f = style === 'void' ? THEME.spellZone.voidStrike : THEME.spellZone.strike;
    this.flashDisc(x, y, radius, f.ms * 1.3, f.color, 0.5);
    this.flashDisc(x, y, radius * 0.55, f.ms, f.core, 0.75);
    this.wave(x, y, radius * 0.25, radius * 1.05, f.ms, f.core, 1, 3);
    this.wave(x, y, radius * 0.6, radius * 1.3, f.ms * 1.5, f.color, 0.85, 2);
    this.sparks(x, y, [f.core, f.color, f.deep], 12, 260, f.ms * 1.4, 3);
  }

  /** A Sovereign Scatter cone landing: a flash across the wedge and arcs sweeping out through it. */
  coneBurst(x: number, y: number, angle: number, radius: number, halfAngle: number, style: 'arcane' | 'void' = 'void'): void {
    const f = style === 'void' ? THEME.spellZone.voidStrike : THEME.spellZone.strike;
    this.flashWedge(x, y, angle, halfAngle, radius, f.ms * 1.3, f.color, 0.5);
    this.wave(x, y, radius * 0.25, radius, f.ms, f.core, 1, 3, angle, halfAngle);
    this.wave(x, y, radius * 0.1, radius * 0.75, f.ms * 1.4, f.color, 0.85, 2, angle, halfAngle);
    this.sparks(x + Math.cos(angle) * radius * 0.5, y + Math.sin(angle) * radius * 0.5, [f.core, f.color], 8, 220, f.ms * 1.3, 3, angle, halfAngle * 2);
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

    const ground = this.groundGfx;
    ground.clear();
    for (const s of this.shapes) {
      if (!s.active) continue;
      s.age += ms;
      if (s.age >= s.life) {
        s.active = false;
        continue;
      }
      const t = s.age / s.life;
      const out = easeOut(t);
      const fade = (1 - t) * (1 - t);
      if (s.kind === 'wave') {
        smoothRing(g, s.x, s.y, s.r0 + (s.r1 - s.r0) * out, s.color, s.alpha * (1 - t), s.width, s.angle - s.half, s.angle + s.half);
        continue;
      }
      ground.fillStyle(s.color, Math.min(1, s.alpha * fade));
      if (s.kind === 'disc') ground.fillCircle(s.x, s.y, s.r1 * (0.85 + 0.15 * out));
      else if (s.kind === 'strip') ground.fillPoints(stripPoints(s.x, s.y, s.angle, s.r1, s.half * (1 - 0.7 * out)), true);
      else ground.fillPoints(wedgePoints(s.x, s.y, s.angle, s.half, s.r1 * (0.85 + 0.15 * out), 16), true);
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

    for (const p of this.golds) {
      if (!p.active) continue;
      p.age += ms;
      if (p.age >= p.life) {
        p.active = false;
        p.text.setVisible(false);
        p.coin.setVisible(false);
        continue;
      }
      const t = p.age / p.life;
      const alpha = t < 0.5 ? 1 : 2 - t * 2;
      this.placeGold(p);
      p.text.setAlpha(alpha);
      p.coin.setAlpha(alpha);
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
    for (const s of this.shapes) s.active = false;
    this.groundGfx.clear();
    for (const p of this.popups) {
      p.active = false;
      p.text.setVisible(false);
    }
    for (const p of this.golds) {
      p.active = false;
      p.text.setVisible(false);
      p.coin.setVisible(false);
    }
    this.lastGold = null;
    this.ringGfx.clear();
  }
}
