import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import type { Enemy } from '../../game/entities/Enemy';
import { Fx } from '../../game/view/Fx';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import type { Aim, AutoLook, AutoShot, Kit, KitContext, KitStat, PassiveHud, Slot } from '../types';
import { AxeDrop } from './AxeDrop';
import { CLEAVE_SLOW, E, Q, R, W } from './balance';
import { HeldAxes } from './HeldAxes';
import { WhirlingAxes, type WhirlLeg } from './WhirlingAxes';

/** An auto thrown with a spinning axe: bigger, red-edged, turning faster. */
const SPIN_LOOK: AutoLook = { missile: 'spinAxe', fx: 'axe', muzzle: TEX.player.muzzle };

/**
 * Axe Man's kit, for one run.
 *
 *   Q  readies a spinning axe (he holds up to two). The next auto throws it
 *      for an extra pip; it bounces off and comes down near him, further out
 *      the further he is walking. Standing in its circle as it lands catches it:
 *      the axe is back in his hand, W is ready again, and he heals a little
 *   W  a burst of move speed that decays, and attack speed for a while
 *   E  a great axe a short way through everything: a pip, a slow, a shove aside
 *   R  two great axes down a line and back to him, turning just past the first
 *      enemy they hit or when he presses R again: a pip each way
 *
 * The engine owns the autos; through `autoShot` this changes the one that
 * leaves while he holds an axe. Everything about the falling axe (where, when,
 * caught or not) is decided here, on the game clock.
 */
export class AxeManKit implements Kit {
  /** Spinning axes in hand, and when they are dropped unless one is thrown or caught first. */
  held = 0;
  holdUntil = 0;
  /** Axes in the air or lying where they fell. */
  readonly drops: AxeDrop[] = [];
  /** R axes in flight. */
  readonly whirls: WhirlingAxes[] = [];
  /** When W last started. */
  rushStartedAt = Number.NEGATIVE_INFINITY;

  /** Axes caught in a row since the last miss: each one makes the next catch heal more. */
  catchStreak = 0;

  axesThrown = 0;
  axesCaught = 0;
  axesMissed = 0;
  eHits = 0;
  rHits = 0;

  readonly heldView: HeldAxes;

  constructor(private readonly ctx: KitContext) {
    this.heldView = new HeldAxes(ctx.scene);
  }

  private get now(): number {
    return this.ctx.clock.now;
  }

  get attackSpeedMultiplier(): number {
    return this.now - this.rushStartedAt < W.attackMs ? 1 + W.attackSpeedBonus : 1;
  }

  /** W's speed: the full bonus as it starts, gone by `moveMs`. */
  get moveSpeedMultiplier(): number {
    const t = (this.now - this.rushStartedAt) / W.moveMs;
    return t >= 0 && t < 1 ? 1 + W.moveBonus * (1 - t) : 1;
  }

  /** Q needs a free hand. */
  canCast(slot: Slot): boolean {
    return slot !== 'q' || this.held < Q.maxHeld;
  }

  commit(_slot: Slot, aim: Aim): Aim {
    return aim;
  }

  /** R again while the axes are still going out: they turn for home now. */
  recast(slot: Slot): boolean {
    if (slot !== 'r') return false;
    const outbound = this.whirls.filter((w) => w.leg === 'out');
    for (const whirl of outbound) whirl.recall();
    return outbound.length > 0;
  }

  cast(slot: Slot, aim: Aim): void {
    const { player, projectiles, scene } = this.ctx;
    if (slot === 'q') {
      this.takeAxe();
    } else if (slot === 'w') {
      this.rushStartedAt = this.now;
      Fx.of(scene).ring(player.x, player.y, player.radius, THEME.axeman.rushRingPx, THEME.axeman.rushRingMs, THEME.fx.rush.color, 1);
    } else if (slot === 'e') {
      const from = { x: player.x, y: player.y };
      const angle = Math.atan2(aim.y - from.y, aim.x - from.x);
      projectiles.fire({
        speed: E.speed, radius: E.radius, maxRange: E.maxRange, pierce: true,
        art: PROJECTILE_ART.cleave, fx: 'axe', onHit: (target) => this.onCleaveHit(target, from, angle),
      }, aim.x, aim.y);
    } else if (slot === 'r') {
      const angle = Math.atan2(aim.y - player.y, aim.x - player.x);
      Fx.of(scene).castFlash('axe', player.x + Math.cos(angle) * player.radius, player.y + Math.sin(angle) * player.radius, angle);
      this.whirls.push(new WhirlingAxes(scene, player.x, player.y, angle, R, (target, leg) => this.onWhirlHit(target, leg)));
    }
  }

  /** One more spinning axe in hand (never past the cap), and the hold timer starts over. */
  private takeAxe(): void {
    this.held = Math.min(Q.maxHeld, this.held + 1);
    this.holdUntil = this.now + Q.holdMs;
  }

  /** An auto is leaving: with an axe in hand, it is the axe. */
  autoShot(): AutoShot | null {
    if (this.held <= 0) return null;
    this.held--;
    this.axesThrown++;
    return {
      look: SPIN_LOOK,
      onImpact: (target) => {
        for (let extra = Q.bonusPips; extra > 0 && target.active; extra--) {
          if (target.takeHit()) this.ctx.combat.kill(target);
        }
        this.dropAxe(target.x, target.y);
      },
      // The target died first: the axe still comes down, from where it was headed.
      onFizzle: (target) => this.dropAxe(target.x, target.y),
    };
  }

