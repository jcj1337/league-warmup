import Phaser from 'phaser';
import { ARENA, ATTACK, DEBUG, INDICATORS, PLAYER, ROUND, SKILLSHOT_Q } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { AttackSystem } from '../systems/AttackSystem';
import { SkillshotSystem } from '../systems/SkillshotSystem';
import { EnemyProjectileSystem } from '../systems/EnemyProjectileSystem';
import { DifficultyManager } from '../systems/DifficultyManager';
import { ScoreSystem } from '../systems/ScoreSystem';
import { KitingMetrics } from '../systems/KitingMetrics';
import { GameClock } from '../systems/GameClock';
import { PassiveSystem } from '../systems/PassiveSystem';
import { EnemyDirector } from '../systems/EnemyDirector';
import { InputController, type CommandHandler } from '../systems/InputController';

export type RoundState = 'running' | 'over';

export interface RoundResult {
  score: number;
  damageDealt: number;
  targetsKilled: number;
  projectileHitsTaken: number;
  qFired: number;
  qHit: number;
  survived: boolean;
  timeSurvived: number;
  /** Mechanical counters for the kiting drill — see KitingMetrics. */
  attacksStarted: number;
  attacksFired: number;
  attacksCancelled: number;
  attacksLanded: number;
  idleInRangeMs: number;
  wastedRecoveryMs: number;
  /** Kills broken down by enemy archetype. */
  killsByType: Record<string, number>;
}

/** Snapshot the HUD polls every frame. */
export interface HudState {
  timeRemaining: number;
  score: number;
  hp: number;
  maxHp: number;
  qCooldownMs: number;
  qCooldownTotalMs: number;
  attackMovePending: boolean;
  attackState: string;
  /** Live attack cycle, so the attack-speed ramp is visible while playing. */
  attacksPerSecond: number;
  attackCooldownMs: number;
  /** Live kiting metrics for the debug panel. */
  missilesInFlight: number;
  attacksFired: number;
  attacksCancelled: number;
  attacksLanded: number;
  idleInRangeMs: number;
  wastedRecoveryMs: number;
  difficultyLevel: number;
  elapsed: number;
  /** Countdown to the next stage; Infinity at max level. */
  secondsUntilNextStage: number;
  nextStage: number | null;
  /** Q passive. */
  passiveStacks: number;
  passiveMaxStacks: number;
  passiveFraction: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  /** The live enemy roster. Owned by EnemyDirector; cached each frame. */
  private enemies: Enemy[] = [];
  private director!: EnemyDirector;
  private passive!: PassiveSystem;

  private attacks!: AttackSystem;
  private skillshot!: SkillshotSystem;
  private enemyProjectiles!: EnemyProjectileSystem;
  private difficulty!: DifficultyManager;
  private scoring!: ScoreSystem;
  private metrics!: KitingMetrics;
  private inputs!: InputController;

  /**
   * Simulated time. Every gameplay deadline is measured against this, never
   * against Phaser's wall clock, so pausing cannot fast-forward anything.
   */
  private clock!: GameClock;

  /** True while the pause menu is up. Freezes the entire simulation. */
  private paused = false;

  /** Clock time until which the range ring is held up after a T press. */
  private rangeHintUntil = -Infinity;

  private state: RoundState = 'running';
  private result: RoundResult | null = null;

  /** Last cancel we have already drawn a tag for. */
  private lastCancelShownAt = -Infinity;
  /** Last release we have already drawn a burst for. */
  private lastReleaseShownAt = -Infinity;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.state = 'running';
    this.result = null;
    this.enemies = [];
    this.lastCancelShownAt = -Infinity;
    this.lastReleaseShownAt = -Infinity;
    this.rangeHintUntil = -Infinity;
    this.paused = false;
    this.clock = new GameClock();

    this.drawArena();

    this.player = new Player(this, ARENA.width / 2, ARENA.height / 2);

    this.difficulty = new DifficultyManager();
    this.scoring = new ScoreSystem();

    this.metrics = new KitingMetrics();
    this.passive = new PassiveSystem();

