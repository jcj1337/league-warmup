import Phaser from 'phaser';
import { ATTACK, attackReach, DEBUG } from '../../config/balance';
import { THEME } from '../../config/theme';
import { AUTO_MISSILE_SPEC, AutoAttackMissile, type HomingMissileSpec } from '../entities/AutoAttackMissile';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import type { AutoShot } from '../../champions/types';
import type { KitingMetrics } from './KitingMetrics';

/**
 * Where the base auto cycle comes from. The player's Progression supplies it
 * from their level, so attack speed grows with kills — never with time.
 */
/** How fast the auto cycles, and how far it reaches (the champion's, read live). */
export interface AttackPacing {
  readonly baseAttackCooldownMs: number;
  readonly attackRange: number;
}

/**
 * idle     — no attack in progress; may start one the moment a target is in range
 * windup   — rooted, damage NOT yet committed, cancellable by move/A-move/stop
 * recovery — the attack has fired, damage is committed, free to move (orbwalk window)
 */
export type AttackState = 'idle' | 'windup' | 'recovery';

/**
 * Where the current target came from. A direct right-click commits you to that
 * exact enemy (and chases it); an Attack Move acquisition is opportunistic and
 * is dropped again when the enemy leaves range.
 */
export type TargetSource = 'direct' | 'attack-move';

interface AttackCallbacks {
  /** An auto missile connected and removed one pip. */
  onHit: (target: Enemy, killed: boolean) => void;
}

interface AttackMoveOrder {
  /** Where the player walks while looking for something to hit. */
  destX: number;
  destY: number;
  /** Where the A-click happened — used by 'cursor' target selection. */
  cursorX: number;
  cursorY: number;
}

/**
 * Basic attacks and the orders that drive them.
 *
 * The cycle:
 *
 *   [ WINDUP (rooted) ][ ---- RECOVERY (free to move) ---- ]
 *   ^ attack starts    ^ damage fires        ^ next attack available
 *
 * windup + recovery == the CURRENT cooldown: the stage's base cycle divided by
 * the passive multiplier (see cooldownMs). The cooldown starts when the WINDUP
 * starts, so firing does not extend the cycle — that is what makes recovery the
 * orbwalk window.
 *
 * Movement ownership, which is what keeps orbwalking honest:
 *   - While an order is active (attack target or attack move), this system
 *     drives the player's movement.
 *   - A plain move order or Stop clears the order and hands movement back —
 *     see `onMoveOrder()` / `onStop()`.
 */
export class AttackSystem {
  public state: AttackState = 'idle';
  /** True when the current target is in range — read by the scene for the ring. */
  public targetInRange = false;
  public currentTarget: Enemy | null = null;
  public targetSource: TargetSource = 'direct';

  private now = 0;
  /** When the current windup commits damage. */
  private windupEndsAt = 0;
  /** When the whole cycle ends and the next attack may start. */
  private cycleEndsAt = 0;
  /** The target this swing committed to — may differ from currentTarget. */
  private windupTarget: Enemy | null = null;
  /** True while we are driving the player's movement toward a target. */
  private chasing = false;
  /** Active Attack Move order, if any. */
  private attackMove: AttackMoveOrder | null = null;
  /** Set when the A-move order still needs a move command issued. */
  private attackMoveNeedsWalk = false;

  /** Auto-attack missiles in flight. They never gate the attack cycle. */
  private readonly missiles: AutoAttackMissile[] = [];

  /** Timestamp of the last release, for the player's recoil kick. */
  public lastReleaseAt = -Infinity;
  /** Timestamp of the last cancel, for the cancel tag. */
  public lastCancelAt = -Infinity;

