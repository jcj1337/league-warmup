import Phaser from 'phaser';
import { CONTACT, DIFFICULTY, ENEMIES, type EnemyId } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Fx } from '../view/Fx';
import { scaled } from '../systems/Difficulty';
import type { GameClock } from '../systems/GameClock';
import type { HostileSpellSink } from '../systems/HostileSpellSystem';
import type { AttackTokens } from '../systems/AttackTokens';
import type { EnemyView } from '../view/EnemyView';

/** How an enemy hurt the player: an attack (swing, spit, spell), or touching bodies. */
export type DamageKind = 'attack' | 'contact';

/** Identifies an archetype for spawn weighting, scoring and kill tallies: a key of ENEMIES. */
export type EnemyArchetype = EnemyId;

/**
 * Where an enemy is in its life, as far as gameplay is concerned.
 *
 *   spawning ──(GameClock reaches activeAt)──► active ──(last pip lost)──► dead
 *
 * Only an `active` enemy exists for gameplay: it can be targeted, hit, marked,
 * moves, attacks and counts as a threat. A `spawning` enemy sits on its fixed
 * spawn spot doing none of that. Nothing ever goes backwards.
 */
export type EnemyLifecycle = 'spawning' | 'active' | 'dead';

/** What an enemy's AI is allowed to see and do each frame. */
export interface EnemyContext {
  player: {
    x: number;
    y: number;
    radius: number;
    /** Current velocity in px/s, for enemies that lead their aim. */
    vx: number;
    vy: number;
    /** True while the player is stunned and cannot act. */
    stunned: boolean;
  };
  /**
   * Apply damage to the player, tagged with who dealt it and how ('attack' by
   * default, or 'contact' for a body bump). Routed through the scene's
   * i-frame logic and its stage damage scaling.
   */
  damagePlayer(amount: number, source: EnemyArchetype, kind?: DamageKind): void;
  /**
   * Cast hostile spells (ground zones, the Magus orb). The spell system owns
   * them, so a spell already placed still lands after its caster dies.
   */
  spells: HostileSpellSink;
  /** Shared pool a crowd takes turns with for token-gated attacks (the basic spit). */
  attackTokens: AttackTokens;
  /** Enemies still between the player and a wave clear (pending + arriving + alive), the caller included. */
  enemiesRemaining: number;
  /** The current wave's enemies (the caller included), for mobs that act on their allies. */
  allies: readonly Enemy[];
}

export interface EnemyOptions {
  radius: number;
  /** Health pips: how many hits this enemy takes to kill. */
  maxHp: number;
  /** Kill score = SCORE.pointsPerKill * this. */
  scoreMultiplier: number;
  /** 1-based stage it spawned on: its scaled stats are fixed from this. */
  stage: number;
}

/**
 * What the AI is doing this frame, published for the view to animate.
 * Written by gameplay, only ever read by visuals.
 */
export interface EnemyPose {
  moving: boolean;
  /** 1 = facing right, -1 = facing left. */
  facing: number;
  /** 0..1 through an attack windup, or -1 when not winding up. */
  windup: number;
  /** Centre-to-centre reach of its attack, if it has one (for the telegraph). */
  reach: number;
}

/**
 * Everything every enemy shares: position, health pips, the W mark, the
 * spawn → active → dead lifecycle and the hit/death flow. Archetypes subclass
 * this, supply their AI in `updateAi()` and build their `view` in their
 * constructor.
 *
 * Health is discrete: `hp` / `maxHp` count PIPS, and every hit removes exactly
 * one (see takeHit). There are no damage amounts anywhere in the enemy model.
 *
 * Gameplay state (`hp`, `lifecycle`) flips immediately; the view only represents
 * it and is told about hits and deaths as they happen. All gameplay timing
 * reads the GameClock, so every enemy freezes correctly when paused.
 */
export abstract class Enemy {
  abstract readonly archetype: EnemyArchetype;

  public x: number;
  public y: number;

  public readonly radius: number;
  public readonly scoreMultiplier: number;
  /** The stage it spawned on. */
  public readonly stage: number;
  /** DIFFICULTY.moveSpeed on that stage: multiplies every speed the AI moves at. */
  public readonly moveScale: number;

  /** Remaining health pips. */
  public hp: number;
  /** Health pips at spawn, from the current stage's STAGES row. */
  public readonly maxHp: number;

  /**
   * Constructed enemies are active at once; the WaveDirector puts wave
   * arrivals through `beginArrival()` first.
   */
  public lifecycle: EnemyLifecycle = 'active';
  /** GameClock time the arrival began. Only meaningful once beginArrival() ran. */
  public arrivalStartedAt = 0;
  /** GameClock time a spawning enemy becomes active. The one activation deadline. */
  public activeAt = 0;

  /**
   * Generational guard captured by in-flight missiles, so a projectile aimed at
   * one enemy can never damage a different one.
   */
  public spawnId = 0;

  public readonly pose: EnemyPose = { moving: false, facing: 1, windup: -1, reach: 0 };

  /** The enemy's visual representation. Built by the archetype's constructor. */
  public view!: EnemyView;

  protected readonly scene: Phaser.Scene;
  protected readonly clock: GameClock;

