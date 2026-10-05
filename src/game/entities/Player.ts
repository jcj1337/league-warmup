import Phaser from 'phaser';
import { ARENA, ATTACK, attackReach, DEBUG, PLAYER, TARGETS } from '../../config/balance';
import { PlayerView, type AttackVisual, type CastKind, type CastVisual, type PlayerViewState } from '../view/PlayerView';
import type { ChampionStats } from '../../champions/types';
import type { PlayerFrames } from '../art/look';

export type { AttackVisual } from '../view/PlayerView';

/**
 * The player: position, click-to-move, HP and the movement lock.
 *
 * Attacking lives in AttackSystem and casting in CastSystem; they talk to the
 * player through `root()` / `releaseRoot()` so that "can I move right now?"
 * has exactly one owner. Everything the player LOOKS like lives in its
 * PlayerView, which is only ever fed state — the visual entry points below
 * forward to it and cannot change timing or position.
 */
export class Player {
  public x: number;
  public y: number;
  public readonly radius: number;

  public hp: number;
  public readonly maxHp: number;
  private readonly baseMoveSpeed: number;

  /** Current move order, or null when standing still. */
  private destX: number | null = null;
  private destY: number | null = null;

  /** Non-zero while an action (attack windup / cast) is holding us in place. */
  private rootCount = 0;

  private lastHitAt = -Infinity;

  /**
   * Crowd control, as GameClock deadlines. Only hostile spells apply it.
   * A stun freezes movement and blocks every action (see GameScene); a slow
   * scales move speed down.
   */
  private now = 0;
  private stunnedUntil = 0;
  private slowUntil = 0;
  private slowFraction = 0;

  /** Velocity this frame in px/s (0 while standing, rooted or stunned). Read by enemies that lead their aim. */
  public vx = 0;
  public vy = 0;

  readonly view: PlayerView;
  private readonly viewState: PlayerViewState;

