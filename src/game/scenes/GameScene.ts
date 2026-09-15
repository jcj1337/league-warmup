import Phaser from 'phaser';
import { ARENA, ATTACK, BLINK_E, DEBUG, PLAYER, SKILLSHOT_Q, SKILLSHOT_W } from '../../config/balance';
import { THEME } from '../../config/theme';
import { ensureArt } from '../art/textures';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { AttackSystem } from '../systems/AttackSystem';
import { SkillshotSystem } from '../systems/SkillshotSystem';
import { EnemyProjectileSystem } from '../systems/EnemyProjectileSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { KitingMetrics } from '../systems/KitingMetrics';
import { ApmTracker } from '../systems/ApmTracker';
import { GameClock } from '../systems/GameClock';
import { PassiveSystem } from '../systems/PassiveSystem';
import { WaveDirector, type WavePhase } from '../systems/WaveDirector';
import { AbilityCooldowns } from '../systems/AbilityCooldowns';
import { BlinkSystem } from '../systems/BlinkSystem';
import { CastSystem, type CastAbility, type CastPayload } from '../systems/CastSystem';
import { InputController, type CommandHandler } from '../systems/InputController';
import { Battlefield } from '../view/Battlefield';
import { Fx } from '../view/Fx';

export type RoundState = 'running' | 'over';

export interface RoundResult {
  /** How the run ended: the player died, or the final stage's last wave was cleared. */
  outcome: 'completed' | 'defeated';
  /** The stage and wave in play when the run ended (the one just cleared, on completion). */
  stageReached: number;
  stageCount: number;
  waveReached: number;
  wavesInStage: number;
  wavesCleared: number;
  wavesTotal: number;
  /** Total run time on the GameClock, in seconds. */
  runTimeSeconds: number;
  score: number;
  /** Pip-removing hits landed by autos, Q and the E bolt. */
  hitsLanded: number;
  /** W marks detonated for their extra pip. */
  markProcs: number;
  targetsKilled: number;
  projectileHitsTaken: number;
  qFired: number;
  qHit: number;
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
  /**
   * Which round this snapshot belongs to. Bumps each time create() starts a
   * round, so the persistent UIScene can tell a restart from a continuing round.
   */
  round: number;
  /** Seconds of run time on the GameClock. A statistic, not a countdown. */
  runTime: number;
  score: number;
  hp: number;
  maxHp: number;
  /** Remaining / total cooldown per ability slot, straight from AbilityCooldowns. */
  abilityCooldowns: Record<string, { remaining: number; total: number }>;
  /** Which ability is mid-cast, and how far through, for the slot highlight. */
  castingAbility: string | null;
  castProgress: number;
  attackMovePending: boolean;
  /** Gameplay actions per minute over a rolling window. Informational only. */
  apm: number;
  /** Stage / wave progress, straight from the WaveDirector. */
  stage: number;
  stageCount: number;
  wave: number;
  wavesInStage: number;
  enemiesRemaining: number;
  wavePhase: WavePhase;
  /** During a breather, what comes next; null while fighting or once complete. */
  nextTransition: 'wave' | 'stage' | null;
  /** Q passive. */
  passiveStacks: number;
  passiveMaxStacks: number;
  passiveFraction: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  /** The current wave's roster. Owned by the WaveDirector; cached each frame. */
  private enemies: Enemy[] = [];
  private director!: WaveDirector;
  private passive!: PassiveSystem;
  private cooldowns!: AbilityCooldowns;
  private blink!: BlinkSystem;
  private cast!: CastSystem;
  /** Last cast resolve we have already flashed for. */
  private lastCastShownAt = -Infinity;

  private attacks!: AttackSystem;
  private skillshot!: SkillshotSystem;
  private enemyProjectiles!: EnemyProjectileSystem;
  private scoring!: ScoreSystem;
  private metrics!: KitingMetrics;
  private apm!: ApmTracker;
  private inputs!: InputController;

  /** Presentation only: the painted field and the pooled combat effects. */
  battlefield!: Battlefield;
  private fx!: Fx;

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