  /**
   * Where a thrown axe comes down, from where he stands as it hits: toward
   * where he is walking, as far as the rest of that walk up to Q.dropMaxPx,
   * or right by him when he isn't walking anywhere. Decided once.
   */
  dropSpot(): { x: number; y: number } {
    const { player } = this.ctx;
    const dest = player.destination;
    const dx = dest ? dest.x - player.x : 0;
    const dy = dest ? dest.y - player.y : 0;
    const dist = Math.hypot(dx, dy);
    let x = player.x;
    let y = player.y;
    if (dist > 1) {
      const reach = Math.min(dist, Q.dropMaxPx);
      x += (dx / dist) * reach;
      y += (dy / dist) * reach;
    } else {
      const r = Q.dropIdlePx * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
    }
    const m = ARENA.padding + player.radius;
    return { x: Phaser.Math.Clamp(x, m, ARENA.width - m), y: Phaser.Math.Clamp(y, m, ARENA.height - m) };
  }

  /** The axe bounces off its target; where it will land is fixed from this moment. */
  private dropAxe(fromX: number, fromY: number): void {
    const spot = this.dropSpot();
    this.drops.push(new AxeDrop(this.ctx.scene, fromX, fromY, spot.x, spot.y, this.now, this.now + Q.airMs, Q.catchRadius));
  }

  /** What the next catch heals: more for every catch in a row, to a cap. */
  get nextCatchHeal(): number {
    const H = Q.catchHeal;
    return Math.min(H.max, H.base + H.perCatch * this.catchStreak);
  }

  private underIt(drop: AxeDrop): boolean {
    const { player } = this.ctx;
    return Math.hypot(player.x - drop.x, player.y - drop.y) <= drop.radius;
  }

  /** Back in his hand: an axe ready for the next auto, the hold timer fresh, W off cooldown, and some HP back. */
  private catchAxe(drop: AxeDrop): void {
    drop.finish(true);
    this.axesCaught++;
    this.takeAxe();
    this.ctx.cooldowns.reduce(Number.POSITIVE_INFINITY, ['w']);
    const healed = this.ctx.player.heal(this.nextCatchHeal);
    this.catchStreak++;
    if (healed > 0) Fx.of(this.ctx.scene).popup(drop.x, drop.y - this.ctx.player.radius - 12, `+${healed}`, THEME.ui.good);
    this.ctx.player.playPassivePulse(this.held >= Q.maxHeld);
  }

  private onCleaveHit(target: Enemy, from: { x: number; y: number }, angle: number): void {
    this.eHits++;
    this.ctx.combat.hit(target, target.takeHit());
    if (!target.active) return;
    target.applySlow(CLEAVE_SLOW, E.slowFraction, this.now, E.slowMs);
    if (target.unstoppable || target.held) return;
    // Shoved off the line, to whichever side of it they were on.
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const side = (target.x - from.x) * nx + (target.y - from.y) * ny >= 0 ? 1 : -1;
    const m = ARENA.padding + target.radius;
    target.x = Phaser.Math.Clamp(target.x + nx * side * E.knockPx, m, ARENA.width - m);
    target.y = Phaser.Math.Clamp(target.y + ny * side * E.knockPx, m, ARENA.height - m);
  }

  private onWhirlHit(target: Enemy, leg: WhirlLeg): void {
    this.rHits++;
    this.ctx.combat.hit(target, target.takeHit());
    for (let extra = (leg === 'out' ? R.pips : R.returnPips) - 1; extra > 0 && target.active; extra--) {
      if (target.takeHit()) this.ctx.combat.kill(target);
    }
  }

  update(deltaSeconds: number, nowMs: number): void {
    const { player } = this.ctx;
    // Held too long without throwing or catching: they are dropped.
    if (this.held > 0 && nowMs >= this.holdUntil) this.held = 0;

    for (const drop of this.drops) {
      if (drop.state === 'air') {
        // In reach from the moment it comes down to him, a beat before it would hit the ground.
        if (nowMs >= drop.landsAt - Q.catchEarlyMs && this.underIt(drop)) this.catchAxe(drop);
        else if (nowMs >= drop.landsAt) drop.land(nowMs, Q.groundMs);
      } else if (drop.state === 'ground') {
        if (this.underIt(drop)) this.catchAxe(drop);
        else if (nowMs >= drop.goneAt) {
          this.axesMissed++;
          this.catchStreak = 0;
          drop.finish(false);
        }
      }
      drop.sync(nowMs, deltaSeconds);
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      if (this.drops[i].state === 'done') this.drops.splice(i, 1);
    }

    for (const whirl of this.whirls) whirl.update(deltaSeconds, this.ctx.enemies(), player);
    for (let i = this.whirls.length - 1; i >= 0; i--) {
      if (!this.whirls[i].alive) this.whirls.splice(i, 1);
    }

    this.heldView.sync(player.x, player.y, this.held, deltaSeconds);
  }

  /** The gems over the bar are the axes in his hands; they drain with the time left to use them. */
  passiveHud(): PassiveHud {
    return {
      stacks: this.held,
      max: Q.maxHeld,
      fraction: this.held > 0 ? Phaser.Math.Clamp((this.holdUntil - this.now) / Q.holdMs, 0, 1) : 0,
    };
  }

  stats(): Record<string, number> {
    return {
      axesThrown: this.axesThrown, axesCaught: this.axesCaught, axesMissed: this.axesMissed, eHits: this.eHits, rHits: this.rHits,
    };
  }

  /** Nothing of his on the end screen: his counters stay in the run log (stats). */
  statRows(): KitStat[] {
    return [];
  }

  clear(): void {
    for (const drop of this.drops) drop.destroy();
    this.drops.length = 0;
    for (const whirl of this.whirls) whirl.kill();
    this.whirls.length = 0;
    this.held = 0;
    this.catchStreak = 0;
    this.rushStartedAt = Number.NEGATIVE_INFINITY;
    this.heldView.hide();
  }
}
