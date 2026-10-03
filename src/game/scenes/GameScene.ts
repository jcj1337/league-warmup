import Phaser from 'phaser';
import { ARENA, ATTACK, BALANCE_VERSION, BLINK_E, DEBUG, DIFFICULTY, ENEMIES, PLAYER, SKILLSHOT_Q, SKILLSHOT_W } from '../../config/balance';
import { THEME } from '../../config/theme';
import { ensureArt } from '../art/textures';
import { Player } from '../entities/Player';
import type { DamageKind, Enemy, EnemyArchetype } from '../entities/Enemy';
import { RunHistory } from '../RunHistory';
import { AttackSystem } from '../systems/AttackSystem';
import { SkillshotSystem } from '../systems/SkillshotSystem';
import { EnemyProjectileSystem } from '../systems/EnemyProjectileSystem';
import { HostileSpellSystem } from '../systems/HostileSpellSystem';
import { AttackTokens } from '../systems/AttackTokens';
import { Progression } from '../systems/Progression';
import { ScoreSystem } from '../systems/ScoreSystem';
import { KitingMetrics } from '../systems/KitingMetrics';
import { ApmTracker } from '../systems/ApmTracker';
import { GameClock } from '../systems/GameClock';
import { PassiveSystem } from '../systems/PassiveSystem';
import { WaveDirector, type ClearedWave, type WavePhase } from '../systems/WaveDirector';
import { AbilityCooldowns } from '../systems/AbilityCooldowns';
import { BlinkSystem } from '../systems/BlinkSystem';
import { CastSystem, type CastAbility, type CastPayload } from '../systems/CastSystem';
import { InputController, type CommandHandler } from '../systems/InputController';
import { Battlefield } from '../view/Battlefield';
import { Fx } from '../view/Fx';

export type RoundState = 'running' | 'over';

export interface RoundResult {
  /** How the run ended. The run is endless, so it always ends in defeat. */
  outcome: 'defeated';
  /** The stage and wave in play when the run ended. */
  stageReached: number;
  waveReached: number;
  wavesInStage: number;
  wavesCleared: number;
  /** Best stage of earlier logged runs on this growth setting (null: none), and whether this run beat it. */
  previousBest: number | null;
  newBest: boolean;
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
  /** Where the score came from: kills, wave speed bonuses, stage HP bonuses. */
  scoreFrom: { kills: number; speed: number; hp: number };
  /** Damage taken per source over the run, and in the stage that killed you; the source of the killing blow. */
  damageTaken: Record<string, number>;
  stageDamage: Record<string, number>;
  killedBy: string | null;
  /** DIFFICULTY.growth this run was played on. */
  growth: number;
  /** The player's level when the run ended. */
  level: number;
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
  /** Stage / wave progress, straight from the WaveDirector. The run is endless: no stage total. */
  stage: number;
  wave: number;
  wavesInStage: number;
  enemiesRemaining: number;
  wavePhase: WavePhase;
  /** During a breather, what comes next; null while fighting. */
  nextTransition: 'wave' | 'stage' | null;
  /** Q passive. */
  passiveStacks: number;
  passiveMaxStacks: number;
  passiveFraction: number;
  /** The player's level (1-18) and 0..1 progress to the next one (1 at max). */
  level: number;
  levelProgress: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  /** The current wave's roster. Owned by the WaveDirector; cached each frame. */
  private enemies: Enemy[] = [];
  private director!: WaveDirector;
  private passive!: PassiveSystem;
  /** The player's level and XP: drives ability haste, attack speed and the Q rank-up. */
  private progression!: Progression;
  private cooldowns!: AbilityCooldowns;
  private blink!: BlinkSystem;
  private cast!: CastSystem;
  /** Last cast resolve we have already flashed for. */
  private lastCastShownAt = -Infinity;

  private attacks!: AttackSystem;
  private skillshot!: SkillshotSystem;
  private enemyProjectiles!: EnemyProjectileSystem;
  private hostileSpells!: HostileSpellSystem;
  /** The crowd's turn-taking pool for token-gated enemy attacks (basic spit). */
  private attackTokens!: AttackTokens;
  /** A move / attack / attack-move order issued while stunned, replayed when the stun ends. */
  private stunBuffered: (() => void) | null = null;
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
    this.stunBuffered = null;
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
    this.progression = new Progression();
    this.cooldowns = new AbilityCooldowns(() => this.progression.cooldownMultiplier);
    this.lastCastShownAt = -Infinity;

