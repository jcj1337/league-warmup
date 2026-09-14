import Phaser from 'phaser';
import { DEBUG, SKILLSHOT_W, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import type { GameClock } from '../systems/GameClock';

/** Identifies an archetype for spawn weighting, scoring and kill tallies. */
export type EnemyArchetype = 'basic' | 'pursuer';

/** What an enemy's AI is allowed to see and do each frame. */
export interface EnemyContext {
  player: { x: number; y: number; radius: number };
  /** Apply damage to the player. Routed through the scene's i-frame logic. */
  damagePlayer(amount: number): void;
}

export interface EnemyOptions {
  radius: number;
  maxHp: number;
  /** Kill score = SCORE.pointsPerKill * this. */
  scoreMultiplier: number;
  hpBarWidth: number;
  hpBarHeight: number;
  hpBarOffsetY: number;
  /** Ring/shard colour for the death burst. */
  burstColor: number;
  shadowAlpha: number;
}

/**
 * Everything every enemy shares: position, HP, the damage/death/respawn
 * lifecycle, and all the feedback that goes with it (hit flash, floating damage
 * numbers, draining ghost health bar, death burst, grounding shadow).
 *
 * Archetypes subclass this and supply only what makes them different:
 *   - `buildBody()`  — the silhouette, as a Container
 *   - `syncBody()`   — per-frame transform of that silhouette
 *   - `updateAi()`   — behaviour, if any (the basic target just drifts)
 *
 * As with the player, gameplay state (`hp`, `active`) flips immediately and the
 * visuals only ever represent it — nothing here waits on a tween. All timing
 * reads the GameClock, so every enemy freezes correctly when paused.
 */
export abstract class Enemy {
  abstract readonly archetype: EnemyArchetype;

  public x: number;
  public y: number;

  public readonly radius: number;
  public readonly scoreMultiplier: number;

  public hp: number;
  public readonly maxHp: number;

  /** Killed enemies stay in the list but inactive until the director clears them. */
  public active = true;

  /**
   * Bumped whenever this slot is reused. In-flight auto missiles capture it so
   * a projectile aimed at a dead enemy can never damage its replacement.
   */
  public spawnId = 0;

  protected readonly scene: Phaser.Scene;
  protected readonly clock: GameClock;
  protected readonly opts: EnemyOptions;

  /** Visual-only: drives the hit squash and the death fade. */
  protected hitFlashUntil = 0;
  protected deathAnimUntil = 0;

  /** Trails behind `hp` so you can see how much was just taken off. */
  private ghostHp: number;

  /**
   * W mark: clock time at which it lapses, or 0 for unmarked.
   *
   * Marks live on the enemy itself so every archetype gets them for free and so
   * they die with the enemy. Respawning REPLACES the enemy object outright, so
   * a fresh enemy can never inherit a predecessor's mark.
   */
  private markUntil = 0;
  /** The rotating ring drawn on a marked enemy. */
  private readonly markGfx: Phaser.GameObjects.Graphics;

  /** The silhouette, built by the subclass. */
  protected body!: Phaser.GameObjects.Container;

  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpGhost: Phaser.GameObjects.Rectangle;
  private readonly hpBar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, opts: EnemyOptions) {
    this.scene = scene;
    this.clock = clock;
    this.opts = opts;
    this.x = x;
    this.y = y;
    this.radius = opts.radius;
    this.scoreMultiplier = opts.scoreMultiplier;
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
    this.ghostHp = opts.maxHp;

    this.shadow = scene.add
      .ellipse(x, y + opts.radius * 0.7, opts.radius * 2.1, opts.radius * 0.8, 0x000000, opts.shadowAlpha)
      .setDepth(2);

    const barY = y - opts.radius - opts.hpBarOffsetY;
    this.hpBarBg = scene.add
      .rectangle(x, barY, opts.hpBarWidth, opts.hpBarHeight, 0x121820, 0.9)
      .setStrokeStyle(1, 0x000000, 0.8)
      .setDepth(9);
    // Pale "ghost" layer drains toward the real value so each hit is visible.
    this.hpGhost = scene.add
      .rectangle(x - opts.hpBarWidth / 2, barY, opts.hpBarWidth, opts.hpBarHeight - 2, 0xffd9d9, 0.65)
      .setOrigin(0, 0.5)
      .setDepth(9);
    this.hpBar = scene.add
      .rectangle(x - opts.hpBarWidth / 2, barY, opts.hpBarWidth, opts.hpBarHeight - 2, 0x62d26f)
      .setOrigin(0, 0.5)
      .setDepth(10);

    this.markGfx = scene.add.graphics().setDepth(11).setVisible(false);
  }

  // ------------------------------------------------------------------ W mark

  /** Apply (or refresh) the W mark. */
  applyMark(nowMs: number): void {
    this.markUntil = nowMs + SKILLSHOT_W.markDurationMs;
  }

  isMarked(nowMs: number): boolean {
    return this.active && nowMs < this.markUntil;
  }

  /** Consume the mark — on detonation, or when it lapses/the enemy dies. */
  clearMark(): void {
    this.markUntil = 0;
    this.markGfx.clear().setVisible(false);
  }

  /**
   * Rotating ring + orbiting accents. Deliberately loud: a marked enemy is a
   * damage opportunity and must be identifiable at a glance.
   */
  private drawMark(nowMs: number): void {
    if (!this.isMarked(nowMs)) {
      if (this.markGfx.visible) this.markGfx.clear().setVisible(false);
      return;
    }

    const g = this.markGfx;
    const spin = nowMs * THEME.mark.spinSpeed;
    // Gentle pulse, plus a fade over the last 600ms so the lapse is readable.
    const remaining = this.markUntil - nowMs;
    const fade = Math.min(1, remaining / 600);
    const r = this.radius + 9 + Math.sin(nowMs * 0.006) * 1.5;

    g.clear().setVisible(true);
    g.lineStyle(2, THEME.mark.color, 0.85 * fade);
    g.strokeCircle(this.x, this.y, r);

    // Four orbiting ticks.
    g.lineStyle(3, THEME.mark.accent, 0.95 * fade);
    for (let i = 0; i < 4; i++) {
      const a = spin + (Math.PI / 2) * i;
      const inner = r + 2;
      const outer = r + 7;
      g.lineBetween(
        this.x + Math.cos(a) * inner,
        this.y + Math.sin(a) * inner,
        this.x + Math.cos(a) * outer,
        this.y + Math.sin(a) * outer,
      );
    }
  }

  /** @returns true if this hit killed the enemy. */
  takeDamage(amount: number): boolean {
    if (!this.active) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashUntil = this.clock.now + TARGETS.hitFeedbackMs;
    this.showDamageNumber(amount);

    if (this.hp === 0) {
      // State flips NOW; the fade below is only decoration.
      this.active = false;
      this.clearMark();
      this.deathAnimUntil = this.clock.now + TARGETS.deathAnimMs;
      this.playDeathBurst();
      return true;
    }
    return false;
  }

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    if (this.active) this.updateAi(deltaSeconds, nowMs, ctx);

    // Ghost bar eases toward the real value (visual only).
    if (this.ghostHp > this.hp) {
      this.ghostHp = Math.max(this.hp, this.ghostHp - this.maxHp * 1.6 * deltaSeconds);
    } else if (this.ghostHp < this.hp) {
      this.ghostHp = this.hp;
    }

    this.syncVisuals(nowMs);
  }

  /** Behaviour. Default: stand still. */
  protected updateAi(_deltaSeconds: number, _nowMs: number, _ctx: EnemyContext): void {}

  /**
   * Per-frame transform of the archetype's silhouette.
   * `flash` is 1 immediately after a hit and decays to 0.
   */
  protected abstract syncBody(nowMs: number, flash: number): void;

  private syncVisuals(nowMs: number): void {
    // Dying: play out the fade/shrink, then go fully hidden.
    if (!this.active) {
      const remaining = this.deathAnimUntil - nowMs;
      if (remaining > 0) {
        const t = remaining / TARGETS.deathAnimMs; // 1 -> 0
        this.body
          .setVisible(true)
          .setPosition(this.x, this.y)
          .setScale(0.35 + 0.65 * t)
          .setAlpha(t);
      } else {
        this.body.setVisible(false);
      }
      this.hpBarBg.setVisible(false);
      this.hpBar.setVisible(false);
      this.hpGhost.setVisible(false);
      this.shadow.setVisible(false);
      this.markGfx.clear().setVisible(false);
      return;
    }

    const flash = Math.max(0, (this.hitFlashUntil - nowMs) / TARGETS.hitFeedbackMs);
    this.body.setVisible(true).setAlpha(1);
    this.syncBody(nowMs, flash);
    this.drawMark(nowMs);

    const o = this.opts;
    const barY = this.y - this.radius - o.hpBarOffsetY;
    this.hpBarBg.setVisible(true).setPosition(this.x, barY);
    this.hpBar.setVisible(true).setPosition(this.x - o.hpBarWidth / 2, barY);
    this.shadow.setVisible(true).setPosition(this.x, this.y + this.radius * 0.7);

    const pct = this.hp / this.maxHp;
    const ghostPct = this.ghostHp / this.maxHp;
    this.hpBar.width = Math.max(0, (o.hpBarWidth - 2) * pct);
    this.hpGhost.setVisible(ghostPct > pct).setPosition(this.x - o.hpBarWidth / 2, barY);
    this.hpGhost.width = Math.max(0, (o.hpBarWidth - 2) * ghostPct);
    this.hpBar.setFillStyle(pct > 0.5 ? 0x62d26f : pct > 0.25 ? 0xffd166 : 0xff6b6b);
  }

  /** Small number that floats up and fades, so damage is impossible to miss. */
  private showDamageNumber(amount: number): void {
    if (!DEBUG.showDamageNumbers) return;

    const text = this.scene.add
      .text(this.x, this.y - this.radius - 6, `-${Math.round(amount)}`, {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '15px',
        color: THEME.ui.warn,
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 26,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  /** Ring + shards on death. Purely decorative; the kill already registered. */
  private playDeathBurst(): void {
    const ring = this.scene.add
      .circle(this.x, this.y, this.radius, 0x000000, 0)
      .setStrokeStyle(3, this.opts.burstColor, 0.9)
      .setDepth(11);
    this.scene.tweens.add({
      targets: ring,
      radius: this.radius * 2.6,
      alpha: 0,
      duration: TARGETS.deathAnimMs + 80,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });

    for (let i = 0; i < TARGETS.deathShards; i++) {
      const angle = (Math.PI * 2 * i) / TARGETS.deathShards + Math.random() * 0.4;
      const shard = this.scene.add
        .circle(this.x, this.y, 3.5, this.opts.burstColor, 0.95)
        .setDepth(11);
      this.scene.tweens.add({
        targets: shard,
        x: this.x + Math.cos(angle) * (34 + Math.random() * 20),
        y: this.y + Math.sin(angle) * (34 + Math.random() * 20),
        alpha: 0,
        scale: 0.3,
        duration: TARGETS.deathAnimMs + 120,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  destroy(): void {
    this.markGfx.destroy();
    this.body.destroy();
    this.shadow.destroy();
    this.hpBar.destroy();
    this.hpGhost.destroy();
    this.hpBarBg.destroy();
  }
}
