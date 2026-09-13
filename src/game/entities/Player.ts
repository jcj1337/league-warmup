import Phaser from 'phaser';
import { ARENA, ATTACK, attackReach, DEBUG, PLAYER, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';

/** What the scene hands the player each frame so it can animate the attack. */
export interface AttackVisual {
  /** 0 outside a windup, 0 -> 1 through it. Comes straight from AttackSystem. */
  windupProgress: number;
  /** Time since the last missile release, for the recoil kick. */
  msSinceRelease: number;
  /** Where the attack is aimed, if anywhere. */
  targetX: number | null;
  targetY: number | null;
}

/**
 * The player avatar: a circle with League-style click-to-move.
 *
 * The class owns position + movement + HP only. Attacking lives in AttackSystem
 * and casting lives in SkillshotSystem; they talk to the player through
 * `root()` / `releaseRoot()` so that "can I move right now?" has exactly one owner.
 */
export class Player {
  public x: number;
  public y: number;
  public readonly radius = PLAYER.radius;

  public hp: number = PLAYER.maxHp;
  public readonly maxHp: number = PLAYER.maxHp;

  /** Current move order, or null when standing still. */
  private destX: number | null = null;
  private destY: number | null = null;

  /** Non-zero while an action (attack windup / cast) is holding us in place. */
  private rootCount = 0;

  private lastHitAt = -Infinity;

  /**
   * The unit itself: a container so the whole silhouette can be rotated toward
   * the facing direction and scaled as one during the windup.
   */
  private readonly body: Phaser.GameObjects.Container;
  private readonly hull: Phaser.GameObjects.Polygon;
  private readonly core: Phaser.GameObjects.Arc;
  private readonly idleRing: Phaser.GameObjects.Arc;
  private readonly rangeRing: Phaser.GameObjects.Arc;
  private readonly moveMarker: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  /** Where the unit is pointing. Smoothed so it never snaps. */
  private facingAngle = -Math.PI / 2;
  /** Contracts onto the body through the windup: the "can I still cancel?" cue. */
  private readonly chargeRing: Phaser.GameObjects.Arc;
  /** Expands outward at the instant of release. */
  private readonly releaseRing: Phaser.GameObjects.Arc;

  /** Visual-only attack animation state, written by applyAttackVisual(). */
  private visualOffsetX = 0;
  private visualOffsetY = 0;
  private windupAmount = 0;
  private aimAngle: number | null = null;
  /** Drives the idle breathing pulse. */
  private pulseClock = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;

    // Deliberately faint: useful reference, not the main visual element.
    this.rangeRing = scene.add
      .circle(x, y, this.attackRingRadius(), 0x000000, 0)
      .setStrokeStyle(1, 0x4a5a72, 0.28)
      .setVisible(DEBUG.showAttackRange)
      .setDepth(1);

    this.moveMarker = scene.add
      .circle(x, y, 5, 0x000000, 0)
      .setStrokeStyle(1.5, THEME.markers.moveColor, 0.55)
      .setVisible(false)
      .setDepth(2);

    // Grounding shadow, so the player reads as sitting on the arena floor.
    this.shadow = scene.add
      .ellipse(x, y + this.radius * 0.75, this.radius * 2.2, this.radius * 0.9, 0x000000, THEME.player.shadowAlpha)
      .setDepth(2);

    this.chargeRing = scene.add
      .circle(x, y, this.radius, 0x000000, 0)
      .setStrokeStyle(2, THEME.ui.warn === '#ffd166' ? 0xffd166 : 0xffd166, 0.9)
      .setDepth(9)
      .setVisible(false);

    this.releaseRing = scene.add
      .circle(x, y, this.radius, 0x000000, 0)
      .setStrokeStyle(3, THEME.player.outline, 1)
      .setDepth(9)
      .setVisible(false);

    // A dart-shaped hull: the point IS the facing indicator, so no tether line
    // is needed to show where the unit is heading or aiming.
    const r = this.radius;
    this.hull = scene.add
      .polygon(
        0,
        0,
        [
          r * 1.45, 0,
          -r * 0.55, r * 0.95,
          -r * 0.15, 0,
          -r * 0.55, -r * 0.95,
        ],
        THEME.player.core,
      )
      .setOrigin(0, 0);
    this.hull.setStrokeStyle(2, THEME.player.outline, 0.95);

    this.core = scene.add.circle(0, 0, r * 0.42, THEME.player.coreBright, 0.95);

    // Breathing ring: cheap "this thing is powered on" idle motion.
    this.idleRing = scene.add
      .circle(0, 0, r * 1.05, 0x000000, 0)
      .setStrokeStyle(1.5, THEME.player.ringColor, 0.5);

    this.body = scene.add.container(x, y, [this.idleRing, this.hull, this.core]).setDepth(10);
  }

  get isRooted(): boolean {
    return this.rootCount > 0;
  }

  get isMoving(): boolean {
    return this.destX !== null && !this.isRooted;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  /** Issue a move order. Overrides any previous destination immediately. */
  moveTo(x: number, y: number): void {
    this.destX = Phaser.Math.Clamp(x, ARENA.padding + this.radius, ARENA.width - ARENA.padding - this.radius);
    this.destY = Phaser.Math.Clamp(y, ARENA.padding + this.radius, ARENA.height - ARENA.padding - this.radius);
  }

  stop(): void {
    this.destX = null;
    this.destY = null;
  }

  /**
   * Attack-range ring feedback. One ring, three readings:
   *   red   — Attack Move is pending (waiting for the A-click)
   *   green — the current attack target is inside range
   *   grey  — idle
   * Called every frame; `pending` wins so A-mode is unmistakable.
   */
  setRangeRingState(inRange: boolean, attackMovePending: boolean): void {
    if (!DEBUG.showAttackRange) return;
    if (attackMovePending) {
      this.rangeRing.setStrokeStyle(1.5, THEME.markers.attackMoveColor, 0.5);
    } else {
      this.rangeRing.setStrokeStyle(1, inRange ? THEME.markers.targetLockColor : 0x4a5a72, inRange ? 0.38 : 0.22);
    }
  }

  /** Hold the player in place (attack windup, cast time). Reference counted. */
  root(): void {
    this.rootCount++;
  }

  releaseRoot(): void {
    this.rootCount = Math.max(0, this.rootCount - 1);
  }

  /** @returns damage actually taken (0 if the hit was eaten by i-frames). */
  takeDamage(amount: number, nowMs: number): number {
    if (nowMs - this.lastHitAt < PLAYER.hitInvulnerabilityMs) return 0;
    this.lastHitAt = nowMs;
    this.hp = Math.max(0, this.hp - amount);
    return amount;
  }

  update(deltaSeconds: number): void {
    this.pulseClock += deltaSeconds * 1000 * THEME.player.idlePulseSpeed;

    if (!this.isRooted && this.destX !== null && this.destY !== null) {
      const dx = this.destX - this.x;
      const dy = this.destY - this.y;
      const dist = Math.hypot(dx, dy);
      const step = PLAYER.moveSpeed * deltaSeconds;

      if (dist <= Math.max(step, PLAYER.arriveEpsilon)) {
        // Snap and clear the order so we come to a clean stop.
        this.x = this.destX;
        this.y = this.destY;
        this.stop();
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    this.syncVisuals();
  }

  /**
   * Radius of the drawn attack-range ring: the exact locus of attackable target
   * CENTERS, using the same `attackReach` the hit test uses. A target center
   * inside this ring is attackable — no visual/mechanical disagreement.
   * (Assumes the standard target size; per-target truth is the target marker,
   * which turns green only when that specific enemy is actually in range.)
   */
  private attackRingRadius(): number {
    return attackReach(TARGETS.radius, this.radius);
  }

  /**
   * Apply the attack animation. This is a pure READ of the attack state — the
   * scene passes in what AttackSystem already decided, and nothing here can
   * change the timing. Swapping this animation out cannot break orbwalking.
   *
   * windup   : lean + stretch toward the target, ramping with real progress
   * released : brief recoil kick away from the target, then settle
   * idle     : neutral
   */
  applyAttackVisual(v: AttackVisual): void {
    const lean = ATTACK.windupLeanPx * v.windupProgress;
    const kick = v.msSinceRelease < ATTACK.releaseKickMs
      ? ATTACK.releaseKickPx * (1 - v.msSinceRelease / ATTACK.releaseKickMs)
      : 0;

    // Offset is visual only; this.x / this.y stay authoritative.
    this.visualOffsetX = 0;
    this.visualOffsetY = 0;
    this.aimAngle = null;

    if (v.targetX !== null && v.targetY !== null && (lean > 0 || kick > 0)) {
      const dx = v.targetX - this.x;
      const dy = v.targetY - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;

      this.visualOffsetX = ux * (lean - kick);
      this.visualOffsetY = uy * (lean - kick);
      this.aimAngle = Math.atan2(dy, dx);
    }

    this.windupAmount = v.windupProgress;

  }

  /**
   * Fired once per release by the scene, off AttackSystem's own timestamp.
   * A ring snaps out from the body — the "the auto is gone, move now" cue.
   */
  playReleaseBurst(scene: Phaser.Scene): void {
    this.releaseRing
      .setPosition(this.x, this.y)
      .setRadius(this.radius + ATTACK.chargeRingEndPad)
      .setScale(1)
      .setAlpha(0.95)
      .setVisible(true);

    scene.tweens.killTweensOf(this.releaseRing);
    scene.tweens.add({
      targets: this.releaseRing,
      radius: ATTACK.releaseRingRadius,
      alpha: 0,
      duration: ATTACK.releaseRingMs,
      ease: 'Quad.easeOut',
      onComplete: () => this.releaseRing.setVisible(false),
    });
  }

  /** Small "CANCEL" tag so an aborted windup is unmistakable while testing. */
  showCancelTag(scene: Phaser.Scene): void {
    if (!DEBUG.showCancelFeedback) return;

    const tag = scene.add
      .text(this.x, this.y - this.radius - 14, 'CANCEL', {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '12px',
        color: '#ff8f8f',
      })
      .setOrigin(0.5, 1)
      .setDepth(20);

    scene.tweens.add({
      targets: tag,
      y: tag.y - 18,
      alpha: 0,
      duration: 420,
      onComplete: () => tag.destroy(),
    });
  }

  private syncVisuals(): void {
    const bx = this.x + this.visualOffsetX;
    const by = this.y + this.visualOffsetY;

    this.body.setPosition(bx, by);
    this.shadow.setPosition(this.x, this.y + this.radius * 0.75);

    // Face the aim target while attacking, otherwise face the way we are moving.
    // This replaces the old destination tether line entirely.
    const desired = this.aimAngle ?? this.moveAngle();
    if (desired !== null) {
      this.facingAngle = Phaser.Math.Angle.RotateTo(this.facingAngle, desired, 0.35);
    }
    this.body.setRotation(this.facingAngle);

    // Idle breathing on the ring only, so the hull silhouette stays stable.
    const pulse = 1 + THEME.player.idlePulseAmp * Math.sin(this.pulseClock);
    this.idleRing.setScale(this.windupAmount > 0 ? 1 : pulse);

    // Charge ring: radius collapses from chargeRingStartPad onto the body over
    // the windup, landing on the body exactly as the missile leaves. Everything
    // here is derived from windupAmount, which is the real attack timing.
    if (this.windupAmount > 0) {
      const pad = Phaser.Math.Linear(
        ATTACK.chargeRingStartPad,
        ATTACK.chargeRingEndPad,
        this.windupAmount,
      );
      this.chargeRing
        .setPosition(bx, by)
        .setRadius(this.radius + pad)
        // Tightens up and brightens as the commit point approaches.
        .setStrokeStyle(1.5 + 2 * this.windupAmount, 0xffd166, 0.35 + 0.6 * this.windupAmount)
        .setVisible(true);
    } else {
      this.chargeRing.setVisible(false);
    }
    // Stretch toward the target during windup, so the "wind up" reads even
    // when the lean itself is small.
    this.body.setScale(1 + (ATTACK.windupScale - 1) * this.windupAmount);

    // Radius re-read every frame so live-tuning ATTACK.range updates the ring.
    this.rangeRing
      .setPosition(this.x, this.y)
      .setRadius(this.attackRingRadius())
      .setVisible(DEBUG.showAttackRange);

    // Brighten the hull through the windup: closer to white = closer to committed.
    this.hull.setFillStyle(
      this.windupAmount > 0
        ? Phaser.Display.Color.Interpolate.ColorWithColor(
            Phaser.Display.Color.ValueToColor(THEME.player.core),
            Phaser.Display.Color.ValueToColor(THEME.player.coreBright),
            100,
            Math.round(this.windupAmount * 85),
          ).color
        : THEME.player.core,
    );

    // Destination pip only — no line back to the player.
    if (this.destX !== null && this.destY !== null) {
      this.moveMarker.setPosition(this.destX, this.destY).setVisible(true);
    } else {
      this.moveMarker.setVisible(false);
    }
  }

  /** Heading from the current move order, or null when standing still. */
  private moveAngle(): number | null {
    if (this.destX === null || this.destY === null) return null;
    const dx = this.destX - this.x;
    const dy = this.destY - this.y;
    if (Math.hypot(dx, dy) < 1) return null;
    return Math.atan2(dy, dx);
  }

  destroy(): void {
    this.body.destroy();
    this.shadow.destroy();
    this.chargeRing.destroy();
    this.releaseRing.destroy();
    this.rangeRing.destroy();
    this.moveMarker.destroy();
  }
}