  /**
   * Round identity. Deliberately NOT reset in create(): the scene instance
   * survives scene.restart(), so this counts rounds for the persistent UIScene.
   */
  private roundId = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.roundId++;
    this.state = 'running';
    this.result = null;
    this.enemies = [];
    this.lastCancelShownAt = -Infinity;
    this.lastReleaseShownAt = -Infinity;
    this.rangeHintUntil = -Infinity;
    this.paused = false;
    this.clock = new GameClock();

    // Art first: textures are generated once per game, then reused on restart.
    ensureArt(this);
    this.battlefield = new Battlefield(this);
    this.fx = new Fx(this);

    this.player = new Player(this, ARENA.width / 2, ARENA.height / 2);

    this.scoring = new ScoreSystem();

    this.metrics = new KitingMetrics();
    this.apm = new ApmTracker(this.clock.now);
    this.passive = new PassiveSystem();
    this.cooldowns = new AbilityCooldowns();
    this.lastCastShownAt = -Infinity;

    // The run itself: stage/wave progression and the current wave's enemies.
    // Built before the systems that read stage tuning from it.
    this.director = new WaveDirector(this, this.clock, () => ({
      x: this.player.x,
      y: this.player.y,
    }));
    this.enemies = this.director.enemies;

    this.attacks = new AttackSystem(this, this.player, this.metrics, this.director, this.passive, {
      onHit: (target, killed) => this.onTargetHit(target, killed),
    });

    this.skillshot = new SkillshotSystem(this, this.player, this.cooldowns, {
      onQHit: (target, killed) => {
        this.onTargetHit(target, killed);
        this.grantPassiveStack();
        // A landed Q refunds the basic ability cooldowns — never Flash.
        this.cooldowns.reduce(SKILLSHOT_Q.hitCooldownReductionMs, ['q', 'w', 'e']);
      },
      onWHit: (target) => {
        // W removes no pips: it marks, and the mark grants the stack.
        target.applyMark(this.clock.now);
        this.grantPassiveStack();
      },
    });

    this.blink = new BlinkSystem(this, this.player, this.cooldowns, {
      onBoltHit: (target, killed) => {
        this.onTargetHit(target, killed);
        this.grantPassiveStack();
      },
      // A blink cancels an uncommitted auto, exactly like a move order.
      onBeforeBlink: () => this.attacks.onMoveOrder(),
    });

    this.enemyProjectiles = new EnemyProjectileSystem(this, this.player, this.director, {
      onPlayerHit: (damage) => this.onPlayerHit(damage),
    });

