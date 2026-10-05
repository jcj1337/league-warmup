import Phaser from 'phaser';
import { SOVEREIGN } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { SovereignView } from '../view/SovereignView';
import type { EnemyArt } from '../view/EnemyView';
import type { Enemy, EnemyArchetype, EnemyContext } from './Enemy';
import { Caster, type CasterTuning } from './Caster';
import { scaled } from '../systems/Difficulty';
import type { DarkSphere } from '../systems/HostileSpellSystem';
import type { GameClock } from '../systems/GameClock';

/**
 * Sovereign AI states. Everything but `reposition` is a cast, and she never
 * moves while casting.
 *
 *   reposition — hold the spacing band; start a spell when the gap allows
 *   sphere     — brief cast pose after placing a Dark Sphere (Q)
 *   grab       — Force of Will (W): lifting a sphere or another mob over her head
 *   throw      — the thrown thing in flight toward where it lands
 *   scatter    — Scatter (E): the cone fills; the spheres in it fly at the end
 */
export type SovereignState = 'reposition' | 'sphere' | 'grab' | 'throw' | 'scatter';

type SpellId = 'sphere' | 'will' | 'scatter';

/** What Force of Will is holding: one of her spheres, or another mob of her wave. */
type Held = { kind: 'sphere'; x: number; y: number } | { kind: 'mob'; enemy: Enemy };

/** A sphere Scatter will fling, and the line it will fly along. */
export interface ExitLine {
  sphere: DarkSphere;
  x: number;
  y: number;
  angle: number;
}

const ART: EnemyArt = {
  idle: TEX.sovereign.idle,
  move: TEX.sovereign.idle,
  windup: TEX.sovereign.cast,
  frameMs: THEME.sovereign.frameMs,
  originY: THEME.sovereign.originY,
  shadow: TEX.shadow.m,
  shadowOffsetY: THEME.sovereign.shadowOffsetY,
  hpBarOffsetY: THEME.sovereign.hpBarOffsetY,
  burst: THEME.sovereign.burst,
};

/**
 * The Sovereign: an indigo-black sphere mage with a Syndra-style kit.
 *
 * She holds you just inside your Q range and builds a board of Dark Spheres
 * (Q), then uses it: Force of Will (W) throws a sphere — or any other mob of
 * her wave, which lands live — at where you're heading; Scatter (E) flings
 * every sphere in a short cone outward along the line from her, stunning what
 * it hits. She hunts that angle: she casts Scatter when a sphere lines up with
 * you, and sometimes drops a sphere between you and her first (Q→E).
 *
 * Her spheres belong to the HostileSpellSystem and vanish when she dies.
 */
export class Sovereign extends Caster {
  readonly archetype: EnemyArchetype = 'sovereign';
  declare view: SovereignView;

  /** What she is doing. A readout for the view and tests; only the AI writes it. */
  state: SovereignState = 'reposition';
  /** What Force of Will holds, if anything. */
  holding: Held | null = null;
  /** Where a held/thrown sphere is drawn (a mob draws itself). Read by the view. */
  heldSpherePos: { x: number; y: number } | null = null;
  /** The spheres Scatter will fling, during its windup. Read by the view. */
  exitLines: ExitLine[] = [];
  /** Her stage's numbers (see DIFFICULTY, SOVEREIGN.spheres / scatter). */
  readonly spellGapMs: number;
  readonly sphereCap: number;
  readonly coneHalfAngle: number;

