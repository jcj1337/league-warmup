import { AutoAttackMissile } from '../../game/entities/AutoAttackMissile';
import type { Enemy } from '../../game/entities/Enemy';
import { PlayerZoneSystem } from '../../game/systems/PlayerZoneSystem';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import type { Aim, Kit, KitContext, KitStat, Slot } from '../types';
import { E, GAZE_SLOW, MIASMA_SLOW, PETRIFY_STATUS, POISON, POISON_STATUS, Q, R, W } from './balance';

/**
 * Cassiopeia's kit, for one run.
 *
 *   Q  Noxious Blast     a delayed blast at a ground point: one pip, and poison
 *   W  Miasma            venom lobbed into a wall of clouds across her aim: enemies inside are
 *                        slowed and poisoned
 *   E  Twin Fang         a quick point-and-click bolt: one pip, two on a poisoned target
 *   R  Petrifying Gaze   a cone, striking as its cast ends: enemies facing her are stunned, the
 *                        rest slowed; one pip to all; back at every stage clear
 *
 * Every slot resolves from where she stands when its cast ends, so a mid-cast
 * Flash carries W and R with her (the engine shifts the aim; see CastSystem).
 *
 * Poison is a status on the enemy ('cassiopeia.poison') plus a tick schedule
 * kept here: a pip every POISON.tickMs while it lasts. Every pip goes through
 * the hit funnel, so kills, score and gold are the engine's.
 */
export class CassiopeiaKit implements Kit {
  /** Ground spells she owns. Public for the suites. */
  readonly zones: PlayerZoneSystem;
  /** E bolts in flight. */
  readonly bolts: AutoAttackMissile[] = [];
  /** Per poisoned enemy: when its next pip ticks, and when the poison lapses (ticks on the deadline still land). */
  private readonly poisonTicks = new Map<Enemy, { nextTickAt: number; until: number }>();

  poisonTicksLanded = 0;
  fangs = 0;
  fangsOnPoisoned = 0;
  gazeStuns = 0;

  constructor(private readonly ctx: KitContext) {
    this.zones = new PlayerZoneSystem(ctx.scene);
    // Her ultimate comes back with every stage, like your HP.
    if (R.refreshOnStageClear) ctx.events.on('stageCleared', () => ctx.cooldowns.refund('r'));
  }

  get attackSpeedMultiplier(): number {
    return 1;
  }

  canCast(slot: Slot, aim: Aim): boolean {
    // E needs a target; the engine only offers one within range.
    return slot !== 'e' || Boolean(aim.target);
  }

  commit(_slot: Slot, aim: Aim): Aim {
    return aim;
  }

  cast(slot: Slot, aim: Aim): void {
    const now = this.ctx.clock.now;
    if (slot === 'q') {
      this.zones.place({
        kind: 'circle', x: aim.x, y: aim.y, radius: Q.radius, delayMs: Q.delayMs,
        onLand: (inside) => {
          for (const e of inside) {
            this.pip(e);
            if (e.active) this.poison(e);
          }
        },
      }, now);
    } else if (slot === 'w') {
      const { player } = this.ctx;
      this.zones.placeCloud({
        x: aim.x, y: aim.y, puffs: this.miasmaPuffs(aim), radius: W.puffRadius,
        thrownFrom: { x: player.x, y: player.y, speed: W.boltSpeed },
        durationMs: W.durationMs, tickMs: W.tickMs,
        onTick: (inside) => {
          const t = this.ctx.clock.now;
          for (const e of inside) {
            e.applySlow(MIASMA_SLOW, W.slowFraction, t, W.slowMs);
            this.poison(e);
          }
        },
      }, now);
    } else if (slot === 'e') {
      const target = aim.target;
      if (!target || !target.active) return;
      this.fangs++;
      const { scene, player } = this.ctx;
      this.bolts.push(new AutoAttackMissile(
        scene, player.x, player.y, target, target.spawnId,
        (hit) => this.onFangImpact(hit),
        { speed: E.boltSpeed, radius: E.boltRadius, art: PROJECTILE_ART.fang, impact: 'fang' },
      ));
    } else if (slot === 'r') {
      const { player } = this.ctx;
      const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
      this.zones.strike({
        kind: 'cone', x: player.x, y: player.y, angle, radius: R.radius, halfAngle: R.halfAngle, delayMs: 0,
        onLand: (inside) => this.gaze(inside),
      }, now, this.ctx.enemies());
    }
  }