    // Cast windows for Q, W and E. The timer here is authoritative; the player's
    // charge animation only reads its progress.
    this.cast = new CastSystem(this.player, {
      onResolve: (ability, payload) => this.resolveCast(ability, payload),
    });

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
        // Mid-cast the order is buffered, not dropped: the ping shows instantly
        // so the input feels received, and the move starts the moment the cast
        // resolves. See CastSystem.bufferCommand().
        this.ping(x, y, 'move');
        if (this.cast.isCasting) {
          this.cast.bufferCommand(() => {
            this.attacks.onMoveOrder();
            this.player.moveTo(x, y);
          });
          return;
        }
        this.attacks.onMoveOrder();
        this.player.moveTo(x, y);
      },

      commandAttackTarget: (target) => {
        // Direct order: commits to this exact enemy, ignoring A-move selection.
        // Mid-cast it is buffered like a move, so no auto can start during a
        // Q/W/E window — the attack begins the moment the cast resolves.
        if (this.cast.isCasting) {
          this.cast.bufferCommand(() => this.attacks.commandAttack(target));
          return;
        }
        this.attacks.commandAttack(target);
      },

      commandAttackMove: (x, y, opts) => {
        if (this.cast.isCasting) {
          this.ping(x, y, 'attack-move');
          this.cast.bufferCommand(() => this.attacks.commandAttackMove(x, y));
          if (opts?.showRangeHint) this.rangeHintUntil = this.clock.now + THEME.rangeHint.holdMs;
          return;
        }
        // Identical order for A-click and T; `showRangeHint` is purely visual
        // and is only set by the instant (T) path, which has no targeting mode
        // to keep the ring up for it.
        this.attacks.commandAttackMove(x, y);
        this.ping(x, y, 'attack-move');
        if (opts?.showRangeHint) {
          this.rangeHintUntil = this.clock.now + THEME.rangeHint.holdMs;
        }
      },

      // Stop cannot cancel a committed cast, but it discards any order buffered
      // behind it, so nothing replays when the cast resolves.
      commandStop: () => {
        if (this.cast.isCasting) this.cast.clearBufferedCommand();
        this.attacks.onStop();
      },

      // All three kit abilities commit for a short window anchored to the auto
      // windup, so weaving them between attacks keeps one rhythm.
      castSkillshot: (x, y) => {
        if (this.cast.isCasting || !this.skillshot.canCast('q')) return;
        this.attacks.onMoveOrder();
        this.cooldowns.start('q');
        this.beginCastOrResolve('q', { x, y }, SKILLSHOT_Q.castTimeMs);
      },

      // W and E commit: the cooldown starts NOW (so the window never extends
      // it), the aim/destination is frozen NOW, and the effect happens when the
      // cast timer elapses.
      castMark: (x, y) => {
        if (this.cast.isCasting || !this.skillshot.canCast('w')) return;
        this.attacks.onMoveOrder();
        this.cooldowns.start('w');
        this.beginCastOrResolve('w', { x, y }, SKILLSHOT_W.castTimeMs);
      },
      castBlink: (x, y) => {
        if (this.cast.isCasting || !this.blink.canBlink()) return;
        this.attacks.onMoveOrder();
        // Destination is committed here, not when the cast lands.
        const dest = this.blink.blinkDestination(x, y);
        this.cooldowns.start('e');
        this.beginCastOrResolve('e', dest, BLINK_E.castTimeMs);
      },

      // Flash stays instant, deliberately: it should feel more immediate than E.
      castFlash: (x, y) => {
        if (this.cast.isCasting) return;
        this.blink.castFlash(x, y);
      },

      targetAt: (x, y) => this.targetAt(x, y),
      recordAction: () => this.apm.record(this.clock.now),
      isRoundRunning: () => this.state === 'running',
      acceptsGameplayInput: () => this.state === 'running' && !this.paused,
      isPaused: () => this.paused,
      togglePause: () => this.setPaused(!this.paused),
      restartRound: () => this.restartRound(),
    };
  }

  /**
   * Start a cast window, or resolve immediately when castTimeMs is 0 — so any
   * ability can be made instant from config alone.
   */
  private beginCastOrResolve(ability: CastAbility, payload: CastPayload, castTimeMs: number): void {
    if (castTimeMs <= 0) {
      this.resolveCast(ability, payload);
      return;
    }
    this.cast.begin(ability, payload, castTimeMs, this.clock.now);
  }

  /** What each ability actually does once its commitment window elapses. */
  private resolveCast(ability: CastAbility, payload: CastPayload): void {
    if (ability === 'e') {
      this.blink.executeBlink(payload, this.enemies, this.clock.now);
    } else {
      this.skillshot.fire(ability, payload.x, payload.y);
    }
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
   * Short-lived click marker so issued commands are readable. Move orders
   * collapse inward; attack-move crosshairs bloom outward, so the two are
   * distinguishable at a glance.
   */
  private ping(x: number, y: number, kind: 'move' | 'attack-move'): void {
    this.fx.ping(x, y, kind);
  }

  // ---------------------------------------------------------------- pause

  /**
   * Freeze / unfreeze the whole simulation.
   *
   * Nothing is rescheduled on resume: `update()` simply stops running, so the
   * GameClock stops advancing and every stored deadline (windup, cooldowns,
   * wave breathers, spawn ticks) keeps exactly the same remaining time it had.
   * Effects advance inside update() too, so they freeze with it; Phaser tweens
   * run on wall time and are paused alongside.
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
    this.blink.clear();
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

    this.scoring.tickSurvival(dt);
    this.passive.update(now);
    this.cooldowns.update(now);
    this.cast.update(now);

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

    // Persistent emphasis while the passive is fully stacked.
    this.player.setPassiveMaxed(this.passive.isMaxStacked);

    // Cast animation is a pure read of the cast timer.
    const aim = this.cast.aim;
    this.player.setCastVisual(
      this.cast.castingAbility,
      this.cast.progress,
      aim ? aim.x : null,
      aim ? aim.y : null,
    );

    // 3. ...and only now does the player move and redraw.
    this.player.update(dt);

    this.metrics.update(dt, {
      attackState: this.attacks.state,
      enemyInRange: this.attacks.hasTargetInRange(this.enemies),
      playerMoving: this.player.isMoving,
    });

    if (this.cast.lastResolveAt > this.lastCastShownAt) {
      this.lastCastShownAt = this.cast.lastResolveAt;
      this.player.playCastRelease(this.cast.lastResolvedAbility);
    }

    // Cancel tag: fires once per cancel, driven off the system's timestamp.
    if (this.attacks.lastCancelAt > this.lastCancelShownAt) {
      this.lastCancelShownAt = this.attacks.lastCancelAt;
      this.player.showCancelTag();
    }

    // Release burst: likewise fired once per release from the system's timestamp,
    // so the "auto is committed" cue can never drift from the state machine.
    if (this.attacks.lastReleaseAt > this.lastReleaseShownAt) {
      this.lastReleaseShownAt = this.attacks.lastReleaseAt;
      this.player.playReleaseBurst();
    }

    // The director owns the run: breather → next wave/stage, enemy AI, spacing.
    this.director.update(dt, now, {
      player: { x: this.player.x, y: this.player.y, radius: this.player.radius },
      damagePlayer: (amount) => this.onPlayerHit(amount),
    });
    this.enemies = this.director.enemies;

    this.skillshot.update(dt, now, this.enemies);
    this.blink.update(dt);
    this.enemyProjectiles.update(dt, now);

    // Decoration last: it reads what this frame decided and changes nothing.
    this.fx.update(dt);

    // The run ends on death, or once the final stage's last wave is cleared.
    // There is no timer end.
    if (!this.player.isAlive) {
      this.endRound('defeated');
    } else if (this.director.isRunComplete) {
      this.endRound('completed');
    }
  }

  // ---------------------------------------------------------------- events

  /**
   * Every pip-removing hit funnels through here, AFTER the entity has already
   * lost its one pip: autos, Q and the E bolt.
   *
   * W's mark detonates from this one place, which is why W itself does not call
   * it — the mark application removes no pip, so it cannot detonate itself.
   */
  private onTargetHit(target: Enemy, killed: boolean): void {
    this.scoring.addHit();

    if (killed) {
      // Score and kill tallies are per archetype, so a Pursuer is worth more.
      this.scoring.addKill(target.archetype, target.scoreMultiplier);
      this.director.onEnemyKilled(target, this.clock.now);
      return;
    }

    if (target.isMarked(this.clock.now)) this.detonateMark(target);
  }

  /**
   * Cash in a W mark: one extra pip on top of the triggering hit's own.
   * Deliberately does NOT route back through onTargetHit() — that would recurse,
   * and a detonation must never grant a second passive stack (the stack was
   * already given when the mark landed).
   */
  private detonateMark(target: Enemy): void {
    target.clearMark();

    const killed = target.takeHit();
    this.scoring.addMarkProc();
    if (killed) {
      this.scoring.addKill(target.archetype, target.scoreMultiplier);
      this.director.onEnemyKilled(target, this.clock.now);
    }

    this.fx.detonation(target.x, target.y);
  }

  /**
   * One place that grants a passive stack, so every ability that should stack
   * it (Q hit, W mark landing, E bolt hit) behaves identically — and so the
   * player feedback can never fire without a real stack.
   */
  private grantPassiveStack(): void {
    this.passive.addStack();
    this.player.playPassivePulse(this.passive.isMaxStacked);
  }

  private onPlayerHit(damage: number): void {
    const taken = this.player.takeDamage(damage, this.clock.now);
    if (taken <= 0) return;

    this.scoring.addProjectileHit();
    this.cameras.main.shake(90, 0.004);

    // Red rim flash: hits register even when your eyes are on the enemy.
    const rim = this.add
      .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width - 8, ARENA.height - 8, 0x000000, 0)
      .setStrokeStyle(8, THEME.ui.hitRim, 0.55)
      .setDepth(THEME.depth.screen);
    this.tweens.add({
      targets: rim,
      alpha: 0,
      duration: 260,
      onComplete: () => rim.destroy(),
    });
  }

  private endRound(outcome: RoundResult['outcome']): void {
    this.state = 'over';
    this.attacks.cancel();
    this.cast.cancel();
    this.inputs.cancelPending();
    this.player.setRangeRingState(false, false, 0);
    this.player.stop();

    this.result = {
      outcome,
      stageReached: this.director.stage,
      stageCount: this.director.stageCount,
      waveReached: this.director.wave,
      wavesInStage: this.director.wavesInStage,
      wavesCleared: this.director.wavesCleared,
      wavesTotal: this.director.wavesTotal,
      runTimeSeconds: this.clock.now / 1000,
      score: Math.round(this.scoring.score),
      hitsLanded: this.scoring.hitsLanded,
      markProcs: this.scoring.markProcs,
      targetsKilled: this.scoring.targetsKilled,
      projectileHitsTaken: this.scoring.projectileHitsTaken,
      qFired: this.skillshot.shotsFired,
      qHit: this.skillshot.shotsHit,
      attacksStarted: this.metrics.attacksStarted,
      attacksFired: this.metrics.attacksFired,
      attacksCancelled: this.metrics.attacksCancelled,
      attacksLanded: this.metrics.attacksLanded,
      idleInRangeMs: Math.round(this.metrics.idleInRangeMs),
      wastedRecoveryMs: Math.round(this.metrics.wastedRecoveryMs),
      killsByType: { ...this.scoring.killsByType },
    };
  }

  // ---------------------------------------------------------------- HUD API

  /** Polled by UIScene each frame; safe to call before create() finishes. */
  getHudState(): HudState {
    return {
      round: this.roundId,
      runTime: this.clock ? this.clock.now / 1000 : 0,
      score: this.scoring ? Math.round(this.scoring.score) : 0,
      hp: this.player ? this.player.hp : PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      castingAbility: this.cast ? this.cast.castingAbility : null,
      castProgress: this.cast ? this.cast.progress : 0,
      abilityCooldowns: {
        q: this.abilityCooldown('q'),
        w: this.abilityCooldown('w'),
        e: this.abilityCooldown('e'),
        flash: this.abilityCooldown('flash'),
      },
      attackMovePending: this.inputs ? this.inputs.attackMovePending : false,
      apm: this.apm && this.clock ? this.apm.valueAt(this.clock.now) : 0,
      stage: this.director ? this.director.stage : 1,
      stageCount: this.director ? this.director.stageCount : 0,
      wave: this.director ? this.director.wave : 1,
      wavesInStage: this.director ? this.director.wavesInStage : 0,
      enemiesRemaining: this.director ? this.director.enemiesRemaining : 0,
      wavePhase: this.director ? this.director.phase : 'wave',
      nextTransition: this.director ? this.director.nextTransition : null,
      passiveStacks: this.passive ? this.passive.stackCount : 0,
      passiveMaxStacks: this.passive ? this.passive.maxStacks : 0,
      passiveFraction: this.passive ? this.passive.remainingFraction : 0,
    };
  }

  private abilityCooldown(id: 'q' | 'w' | 'e' | 'flash'): { remaining: number; total: number } {
    if (!this.cooldowns) return { remaining: 0, total: 0 };
    return { remaining: this.cooldowns.remainingMs(id), total: this.cooldowns.totalMs(id) };
  }

  getRoundResult(): RoundResult | null {
    return this.result;
  }

  get attackRange(): number {
    return ATTACK.range;
  }
}