    // The run itself: stage/wave progression and the current wave's enemies.
    // Built before the systems that read stage tuning from it.
    this.director = new WaveDirector(
      this,
      this.clock,
      () => ({ x: this.player.x, y: this.player.y }),
      {
        onWaveCleared: (wave) => this.onWaveCleared(wave),
        onStageCleared: () => this.onStageCleared(),
      },
    );
    this.enemies = this.director.enemies;

    this.attacks = new AttackSystem(this, this.player, this.metrics, this.progression, this.passive, {
      onHit: (target, killed) => this.onTargetHit(target, killed),
    });

    this.skillshot = new SkillshotSystem(this, this.player, this.cooldowns, {
      onQHit: (target, killed) => {
        this.onTargetHit(target, killed);
        // Ranked-up Q (LEVELS.qRankUp): its extra pips land on whatever survived the first.
        for (let extra = this.progression.qPips - 1; extra > 0 && target.active; extra--) {
          if (target.takeHit()) this.onKill(target);
        }
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
      onPlayerHit: (damage) => this.onPlayerHit(damage, 'edgeFire'),
    });

    this.attackTokens = new AttackTokens(() => this.director.difficulty.attackTokens);

    // Hostile spells: Magus zones and orbs, basic spit. They live here, so they outlive their caster.
    this.hostileSpells = new HostileSpellSystem(this, this.player, this.director, {
      onPlayerHit: (damage, source) => this.onEnemyHit(damage, source),
      onPlayerStunned: (ms) => this.stunPlayer(ms),
      onPlayerSlowed: (fraction, ms) => this.player.slow(this.clock.now, fraction, ms),
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
        // The ping shows instantly so the input feels received, even when the
        // move itself has to wait for a cast or a stun (see issueOrder).
        this.ping(x, y, 'move');
        this.issueOrder(() => {
          this.attacks.onMoveOrder();
          this.player.moveTo(x, y);
        });
      },

      // Direct order: commits to this exact enemy, ignoring A-move selection.
      // Held like a move while casting or stunned, so no auto can start then.
      commandAttackTarget: (target) => {
        this.issueOrder(() => this.attacks.commandAttack(target));
      },

      // Identical order for A-click and T; `showRangeHint` is purely visual
      // and is only set by the instant (T) path, which has no targeting mode
      // to keep the ring up for it.
      commandAttackMove: (x, y, opts) => {
        this.ping(x, y, 'attack-move');
        if (opts?.showRangeHint) this.rangeHintUntil = this.clock.now + THEME.rangeHint.holdMs;
        this.issueOrder(() => this.attacks.commandAttackMove(x, y));
      },

      // Stop cannot cancel a committed cast or a stun, but it discards any
      // order held behind them, so nothing replays when they end.
      commandStop: () => {
        this.cast.clearBufferedCommand();
        this.stunBuffered = null;
        this.attacks.onStop();
      },

      // All three kit abilities commit for a short window anchored to the auto
      // windup, so weaving them between attacks keeps one rhythm.
      castSkillshot: (x, y) => {
        if (!this.canAct || !this.skillshot.canCast('q')) return;
        this.attacks.onMoveOrder();
        this.cooldowns.start('q');
        this.beginCastOrResolve('q', { x, y }, SKILLSHOT_Q.castTimeMs);
      },

      // W and E commit: the cooldown starts NOW (so the window never extends
      // it), the aim/destination is frozen NOW, and the effect happens when the
      // cast timer elapses.
      castMark: (x, y) => {
        if (!this.canAct || !this.skillshot.canCast('w')) return;
        this.attacks.onMoveOrder();
        this.cooldowns.start('w');
        this.beginCastOrResolve('w', { x, y }, SKILLSHOT_W.castTimeMs);
      },
      castBlink: (x, y) => {
        if (!this.canAct || !this.blink.canBlink()) return;
        this.attacks.onMoveOrder();
        // Destination is committed here, not when the cast lands.
        const dest = this.blink.blinkDestination(x, y);
        this.cooldowns.start('e');
        this.beginCastOrResolve('e', dest, BLINK_E.castTimeMs);
      },

      // Flash stays instant, deliberately: it should feel more immediate than E.
      // It cannot break a stun — dodging the orb is the counterplay.
      castFlash: (x, y) => {
        if (!this.canAct) return;
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

  /** Free to start an ability: not mid-cast and not stunned. */
  private get canAct(): boolean {
    return !this.cast.isCasting && !this.player.isStunned;
  }

  /**
   * Run a move / attack / attack-move order now, or hold it while the player
   * cannot act: mid-cast it is buffered in the CastSystem (see
   * CastSystem.bufferCommand), and while stunned it waits here. Either way
   * only the latest order survives, and it replays the instant the player is
   * free — committed, never unresponsive.
   */
  private issueOrder(run: () => void): void {
    if (this.cast.isCasting) this.cast.bufferCommand(run);
    else if (this.player.isStunned) this.stunBuffered = run;
    else run();
  }

  /**
   * A Magus orb connected. Stunned: no movement, no attacks, no abilities
   * (Flash included). Whatever the player was committing to is interrupted
   * with nothing lost but time — an uncommitted auto windup and a cast window
   * both refund their cooldown — and the order queued behind the cast is kept
   * to replay when the stun ends.
   */
  private stunPlayer(ms: number): void {
    this.player.stun(this.clock.now, ms);
    this.attacks.interrupt();
    const interrupted = this.cast.interrupt();
    if (interrupted) {
      this.cooldowns.refund(interrupted.ability);
      if (interrupted.buffered) this.stunBuffered = interrupted.buffered;
    }
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
    this.hostileSpells.clear();
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

    this.player.tickStatus(now);
    // A stun just wore off: replay the order issued during it.
    if (this.stunBuffered && !this.player.isStunned) {
      const run = this.stunBuffered;
      this.stunBuffered = null;
      run();
    }
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
      player: {
        x: this.player.x,
        y: this.player.y,
        radius: this.player.radius,
        vx: this.player.vx,
        vy: this.player.vy,
        stunned: this.player.isStunned,
      },
      damagePlayer: (amount, source, kind) => this.onEnemyHit(amount, source, kind),
      spells: this.hostileSpells,
      attackTokens: this.attackTokens,
      enemiesRemaining: this.director.enemiesRemaining,
      allies: this.director.enemies,
    });
    this.enemies = this.director.enemies;

    this.skillshot.update(dt, now, this.enemies);
    this.blink.update(dt);
    this.enemyProjectiles.update(dt, now);
    this.hostileSpells.update(dt, now);

    // Decoration last: it reads what this frame decided and changes nothing.
    this.fx.update(dt);

    // The run is endless: it ends only on death. There is no timer end.
    if (!this.player.isAlive) this.endRound('defeated');
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
      this.onKill(target);
      return;
    }

    if (target.isMarked(this.clock.now)) this.detonateMark(target);
  }