  /**
   * Where W's clouds land: W.puffs of them on an arc across her aim, the
   * middle one on the aim point. The arc is centred behind the aim point, at
   * her distance (or W.arcMinRadius, whichever is larger), so the field bows
   * away from her like venom spat in a sweep. Public for the suites.
   */
  miasmaPuffs(aim: Aim): { x: number; y: number }[] {
    const { player } = this.ctx;
    const dist = Math.hypot(aim.x - player.x, aim.y - player.y);
    const facing = dist > 0 ? Math.atan2(aim.y - player.y, aim.x - player.x) : 0;
    const arc = Math.max(dist, W.arcMinRadius);
    const cx = aim.x - Math.cos(facing) * arc;
    const cy = aim.y - Math.sin(facing) * arc;
    const sweep = W.spanPx / arc;
    const puffs: { x: number; y: number }[] = [];
    for (let i = 0; i < W.puffs; i++) {
      const a = facing + (W.puffs > 1 ? (i / (W.puffs - 1) - 0.5) * sweep : 0);
      puffs.push({ x: cx + Math.cos(a) * arc, y: cy + Math.sin(a) * arc });
    }
    return puffs;
  }

  /** One pip through the hit funnel. */
  private pip(e: Enemy): void {
    if (!e.active) return;
    this.ctx.combat.hit(e, e.takeHit());
  }

  /** Apply (or refresh) poison; the first tick is one tick from now. */
  poison(e: Enemy): void {
    const now = this.ctx.clock.now;
    e.applyStatus(POISON_STATUS, now, POISON.durationMs);
    const live = this.poisonTicks.get(e);
    this.poisonTicks.set(e, { nextTickAt: live ? live.nextTickAt : now + POISON.tickMs, until: now + POISON.durationMs });
  }

  private onFangImpact(target: Enemy): void {
    if (!target.active) return;
    const poisoned = target.hasStatus(POISON_STATUS, this.ctx.clock.now);
    if (poisoned) this.fangsOnPoisoned++;
    const pips = poisoned ? E.pipsOnPoisoned : E.pips;
    for (let i = 0; i < pips && target.active; i++) this.pip(target);
  }

  /**
   * The cone lands. An enemy is "facing her" when its heading points toward
   * her (the dot product is positive): walking at her, or standing having
   * last walked at her. Those are petrified; the rest are slowed.
   */
  private gaze(inside: Enemy[]): void {
    const { player, clock } = this.ctx;
    const now = clock.now;
    for (const e of inside) {
      const toPlayer = Math.atan2(player.y - e.y, player.x - e.x);
      const facing = Math.cos(e.heading - toPlayer) > 0;
      this.pip(e);
      if (!e.active) continue;
      if (facing) {
        e.stun(now, R.stunMs);
        e.applyStatus(PETRIFY_STATUS, now, R.stunMs);
        this.gazeStuns++;
      } else {
        e.applySlow(GAZE_SLOW, R.slowFraction, now, R.slowMs);
      }
    }
  }

  update(deltaSeconds: number, nowMs: number): void {
    this.zones.update(deltaSeconds, nowMs, this.ctx.enemies());

    for (const bolt of this.bolts) bolt.update(deltaSeconds);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      if (!this.bolts[i].alive) this.bolts.splice(i, 1);
    }

    for (const [e, p] of this.poisonTicks) {
      if (!e.active) {
        this.poisonTicks.delete(e);
        continue;
      }
      // Every tick due up to the deadline lands, the one on the deadline included.
      while (e.active && nowMs >= p.nextTickAt && p.nextTickAt <= p.until) {
        p.nextTickAt += POISON.tickMs;
        this.poisonTicksLanded++;
        this.pip(e);
      }
      if (nowMs >= p.until) this.poisonTicks.delete(e);
    }
  }

  passiveHud(): null {
    return null;
  }

  stats(): Record<string, number> {
    return { poisonTicks: this.poisonTicksLanded, fangs: this.fangs, fangsOnPoisoned: this.fangsOnPoisoned, gazeStuns: this.gazeStuns };
  }

  statRows(): KitStat[] {
    const pct = this.fangs > 0 ? Math.round((this.fangsOnPoisoned / this.fangs) * 100) : 0;
    return [
      { label: 'FANGS ON POISON', value: `${this.fangsOnPoisoned}/${this.fangs}  (${pct}%)` },
      { label: 'PETRIFIED', value: `${this.gazeStuns}` },
    ];
  }

  clear(): void {
    this.zones.clear();
    for (const b of this.bolts) b.kill();
    this.bolts.length = 0;
    this.poisonTicks.clear();
  }
}