    this.attacks = new AttackSystem(this, this.player, this.metrics, this.difficulty, this.passive, {
      onDamage: (target, damage, killed) => this.onTargetDamaged(target, damage, killed),
    });

    this.skillshot = new SkillshotSystem(this, this.player, {
      onHit: (target, damage, killed) => this.onTargetDamaged(target, damage, killed),
      // The authoritative Q hit event: only a landed Q stacks the passive.
      onLanded: () => {
        this.passive.addStack();
        this.player.playPassivePulse(this, this.passive.isMaxStacked);
      },
    });

    this.enemyProjectiles = new EnemyProjectileSystem(this, this.player, this.difficulty, {
      onPlayerHit: (damage) => this.onPlayerHit(damage),
    });

    this.director = new EnemyDirector(this, this.clock, this.difficulty, () => ({
      x: this.player.x,
      y: this.player.y,
    }));
    this.enemies = this.director.enemies;

    this.inputs = new InputController(this, this.commandHandler());
  }

  // ---------------------------------------------------------------- input

  /**
   * The command surface exposed to InputController. All input-driven behavior
   * funnels through these methods, so rebinding or adding an input never means
   * touching gameplay systems.
   */
  private commandHandler(): CommandHandler {
    return {
      commandMove: (x, y) => {
        this.attacks.onMoveOrder();
        this.player.moveTo(x, y);
        this.ping(x, y, INDICATORS.moveColor, 'move');
      },

      commandAttackTarget: (target) => {
        // Direct order: commits to this exact enemy, ignoring A-move selection.
        this.attacks.commandAttack(target);
      },

      commandAttackMove: (x, y, opts) => {
        // Identical order for A-click and T; `showRangeHint` is purely visual
        // and is only set by the instant (T) path, which has no targeting mode
        // to keep the ring up for it.
        this.attacks.commandAttackMove(x, y);
        this.ping(x, y, INDICATORS.attackMoveColor, 'attack-move');
        if (opts?.showRangeHint) {
          this.rangeHintUntil = this.clock.now + THEME.rangeHint.holdMs;
        }
      },

      commandStop: () => this.attacks.onStop(),

      castSkillshot: (x, y) => {
        this.skillshot.castToward(x, y);
      },

      targetAt: (x, y) => this.targetAt(x, y),
      isRoundRunning: () => this.state === 'running',
      acceptsGameplayInput: () => this.state === 'running' && !this.paused,
      isPaused: () => this.paused,
      togglePause: () => this.setPaused(!this.paused),
      restartRound: () => this.restartRound(),
    };
  }

  /** Click hit test, with a little grace so clicks feel forgiving. */
  private targetAt(x: number, y: number): Enemy | null {
    const grace = 10;
    let best: Enemy | null = null;
    let bestDist = Infinity;

    for (const target of this.enemies) {
      if (!target.active) continue;
      const dist = Phaser.Math.Distance.Between(x, y, target.x, target.y);
      if (dist <= target.radius + grace && dist < bestDist) {
        best = target;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Short-lived click marker so issued commands are readable while testing.
   * Move orders collapse inward; attack-move markers expand outward and carry a
   * center dot, so the two are distinguishable at a glance.
   */
  private ping(x: number, y: number, color: number, kind: 'move' | 'attack-move'): void {
    const ring = this.add
      .circle(x, y, INDICATORS.pingRadius, 0x000000, 0)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(5);

    const parts: Phaser.GameObjects.GameObject[] = [ring];

    if (kind === 'attack-move') {
      // Attack move: a crosshair that blooms outward, unmistakably different
      // from the move pip that collapses inward.
      ring.setScale(0.5);
      const cross = this.add.graphics().setDepth(5);
      cross.lineStyle(2, color, 0.95);
      const s = 9;
      cross.lineBetween(x - s, y, x - 3, y);
      cross.lineBetween(x + 3, y, x + s, y);
      cross.lineBetween(x, y - s, x, y - 3);
      cross.lineBetween(x, y + 3, x, y + s);
      parts.push(cross);
    } else {
      // Move: a small solid pip at the destination.
      parts.push(this.add.circle(x, y, 2.5, color, 0.9).setDepth(5));
    }

    this.tweens.add({
      targets: parts,
      scale: kind === 'move' ? 0.35 : 1.25,
      alpha: 0,
      duration: INDICATORS.pingDurationMs,
      ease: 'Quad.easeOut',
      onComplete: () => parts.forEach((p) => p.destroy()),
    });
  }

  // ---------------------------------------------------------------- pause

  /**
   * Freeze / unfreeze the whole simulation.
   *
   * Nothing is rescheduled on resume: `update()` simply stops running, so the
   * GameClock stops advancing and every stored deadline (windup, cooldowns,
   * respawns, spawn ticks) keeps exactly the same remaining time it had.
   * Phaser tweens are decoration only, but they run on wall time, so they are
   * paused alongside to stop pings and damage numbers finishing behind the menu.
   */
  setPaused(paused: boolean): void {
    if (this.state !== 'running' || this.paused === paused) return;
    this.paused = paused;

    if (paused) {
      this.tweens.pauseAll();
    } else {
      this.tweens.resumeAll();
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * How strongly to draw the attack-range ring right now, 0..1.
   *
   * 'contextual' (the default) only shows it while an Attack Move command is in
   * play: held at full strength while A-targeting is armed, then a short fading
   * hint after an instant T press.
   */
  private rangeRingVisibility(now: number): number {
    if (DEBUG.attackRangeDisplay === 'off') return 0;
    if (DEBUG.attackRangeDisplay === 'always') return 1;

    if (this.inputs.attackMovePending) return 1;

    const remaining = this.rangeHintUntil - now;
    if (remaining <= 0) return 0;
    // Full strength, then ease out over the last `fadeMs`.
    return Math.min(1, remaining / THEME.rangeHint.fadeMs);
  }

  restartRound(): void {
    this.attacks.clearMissiles();
    this.skillshot.clear();
    this.enemyProjectiles.clear();
    this.scene.restart();
  }

  // ---------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    if (this.state !== 'running' || this.paused) return;

    // Clamp dt so an alt-tab / long frame cannot teleport everything.
    const dt = Math.min(delta, 50) / 1000;

    // Advance simulated time FIRST; everything below reads `now` from here and
    // never from Phaser's wall clock, which is what makes pausing safe.
    this.clock.advance(dt * 1000);
    const now = this.clock.now;

    this.difficulty.update(dt);
    this.scoring.tickSurvival(dt);
    this.passive.update(now);

    // 1. Gameplay state decides what is happening...
    this.attacks.update(now, dt, this.enemies);

    // 2. ...then the visuals read it. This runs BEFORE player.update() so the
    //    animation drawn this frame reflects this frame's attack state — a
    //    frame of lag here would show the charge ring during recovery.
    const aimTarget = this.attacks.currentTarget;
    this.player.applyAttackVisual({
      windupProgress: this.attacks.windupProgress,
      msSinceRelease: now - this.attacks.lastReleaseAt,
      targetX: aimTarget ? aimTarget.x : null,
      targetY: aimTarget ? aimTarget.y : null,
    });
    // The range ring is contextual: up while A-targeting is armed, and a brief
    // fading hint after an instant T press. See rangeRingVisibility().
    this.player.setRangeRingState(
      this.attacks.targetInRange,
      this.inputs.attackMovePending,
      this.rangeRingVisibility(now),
    );

    // 3. ...and only now does the player move and redraw.
    this.player.update(dt);

    this.metrics.update(dt, {
      attackState: this.attacks.state,
      enemyInRange: this.attacks.hasTargetInRange(this.enemies),
      playerMoving: this.player.isMoving,
    });

    // Persistent emphasis while the passive is fully stacked.
    this.player.setPassiveMaxed(this.passive.isMaxStacked);

    // Cancel tag: fires once per cancel, driven off the system's timestamp.
    if (this.attacks.lastCancelAt > this.lastCancelShownAt) {
      this.lastCancelShownAt = this.attacks.lastCancelAt;
      this.player.showCancelTag(this);
    }

    // Release burst: likewise fired once per release from the system's timestamp,
    // so the "auto is committed" cue can never drift from the state machine.
    if (this.attacks.lastReleaseAt > this.lastReleaseShownAt) {
      this.lastReleaseShownAt = this.attacks.lastReleaseAt;
      this.player.playReleaseBurst(this);
    }

    // The director owns the roster: AI, respawns, archetype re-rolls, spacing.
    this.director.update(dt, now, {
      player: { x: this.player.x, y: this.player.y, radius: this.player.radius },
      damagePlayer: (amount) => this.onPlayerHit(amount),
    });
    this.enemies = this.director.enemies;

    this.skillshot.update(dt, now, this.enemies);
    this.enemyProjectiles.update(dt, now);

    if (!this.player.isAlive) {
      this.endRound(false);
    } else if (this.difficulty.remaining <= 0) {
      this.endRound(true);
    }
  }

  // ---------------------------------------------------------------- events

  private onTargetDamaged(target: Enemy, damage: number, killed: boolean): void {
    this.scoring.addDamage(damage);
    if (killed) {
      // Score and kill tallies are per archetype, so a Pursuer is worth more.
      this.scoring.addKill(target.archetype, target.scoreMultiplier);
      this.director.onEnemyKilled(target, this.clock.now);
    }
  }

  private onPlayerHit(damage: number): void {
    const taken = this.player.takeDamage(damage, this.clock.now);
    if (taken <= 0) return;

    this.scoring.addProjectileHit();
    this.cameras.main.shake(90, 0.004);

    // Red rim flash: hits register even when your eyes are on the enemy.
    const rim = this.add
      .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width - 8, ARENA.height - 8, 0x000000, 0)
      .setStrokeStyle(8, 0xff6b6b, 0.55)
      .setDepth(60);
    this.tweens.add({
      targets: rim,
      alpha: 0,
      duration: 260,
      onComplete: () => rim.destroy(),
    });
  }

  private endRound(survived: boolean): void {
    this.state = 'over';
    this.attacks.cancel();
    this.inputs.cancelPending();
    this.player.setRangeRingState(false, false, 0);
    this.player.stop();

    this.result = {
      score: Math.round(this.scoring.score),
      damageDealt: Math.round(this.scoring.damageDealt),
      targetsKilled: this.scoring.targetsKilled,
      projectileHitsTaken: this.scoring.projectileHitsTaken,
      qFired: this.skillshot.shotsFired,
      qHit: this.skillshot.shotsHit,
      survived,
      timeSurvived: Math.min(ROUND.durationSeconds, this.difficulty.elapsed),
      attacksStarted: this.metrics.attacksStarted,
      attacksFired: this.metrics.attacksFired,
      attacksCancelled: this.metrics.attacksCancelled,
      attacksLanded: this.metrics.attacksLanded,
      idleInRangeMs: Math.round(this.metrics.idleInRangeMs),
      wastedRecoveryMs: Math.round(this.metrics.wastedRecoveryMs),
      killsByType: { ...this.scoring.killsByType },
    };
  }

  // ---------------------------------------------------------------- helpers

  private drawArena(): void {
    const A = THEME.arena;
    this.cameras.main.setBackgroundColor(A.voidColor);

    const pad = ARENA.padding;
    const left = pad;
    const top = pad;
    const w = ARENA.width - pad * 2;
    const h = ARENA.height - pad * 2;
    const right = left + w;
    const bottom = top + h;

    const g = this.add.graphics().setDepth(0);

    // Floor slab, with a slightly lighter wash toward the middle for depth.
    g.fillStyle(A.floorColor, 1);
    g.fillRect(left, top, w, h);
    g.fillStyle(A.floorCenterColor, 0.5);
    g.fillEllipse(ARENA.width / 2, ARENA.height / 2, w * 0.92, h * 1.05);

    // Fine grid.
    g.lineStyle(1, A.gridColor, 0.55);
    for (let x = left; x <= right; x += A.gridSize) g.lineBetween(x, top, x, bottom);
    for (let y = top; y <= bottom; y += A.gridSize) g.lineBetween(left, y, right, y);

    // Major grid every Nth cell — gives the field a sense of scale.
    const major = A.gridSize * A.majorEvery;
    g.lineStyle(1, A.gridMajorColor, 0.9);
    for (let x = left; x <= right; x += major) g.lineBetween(x, top, x, bottom);
    for (let y = top; y <= bottom; y += major) g.lineBetween(left, y, right, y);

    // Centre mark: a calibration ring + crosshair ticks.
    const cx = ARENA.width / 2;
    const cy = ARENA.height / 2;
    g.lineStyle(1, A.gridMajorColor, 0.9);
    g.strokeCircle(cx, cy, 74);
    g.lineStyle(1, A.borderColor, 0.5);
    g.lineBetween(cx - 14, cy, cx + 14, cy);
    g.lineBetween(cx, cy - 14, cx, cy + 14);

    // Edge vignette: bands of increasing darkness hugging the border.
    const vig = this.add.graphics().setDepth(3);
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const inset = A.vignetteBand * t;
      vig.lineStyle(
        A.vignetteBand / bands + 1,
        A.vignetteColor,
        A.vignetteAlpha * Math.pow(1 - t, 2.2),
      );
      vig.strokeRect(left + inset, top + inset, w - inset * 2, h - inset * 2);
    }

    // Border frame: thin outer line, brighter inner line, corner brackets.
    const frame = this.add.graphics().setDepth(4);
    frame.lineStyle(1, A.borderColor, 0.55);
    frame.strokeRect(left - 4, top - 4, w + 8, h + 8);
    frame.lineStyle(2, A.borderColor, 0.9);
    frame.strokeRect(left, top, w, h);

    const b = A.bracketLength;
    frame.lineStyle(3, A.borderGlowColor, 0.75);
    const corners: Array<[number, number, number, number]> = [
      [left, top, 1, 1],
      [right, top, -1, 1],
      [left, bottom, 1, -1],
      [right, bottom, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      frame.lineBetween(x, y, x + b * sx, y);
      frame.lineBetween(x, y, x, y + b * sy);
    }
  }

  // ---------------------------------------------------------------- HUD API

  /** Polled by UIScene each frame; safe to call before create() finishes. */
  getHudState(): HudState {
    return {
      timeRemaining: this.difficulty ? this.difficulty.remaining : ROUND.durationSeconds,
      score: this.scoring ? Math.round(this.scoring.score) : 0,
      hp: this.player ? this.player.hp : PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      qCooldownMs: this.skillshot ? this.skillshot.cooldownRemainingMs : 0,
      qCooldownTotalMs: SKILLSHOT_Q.cooldownMs,
      attackMovePending: this.inputs ? this.inputs.attackMovePending : false,
      attackState: this.attacks ? this.attacks.state : 'idle',
      attacksPerSecond: this.attacks ? this.attacks.attacksPerSecond : 0,
      attackCooldownMs: this.attacks ? this.attacks.cooldownMs : 0,
      missilesInFlight: this.attacks ? this.attacks.missilesInFlight : 0,
      attacksFired: this.metrics ? this.metrics.attacksFired : 0,
      attacksCancelled: this.metrics ? this.metrics.attacksCancelled : 0,
      attacksLanded: this.metrics ? this.metrics.attacksLanded : 0,
      idleInRangeMs: this.metrics ? this.metrics.idleInRangeMs : 0,
      wastedRecoveryMs: this.metrics ? this.metrics.wastedRecoveryMs : 0,
      difficultyLevel: this.difficulty ? this.difficulty.level : 1,
      elapsed: this.difficulty ? this.difficulty.elapsed : 0,
      secondsUntilNextStage: this.difficulty
        ? this.difficulty.secondsUntilNextLevel
        : Number.POSITIVE_INFINITY,
      nextStage: this.difficulty ? this.difficulty.nextLevel : null,
      passiveStacks: this.passive ? this.passive.stackCount : 0,
      passiveMaxStacks: this.passive ? this.passive.maxStacks : 0,
      passiveFraction: this.passive ? this.passive.remainingFraction : 0,
    };
  }

  getRoundResult(): RoundResult | null {
    return this.result;
  }

  get attackRange(): number {
    return ATTACK.range;
  }
}
