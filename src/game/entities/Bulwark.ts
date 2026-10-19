import Phaser from 'phaser';
import { ARENA, BULWARK, PLAYER } from '../../config/balance';
import { BulwarkView } from '../view/BulwarkView';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import { scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';

/**
 * Bulwark AI states.
 *
 *   chase:    walk at the player; start a Strike or a Path Maker when one is
 *             off cooldown and in range; go All Out once its pips say so
 *   strike:   rooted, its line LOCKED and drawn; the slam lands at the end
 *   recover:  the slam held for a beat
 *   brace:    rooted and unstoppable, its path LOCKED and drawn
 *   ram:      down the locked path, unstoppable; stops where it catches you
 *   winded:   standing still after a ram, the window to punish it
 *   flare:    going All Out; plates off, unstoppable for the flare
 *
 * Cooldowns are timestamps checked from `chase`, as the Pursuer's are.
 */
export type BulwarkState = 'chase' | 'strike' | 'recover' | 'brace' | 'ram' | 'winded' | 'flare';

/**
 * The Bulwark: a wide, slow, many-pipped tank (a sand slime under iron plates)
 * with a K'Sante-style kit, and a stage's capstone.
 *
 *   Q  Strike      a short line slam that slows; every few, a Heavy Strike:
 *                  twice as long, and it stuns
 *   W  Path Maker  a braced ram down a locked path that stuns; unstoppable
 *                  through it, winded after
 *   R  All Out     at two thirds of its pips it sheds its plates: faster,
 *                  shorter cooldowns, more Heavy Strikes
 *
 * It is a normal `Enemy`: every hit removes one pip whatever it is doing, and
 * every player tool works on it. A Strike is its own, resolved here like the
 * Pursuer's swing, so it dies with it and a stun (Snake Lady's R) breaks it.
 */
export class Bulwark extends Enemy {
  readonly archetype: EnemyArchetype = 'bulwark';
  declare view: BulwarkView;

  /** What it is doing. A readout for the view and tests; only the AI writes it. */
  state: BulwarkState = 'chase';
  /** True once it has gone All Out (from the start of the flare). */
  allOut = false;
  /** The locked Strike line, in radians, and whether this one is Heavy. */
  strikeAngle = 0;
  strikeHeavy = false;
  /** The locked Path Maker direction, in radians. */
  pathAngle = 0;
  /** Its stage's numbers (see DIFFICULTY), before All Out shortens them. */
  readonly strikeCooldownMs: number;
  readonly pathMakerCooldownMs: number;
  /** Pips at or below which it goes All Out. */
  readonly allOutAtPips: number;

  /** Its walk as a fraction of the reference speed on its stage, before All Out and slows. */
  private readonly baseSpeedFraction: number;
  private stateStartedAt = 0;
  private stateEndsAt = 0;
  /** Cooldown gates, measured from the START of the previous one. Negative = first active frame. */
  private nextStrikeAt = 0;
  private nextPathMakerAt = -1;
  /** Strikes since the last Heavy one. */
  private strikesSinceHeavy = 0;
  private ramTravelled = 0;
  /** Smoothed heading, so it turns toward the player instead of snapping. */
  private facing = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number) {
    super(scene, clock, x, y, { radius: BULWARK.radius, maxHp: pips, scoreMultiplier: BULWARK.scoreMultiplier, stage });
    this.baseSpeedFraction = BULWARK.moveSpeedFraction * this.moveScale;
    this.strikeCooldownMs = scaled(BULWARK.scaling.strikeCooldownMs, stage, BULWARK.strike.cooldownMs);
    this.pathMakerCooldownMs = scaled(BULWARK.scaling.pathMakerCooldownMs, stage, BULWARK.pathMaker.cooldownMs);
    this.allOutAtPips = Math.floor(pips * BULWARK.allOut.atPipsFraction);
    this.view = new BulwarkView(scene, this);
  }

  /** 0..1 through the current state's window, or -1 while chasing. Read by the view. */
  stateProgress(nowMs: number): number {
    if (this.state === 'chase') return -1;
    const span = this.stateEndsAt - this.stateStartedAt;
    return span > 0 ? Phaser.Math.Clamp((nowMs - this.stateStartedAt) / span, 0, 1) : 1;
  }

  /** How long and how wide the Strike being wound up is. Read by the view. */
  get strikeShape(): { length: number; halfWidth: number } {
    return this.strikeHeavy ? BULWARK.heavy : BULWARK.strike;
  }

  /** Whether the next Strike it starts will be Heavy. */
  get heavyNext(): boolean {
    const every = this.allOut ? BULWARK.allOut.heavyEvery : BULWARK.strike.heavyEvery;
    return this.strikesSinceHeavy >= every - 1;
  }

  /** Its walk right now, as a fraction of the reference speed: All Out is faster, never past the cap. */
  get speedFraction(): number {
    const boost = this.allOut ? BULWARK.allOut.speedMultiplier : 1;
    return Math.min(BULWARK.maxSpeedFraction, this.baseSpeedFraction * boost);
  }

  /** A stun that takes breaks a Strike it is winding up: the line never lands. */
  override stun(nowMs: number, ms: number): boolean {
    const took = super.stun(nowMs, ms);
    if (took && this.state === 'strike') {
      this.state = 'chase';
      this.pose.windup = -1;
    }
    return took;
  }

  /** Picked up: a Strike it is winding up never lands. (Unstoppable, it is never picked up.) */
  protected override onPickedUp(): void {
    if (this.state === 'strike') this.state = 'chase';
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    const dx = ctx.player.x - this.x;
    const dy = ctx.player.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;

    // It turns toward you while it is free to; a locked line or path holds its facing.
    if (this.state === 'chase' || this.state === 'winded' || this.state === 'flare') {
      this.facing = Phaser.Math.Angle.RotateTo(this.facing, Math.atan2(dy, dx), 0.1);
    }
    if (Math.abs(Math.cos(this.facing)) > 0.2) this.pose.facing = Math.cos(this.facing) >= 0 ? 1 : -1;
    this.pose.moving = false;

    switch (this.state) {
      case 'strike':
        if (nowMs >= this.stateEndsAt) this.resolveStrike(nowMs, ctx);
        break;
      case 'brace':
        if (nowMs >= this.stateEndsAt) {
          this.ramTravelled = 0;
          this.enter('ram', nowMs, BULWARK.pathMaker.durationMs);
        }
        break;
      case 'ram':
        this.ram(deltaSeconds, nowMs, ctx);
        break;
      case 'flare':
        if (nowMs >= this.stateEndsAt) {
          this.unstoppable = false;
          this.state = 'chase';
        }
        break;
      case 'recover':
      case 'winded':
        if (nowMs >= this.stateEndsAt) this.state = 'chase';
        break;
      case 'chase':
        this.chase(deltaSeconds, nowMs, ctx, dx, dy, dist);
        break;
    }

    const t = this.stateProgress(nowMs);
    this.pose.windup = this.state === 'strike' || this.state === 'brace' ? t : -1;
  }

  private chase(deltaSeconds: number, nowMs: number, ctx: EnemyContext, dx: number, dy: number, dist: number): void {
    if (!this.allOut && this.hp <= this.allOutAtPips) {
      this.goAllOut(nowMs);
      return;
    }

    const cooldown = this.allOut ? BULWARK.allOut.cooldownMultiplier : 1;
    // A fresh Bulwark walks for two seconds before its first Path Maker.
    if (this.nextPathMakerAt < 0) this.nextPathMakerAt = nowMs + 2000;

    // Never starts anything on a stunned player: a stun must not become a
    // guaranteed hit there was no way to walk out of.
    if (!ctx.player.stunned) {
      const W = BULWARK.pathMaker;
      if (nowMs >= this.nextPathMakerAt && dist >= W.minRange && dist <= W.maxRange) {
        this.pathAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
        this.facing = this.pathAngle;
        this.nextPathMakerAt = nowMs + this.pathMakerCooldownMs * cooldown;
        this.unstoppable = true;
        this.enter('brace', nowMs, W.braceMs);
        return;
      }
      const heavy = this.heavyNext;
      if (nowMs >= this.nextStrikeAt && dist <= (heavy ? BULWARK.heavy.triggerRange : BULWARK.strike.length)) {
        this.strikeHeavy = heavy;
        this.strikesSinceHeavy = heavy ? 0 : this.strikesSinceHeavy + 1;
        this.strikeAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
        this.facing = this.strikeAngle;
        this.nextStrikeAt = nowMs + this.strikeCooldownMs * cooldown;
        this.enter('strike', nowMs, heavy ? BULWARK.heavy.windupMs : BULWARK.strike.windupMs);
        return;
      }
    }

    // Walk the player down, stopping just short of touching them.
    const stop = this.radius + ctx.player.radius + BULWARK.standOffPx;
    if (dist > stop) {
      const speed = PLAYER.referenceMoveSpeed * this.speedFraction * this.slowFactor;
      const step = Math.min(speed * deltaSeconds, dist - stop);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.pose.moving = true;
      this.keepInArena();
    }
  }

  /**
   * The Strike lands: you are hit only if your body is still on the line.
   * A Strike slows; a Heavy Strike stuns.
   */
  private resolveStrike(nowMs: number, ctx: EnemyContext): void {
    const { length, halfWidth } = this.strikeShape;
    const ux = Math.cos(this.strikeAngle);
    const uy = Math.sin(this.strikeAngle);
    const rx = ctx.player.x - this.x;
    const ry = ctx.player.y - this.y;
    const along = Phaser.Math.Clamp(rx * ux + ry * uy, 0, length);
    const landed = Math.hypot(rx - ux * along, ry - uy * along) <= halfWidth + ctx.player.radius;
    if (landed) {
      if (this.strikeHeavy) {
        ctx.damagePlayer(BULWARK.heavy.damage, this.archetype);
        ctx.stunPlayer(BULWARK.heavy.stunMs);
      } else {
        const S = BULWARK.strike;
        ctx.damagePlayer(S.damage, this.archetype);
        ctx.slowPlayer(S.slowFraction, S.slowMs);
      }
    }
    this.view.slam(this.strikeAngle, length, halfWidth, this.strikeHeavy, landed);
    this.enter('recover', nowMs, BULWARK.strike.recoverMs);
  }

  /** Down the locked path; it stops where its body catches you, or at the path's end. */
  private ram(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    const W = BULWARK.pathMaker;
    const step = Math.min((W.distance / W.durationMs) * 1000 * deltaSeconds, W.distance - this.ramTravelled);
    this.x += Math.cos(this.pathAngle) * step;
    this.y += Math.sin(this.pathAngle) * step;
    this.ramTravelled += step;
    this.pose.moving = true;
    this.keepInArena();

    const caught = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) <= this.radius + ctx.player.radius;
    if (caught) {
      ctx.damagePlayer(W.damage, this.archetype);
      ctx.stunPlayer(W.stunMs);
      this.view.rammed(ctx.player.x, ctx.player.y);
    }
    if (caught || this.ramTravelled >= W.distance - 0.01) {
      this.unstoppable = false;
      this.enter('winded', nowMs, W.windedMs);
    }
  }

  private goAllOut(nowMs: number): void {
    this.allOut = true;
    this.unstoppable = true;
    // All Out comes in swinging: the Strike count starts over.
    this.strikesSinceHeavy = 0;
    this.enter('flare', nowMs, BULWARK.allOut.flareMs);
    this.view.flare();
  }

  private enter(state: BulwarkState, nowMs: number, durationMs: number): void {
    this.state = state;
    this.stateStartedAt = nowMs;
    this.stateEndsAt = nowMs + durationMs;
  }

  private keepInArena(): void {
    const m = ARENA.padding + this.radius;
    this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
    this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
  }
}
