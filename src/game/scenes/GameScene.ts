import Phaser from 'phaser';
import { ARENA, ATTACK, INDICATORS, PLAYER, ROUND, SKILLSHOT_Q, TARGETS } from '../../config/balance';
import { THEME } from '../../config/theme';
import { Player } from '../entities/Player';
import { Target } from '../entities/Target';
import { AttackSystem } from '../systems/AttackSystem';
import { SkillshotSystem } from '../systems/SkillshotSystem';
import { EnemyProjectileSystem } from '../systems/EnemyProjectileSystem';
import { DifficultyManager } from '../systems/DifficultyManager';
import { ScoreSystem } from '../systems/ScoreSystem';
import { KitingMetrics } from '../systems/KitingMetrics';
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
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private targets: Target[] = [];

  private attacks!: AttackSystem;
  private skillshot!: SkillshotSystem;
  private enemyProjectiles!: EnemyProjectileSystem;
  private difficulty!: DifficultyManager;
  private scoring!: ScoreSystem;
  private metrics!: KitingMetrics;
  private inputs!: InputController;

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
    this.targets = [];
    this.lastCancelShownAt = -Infinity;
    this.lastReleaseShownAt = -Infinity;

    this.drawArena();

    this.player = new Player(this, ARENA.width / 2, ARENA.height / 2);

    this.difficulty = new DifficultyManager();
    this.scoring = new ScoreSystem();

    this.metrics = new KitingMetrics();

    this.attacks = new AttackSystem(this, this.player, this.metrics, this.difficulty, {
      onDamage: (target, damage, killed) => this.onTargetDamaged(target, damage, killed),
    });

    this.skillshot = new SkillshotSystem(this, this.player, {
      onHit: (target, damage, killed) => this.onTargetDamaged(target, damage, killed),
    });

    this.enemyProjectiles = new EnemyProjectileSystem(this, this.player, this.difficulty, {
      onPlayerHit: (damage) => this.onPlayerHit(damage),
    });

    for (let i = 0; i < TARGETS.count; i++) {
      const spot = this.findSpawnSpot();
      this.targets.push(new Target(this, spot.x, spot.y));
    }

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

      commandAttackMove: (x, y) => {
        this.attacks.commandAttackMove(x, y);
        this.ping(x, y, INDICATORS.attackMoveColor, 'attack-move');
      },

      commandStop: () => this.attacks.onStop(),

      castSkillshot: (x, y) => {
        this.skillshot.castToward(x, y);
      },

      targetAt: (x, y) => this.targetAt(x, y),
      isRoundRunning: () => this.state === 'running',
      restartRound: () => this.restartRound(),
    };
  }

  /** Click hit test, with a little grace so clicks feel forgiving. */
  private targetAt(x: number, y: number): Target | null {
    const grace = 10;
    let best: Target | null = null;
    let bestDist = Infinity;

    for (const target of this.targets) {
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

  restartRound(): void {
    this.attacks.clearMissiles();
    this.skillshot.clear();
    this.enemyProjectiles.clear();
    this.scene.restart();
  }

  // ---------------------------------------------------------------- loop

  override update(time: number, delta: number): void {
    if (this.state !== 'running') return;

    // Clamp dt so an alt-tab / long frame cannot teleport everything.
    const dt = Math.min(delta, 50) / 1000;

    this.difficulty.update(dt);
    this.scoring.tickSurvival(dt);

    // 1. Gameplay state decides what is happening...
    this.attacks.update(time, dt, this.targets);

    // 2. ...then the visuals read it. This runs BEFORE player.update() so the
    //    animation drawn this frame reflects this frame's attack state — a
    //    frame of lag here would show the charge ring during recovery.
    const aimTarget = this.attacks.currentTarget;
    this.player.applyAttackVisual({
      windupProgress: this.attacks.windupProgress,
      msSinceRelease: time - this.attacks.lastReleaseAt,
      targetX: aimTarget ? aimTarget.x : null,
      targetY: aimTarget ? aimTarget.y : null,
    });
    // One range ring, recolored: red while Attack Move is pending.
    this.player.setRangeRingState(this.attacks.targetInRange, this.inputs.attackMovePending);

    // 3. ...and only now does the player move and redraw.
    this.player.update(dt);

    this.metrics.update(dt, {
      attackState: this.attacks.state,
      enemyInRange: this.attacks.hasTargetInRange(this.targets),
      playerMoving: this.player.isMoving,
    });

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

    for (const target of this.targets) {
      target.update(dt, time);
      if (target.isReadyToRespawn(time)) {
        const spot = this.findSpawnSpot();
        target.respawnAtPosition(spot.x, spot.y, time);
      }
    }

    this.separateTargets();
    this.skillshot.update(dt, time, this.targets);
    this.enemyProjectiles.update(dt, time);

    if (!this.player.isAlive) {
      this.endRound(false);
    } else if (this.difficulty.remaining <= 0) {
      this.endRound(true);
    }
  }

  /**
   * Soft body-blocking between targets so drifting ones do not stack into a
   * single blob, which would make click-targeting ambiguous.
   */
  private separateTargets(): void {
    for (let i = 0; i < this.targets.length; i++) {
      const a = this.targets[i];
      if (!a.active) continue;

      for (let j = i + 1; j < this.targets.length; j++) {
        const b = this.targets[j];
        if (!b.active) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius + 6;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= minDist) continue;

        const push = (minDist - dist) / 2;
        a.x -= (dx / dist) * push;
        a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push;
        b.y += (dy / dist) * push;
      }
    }
  }

  // ---------------------------------------------------------------- events

  private onTargetDamaged(target: Target, damage: number, killed: boolean): void {
    this.scoring.addDamage(damage);
    if (killed) {
      this.scoring.addKill();
      target.scheduleRespawn(this.time.now);
    }
  }

  private onPlayerHit(damage: number): void {
    const taken = this.player.takeDamage(damage, this.time.now);
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
    this.player.setRangeRingState(false, false);
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
    };
  }

  // ---------------------------------------------------------------- helpers

  /** A spot inside the arena that is not on top of the player or another target. */
  private findSpawnSpot(): { x: number; y: number } {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    const minX = margin;
    const maxX = ARENA.width - margin;
    const minY = margin;
    const maxY = ARENA.height - margin;

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Phaser.Math.Between(minX, maxX);
      const y = Phaser.Math.Between(minY, maxY);

      if (this.player) {
        const d = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (d < TARGETS.minSpawnDistanceFromPlayer) continue;
      }
      const tooClose = this.targets.some(
        (t) => t.active && Phaser.Math.Distance.Between(x, y, t.x, t.y) < TARGETS.radius * 5,
      );
      if (tooClose) continue;

      return { x, y };
    }

    // Fallback if the arena is crowded: any legal point.
    return { x: Phaser.Math.Between(minX, maxX), y: Phaser.Math.Between(minY, maxY) };
  }

  /**
   * The training field. Built once from Graphics primitives, in layers:
   * floor slab -> centre wash -> fine grid -> major grid -> centre mark ->
   * border frame + corner brackets -> edge vignette.
   *
   * Everything is dark and low contrast on purpose; units, projectiles and
   * markers own all the bright colour in the scene.
   */
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
    };
  }

  getRoundResult(): RoundResult | null {
    return this.result;
  }

  get attackRange(): number {
    return ATTACK.range;
  }
}
