import { AutoAttackMissile } from '../../game/entities/AutoAttackMissile';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import type { Enemy } from '../../game/entities/Enemy';
import type { Aim, Kit, KitContext, KitStat, PassiveHud, Slot } from '../types';
import { BLINK_E, LEVELS, MARK_STATUS, SKILLSHOT_Q, SKILLSHOT_W, ULT_R } from './balance';
import { PassiveSystem } from './PassiveSystem';

/**
 * Magic Boy's kit, for one run.
 *
 *   Q  a linear bolt: one pip (two from LEVELS.qRankUp.level), refunds
 *      part of every basic cooldown, stacks the passive
 *   W  a linear orb that MARKS: the next pip the enemy loses detonates
 *      the mark for one extra pip
 *   E  a blink committed at keypress, then a homing bolt from where he
 *      lands, preferring a marked enemy
 *   R  a long charge, then a global wave through everything in its path:
 *      two pips to the first enemy, one to each after, a passive stack each
 *
 * The engine owns the cast windows, cooldowns and projectiles; this decides
 * what each slot does when it resolves, and keeps his counters.
 */
export class MagicBoyKit implements Kit {
  readonly passive = new PassiveSystem();
  /** Stats for the end screen (Q only — W removes no pips). */
  qFired = 0;
  qHit = 0;
  /** W marks cashed in for their extra pip. */
  markProcs = 0;
  /** R waves fired, and the enemies they hit. */
  rFired = 0;
  rHits = 0;

  /** E bolts in flight. */
  readonly bolts: AutoAttackMissile[] = [];

  constructor(private readonly ctx: KitContext) {
    // A W mark detonates on the next counted pip the enemy loses, from any source.
    ctx.events.on('hit', ({ target, killed }) => {
      if (!killed && target.hasStatus(MARK_STATUS, ctx.clock.now)) this.detonateMark(target);
    });
  }

  get boltsInFlight(): number {
    return this.bolts.length;
  }

  /** Pips one Q hit removes: ranks up at LEVELS.qRankUp.level. */
  get qPips(): number {
    return this.ctx.progression.level >= LEVELS.qRankUp.level ? LEVELS.qRankUp.pips : 1;
  }

  get attackSpeedMultiplier(): number {
    return this.passive.attackSpeedMultiplier;
  }

  canCast(): boolean {
    return true;
  }

  /** E commits its destination at keypress, so mousing around during the window can't move it. */
  commit(slot: Slot, aim: Aim): Aim {
    if (slot === 'e') return this.ctx.blink.destinationFor(aim.x, aim.y, BLINK_E.range);
    return aim;
  }

  cast(slot: Slot, aim: Aim): void {
    const { projectiles } = this.ctx;
    if (slot === 'q') {
      this.qFired++;
      projectiles.fire({
        speed: SKILLSHOT_Q.speed, radius: SKILLSHOT_Q.radius, maxRange: SKILLSHOT_Q.maxRange,
        art: PROJECTILE_ART.q, fx: 'q', onHit: (target) => this.onQHit(target),
      }, aim.x, aim.y);
    } else if (slot === 'w') {
      projectiles.fire({
        speed: SKILLSHOT_W.speed, radius: SKILLSHOT_W.radius, maxRange: SKILLSHOT_W.maxRange,
        art: PROJECTILE_ART.w, fx: 'w', onHit: (target) => this.onWHit(target),
      }, aim.x, aim.y);
    } else if (slot === 'e') {
      // Relocate first, THEN acquire, so the bolt is chosen from the new position.
      this.ctx.blink.blinkTo(aim);
      this.fireBolt();
    } else if (slot === 'r') {
      this.rFired++;
      let struck = 0;
      projectiles.fire({
        speed: ULT_R.speed, radius: ULT_R.radius, maxRange: ULT_R.maxRange, pierce: true,
        art: PROJECTILE_ART.r, fx: 'r', onHit: (target) => this.onRHit(target, struck++ === 0),
      }, aim.x, aim.y, aim.from);   // anchored: from where he stood when it began, Flash or not
    }
  }

  /** One enemy in the wave's path: the first takes the brunt, the rest less. Each is a stack. */
  private onRHit(target: Enemy, first: boolean): void {
    const { combat } = this.ctx;
    this.rHits++;
    combat.hit(target, target.takeHit());
    for (let extra = (first ? ULT_R.firstPips : ULT_R.pips) - 1; extra > 0 && target.active; extra--) {
      if (target.takeHit()) combat.kill(target);
    }
    this.grantPassiveStack();
  }