  /** `levelSpeed()` multiplies move speed by the champion's level perk (Progression.moveSpeedMultiplier). */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    stats: ChampionStats,
    look: PlayerFrames,
    private readonly levelSpeed: () => number = () => 1,
    /** The champion's auto range, for the drawn ring. */
    private readonly attackRange: () => number = () => ATTACK.range,
  ) {
    this.x = x;
    this.y = y;
    this.radius = stats.radius;
    this.hp = stats.maxHp;
    this.maxHp = stats.maxHp;
    this.baseMoveSpeed = stats.moveSpeed;
    this.view = new PlayerView(scene, x, y, look);
    this.viewState = {
      x, y, radius: this.radius, moving: false, destX: null, destY: null,
      hp: this.hp, maxHp: this.maxHp, rangeRadius: this.attackRingRadius(), stunned: false, slowed: false,
    };
  }

  /** Screen pixels the worn hat adds above the head, for text over the slime. */
  get headPx(): number {
    return this.view.hatPx;
  }

  /** Where the current move order is headed, or null when there is none. */
  get destination(): { x: number; y: number } | null {
    return this.destX !== null && this.destY !== null ? { x: this.destX, y: this.destY } : null;
  }

  get isRooted(): boolean {
    return this.rootCount > 0;
  }

  get isMoving(): boolean {
    return this.destX !== null && !this.isRooted && !this.isStunned;
  }

  get isStunned(): boolean {
    return this.now < this.stunnedUntil;
  }

  get isSlowed(): boolean {
    return this.now < this.slowUntil;
  }

  /** The champion's move speed at this level, scaled down while slowed. */
  get moveSpeed(): number {
    return this.baseMoveSpeed * this.levelSpeed() * (this.isSlowed ? 1 - this.slowFraction : 1);
  }

  /** Bring the status timers up to this frame. Called before anything reads them. */
  tickStatus(nowMs: number): void {
    this.now = nowMs;
  }

  /**
   * Stun for `ms` from now. Overlapping stuns never shorten one another. The
   * move order is kept: you resume walking when it ends.
   */
  stun(nowMs: number, ms: number): void {
    this.now = nowMs;
    this.stunnedUntil = Math.max(this.stunnedUntil, nowMs + ms);
  }

  /** Slow by `fraction` (0.4 = 40% slower) for `ms`. A weaker slow never overrides a stronger live one. */
  slow(nowMs: number, fraction: number, ms: number): void {
    this.now = nowMs;
    if (!this.isSlowed || fraction >= this.slowFraction) this.slowFraction = fraction;
    this.slowUntil = Math.max(this.slowUntil, nowMs + ms);
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
   * Instant relocation (E / Flash). Clears any move order so the player does
   * not immediately walk back toward a stale destination, and clamps to the
   * arena exactly like moveTo() does.
   */
  blinkTo(x: number, y: number): void {
    this.x = Phaser.Math.Clamp(x, ARENA.padding + this.radius, ARENA.width - ARENA.padding - this.radius);
    this.y = Phaser.Math.Clamp(y, ARENA.padding + this.radius, ARENA.height - ARENA.padding - this.radius);
    this.stop();
  }

  /** Hold the player in place (attack windup, cast time). Reference counted. */
  root(): void {
    this.rootCount++;
  }

  releaseRoot(): void {
    this.rootCount = Math.max(0, this.rootCount - 1);
  }

  /** Restore up to `amount` HP, never past full. @returns HP actually restored. */
  heal(amount: number): number {
    const healed = Math.min(amount, this.maxHp - this.hp);
    this.hp += healed;
    return healed;
  }

  /** @returns damage actually taken (0 if the hit was eaten by i-frames). */
  takeDamage(amount: number, nowMs: number): number {
    if (nowMs - this.lastHitAt < PLAYER.hitInvulnerabilityMs) return 0;
    this.lastHitAt = nowMs;
    this.hp = Math.max(0, this.hp - amount);
    this.view.flashHit();
    return amount;
  }

  update(deltaSeconds: number): void {
    this.vx = 0;
    this.vy = 0;
    if (this.isMoving && this.destX !== null && this.destY !== null) {
      const dx = this.destX - this.x;
      const dy = this.destY - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = this.moveSpeed;
      const step = speed * deltaSeconds;

      if (dist <= Math.max(step, PLAYER.arriveEpsilon)) {
        // Snap and clear the order so we come to a clean stop.
        this.x = this.destX;
        this.y = this.destY;
        this.stop();
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
      }
    }

    const s = this.viewState;
    s.x = this.x;
    s.y = this.y;
    s.moving = this.isMoving;
    s.destX = this.destX;
    s.destY = this.destY;
    s.hp = this.hp;
    s.stunned = this.isStunned;
    s.slowed = this.isSlowed;
    // Re-read every frame so live-tuning the champion's range updates the ring.
    s.rangeRadius = this.attackRingRadius();
    this.view.sync(s, deltaSeconds);
  }

  /**
   * Radius of the drawn attack-range ring: the exact locus of attackable target
   * CENTERS for the standard target size, using the same `attackReach` the hit
   * test uses. (Per-target truth is the target reticle.)
   */
  private attackRingRadius(): number {
    return attackReach(this.attackRange(), TARGETS.radius, this.radius);
  }

  // ------------------------------------------------ visual feeds (read-only)

  applyAttackVisual(v: AttackVisual): void {
    this.view.applyAttackVisual(v, this.x, this.y);
  }

  setCastVisual(v: CastVisual): void {
    this.view.setCastVisual(v, this.x, this.y);
  }

  setRangeRingState(inRange: boolean, attackMovePending: boolean, visibility: number): void {
    this.view.setRangeRingState(inRange, attackMovePending, visibility);
  }

  setPassiveMaxed(maxed: boolean): void {
    this.view.setPassiveMaxed(maxed);
  }

  playReleaseBurst(): void {
    this.view.playReleaseBurst();
  }

  playCastRelease(ability: CastKind): void {
    this.view.playCastRelease(ability);
  }

  playPassivePulse(maxed: boolean): void {
    this.view.playPassivePulse(this.radius, maxed);
  }

  showCancelTag(): void {
    if (!DEBUG.showCancelFeedback) return;
    this.view.showCancelTag(this.radius);
  }

  destroy(): void {
    this.view.destroy();
  }
}
