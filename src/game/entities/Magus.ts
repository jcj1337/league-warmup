import Phaser from 'phaser';
import { ARENA, MAGUS, PLAYER, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { MagusView } from '../view/MagusView';
import type { EnemyArt } from '../view/EnemyView';
import { Enemy, type EnemyArchetype, type EnemyContext } from './Enemy';
import type { GameClock } from '../systems/GameClock';

/**
 * Magus AI states. Everything but `reposition` is a cast, and it never moves
 * while casting — those windows are when you close the gap.
 *
 *   reposition — hold the spacing band; start a spell when the gap allows
 *   lance      — charging: the line tracks you
 *   lock       — the line is placed and about to land; still rooted
 *   eye        — brief cast pose after placing a circle
 *   orb        — windup; the orb leaves at the end
 *   rite       — the last stand: rooted, calling circles down one after another
 */
export type MagusState = 'reposition' | 'lance' | 'lock' | 'eye' | 'orb' | 'rite';

type SpellId = 'lance' | 'eye' | 'orb';

const ART: EnemyArt = {
  idle: TEX.magus.idle,
  move: TEX.magus.idle,
  windup: TEX.magus.cast,
  frameMs: THEME.magus.frameMs,
  originY: THEME.magus.originY,
  shadow: TEX.shadow.m,
  shadowOffsetY: THEME.magus.shadowOffsetY,
  hpBarOffsetY: THEME.magus.hpBarOffsetY,
  burst: THEME.magus.burst,
};

/**
 * The Magus: a brass-masked artillery slime with a Xerath-style kit.
 *
 * It keeps you at the edge of your Q range and drops telegraphed spells on
 * you — a tracking line (Lance), a delayed circle with a hot centre (Eye) and
 * a stunning orb (Orb) — one at a time, never closer together than
 * MAGUS.spellGapMs. If it is ever the last enemy in the wave it plants itself
 * and calls down its Rite. Spells it has already placed belong to the
 * HostileSpellSystem and land even if it dies; a spell it is still charging
 * dies with it.
 *
 * Fragile by design: it has a basic enemy's pips, so diving it through its
 * zones is the intended answer. It is a normal `Enemy`, so every player tool
 * works on it unchanged.
 */
export class Magus extends Enemy {
  readonly archetype: EnemyArchetype = 'magus';
  declare view: MagusView;

  /** What it is doing. A readout for the view and tests; only the AI writes it. */
  state: MagusState = 'reposition';
  /** Where the current spell points, in radians. Tracks the player while charging. */
  aimAngle = 0;
  /** True once it has spent its Rite. */
  riteUsed = false;

  private stateStartedAt = 0;
  private stateEndsAt = 0;
  /** Earliest time the next spell may START. Negative = not scheduled yet (first active frame). */
  private nextCastAt = -1;
  private readonly readyAt: Record<SpellId, number> = { lance: 0, eye: 0, orb: 0 };
  private riteShotsLeft = 0;
  private nextRiteShotAt = 0;

  private goalX: number;
  private goalY: number;
  private nextPlanAt = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number) {
    super(scene, clock, x, y, { radius: MAGUS.radius, maxHp: pips, scoreMultiplier: MAGUS.scoreMultiplier });
    this.goalX = x;
    this.goalY = y;
    this.view = new MagusView(scene, this, ART);
  }

  /** 0..1 through the current cast, or -1 while repositioning. Read by the view. */
  castProgress(nowMs: number): number {
    if (this.state === 'reposition') return -1;
    const span = this.stateEndsAt - this.stateStartedAt;
    return span > 0 ? Phaser.Math.Clamp((nowMs - this.stateStartedAt) / span, 0, 1) : 1;
  }

  protected override updateAi(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    const px = ctx.player.x;
    const py = ctx.player.y;
    const dist = Math.hypot(px - this.x, py - this.y);
    this.pose.moving = false;
    if (Math.abs(px - this.x) > 2) this.pose.facing = px >= this.x ? 1 : -1;
    if (this.nextCastAt < 0) this.nextCastAt = nowMs + MAGUS.openingDelayMs;

    switch (this.state) {
      case 'reposition':
        if (nowMs < this.nextCastAt || !this.tryCast(nowMs, dist, ctx)) this.reposition(deltaSeconds, nowMs, ctx, dist);
        break;

      case 'lance': {
        // The line tracks you through the charge, then locks where you are.
        const aim = this.aimPoint(ctx);
        this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
        if (nowMs >= this.stateEndsAt) {
          const L = MAGUS.lance;
          ctx.spells.castLine(
            { x: this.x, y: this.y, angle: this.aimAngle, length: L.length, halfWidth: L.halfWidth, delayMs: L.lockMs, damage: L.damage },
            nowMs,
          );
          this.enter('lock', nowMs, L.lockMs);
        }
        break;
      }

      case 'orb': {
        const aim = this.aimPoint(ctx);
        this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
        if (nowMs >= this.stateEndsAt) {
          const O = MAGUS.orb;
          ctx.spells.fireOrb({
            x: this.x + Math.cos(this.aimAngle) * this.radius,
            y: this.y + Math.sin(this.aimAngle) * this.radius,
            angle: this.aimAngle,
            speed: O.speed,
            radius: O.radius,
            range: O.range,
            damage: O.damage,
            stunMinMs: O.stunMinMs,
            stunMaxMs: O.stunMaxMs,
          });
          this.enter('reposition', nowMs, 0);
        }
        break;
      }

      case 'rite':
        if (this.riteShotsLeft > 0 && nowMs >= this.nextRiteShotAt) {
          const R = MAGUS.rite;
          const aim = this.aimPoint(ctx);
          this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
          ctx.spells.castCircle({ x: aim.x, y: aim.y, radius: R.radius, delayMs: R.delayMs, damage: R.damage }, nowMs);
          this.riteShotsLeft--;
          this.nextRiteShotAt += R.intervalMs;
        }
        if (this.riteShotsLeft === 0 && nowMs >= this.stateEndsAt) {
          this.enter('reposition', nowMs, 0);
          this.nextCastAt = nowMs + MAGUS.spellGapMs;
        }
        break;

      case 'lock':
      case 'eye':
        if (nowMs >= this.stateEndsAt) this.enter('reposition', nowMs, 0);
        break;
    }

    this.pose.windup = this.castProgress(nowMs);
  }

  // ------------------------------------------------------------ spells

  /**
   * Pick a spell, in priority order:
   *   1. Rite — it is the last enemy standing (once per life)
   *   2. Orb  — you are inside its trigger range: its answer to being dived
   *   3. any ready spell whose reach covers you, at random
   * @returns whether a spell started.
   */
  private tryCast(nowMs: number, dist: number, ctx: EnemyContext): boolean {
    if (!this.riteUsed && ctx.enemiesRemaining === 1) {
      this.beginRite(nowMs);
      return true;
    }

    const ready = (id: SpellId) => nowMs >= this.readyAt[id];
    if (ready('orb') && dist <= MAGUS.orb.triggerRange) return this.begin('orb', nowMs, ctx);

    const options: SpellId[] = [];
    if (ready('lance') && dist <= MAGUS.lance.length - ctx.player.radius) options.push('lance');
    if (ready('eye') && dist <= MAGUS.eye.range) options.push('eye');
    if (ready('orb') && dist <= MAGUS.orb.range) options.push('orb');
    if (options.length === 0) return false;
    return this.begin(Phaser.Utils.Array.GetRandom(options), nowMs, ctx);
  }

  private begin(id: SpellId, nowMs: number, ctx: EnemyContext): boolean {
    this.readyAt[id] = nowMs + MAGUS[id].cooldownMs;
    this.nextCastAt = nowMs + MAGUS.spellGapMs;

    const aim = this.aimPoint(ctx);
    this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);

    if (id === 'lance') {
      this.enter('lance', nowMs, MAGUS.lance.chargeMs);
    } else if (id === 'orb') {
      this.enter('orb', nowMs, MAGUS.orb.windupMs);
    } else {
      // The circle goes down at once on where you are (clamped to its reach);
      // the delay before it lands is the telegraph.
      const E = MAGUS.eye;
      const reach = Math.min(E.range, Math.hypot(aim.x - this.x, aim.y - this.y));
      ctx.spells.castCircle(
        {
          x: this.x + Math.cos(this.aimAngle) * reach,
          y: this.y + Math.sin(this.aimAngle) * reach,
          radius: E.radius,
          delayMs: E.delayMs,
          damage: E.damage,
          centre: { radius: E.centreRadius, damage: E.centreDamage, slowFraction: E.slowFraction, slowMs: E.slowMs },
        },
        nowMs,
      );
      this.enter('eye', nowMs, E.castMs);
    }
    return true;
  }

  private beginRite(nowMs: number): void {
    const R = MAGUS.rite;
    this.riteUsed = true;
    this.riteShotsLeft = R.shots;
    this.nextRiteShotAt = nowMs + R.leadInMs;
    // Rooted until the last circle has landed.
    this.enter('rite', nowMs, R.leadInMs + (R.shots - 1) * R.intervalMs + R.delayMs);
  }

  private enter(state: MagusState, nowMs: number, durationMs: number): void {
    this.state = state;
    this.stateStartedAt = nowMs;
    this.stateEndsAt = nowMs + durationMs;
  }

  /** Where it aims: the player, led by MAGUS.aimLeadMs of their current velocity, kept in the arena. */
  private aimPoint(ctx: EnemyContext): { x: number; y: number } {
    const lead = MAGUS.aimLeadMs / 1000;
    const m = ARENA.padding + ctx.player.radius;
    return {
      x: Phaser.Math.Clamp(ctx.player.x + ctx.player.vx * lead, m, ARENA.width - m),
      y: Phaser.Math.Clamp(ctx.player.y + ctx.player.vy * lead, m, ARENA.height - m),
    };
  }

  // ------------------------------------------------------------ movement

  private reposition(deltaSeconds: number, nowMs: number, ctx: EnemyContext, dist: number): void {
    if (nowMs >= this.nextPlanAt) this.plan(nowMs, ctx, dist);

    const dx = this.goalX - this.x;
    const dy = this.goalY - this.y;
    const toGoal = Math.hypot(dx, dy);
    if (toGoal > 2) {
      const step = Math.min(PLAYER.moveSpeed * MAGUS.moveSpeedFraction * deltaSeconds, toGoal);
      this.x += (dx / toGoal) * step;
      this.y += (dy / toGoal) * step;
      this.pose.moving = true;
    }

    const m = ARENA.padding + this.radius;
    this.x = Phaser.Math.Clamp(this.x, m, ARENA.width - m);
    this.y = Phaser.Math.Clamp(this.y, m, ARENA.height - m);
  }

  /**
   * Choose where to stand: walk in when you are beyond the band, back off when
   * you are inside it (sliding along a wall if straight back is blocked), and
   * otherwise hold still. Cornered with nowhere to go, it stands its ground.
   */
  private plan(nowMs: number, ctx: EnemyContext, dist: number): void {
    this.nextPlanAt = nowMs + MAGUS.replanMs;
    const { min, max } = MAGUS.spacing;
    const px = ctx.player.x;
    const py = ctx.player.y;
    const bearing = Math.atan2(this.y - py, this.x - px);

    if (dist > max) {
      if (!this.setGoal(px, py, [bearing], max - 20)) {
        const m = ARENA.padding + TARGETS.edgeMargin * 0.5;
        this.goalX = Phaser.Math.Clamp(px + Math.cos(bearing) * (max - 20), m, ARENA.width - m);
        this.goalY = Phaser.Math.Clamp(py + Math.sin(bearing) * (max - 20), m, ARENA.height - m);
      }
    } else if (dist < min) {
      const fan = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8].map((d) => bearing + d);
      if (!this.setGoal(px, py, fan, min + 30)) {
        this.goalX = this.x;
        this.goalY = this.y;
      }
    } else {
      this.goalX = this.x;
      this.goalY = this.y;
    }
  }

  /**
   * Aim at the first point `radius` from the player along one of `angles` that
   * lies inside the arena.
   * @returns whether one was found.
   */
  private setGoal(px: number, py: number, angles: number[], radius: number): boolean {
    const m = ARENA.padding + TARGETS.edgeMargin * 0.5;
    for (const a of angles) {
      const x = px + Math.cos(a) * radius;
      const y = py + Math.sin(a) * radius;
      if (x >= m && x <= ARENA.width - m && y >= m && y <= ARENA.height - m) {
        this.goalX = x;
        this.goalY = y;
        return true;
      }
    }
    return false;
  }
}
