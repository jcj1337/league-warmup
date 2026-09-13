import Phaser from 'phaser';
import { ARENA, DEBUG, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';

/** Flat-top hexagon points, centred on (0,0). */
function hexPoints(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/**
 * A dummy enemy: hex hull + HP bar. It does not shoot back (dodging pressure comes
 * from EnemyProjectileSystem) but it wanders slowly so you have to keep kiting
 * rather than parking at max range.
 *
 * All the feedback here (flash, squash, damage numbers, death fade) is visual
 * only — `active` and `hp` flip immediately, so gameplay never waits on a tween.
 */
export class Target {
  public x: number;
  public y: number;
  public readonly radius = TARGETS.radius;

  public hp: number = TARGETS.maxHp;
  public readonly maxHp: number = TARGETS.maxHp;

  /** Killed targets stay in the list but inactive until their respawn timer ends. */
  public active = true;

  /**
   * Bumped on every respawn. In-flight missiles capture this so a projectile
   * aimed at a target that died cannot damage the replacement.
   */
  public spawnId = 0;

  private respawnAt = 0;

  private wanderX: number;
  private wanderY: number;
  private nextWanderAt = 0;

  /** Visual-only: drives the hit squash and the death fade. */
  private hitFlashUntil = 0;
  private deathAnimUntil = 0;

  /** Trails behind `hp` so you can see how much was just taken off. */
  private ghostHp: number = TARGETS.maxHp;

  private readonly scene: Phaser.Scene;
  /** Container so the whole silhouette can spin / squash as one. */
  private readonly body: Phaser.GameObjects.Container;
  private readonly hull: Phaser.GameObjects.Polygon;
  private readonly innerPlate: Phaser.GameObjects.Polygon;
  private readonly eye: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpGhost: Phaser.GameObjects.Rectangle;
  private readonly hpBar: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.wanderX = x;
    this.wanderY = y;

    this.shadow = scene.add
      .ellipse(x, y + this.radius * 0.7, this.radius * 2.1, this.radius * 0.8, 0x000000, THEME.target.shadowAlpha)
      .setDepth(2);

    // Hostiles are hexagons: a completely different silhouette from the
    // player's dart, so friend/foe reads instantly even at the edge of vision.
    // The dark outline keeps them legible against the grid and passing shots.
    this.hull = scene.add
      .polygon(0, 0, hexPoints(this.radius), THEME.target.core)
      .setOrigin(0, 0);
    this.hull.setStrokeStyle(2.5, THEME.target.outline, 0.95);

    this.innerPlate = scene.add
      .polygon(0, 0, hexPoints(this.radius * 0.62), THEME.target.coreDark, 0.85)
      .setOrigin(0, 0);

    this.eye = scene.add.circle(0, 0, this.radius * 0.22, THEME.target.plateColor, 0.95);

    this.body = scene.add.container(x, y, [this.hull, this.innerPlate, this.eye]).setDepth(8);

    const barY = y - this.radius - TARGETS.hpBarOffsetY;
    this.hpBarBg = scene.add
      .rectangle(x, barY, TARGETS.hpBarWidth, TARGETS.hpBarHeight, 0x121820, 0.9)
      .setStrokeStyle(1, 0x000000, 0.8)
      .setDepth(9);
    // Pale "ghost" layer drains toward the real value so each hit is visible.
    this.hpGhost = scene.add
      .rectangle(x - TARGETS.hpBarWidth / 2, barY, TARGETS.hpBarWidth, TARGETS.hpBarHeight - 2, 0xffd9d9, 0.65)
      .setOrigin(0, 0.5)
      .setDepth(9);
    this.hpBar = scene.add
      .rectangle(x - TARGETS.hpBarWidth / 2, barY, TARGETS.hpBarWidth, TARGETS.hpBarHeight - 2, 0x62d26f)
      .setOrigin(0, 0.5)
      .setDepth(10);
  }

  /** @returns true if this hit killed the target. */
  takeDamage(amount: number): boolean {
    if (!this.active) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashUntil = this.scene.time.now + TARGETS.hitFeedbackMs;
    this.showDamageNumber(amount);

    if (this.hp === 0) {
      // State flips NOW; the fade below is only decoration.
      this.active = false;
      this.deathAnimUntil = this.scene.time.now + TARGETS.deathAnimMs;
      this.playDeathBurst();
      return true;
    }
    return false;
  }

  scheduleRespawn(nowMs: number): void {
    this.respawnAt = nowMs + TARGETS.respawnDelayMs;
  }

  isReadyToRespawn(nowMs: number): boolean {
    return !this.active && nowMs >= this.respawnAt;
  }

  respawnAtPosition(x: number, y: number, nowMs: number): void {
    this.x = x;
    this.y = y;
    this.wanderX = x;
    this.wanderY = y;
    this.nextWanderAt = nowMs;
    this.hp = this.maxHp;
    this.ghostHp = this.maxHp;
    this.active = true;
    this.spawnId++;
    this.deathAnimUntil = 0;
    this.hitFlashUntil = 0;

    this.body.setScale(1).setAlpha(1).setRotation(0);
  }

  update(deltaSeconds: number, nowMs: number): void {
    if (this.active && TARGETS.driftSpeed > 0) {
      if (nowMs >= this.nextWanderAt) {
        this.pickWanderPoint(nowMs);
      }
      const dx = this.wanderX - this.x;
      const dy = this.wanderY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        const step = Math.min(TARGETS.driftSpeed * deltaSeconds, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }
    // Ghost bar eases toward the real value (visual only).
    if (this.ghostHp > this.hp) {
      this.ghostHp = Math.max(this.hp, this.ghostHp - this.maxHp * 1.6 * deltaSeconds);
    } else if (this.ghostHp < this.hp) {
      this.ghostHp = this.hp;
    }

    this.syncVisuals(nowMs);
  }

  private pickWanderPoint(nowMs: number): void {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    this.wanderX = Phaser.Math.Clamp(
      this.x + Phaser.Math.Between(-160, 160),
      margin,
      ARENA.width - margin,
    );
    this.wanderY = Phaser.Math.Clamp(
      this.y + Phaser.Math.Between(-160, 160),
      margin,
      ARENA.height - margin,
    );
    this.nextWanderAt = nowMs + TARGETS.driftRetargetMs;
  }

  private syncVisuals(nowMs: number): void {
    // Dying: play out the fade/shrink, then go fully hidden until respawn.
    if (!this.active) {
      const remaining = this.deathAnimUntil - nowMs;
      if (remaining > 0) {
        const t = remaining / TARGETS.deathAnimMs; // 1 -> 0
        this.body
          .setVisible(true)
          .setPosition(this.x, this.y)
          .setScale(0.35 + 0.65 * t)
          .setRotation(nowMs * THEME.target.spinSpeed * 3)
          .setAlpha(t);
      } else {
        this.body.setVisible(false);
      }
      this.hpBarBg.setVisible(false);
      this.hpBar.setVisible(false);
      this.hpGhost.setVisible(false);
      this.shadow.setVisible(false);
      return;
    }

    // Alive: slow spin, plus a brief squash + brightening on hit.
    const flash = Math.max(0, (this.hitFlashUntil - nowMs) / TARGETS.hitFeedbackMs);
    this.body
      .setVisible(true)
      .setPosition(this.x, this.y)
      .setAlpha(1)
      .setScale(1 + 0.22 * flash)
      .setRotation(nowMs * THEME.target.spinSpeed);
    this.hull.setFillStyle(flash > 0.35 ? THEME.target.hitFlashColor : THEME.target.core);

    const barY = this.y - this.radius - TARGETS.hpBarOffsetY;
    this.hpBarBg.setVisible(true).setPosition(this.x, barY);
    this.hpBar.setVisible(true).setPosition(this.x - TARGETS.hpBarWidth / 2, barY);

    this.shadow.setVisible(true).setPosition(this.x, this.y + this.radius * 0.7);

    const pct = this.hp / this.maxHp;
    const ghostPct = this.ghostHp / this.maxHp;
    this.hpBar.width = Math.max(0, (TARGETS.hpBarWidth - 2) * pct);
    this.hpGhost
      .setVisible(ghostPct > pct)
      .setPosition(this.x - TARGETS.hpBarWidth / 2, barY);
    this.hpGhost.width = Math.max(0, (TARGETS.hpBarWidth - 2) * ghostPct);
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
      .setStrokeStyle(3, THEME.target.plateColor, 0.9)
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
        .circle(this.x, this.y, 3.5, THEME.target.core, 0.95)
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
    this.body.destroy();
    this.shadow.destroy();
    this.hpBar.destroy();
    this.hpGhost.destroy();
    this.hpBarBg.destroy();
  }
}