  /** Rotating bracket reticle drawn on the current attack target. */
  private readonly targetMarker: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly metrics: KitingMetrics,
    private readonly pacing: AttackPacing,
    /** The champion's kit: its passive (if any) multiplies attack speed, and it may change a shot as it leaves. */
    private readonly haste: { readonly attackSpeedMultiplier: number; autoShot?(target: Enemy): AutoShot | null },
    private readonly callbacks: AttackCallbacks,
    /** The champion's missile: its speed, size and look. Read per shot, so console tuning applies. */
    private readonly missileSpec: () => HomingMissileSpec = () => AUTO_MISSILE_SPEC(),
  ) {
    this.targetMarker = scene.add.graphics().setDepth(THEME.depth.reticle).setVisible(false);
  }

  /**
   * 0 -> 1 through the windup, for the visual lean. Returns 0 outside a windup.
   * Derived from the real timing, so the animation can never disagree with the
   * mechanics.
   */
  get windupProgress(): number {
    if (this.state !== 'windup') return 0;
    const remaining = this.windupEndsAt - this.now;
    return Math.min(1, Math.max(0, 1 - remaining / this.windupMs));
  }

  // ------------------------------------------------------------ attack speed

  /**
   * The base auto cycle before passive stacks: the player's level's value,
   * supplied by Progression. Elapsed time has no influence on it.
   */
  get baseCooldownMs(): number {
    return this.pacing.baseAttackCooldownMs;
  }

  /**
   * THE authoritative attack cycle length. Everything downstream (windup,
   * recovery, the charge-ring animation, the HUD) derives from this one number.
   *
   * The Q passive is a multiplicative ATTACK SPEED bonus, not a flat cooldown
   * subtraction, so stacks have diminishing absolute value exactly like real
   * attack speed:
   *
   *   attacksPerSecond = (1000 / rampCooldown) * passiveMultiplier
   *   cooldownMs       = 1000 / attacksPerSecond
   *                    = rampCooldown / passiveMultiplier
   */
  get cooldownMs(): number {
    return this.baseCooldownMs / this.haste.attackSpeedMultiplier;
  }

  /** Attacks per second, for the HUD readout. */
  get attacksPerSecond(): number {
    return 1000 / this.cooldownMs;
  }

  /**
   * Windup duration in ms. As a ratio of the (scaling) cooldown it shrinks with
   * attack speed, keeping the cancel window proportional — floored by
   * minWindupMs so it never becomes too short to read or react to.
   */
  get windupMs(): number {
    if (ATTACK.windupMsOverride !== null) return ATTACK.windupMsOverride;
    return Math.max(ATTACK.minWindupMs, this.cooldownMs * ATTACK.windupPercent);
  }

  get cooldownRemaining(): number {
    return Math.max(0, this.cycleEndsAt - this.now);
  }

  /** True once the attack has fired — the point from which you can kite away. */
  get hasFired(): boolean {
    return this.state === 'recovery';
  }

  get hasAttackMoveOrder(): boolean {
    return this.attackMove !== null;
  }

  // ------------------------------------------------------------------- orders

  /**
   * Direct attack command (right-click on an enemy). Commits to this exact
   * enemy and will chase it. Does NOT cancel a windup already in progress —
   * the committed swing still resolves.
   */
  commandAttack(target: Enemy): void {
    if (!target.active) return;
    this.attackMove = null;
    this.currentTarget = target;
    this.targetSource = 'direct';
  }

  /**
   * Attack Move. Walks toward the point, attacking the first valid enemy that
   * is in range along the way. Issued by A + left-click and by the T
   * attack-move-click binding — both land here, so they behave identically.
   *
   * This is an ATTACK order, not a move order, so it deliberately does NOT
   * cancel a windup already in progress: the committed swing resolves and the
   * new order takes over afterwards. That matters because T is meant to be
   * spammed while kiting — cancelling on every press would mean never landing
   * an auto at all. Plain move orders and Stop still cancel.
   *
   * The order stays active after arriving, so the player keeps auto-acquiring
   * anything that wanders into range until another command is issued. That is
   * what makes the T → auto → right-click away loop repeatable.
   */
  commandAttackMove(x: number, y: number): void {
    this.currentTarget = null;
    this.chasing = false;
    this.attackMove = { destX: x, destY: y, cursorX: x, cursorY: y };
    // The walk is issued in update() only if nothing is already in range, so an
    // enemy standing next to you is attacked immediately instead of after a step.
    this.attackMoveNeedsWalk = true;
  }

  /**
   * Plain ground move order. Cancels an uncommitted windup and drops all orders.
   * After the attack has fired (recovery) this does NOT undo the damage.
   */
  onMoveOrder(): void {
    if (this.state === 'windup' && ATTACK.allowMoveCancel) this.cancelWindup();
    this.clearOrders();
  }

  /**
   * Stop command (S). Cancels an uncommitted windup, drops all orders and
   * freezes the player where they stand. A fired attack still resolves and the
   * cooldown keeps running.
   */
  onStop(): void {
    if (this.state === 'windup' && ATTACK.allowMoveCancel) this.cancelWindup();
    this.clearOrders();
    this.player.stop();
  }

  /**
   * Crowd control (stun). An uncommitted windup is lost and its cooldown
   * refunded, like a move-cancel — but the orders survive, so attacking
   * resumes the moment the stun ends.
   */
  interrupt(): void {
    if (this.state === 'windup') this.cancelWindup();
  }

  /** Hard cancel (round end, death). */
  cancel(): void {
    if (this.state === 'windup') this.cancelWindup();
    this.clearOrders();
    this.targetInRange = false;
    this.targetMarker.clear().setVisible(false);
  }

  private clearOrders(): void {
    this.currentTarget = null;
    this.attackMove = null;
    this.attackMoveNeedsWalk = false;
    this.chasing = false;
  }

  // -------------------------------------------------------------------- loop

  update(nowMs: number, deltaSeconds: number, targets: Enemy[]): void {
    this.now = nowMs;

    // Missiles fly independently of the attack cycle — they are never a gate.
    this.updateMissiles(deltaSeconds);

    // 1. Commit a windup that has completed.
    if (this.state === 'windup' && nowMs >= this.windupEndsAt) {
      this.fireAttack();
    }

    // 2. Leave recovery once the full cycle has elapsed.
    if (this.state === 'recovery' && nowMs >= this.cycleEndsAt) {
      this.state = 'idle';
    }

    // 3. Drop dead targets. An Attack Move order survives and re-acquires.
    if (this.currentTarget && !this.currentTarget.active) {
      this.currentTarget = null;
      this.chasing = false;
    }

    // 4. Attack Move: look for something attackable, else keep walking.
    // If nothing is in range and we have already arrived, we simply hold
    // position in attack-move stance so anything entering range still gets hit.
    if (this.attackMove && !this.currentTarget) {
      const acquired = this.acquireAttackMoveTarget(targets);
      if (acquired) {
        this.currentTarget = acquired;
        this.targetSource = 'attack-move';
        this.attackMoveNeedsWalk = false;
        this.player.stop();
        this.chasing = false;
      } else if (this.attackMoveNeedsWalk && this.state !== 'windup') {
        this.player.moveTo(this.attackMove.destX, this.attackMove.destY);
        this.attackMoveNeedsWalk = false;
      }
    }

    const target = this.currentTarget;
    if (!target) {
      this.targetMarker.clear().setVisible(false);
      this.targetInRange = false;
      return;
    }

    // 5. Attack when in range, otherwise chase / release depending on source.
    const inRange = this.isInRange(target);

    if (inRange) {
      if (this.chasing) {
        this.player.stop();
        this.chasing = false;
      }
      if (this.state === 'idle' && !this.player.isStunned) {
        this.beginWindup(target, nowMs);
      }
    } else if (this.state !== 'windup') {
      const mayChase =
        this.targetSource === 'direct'
          ? ATTACK.chaseOutOfRangeTargets
          : ATTACK.attackMoveChasesAcquiredTarget;

      if (mayChase) {
        this.chaseToward(target);
      } else if (this.attackMove) {
        // Opportunistic target walked away: forget it and resume the A-move.
        this.currentTarget = null;
        this.chasing = false;
        this.attackMoveNeedsWalk = true;
      }
    }

    this.updateVisuals(target, inRange);
  }

  // ------------------------------------------------------------ target choice

  /**
   * Attack Move acquisition. Only enemies ALREADY in attack range are
   * considered, so an A-click never turns into a cross-arena sprint.
   */
  private acquireAttackMoveTarget(targets: Enemy[]): Enemy | null {
    const order = this.attackMove;
    if (!order) return null;

    const byCursor = ATTACK.attackMoveTargeting === 'cursor';
    const originX = byCursor ? order.cursorX : this.player.x;
    const originY = byCursor ? order.cursorY : this.player.y;

    let best: Enemy | null = null;
    let bestDist = Infinity;

    for (const target of targets) {
      if (!target.active) continue;
      if (!this.isInRange(target)) continue;

      const dist = (target.x - originX) ** 2 + (target.y - originY) ** 2;
      if (dist < bestDist) {
        best = target;
        bestDist = dist;
      }
    }
    return best;
  }

  /** Is any enemy attackable right now? Used for the kiting metrics. */
  hasTargetInRange(targets: Enemy[]): boolean {
    return targets.some((t) => t.active && this.isInRange(t));
  }

  // -------------------------------------------------------------------- range

  /**
   * League's model by default: the player's CENTER to the EDGE of the target's
   * hitbox. `attackReach` is shared with the drawn ring, so a target whose
   * center is inside the ring is always attackable and vice versa.
   */
  isInRange(target: Enemy): boolean {
    const reach = this.reachTo(target);
    return (target.x - this.player.x) ** 2 + (target.y - this.player.y) ** 2 <= reach * reach;
  }

  private reachTo(target: Enemy): number {
    return attackReach(this.pacing.attackRange, target.radius, this.player.radius);
  }

  /**
   * Walk to the near edge of our attack range rather than to the target itself,
   * so the player coasts to a stop at max range instead of face-hugging.
   * Re-issued each frame, so a drifting target is tracked.
   */
  private chaseToward(target: Enemy): void {
    const dx = this.player.x - target.x;
    const dy = this.player.y - target.y;
    const dist = Math.hypot(dx, dy) || 1;
    const standoff = Math.max(0, this.reachTo(target) - ATTACK.chaseBufferPx);

    this.player.moveTo(target.x + (dx / dist) * standoff, target.y + (dy / dist) * standoff);
    this.chasing = true;
  }

  // ------------------------------------------------------------- attack cycle

  private beginWindup(target: Enemy, nowMs: number): void {
    this.state = 'windup';
    this.windupTarget = target;
    this.windupEndsAt = nowMs + this.windupMs;
    // The whole cycle is on cooldown from the moment the attack starts.
    this.cycleEndsAt = nowMs + this.cooldownMs;
    this.player.stop();
    this.player.root();
    this.metrics.onAttackStarted();
  }

  private cancelWindup(): void {
    this.state = 'idle';
    this.windupTarget = null;
    this.player.releaseRoot();
    // Cancelled attacks refund the cooldown — that is what makes animation
    // cancelling a real skill expression rather than a downside.
    this.cycleEndsAt = 0;
    this.lastCancelAt = this.now;
    this.metrics.onAttackCancelled();
  }

  /** Damage is committed here. From this point a move order cannot undo it. */
  private fireAttack(): void {
    const target = this.windupTarget;
    this.state = 'recovery';
    this.windupTarget = null;
    this.player.releaseRoot();

    this.lastReleaseAt = this.now;
    this.metrics.onAttackFired();

    if (!target || !target.active) return;

    // The auto is committed HERE: a missile leaves the player and the cooldown
    // is already running. The hit lands when the missile arrives, but nothing
    // about the attack cycle waits for it.
    const shot = this.haste.autoShot?.(target) ?? null;
    this.missiles.push(
      new AutoAttackMissile(
        this.scene,
        this.player.x,
        this.player.y,
        target,
        target.spawnId,
        (hitTarget) => this.onMissileHit(hitTarget, shot),
        shot?.look ? AUTO_MISSILE_SPEC(shot.look) : this.missileSpec(),
        () => shot?.onFizzle?.(target),
      ),
    );
  }

  /** Hit resolution, at the moment the missile visibly connects: one pip, then whatever the kit added to this shot. */
  private onMissileHit(target: Enemy, shot: AutoShot | null): void {
    if (!target.active) {
      shot?.onFizzle?.(target);
      return;
    }
    const killed = target.takeHit();
    this.metrics.onAttackLanded();
    this.callbacks.onHit(target, killed);
    shot?.onImpact?.(target, killed);
  }

  private updateMissiles(deltaSeconds: number): void {
    for (const missile of this.missiles) missile.update(deltaSeconds);
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      if (!this.missiles[i].alive) this.missiles.splice(i, 1);
    }
  }

  /** Drop every in-flight missile (round end / restart). */
  clearMissiles(): void {
    for (const m of this.missiles) m.kill();
    this.missiles.length = 0;
  }

  get missilesInFlight(): number {
    return this.missiles.length;
  }

  // ------------------------------------------------------------- debug visuals

  private updateVisuals(target: Enemy, inRange: boolean): void {
    if (DEBUG.showTargetMarker) {
      // Four pixel corner brackets that breathe inward: reads as "locked on"
      // without covering the enemy sprite.
      // Green = attackable now. Amber = acquired but still out of range.
      const color = inRange ? THEME.markers.targetInRange : THEME.markers.targetOutOfRange;
      const pulse = Math.round((Math.sin(this.now * 0.012) + 1) * 1.5);
      const r = Math.round(target.radius + 10 - pulse);
      const len = 9;
      const th = 3;
      const x = Math.round(target.x);
      const y = Math.round(target.y);

      const g = this.targetMarker.clear().setVisible(true);
      g.fillStyle(color, 0.95);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const cx = x + sx * r;
          const cy = y + sy * r;
          g.fillRect(sx < 0 ? cx : cx - len, sy < 0 ? cy : cy - th, len, th);
          g.fillRect(sx < 0 ? cx : cx - th, sy < 0 ? cy : cy - len, th, len);
        }
      }
    }
    this.targetInRange = inRange;
  }
}