  /**
   * Statuses a champion applied (a mark, a poison): id → clock time it lapses.
   * They live on the enemy itself so every archetype gets them for free and
   * they die with it. Ids are namespaced by champion ('ezreal.mark').
   */
  private readonly statusUntil = new Map<string, number>();
  /** Clock time this enemy may next bump the player (see checkContact). */
  private nextContactAt = 0;

  /**
   * Picked up by a Sovereign's Force of Will: no AI and no contact while held —
   * the holder moves it. It stays targetable, so you can pop it in her hands.
   */
  held = false;
  /** After being thrown: no AI and no contact until this clock time. */
  dazedUntil = 0;

  constructor(scene: Phaser.Scene, clock: GameClock, x: number, y: number, opts: EnemyOptions) {
    this.scene = scene;
    this.clock = clock;
    this.x = x;
    this.y = y;
    this.radius = opts.radius;
    this.scoreMultiplier = opts.scoreMultiplier;
    this.stage = opts.stage;
    this.moveScale = scaled(DIFFICULTY.moveSpeed, opts.stage);
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
  }

  // ------------------------------------------------------------- lifecycle

  /**
   * Alive and in play: targetable, damageable, moving, attacking. Every combat
   * system gates on this, so a spawning enemy is invisible to all of them.
   * Assigning forces the lifecycle (true = active, false = dead).
   */
  get active(): boolean {
    return this.lifecycle === 'active';
  }

  set active(value: boolean) {
    this.lifecycle = value ? 'active' : 'dead';
  }

  get spawning(): boolean {
    return this.lifecycle === 'spawning';
  }

  get dead(): boolean {
    return this.lifecycle === 'dead';
  }

  /** Hold this enemy in the arrival window until `nowMs + manifestMs`. */
  beginArrival(nowMs: number, manifestMs: number): void {
    this.lifecycle = 'spawning';
    this.arrivalStartedAt = nowMs;
    this.activeAt = nowMs + manifestMs;
  }

  /** 0..1 through the arrival window; 1 once active. Read by the view. */
  arrivalProgress(nowMs: number): number {
    if (!this.spawning) return 1;
    const span = this.activeAt - this.arrivalStartedAt;
    return span > 0 ? Phaser.Math.Clamp((nowMs - this.arrivalStartedAt) / span, 0, 1) : 1;
  }

  // ---------------------------------------------------------------- statuses

  /** Apply (or refresh to `ms` from now) the status `id`. */
  applyStatus(id: string, nowMs: number, ms: number): void {
    this.statusUntil.set(id, nowMs + ms);
  }

  hasStatus(id: string, nowMs: number): boolean {
    return this.active && nowMs < (this.statusUntil.get(id) ?? 0);
  }

  /** Time left on the status, 0 when absent. Read by the view. */
  statusRemainingMs(id: string, nowMs: number): number {
    return this.hasStatus(id, nowMs) ? (this.statusUntil.get(id) ?? 0) - nowMs : 0;
  }

  /** Consume a status (a mark detonating). */
  clearStatus(id: string): void {
    this.statusUntil.delete(id);
  }

  /** Every status goes with the enemy. */
  clearStatuses(): void {
    this.statusUntil.clear();
  }

  /**
   * One hit: removes exactly one pip. Autos and every ability pip call this
   * once. Spawning and dead enemies cannot be hit.
   * @returns true if this hit killed the enemy.
   */
  takeHit(): boolean {
    if (!this.active) return false;

    this.hp = Math.max(0, this.hp - 1);
    this.view.onHit();

    if (this.hp === 0) {
      // State flips NOW; the death pop is only decoration.
      this.lifecycle = 'dead';
      this.clearStatuses();
      this.view.onDeath();
      this.onDeath();
      return true;
    }
    return false;
  }

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    // Activation happens at the GameClock deadline — never on an animation.
    if (this.spawning && nowMs >= this.activeAt) this.lifecycle = 'active';
    if (this.active && !this.held && nowMs >= this.dazedUntil) {
      this.updateAi(deltaSeconds, nowMs, ctx);
      this.checkContact(nowMs, ctx);
    } else if (this.held) {
      this.pose.moving = false;
    }
    this.view.sync(nowMs, deltaSeconds);
  }

  /**
   * Body contact: while this active enemy's circle overlaps the player's, it
   * bumps them for ENEMIES[archetype].contactDamage, at most once per
   * CONTACT.cooldownMs. Every mob gets this from the base class; none of them
   * walk into the player on purpose, so it punishes pathing through a crowd.
   */
  private checkContact(nowMs: number, ctx: EnemyContext): void {
    const p = ctx.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const reach = this.radius + p.radius;
    if (dx * dx + dy * dy > reach * reach || nowMs < this.nextContactAt) return;
    this.nextContactAt = nowMs + CONTACT.cooldownMs;
    const dist = Math.hypot(dx, dy) || 1;
    Fx.of(this.scene).sparks(
      this.x + (dx / dist) * this.radius, this.y + (dy / dist) * this.radius,
      [THEME.fx.hit.color, THEME.ui.danger], 6, 150, 160,
    );
    ctx.damagePlayer(ENEMIES[this.archetype].contactDamage, this.archetype, 'contact');
  }

  /** Called once, the moment this enemy dies. Default: nothing. */
  protected onDeath(): void {}

  /** Behaviour. Default: stand still. */
  protected updateAi(_deltaSeconds: number, _nowMs: number, _ctx: EnemyContext): void {}

  destroy(): void {
    this.view.destroy();
  }
}