  private stateStartedAt = 0;
  private stateEndsAt = 0;
  /** Earliest time the next spell may START. Negative = not scheduled yet (first active frame). */
  private nextCastAt = -1;
  private readonly readyAt: Record<SpellId, number> = { sphere: 0, will: 0, scatter: 0 };
  /** Force of Will: where the held thing starts and lands. */
  private throwFrom = { x: 0, y: 0 };
  private throwTo = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number) {
    super(scene, clock, x, y, { radius: SOVEREIGN.radius, maxHp: pips, scoreMultiplier: SOVEREIGN.scoreMultiplier, stage });
    const S = SOVEREIGN;
    this.spellGapMs = scaled(S.scaling.spellGapMs, stage, S.spellGapMs);
    this.sphereCap = S.spheres.cap + S.spheres.extraFromStage.filter((s) => stage >= s).length;
    const deg = stage >= S.scatter.wideFromStage ? S.scatter.wideAngleDeg : S.scatter.angleDeg;
    this.coneHalfAngle = Phaser.Math.DegToRad(deg / 2);
    this.view = new SovereignView(scene, this, ART);
  }

  protected get tuning(): CasterTuning {
    return SOVEREIGN;
  }

  /** 0..1 through the current cast, or -1 while repositioning. Read by the view. */
  castProgress(nowMs: number): number {
    if (this.state === 'reposition') return -1;
    const span = this.stateEndsAt - this.stateStartedAt;
    return span > 0 ? Phaser.Math.Clamp((nowMs - this.stateStartedAt) / span, 0, 1) : 1;
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    const dist = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y);
    this.pose.moving = false;
    if (Math.abs(ctx.player.x - this.x) > 2) this.pose.facing = ctx.player.x >= this.x ? 1 : -1;
    if (this.nextCastAt < 0) this.nextCastAt = nowMs + SOVEREIGN.openingDelayMs;

    switch (this.state) {
      case 'reposition':
        if (nowMs < this.nextCastAt || !this.tryCast(nowMs, dist, ctx)) this.reposition(deltaSeconds, nowMs, ctx, dist);
        break;
      case 'sphere':
        if (nowMs >= this.stateEndsAt) this.enter('reposition', nowMs, 0);
        break;
      case 'grab':
        this.updateGrab(nowMs, ctx);
        break;
      case 'throw':
        this.updateThrow(nowMs);
        break;
      case 'scatter':
        if (nowMs >= this.stateEndsAt) this.releaseScatter(nowMs, ctx);
        break;
    }

    this.pose.windup = this.castProgress(nowMs);
  }

  /** Dying mid-throw drops what she holds where it is: a mob lands where it was. */
  protected override onDeath(): void {
    this.dropCast();
  }

  /** Picked up by another Sovereign: her cast is lost, and what she held drops where it is. */
  protected override onPickedUp(): void {
    this.dropCast();
    this.state = 'reposition';
  }

  private dropCast(): void {
    if (this.holding?.kind === 'mob') this.holding.enemy.held = false;
    this.holding = null;
    this.heldSpherePos = null;
    this.exitLines = [];
  }

  // ------------------------------------------------------------ choosing

  /**
   * Pick a spell, in priority order:
   *   1. Scatter — a sphere lines up with you, or you're inside the cone
   *   2. Q→E    — Scatter and Dark Sphere ready: sometimes a sphere between you and her
   *   3. Force of Will — something to grab
   *   4. Dark Sphere — you're in reach
   * @returns whether a spell started.
   */
  private tryCast(nowMs: number, dist: number, ctx: EnemyContext): boolean {
    const ready = (id: SpellId) => nowMs >= this.readyAt[id];
    const S = SOVEREIGN;

    if (ready('scatter')) {
      const lined = this.linedUpSphere(ctx);
      if (lined) return this.beginScatter(nowMs, ctx, Math.atan2(lined.y - this.y, lined.x - this.x));
      if (dist <= S.scatter.radius + ctx.player.radius) {
        return this.beginScatter(nowMs, ctx, Math.atan2(this.aim.y - this.y, this.aim.x - this.x));
      }
    }
    if (ready('scatter') && ready('sphere') && dist <= S.scatter.comboDistancePx + S.scatter.launch.range
      && Math.random() < S.scatter.comboChance) {
      return this.beginComboSphere(nowMs, ctx, dist);
    }
    if (ready('will') && this.beginGrab(nowMs, ctx)) return true;
    if (ready('sphere') && dist <= S.sphere.range) return this.beginSphere(nowMs, ctx);
    return false;
  }

  /**
   * A sphere of hers inside Scatter's reach whose flight line passes within
   * `lineUpPx` of where you're heading when it would arrive.
   */
  private linedUpSphere(ctx: EnemyContext): DarkSphere | null {
    const S = SOVEREIGN.scatter;
    const saved = this.aimOffset;
    this.aimOffset = { x: 0, y: 0 };     // judge the true angle, not a spread one
    let best: DarkSphere | null = null;
    for (const s of ctx.spells.spheresOf(this)) {
      const ds = Math.hypot(s.x - this.x, s.y - this.y);
      if (ds > S.radius || ds < 1) continue;
      const ux = (s.x - this.x) / ds;
      const uy = (s.y - this.y) / ds;
      const flightMs = S.windupMs + (Math.hypot(ctx.player.x - s.x, ctx.player.y - s.y) / S.launch.speed) * 1000;
      const p = this.aimPoint(ctx, flightMs);
      const along = (p.x - s.x) * ux + (p.y - s.y) * uy;
      const perp = Math.abs((p.x - s.x) * uy - (p.y - s.y) * ux);
      if (along > 0 && along <= S.launch.range && perp <= S.lineUpPx) { best = s; break; }
    }
    this.aimOffset = saved;
    return best;
  }

  // ------------------------------------------------------------ Q: Dark Sphere

  private placeSphere(nowMs: number, ctx: EnemyContext, x: number, y: number): void {
    const Q = SOVEREIGN.sphere;
    ctx.spells.castCircle({
      source: this.archetype, x, y, radius: Q.radius, delayMs: Q.delayMs, damage: Q.damage, style: 'void',
      leaveSphere: { owner: this, lifeMs: SOVEREIGN.spheres.lifeMs, cap: this.sphereCap },
    }, nowMs);
    this.readyAt.sphere = nowMs + Q.cooldownMs;
    this.nextCastAt = nowMs + this.spellGapMs;
    this.enter('sphere', nowMs, Q.castMs);
  }

  private beginSphere(nowMs: number, ctx: EnemyContext): boolean {
    this.rollAimOffset(SOVEREIGN.aimSpreadPx);
    const at = this.within(this.aimPoint(ctx, SOVEREIGN.sphere.delayMs), SOVEREIGN.sphere.range);
    this.placeSphere(nowMs, ctx, at.x, at.y);
    return true;
  }

  /** Q→E: a sphere on the line between you and her, close enough for Scatter to fling it at you. */
  private beginComboSphere(nowMs: number, ctx: EnemyContext, dist: number): boolean {
    const angle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
    const d = Math.min(SOVEREIGN.scatter.comboDistancePx, Math.max(40, dist - 60));
    this.placeSphere(nowMs, ctx, this.x + Math.cos(angle) * d, this.y + Math.sin(angle) * d);
    return true;
  }

  // ------------------------------------------------------------ W: Force of Will

  /**
   * Grab the nearest sphere of hers or other mob in reach (a mob `mobChance` of
   * the time). Any mob will do but one nothing can stop.
   */
  private beginGrab(nowMs: number, ctx: EnemyContext): boolean {
    const W = SOVEREIGN.will;
    const near = (o: { x: number; y: number }) => Math.hypot(o.x - this.x, o.y - this.y);
    const spheres = ctx.spells.spheresOf(this).filter((s) => near(s) <= W.grabRange).sort((a, b) => near(a) - near(b));
    const mobs = ctx.allies
      .filter((e) => e !== this && e.active && !e.held && !e.unstoppable && near(e) <= W.grabRange)
      .sort((a, b) => near(a) - near(b));
    if (spheres.length === 0 && mobs.length === 0) return false;

    const takeMob = mobs.length > 0 && (spheres.length === 0 || Math.random() < W.mobChance);
    if (takeMob) {
      const enemy = mobs[0];
      enemy.pickUp(ctx);
      this.holding = { kind: 'mob', enemy };
      this.throwFrom = { x: enemy.x, y: enemy.y };
    } else {
      const s = spheres[0];
      ctx.spells.takeSphere(s);
      this.holding = { kind: 'sphere', x: s.x, y: s.y };
      this.throwFrom = { x: s.x, y: s.y };
      this.heldSpherePos = { x: s.x, y: s.y };
    }
    this.readyAt.will = nowMs + W.cooldownMs;
    this.nextCastAt = nowMs + this.spellGapMs;
    this.enter('grab', nowMs, W.grabMs);
    return true;
  }

  /** The held thing rises over her head; at the end she throws it at where you're heading. */
  private updateGrab(nowMs: number, ctx: EnemyContext): void {
    const held = this.holding;
    if (!held || (held.kind === 'mob' && !held.enemy.active)) {
      // The mob was killed in her hands: the throw fizzles.
      this.holding = null;
      this.enter('reposition', nowMs, 0);
      return;
    }
    const t = this.castProgress(nowMs);
    const over = { x: this.x, y: this.y - THEME.sovereign.holdLiftPx };
    this.moveHeld(Phaser.Math.Linear(this.throwFrom.x, over.x, t), Phaser.Math.Linear(this.throwFrom.y, over.y, t));
    if (nowMs < this.stateEndsAt) return;

    const W = SOVEREIGN.will;
    this.rollAimOffset(SOVEREIGN.aimSpreadPx);
    this.throwFrom = over;
    this.throwTo = this.within(this.aimPoint(ctx, W.delayMs), W.range);
    ctx.spells.castCircle({
      source: this.archetype, x: this.throwTo.x, y: this.throwTo.y, radius: W.radius, delayMs: W.delayMs,
      damage: W.damage, slow: { fraction: W.slowFraction, ms: W.slowMs }, style: 'void',
    }, nowMs);
    this.enter('throw', nowMs, W.delayMs);
  }

  /** In flight: an arc from over her head to where it lands. A mob lands live, briefly dazed. */
  private updateThrow(nowMs: number): void {
    const t = this.castProgress(nowMs);
    const arc = Math.sin(t * Math.PI) * 60;
    this.moveHeld(
      Phaser.Math.Linear(this.throwFrom.x, this.throwTo.x, t),
      Phaser.Math.Linear(this.throwFrom.y, this.throwTo.y, t) - arc,
    );
    if (nowMs < this.stateEndsAt) return;
    if (this.holding?.kind === 'mob') {
      const e = this.holding.enemy;
      e.held = false;
      e.x = this.throwTo.x;
      e.y = this.throwTo.y;
      e.dazedUntil = Math.max(e.dazedUntil, nowMs + SOVEREIGN.will.mobDazedMs);
    }
    this.holding = null;
    this.heldSpherePos = null;
    this.enter('reposition', nowMs, 0);
  }

  private moveHeld(x: number, y: number): void {
    if (!this.holding) return;
    if (this.holding.kind === 'mob') {
      if (this.holding.enemy.active) {
        this.holding.enemy.x = x;
        this.holding.enemy.y = y;
      }
    } else {
      this.heldSpherePos = { x, y };
    }
  }

  // ------------------------------------------------------------ E: Scatter

  /** The cone toward `angle`; every sphere of hers inside it right now will fly. */
  private beginScatter(nowMs: number, ctx: EnemyContext, angle: number): boolean {
    const E = SOVEREIGN.scatter;
    ctx.spells.castCone({
      source: this.archetype, x: this.x, y: this.y, angle, radius: E.radius, halfAngle: this.coneHalfAngle,
      delayMs: E.windupMs, damage: E.damage, style: 'void',
    }, nowMs);
    this.exitLines = ctx.spells.spheresOf(this)
      .filter((s) => {
        const d = Math.hypot(s.x - this.x, s.y - this.y);
        const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(s.y - this.y, s.x - this.x) - angle));
        return d <= E.radius && off <= this.coneHalfAngle;
      })
      .map((s) => ({ sphere: s, x: s.x, y: s.y, angle: Math.atan2(s.y - this.y, s.x - this.x) }));
    this.readyAt.scatter = nowMs + E.cooldownMs;
    this.nextCastAt = nowMs + this.spellGapMs;
    this.enter('scatter', nowMs, E.windupMs);
    return true;
  }

  private releaseScatter(nowMs: number, ctx: EnemyContext): void {
    const L = SOVEREIGN.scatter.launch;
    for (const line of this.exitLines) {
      ctx.spells.launchSphere(line.sphere, line.angle, {
        source: this.archetype, speed: L.speed, radius: L.radius, range: L.range, damage: L.damage, stunMs: L.stunMs,
      });
    }
    this.exitLines = [];
    this.enter('reposition', nowMs, 0);
  }

  // ------------------------------------------------------------ helpers

  private enter(state: SovereignState, nowMs: number, durationMs: number): void {
    this.state = state;
    this.stateStartedAt = nowMs;
    this.stateEndsAt = nowMs + durationMs;
  }

  /** `p` pulled in to at most `range` from her. */
  private within(p: { x: number; y: number }, range: number): { x: number; y: number } {
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d <= range) return p;
    return { x: this.x + ((p.x - this.x) / d) * range, y: this.y + ((p.y - this.y) / d) * range };
  }
}
