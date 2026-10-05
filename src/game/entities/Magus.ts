import Phaser from 'phaser';
import { MAGUS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import { MagusView } from '../view/MagusView';
import type { EnemyArt } from '../view/EnemyView';
import type { EnemyArchetype, EnemyContext } from './Enemy';
import { Caster, type CasterTuning } from './Caster';
import { projectileSpeed, scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';

/**
 * Magus AI states. Everything but `reposition` is a cast, and it never moves
 * while casting — those windows are when you close the gap.
 *
 *   reposition — hold the spacing band; start a spell when the gap allows
 *   lance      — charging: the line sweeps after you at its aim speed (Enemy.aim)
 *   lock       — the line is placed and about to land; still rooted
 *   eye        — targeting: a reticle tracks where the circle will land, then it goes down
 *   orb        — windup: an aim line tracks you, locks for the last MAGUS.orb.lockMs, then the orb leaves
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
export class Magus extends Caster {
  readonly archetype: EnemyArchetype = 'magus';
  declare view: MagusView;

  /** What it is doing. A readout for the view and tests; only the AI writes it. */
  state: MagusState = 'reposition';
  /** Where the current spell points, in radians. Tracks the player while charging. */
  aimAngle = 0;
  /** Where the Eye will go down: tracked through its targeting phase. Read by the view. */
  eyeTarget: { x: number; y: number } | null = null;
  /** True once it has spent its Rite. */
  riteUsed = false;
  /** Its stage's spell gap and orb speed (see DIFFICULTY). */
  readonly spellGapMs: number;
  readonly orbSpeed: number;

  private stateStartedAt = 0;
  private stateEndsAt = 0;
  /** Earliest time the next spell may START. Negative = not scheduled yet (first active frame). */
  private nextCastAt = -1;
  private readonly readyAt: Record<SpellId, number> = { lance: 0, eye: 0, orb: 0 };
  private riteShotsLeft = 0;
  private nextRiteShotAt = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number) {
    super(scene, clock, x, y, { radius: MAGUS.radius, maxHp: pips, scoreMultiplier: MAGUS.scoreMultiplier, stage });
    this.spellGapMs = scaled(MAGUS.scaling.spellGapMs, stage, MAGUS.spellGapMs);
    this.orbSpeed = projectileSpeed(MAGUS.orb.speed, stage);
    this.view = new MagusView(scene, this, ART);
  }

  protected get tuning(): CasterTuning {
    return MAGUS;
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
        // The line sweeps after where you're heading through the charge, then locks.
        const want = this.wantedAim(ctx, MAGUS.lance.lockMs);
        const aim = this.trackAim(want.x, want.y, deltaSeconds, ctx);
        this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
        if (nowMs >= this.stateEndsAt) {
          const L = MAGUS.lance;
          ctx.spells.castLine(
            { source: this.archetype, x: this.x, y: this.y, angle: this.aimAngle, length: L.length, halfWidth: L.halfWidth, delayMs: L.lockMs, damage: L.damage },
            nowMs,
          );
          this.enter('lock', nowMs, L.lockMs);
        }
        break;
      }

      case 'orb': {
        // The aim sweeps after where you're heading, then holds still for the lock.
        // It leads by the time to impact: the rest of the windup plus the flight.
        if (!this.orbLocked(nowMs)) {
          const untilFire = Math.max(0, this.stateEndsAt - nowMs);
          const want = this.wantedAim(ctx, untilFire + this.orbFlightMs(ctx, untilFire), MAGUS.orb.aimLead);
          const aim = this.trackAim(want.x, want.y, deltaSeconds, ctx);
          this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
        }
        if (nowMs >= this.stateEndsAt) {
          const O = MAGUS.orb;
          ctx.spells.fireOrb({
            source: this.archetype,
            x: this.x + Math.cos(this.aimAngle) * this.radius,
            y: this.y + Math.sin(this.aimAngle) * this.radius,
            angle: this.aimAngle,
            speed: this.orbSpeed,
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
          this.rollAimOffset(MAGUS.aimSpreadPx.spell);
          const aim = this.aimPoint(ctx, R.delayMs);
          this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
          ctx.spells.castCircle({ source: this.archetype, x: aim.x, y: aim.y, radius: R.radius, delayMs: R.delayMs, damage: R.damage }, nowMs);
          this.riteShotsLeft--;
          this.nextRiteShotAt += R.intervalMs;
        }
        if (this.riteShotsLeft === 0 && nowMs >= this.stateEndsAt) {
          this.enter('reposition', nowMs, 0);
          this.nextCastAt = nowMs + this.spellGapMs;
        }
        break;

      case 'eye': {
        // Targeting: the reticle travels after where you'll be when it lands, then it goes down.
        const want = this.eyeSpot(this.wantedAim(ctx, MAGUS.eye.delayMs));
        this.eyeTarget = this.eyeSpot(this.trackAim(want.x, want.y, deltaSeconds, ctx));
        this.aimAngle = Math.atan2(this.eyeTarget.y - this.y, this.eyeTarget.x - this.x);
        if (nowMs >= this.stateEndsAt) {
          const E = MAGUS.eye;
          ctx.spells.castCircle(
            {
              source: this.archetype,
              x: this.eyeTarget.x,
              y: this.eyeTarget.y,
              radius: E.radius,
              delayMs: E.delayMs,
              damage: E.damage,
              centre: { radius: E.centreRadius, damage: E.centreDamage, slowFraction: E.slowFraction, slowMs: E.slowMs },
            },
            nowMs,
          );
          this.eyeTarget = null;
          this.enter('reposition', nowMs, 0);
        }
        break;
      }

      case 'lock':
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
    if (ready('orb') && dist <= MAGUS.orb.triggerRange) return this.begin('orb', nowMs);

    const options: SpellId[] = [];
    if (ready('lance') && dist <= MAGUS.lance.length - ctx.player.radius) options.push('lance');
    if (ready('eye') && dist <= MAGUS.eye.range) options.push('eye');
    if (ready('orb') && dist <= MAGUS.orb.range) options.push('orb');
    if (options.length === 0) return false;
    return this.begin(Phaser.Utils.Array.GetRandom(options), nowMs);
  }

  private begin(id: SpellId, nowMs: number): boolean {
    this.readyAt[id] = nowMs + MAGUS[id].cooldownMs;
    this.nextCastAt = nowMs + this.spellGapMs;

    // A cast starts from where its cursor is, and travels to its aim from there.
    this.rollAimOffset(id === 'lance' ? MAGUS.aimSpreadPx.spell : MAGUS.aimSpreadPx[id]);
    this.aimAngle = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);

    if (id === 'lance') {
      this.enter('lance', nowMs, MAGUS.lance.chargeMs);
    } else if (id === 'orb') {
      this.enter('orb', nowMs, MAGUS.orb.windupMs);
    } else {
      // Targeting first: the circle goes down when the cast ends (see 'eye').
      this.eyeTarget = this.eyeSpot(this.aim);
      this.enter('eye', nowMs, MAGUS.eye.castMs);
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

  /** True through the last MAGUS.orb.lockMs of the Orb windup: its aim no longer moves. Read by the view. */
  orbLocked(nowMs: number): boolean {
    return this.state === 'orb' && this.stateEndsAt - nowMs <= MAGUS.orb.lockMs;
  }

  /** `aim`, pulled in to the Eye's reach. */
  private eyeSpot(aim: { x: number; y: number }): { x: number; y: number } {
    const E = MAGUS.eye;
    const angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    const reach = Math.min(E.range, Math.hypot(aim.x - this.x, aim.y - this.y));
    return { x: this.x + Math.cos(angle) * reach, y: this.y + Math.sin(angle) * reach };
  }

  /**
   * How long the Orb, fired `afterMs` from now, would take to reach the player
   * (one refinement toward where they're heading).
   */
  private orbFlightMs(ctx: EnemyContext, afterMs = 0): number {
    const first = (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) / this.orbSpeed) * 1000;
    const ahead = this.wantedAim(ctx, afterMs + first, MAGUS.orb.aimLead);
    return (Math.hypot(ahead.x - this.x, ahead.y - this.y) / this.orbSpeed) * 1000;
  }
}
