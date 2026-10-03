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
 *   lance      — charging: the line tracks you
 *   lock       — the line is placed and about to land; still rooted
 *   eye        — targeting: a reticle tracks where the circle will land, then it goes down
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
        // The line tracks where you're heading through the charge, then locks.
        const aim = this.aimPoint(ctx, MAGUS.lance.lockMs);
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
        const aim = this.aimPoint(ctx, this.orbFlightMs(ctx));
        this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);
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
        // Targeting: the reticle follows where you'll be when it lands, then it goes down.
        this.eyeTarget = this.eyeSpot(ctx);
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
    this.nextCastAt = nowMs + this.spellGapMs;

    this.rollAimOffset(id === 'orb' ? MAGUS.aimSpreadPx.orb : MAGUS.aimSpreadPx.spell);
    const aim = this.aimPoint(ctx, 0);
    this.aimAngle = Math.atan2(aim.y - this.y, aim.x - this.x);

    if (id === 'lance') {
      this.enter('lance', nowMs, MAGUS.lance.chargeMs);
    } else if (id === 'orb') {
      this.enter('orb', nowMs, MAGUS.orb.windupMs);
    } else {
      // Targeting first: the circle goes down when the cast ends (see 'eye').
      this.eyeTarget = this.eyeSpot(ctx);
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

  /** Where the Eye would go down now: led by its delay, clamped to its reach. */
  private eyeSpot(ctx: EnemyContext): { x: number; y: number } {
    const E = MAGUS.eye;
    const aim = this.aimPoint(ctx, E.delayMs);
    const angle = Math.atan2(aim.y - this.y, aim.x - this.x);
    const reach = Math.min(E.range, Math.hypot(aim.x - this.x, aim.y - this.y));
    return { x: this.x + Math.cos(angle) * reach, y: this.y + Math.sin(angle) * reach };
  }

  /** How long the Orb would take to reach the player (one refinement toward where they're heading). */
  private orbFlightMs(ctx: EnemyContext): number {
    const first = (Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y) / this.orbSpeed) * 1000;
    const ahead = this.aimPoint(ctx, first);
    return (Math.hypot(ahead.x - this.x, ahead.y - this.y) / this.orbSpeed) * 1000;
  }
}