  /**
   * Every kill, whatever landed it: score and kill tallies (per archetype, so a
   * Pursuer is worth more), the wave's bookkeeping, and the kill's XP.
   */
  private onKill(target: Enemy): void {
    this.scoring.addKill(target.archetype, target.scoreMultiplier, this.director.stage);
    this.director.onEnemyKilled(target, this.clock.now);
    if (this.progression.addXp(ENEMIES[target.archetype].xp, this.clock.now) > 0) this.onLevelUp();
  }

  /** Level up: a gold ring and the new level over the slime. The numbers already changed. */
  private onLevelUp(): void {
    const { x, y, radius } = this.player;
    this.fx.ring(x, y, radius + 4, radius + 46, 420, THEME.ui.accent, 1, 6);
    this.fx.popup(x, y - radius - 24, `LEVEL ${this.progression.level}`, THEME.ui.accent, 900, 30);
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
    if (killed) this.onKill(target);

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

  /**
   * Damage from an enemy, scaled by the stage: attacks (swings, spit, Magus
   * spells) by DIFFICULTY.damage, body contact by DIFFICULTY.contactDamage.
   * Contact is logged as its own source ('basicContact', …). Edge fire has
   * its own ramp and skips this.
   */
  private onEnemyHit(damage: number, source: EnemyArchetype, kind: DamageKind = 'attack'): void {
    const diff = this.director.difficulty;
    const mult = kind === 'contact' ? diff.contactDamage : diff.damage;
    this.onPlayerHit(Math.round(damage * mult), kind === 'contact' ? `${source}Contact` : source);
  }

  /** A wave was cleared: its speed bonus (SCORE.waveClear), shown over the slime when earned. */
  private onWaveCleared(wave: ClearedWave): void {
    const points = this.scoring.addWaveClear(wave.enemies, wave.elapsedMs, wave.parMs, wave.stage);
    if (points > 0) this.scorePopup(`+${points} SPEED`, 2);
  }

  /**
   * A stage was cleared: the HP bonus for what you finished it with (before
   * the heal), then back to full HP (DIFFICULTY.stageClearHeal) for the next.
   */
  private onStageCleared(): void {
    const { points, flawless } = this.scoring.addStageClear(this.player.hp, this.director.stage);
    if (points > 0) this.scorePopup(`+${points} ${flawless ? 'FLAWLESS' : 'HP'}`, 1);
    this.scoring.startStage();
    const healed = this.player.heal(Math.round(this.player.maxHp * DIFFICULTY.stageClearHeal));
    if (healed > 0) {
      this.fx.popup(this.player.x, this.player.y - this.player.radius - 18, `+${healed}`, THEME.ui.good, 800, 26);
    }
  }

  /** A score bonus over the slime; `row` stacks it above the heal popup. */
  private scorePopup(text: string, row: number): void {
    const { x, y, radius } = this.player;
    this.fx.popup(x, y - radius - 18 - row * 24, text, THEME.ui.accent, 1100, 26);
  }

  /** Every hit on the player lands here, tagged with its source for the run log. */
  private onPlayerHit(damage: number, source: string): void {
    const hpBefore = this.player.hp;
    const taken = this.player.takeDamage(damage, this.clock.now);
    if (taken <= 0) return;
    // Log the HP actually lost: overkill on the final hit is not damage taken.
    this.scoring.addDamageTaken(source ?? 'unknown', hpBefore - this.player.hp, !this.player.isAlive);

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

    const previousBest = RunHistory.summary(DIFFICULTY.growth, BALANCE_VERSION).best;
    this.result = {
      outcome,
      stageReached: this.director.stage,
      waveReached: this.director.wave,
      wavesInStage: this.director.wavesInStage,
      wavesCleared: this.director.wavesCleared,
      previousBest,
      newBest: previousBest === null || this.director.stage > previousBest,
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
      scoreFrom: { ...this.scoring.scoreFrom },
      damageTaken: { ...this.scoring.damageTaken },
      stageDamage: { ...this.scoring.stageDamage },
      killedBy: this.scoring.killedBy,
      growth: DIFFICULTY.growth,
      level: this.progression.level,
    };

    // Local tuning log (see RunHistory). Only finished runs: a restart mid-run is not logged.
    RunHistory.record({
      at: new Date().toISOString(),
      outcome,
      stage: this.result.stageReached,
      wave: this.result.waveReached,
      runTimeSeconds: Math.round(this.result.runTimeSeconds * 10) / 10,
      growth: DIFFICULTY.growth,
      balanceVersion: BALANCE_VERSION,
      level: this.result.level,
      score: this.result.score,
      killedBy: this.result.killedBy,
      damageTaken: this.result.damageTaken,
      stageDamage: this.result.stageDamage,
    });
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
      wave: this.director ? this.director.wave : 1,
      wavesInStage: this.director ? this.director.wavesInStage : 0,
      enemiesRemaining: this.director ? this.director.enemiesRemaining : 0,
      wavePhase: this.director ? this.director.phase : 'wave',
      nextTransition: this.director ? this.director.nextTransition : null,
      passiveStacks: this.passive ? this.passive.stackCount : 0,
      passiveMaxStacks: this.passive ? this.passive.maxStacks : 0,
      passiveFraction: this.passive ? this.passive.remainingFraction : 0,
      level: this.progression ? this.progression.level : 1,
      levelProgress: this.progression ? this.progression.progress : 0,
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