  private onQHit(target: Enemy): void {
    const { combat, cooldowns } = this.ctx;
    this.qHit++;
    combat.hit(target, target.takeHit());
    // Ranked-up Q: its extra pips land on whatever survived the first.
    for (let extra = this.qPips - 1; extra > 0 && target.active; extra--) {
      if (target.takeHit()) combat.kill(target);
    }
    this.grantPassiveStack();
    // A landed Q lowers every ability cooldown, R included — never Flash.
    cooldowns.reduce(SKILLSHOT_Q.hitCooldownReductionMs, ['q', 'w', 'e', 'r']);
  }

  /** W removes no pips: it marks, and the mark grants the stack. */
  private onWHit(target: Enemy): void {
    this.mark(target);
    this.grantPassiveStack();
  }

  /** Apply (or refresh) the W mark. */
  mark(target: Enemy): void {
    target.applyStatus(MARK_STATUS, this.ctx.clock.now, SKILLSHOT_W.markDurationMs);
  }

  /**
   * Cash in a W mark: one extra pip on top of the triggering hit's own.
   * Deliberately not a counted hit, so it can't detonate itself, and it never
   * grants a second passive stack (the stack came when the mark landed).
   */
  private detonateMark(target: Enemy): void {
    target.clearStatus(MARK_STATUS);
    const killed = target.takeHit();
    this.markProcs++;
    this.ctx.events.emit('markDetonated', { target });
    if (killed) this.ctx.combat.kill(target);
  }

  /**
   * One place that grants a passive stack, so every ability that should stack
   * it (Q hit, W mark landing, E bolt hit) behaves identically — and so the
   * player feedback can never fire without a real stack.
   */
  private grantPassiveStack(): void {
    this.passive.addStack();
    this.ctx.player.playPassivePulse(this.passive.isMaxStacked);
  }

  /**
   * Bolt acquisition, from the player's NEW position.
   *
   * A W-marked enemy always wins, because the mark is a limited-time extra-pip
   * opportunity: E is the tool that guarantees you can cash it in even after
   * the target has walked away from your autos.
   */
  private fireBolt(): void {
    const { player, clock, scene } = this.ctx;
    const inRange = this.ctx.enemies().filter(
      (e) => e.active && Math.hypot(e.x - player.x, e.y - player.y) <= BLINK_E.boltAcquisitionRange,
    );
    if (inRange.length === 0) return;

    const marked = inRange.filter((e) => e.hasStatus(MARK_STATUS, clock.now));
    const pool = marked.length > 0 ? marked : inRange;

    let target = pool[0];
    let best = Infinity;
    for (const e of pool) {
      const d = (e.x - player.x) ** 2 + (e.y - player.y) ** 2;
      if (d < best) {
        best = d;
        target = e;
      }
    }

    this.bolts.push(
      new AutoAttackMissile(
        scene, player.x, player.y, target, target.spawnId,
        (hit) => this.onBoltImpact(hit),
        { speed: BLINK_E.boltSpeed, radius: BLINK_E.boltRadius, art: PROJECTILE_ART.e, impact: 'e' },
      ),
    );
  }

  /** The bolt lands: a pip, a stack, and E's score (the blink alone pays nothing). */
  private onBoltImpact(target: Enemy): void {
    if (!target.active) return;
    this.ctx.combat.hit(target, target.takeHit());
    this.grantPassiveStack();
    this.ctx.combat.bonus(BLINK_E.scoreBonus);
  }

  update(deltaSeconds: number, nowMs: number): void {
    this.passive.update(nowMs);
    for (const bolt of this.bolts) bolt.update(deltaSeconds);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (!this.bolts[i].alive) this.bolts.splice(i, 1);
    }
  }

  passiveHud(): PassiveHud {
    return { stacks: this.passive.stackCount, max: this.passive.maxStacks, fraction: this.passive.remainingFraction };
  }

  stats(): Record<string, number> {
    return { qFired: this.qFired, qHit: this.qHit, markProcs: this.markProcs, rFired: this.rFired, rHits: this.rHits };
  }

  statRows(): KitStat[] {
    const accuracy = this.qFired > 0 ? Math.round((this.qHit / this.qFired) * 100) : 0;
    return [{ label: 'Q ACCURACY', value: `${this.qHit}/${this.qFired}  (${accuracy}%)` }];
  }

  clear(): void {
    for (const b of this.bolts) b.kill();
    this.bolts.length = 0;
  }
}
