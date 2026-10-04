import Phaser from 'phaser';
import { ARENA, DEBUG, FLASH } from '../../config/balance';
import { activeChampion, type Champion, type Kit, type Slot } from '../../champions';
import type { AbilityDef, Aim, CastPace } from '../../champions/types';
import { THEME } from '../../config/theme';
import { ensurePlayerFrames } from '../art/look';
import { ensureArt } from '../art/textures';
import { resolveLook } from '../../cosmetics/catalogue';
import { Profile } from '../../profile/Profile';
import { Player } from '../entities/Player';
import type { DamageKind, Enemy, EnemyArchetype } from '../entities/Enemy';
import { Run, type RoundResult } from '../Run';
import { AttackSystem } from '../systems/AttackSystem';
import { PlayerProjectileSystem } from '../systems/PlayerProjectileSystem';
import { EnemyProjectileSystem } from '../systems/EnemyProjectileSystem';
import { HostileSpellSystem } from '../systems/HostileSpellSystem';
import { AttackTokens } from '../systems/AttackTokens';
import { Progression } from '../systems/Progression';
import { ScoreSystem } from '../systems/ScoreSystem';
import { KitingMetrics } from '../systems/KitingMetrics';
import { ApmTracker } from '../systems/ApmTracker';
import type { GameClock } from '../systems/GameClock';
import { Combat } from '../systems/Combat';
import { WaveDirector, type WavePhase } from '../systems/WaveDirector';
import { AbilityCooldowns, type AbilityId } from '../systems/AbilityCooldowns';
import { BlinkSystem } from '../systems/BlinkSystem';
import { CastSystem, type CastAbility, type CastPayload } from '../systems/CastSystem';
import { InputController, type CommandHandler } from '../systems/InputController';
import { CastTelegraphView } from '../view/CastTelegraphView';
import { Battlefield } from '../view/Battlefield';
import { Fx } from '../view/Fx';
import { RunFeedback } from '../view/RunFeedback';
import { DEFAULT_CAST_MOTION, tempoOf } from '../view/motion';
import { AUTO_MISSILE_SPEC } from '../entities/AutoAttackMissile';
import type { CastLook } from '../view/PlayerView';

export type { RoundResult, RoundState } from '../Run';

/** Snapshot the HUD polls every frame. */
export interface HudState {
  /** Who is being played: the HUD builds its slots and passive readout from the champion. */
  champion: string;
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
  /** Per slot: remaining and full cooldown, and ms since something last took time off it. */
  abilityCooldowns: Record<string, { remaining: number; total: number; sinceReduced: number }>;
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
  /** The champion's passive stacks, if it has any (max 0 otherwise). */
  passiveStacks: number;
  passiveMaxStacks: number;
  passiveFraction: number;
  /** The player's level (1-18) and 0..1 progress to the next one (1 at max). */
  level: number;
  levelProgress: number;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  /** Who is being played this round, and their abilities. Public for the suites. */
  champion!: Champion;
  kit!: Kit;
  /** The current wave's roster. Owned by the WaveDirector; cached each frame. */
  private enemies: Enemy[] = [];
  private director!: WaveDirector;
  /** The player's level and XP: drives ability haste, attack speed and the Q rank-up. */
  private progression!: Progression;
  private cooldowns!: AbilityCooldowns;
  private blink!: BlinkSystem;
  private cast!: CastSystem;
  /** The casting slot's ground telegraph, if it has one (AbilityDef.telegraph). */
  private castTelegraph!: CastTelegraphView;
  /** The current (or last) cast's follow-through tempo: its window against the slot's level-1 window. */
  private castTempo = 1;
  /** Last cast resolve we have already flashed for. */
  private lastCastShownAt = -Infinity;

  private attacks!: AttackSystem;
  /** Shared linear player projectiles. Public for the suites. */
  projectiles!: PlayerProjectileSystem;
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

  /** The round: its clock, its events, whether it may advance, and its result once over. */
  private run!: Run;
  /** The hit funnel: every pip lost and every HP lost, scored and announced once. */
  private combat!: Combat;

  /** Clock time until which the range ring is held up after a T press. */
  private rangeHintUntil = -Infinity;

  /** Last cancel we have already drawn a tag for. */
  private lastCancelShownAt = -Infinity;
  /** Last release we have already drawn a burst for. */
  private lastReleaseShownAt = -Infinity;

  /**
   * Round identity. Deliberately NOT reset in create(): the scene instance
   * survives scene.restart(), so this counts rounds for the persistent UIScene.
   */
  private roundId = 0;
  /**
   * Set by returnToStart(): every round until the player starts one waits on
   * the start screen like the first (two quick champion picks queue two
   * restarts; both must hold).
   */
  private holdNextRound = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.roundId++;
    // The first round after a page load waits on the start screen; so does one after "Change champion".
    this.run = new Run(this.roundId === 1 || this.holdNextRound);
    this.enemies = [];
    this.lastCancelShownAt = -Infinity;
    this.lastReleaseShownAt = -Infinity;
    this.rangeHintUntil = -Infinity;
    this.stunBuffered = null;

    // Art first: textures are generated once per game, then reused on restart.
    ensureArt(this);
    this.battlefield = new Battlefield(this);
    this.fx = new Fx(this);

    this.champion = activeChampion();
    // The champion's slime wearing the profile's cosmetics, composed once per look.
    const look = ensurePlayerFrames(this, this.champion, resolveLook(Profile.data));
    this.player = new Player(
      this, ARENA.width / 2, ARENA.height / 2, this.champion.stats, look,
      () => this.progression.moveSpeedMultiplier,
      () => this.champion.attack.range,
    );

    this.scoring = new ScoreSystem();

    this.metrics = new KitingMetrics();
    this.apm = new ApmTracker(this.clock.now);
    this.progression = new Progression(this.champion.levels, this.champion.attack);
    this.cooldowns = new AbilityCooldowns(
      (id) => (id === 'flash' ? FLASH.cooldownMs : this.champion.slots[id]?.cooldownMs() ?? 0),
      () => this.progression.cooldownMultiplier,
    );
    this.lastCastShownAt = -Infinity;

    // The run itself: stage/wave progression and the current wave's enemies.
    // Built before the systems that read stage tuning from it.
    this.director = new WaveDirector(
      this,
      this.clock,
      () => ({ x: this.player.x, y: this.player.y }),
      {
        onWaveCleared: (wave) => this.combat.waveCleared(wave),
        onStageCleared: () => this.combat.stageCleared(),
      },
    );
    this.enemies = this.director.enemies;

    this.combat = new Combat(this.clock, this.run.events, this.player, this.scoring, this.director, this.progression);
    // Presentation that listens to the run's events (kill gold, level-up ring, hit shake).
    new RunFeedback(this, this.fx, this.player, this.run.events);

    // The champion's kit gets the engine's shared pieces: blink geometry,
    // projectiles, the hit funnel. It decides what each slot does; the engine
    // decides when (cooldowns, cast windows, aim).
    this.blink = new BlinkSystem(this, this.player, this.cooldowns, {
      // A blink cancels an uncommitted auto, exactly like a move order.
      onBeforeBlink: () => this.attacks.onMoveOrder(),
    });
    this.projectiles = new PlayerProjectileSystem(this, this.player);
    this.kit = this.champion.createKit({
      scene: this,
      clock: this.clock,
      events: this.run.events,
      player: this.player,
      enemies: () => this.enemies,
      cooldowns: this.cooldowns,
      progression: this.progression,
      blink: this.blink,
      projectiles: this.projectiles,
      combat: this.combat,
    });
    const looks: Partial<Record<Slot, CastLook>> = {};
    for (const slot of ['q', 'w', 'e', 'r'] as const) {
      const def = this.champion.slots[slot];
      if (def) looks[slot] = { style: def.castStyle, fx: def.fx, motion: def.motion ?? DEFAULT_CAST_MOTION };
    }
    this.player.view.setCastLooks(looks, this.champion.autoMotion, this.champion.autoLook);

    this.attacks = new AttackSystem(this, this.player, this.metrics, this.progression, this.kit, {
      onHit: (target, killed) => this.combat.hit(target, killed),
    }, () => AUTO_MISSILE_SPEC(this.champion.autoLook));

    this.enemyProjectiles = new EnemyProjectileSystem(this, this.player, this.director, {
      onPlayerHit: (damage) => this.combat.playerHit(damage, 'edgeFire'),
    });

    this.attackTokens = new AttackTokens(() => this.director.difficulty.attackTokens);

    // Hostile spells: Magus zones and orbs, basic spit. They live here, so they outlive their caster.
    this.hostileSpells = new HostileSpellSystem(this, this.player, this.director, {
      onPlayerHit: (damage, source) => this.combat.enemyHit(damage, source),
      onPlayerStunned: (ms) => this.stunPlayer(ms),
      onPlayerSlowed: (fraction, ms) => this.player.slow(this.clock.now, fraction, ms),
    });

    // Cast windows for Q, W and E. The timer here is authoritative; the player's
    // charge animation only reads its progress.
    this.cast = new CastSystem(this.player, {
      onResolve: (ability, payload) => this.resolveCast(ability, payload),
    });
    this.castTelegraph = new CastTelegraphView(this);

    this.inputs = new InputController(this, this.commandHandler());
    if (this.run.isAwaitingStart) this.tweens.pauseAll();
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

      // Every slot commits for a short window (its castTimeMs) anchored to the
      // auto windup, so weaving abilities between attacks keeps one rhythm.
      castSlot: (slot, x, y) => this.castSlot(slot, x, y),

      // Flash stays instant, deliberately: it should feel more immediate than a
      // blink slot. It cannot break a stun — dodging the orb is the counterplay.
      // It can go off mid-cast, and the cast resolves from where she lands
      // (W-Flash, R-Flash: see CastSystem).
      castFlash: (x, y) => {
        if (this.player.isStunned) return;
        this.blink.castFlash(x, y);
      },

      targetAt: (x, y) => this.targetAt(x, y),
      recordAction: () => this.apm.record(this.clock.now),
      isRoundRunning: () => this.run.isRunning,
      acceptsGameplayInput: () => this.run.isActive,
      isPaused: () => this.run.isPaused,
      togglePause: () => this.setPaused(!this.run.isPaused),
      restartRound: () => this.restartRound(),
    };
  }

  /** Free to start an ability: not mid-cast and not stunned. */
  private get canAct(): boolean {
    return !this.cast.isCasting && !this.player.isStunned;
  }

  /**
   * A slot key went down. The engine checks what every slot shares (free to
   * act, off cooldown, something to aim at), cancels an uncommitted auto as a
   * move order would, starts the cooldown and the cast window; the kit decides
   * what happens when the window elapses.
   */
  private castSlot(slot: Slot, x: number, y: number): void {
    const def = this.champion.slots[slot];
    if (!def || !this.canAct || !this.cooldowns.isReady(slot)) return;
    const aim = this.resolveAim(def, x, y);
    if (!aim || !this.kit.canCast(slot, aim)) return;
    this.attacks.onMoveOrder();
    const payload = this.kit.commit(slot, aim);
    this.cooldowns.start(slot);
    const castTimeMs = def.castTimeMs(this.castPace);
    // The follow-through compresses as the window does: this window against the slot's level-1 one.
    this.castTempo = tempoOf(castTimeMs, def.castTimeMs({ castSpeed: 1, attackSpeed: 1 }));
    this.beginCastOrResolve(slot, payload, castTimeMs, def.anchored ?? false);
  }

  /** How fast she casts right now: haste for most slots, level and passive attack speed for some. */
  private get castPace(): CastPace {
    return {
      castSpeed: this.progression.castSpeedMultiplier,
      attackSpeed: this.progression.attackSpeedMultiplier * this.kit.attackSpeedMultiplier,
    };
  }

  /** Where a cast goes, from the cursor and the slot's targeting. Null: nothing to cast at. */
  private resolveAim(def: AbilityDef, x: number, y: number): Aim | null {
    const { player } = this;
    switch (def.targeting) {
      case 'direction':
        return { x, y };
      case 'self':
        return { x: player.x, y: player.y };
      case 'point': {
        const range = def.range ?? Number.POSITIVE_INFINITY;
        const dx = x - player.x;
        const dy = y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= range || dist === 0) return { x, y };
        return { x: player.x + (dx / dist) * range, y: player.y + (dy / dist) * range };
      }
      case 'unit': {
        // Point-and-click: the enemy under the cursor, by the same hit test as a
        // right-click attack. Out of range, nothing casts, and the slot's range
        // ring flashes so the miss reads as range, not a dropped key.
        const target = this.targetAt(x, y);
        if (!target) return null;
        const range = def.range ?? Number.POSITIVE_INFINITY;
        if (Math.hypot(target.x - player.x, target.y - player.y) > range + target.radius) {
          const R = THEME.rangeHint.unitOutOfRange;
          Fx.of(this).ring(player.x, player.y, range + R.fromPx, range, R.ms, def.accent, R.alpha);
          return null;
        }
        return { x: target.x, y: target.y, target };
      }
    }
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
  private beginCastOrResolve(ability: CastAbility, payload: CastPayload, castTimeMs: number, anchored: boolean): void {
    if (castTimeMs <= 0) {
      this.resolveCast(ability, anchored ? { ...payload, from: { x: this.player.x, y: this.player.y } } : payload);
      return;
    }
    this.cast.begin(ability, payload, castTimeMs, this.clock.now, anchored);
  }

  /** What a slot actually does once its commitment window elapses is the kit's. */
  private resolveCast(ability: CastAbility, payload: CastPayload): void {
    this.kit.cast(ability, payload);
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
    if (!this.run.setPaused(paused)) return;

    if (paused) {
      this.tweens.pauseAll();
    } else {
      this.tweens.resumeAll();
    }
  }

  get isPaused(): boolean {
    return this.run.isPaused;
  }

  /** True while gameplay owns the mouse (CursorLock holds the pointer lock only then). */
  get ownsMouse(): boolean {
    return this.run.isActive;
  }

  /** True while the start screen is holding the first round at time 0. */
  get isAwaitingStart(): boolean {
    return this.run.isAwaitingStart;
  }

  /** Leave the start screen: the run's clock starts on the next frame. */
  startRun(): void {
    if (!this.run.start()) return;
    this.holdNextRound = false;
    this.tweens.resumeAll();
  }

  /** The run's simulated clock. Systems and the suites read it; only update() advances it. */
  get clock(): GameClock {
    return this.run.clock;
  }

  /**
   * The browser dropped the Mouse Speed pointer lock on its own — the player
   * pressed Escape (which the page usually never sees) or switched away.
   * Treated exactly like Escape: back out of A-targeting, else pause.
   */
  onCursorLockLost(): void {
    if (!this.ownsMouse) return;
    if (this.inputs.attackMovePending) this.inputs.cancelPending();
    else this.setPaused(true);
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

  /** Back to the start screen with a fresh, held round (a champion change picks up the profile's choice). */
  returnToStart(): void {
    this.holdNextRound = true;
    this.restartRound();
  }

  restartRound(): void {
    this.attacks.clearMissiles();
    this.projectiles.clear();
    this.kit.clear();
    this.enemyProjectiles.clear();
    this.hostileSpells.clear();
    this.scene.restart();
  }

  // ---------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    if (!this.run.isActive) return;

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
    this.kit.update(dt, now);
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
      windupMs: this.attacks.windupMs,
      tempo: tempoOf(this.attacks.cooldownMs, this.champion.attack.baseCooldownMs),
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
    const passive = this.kit.passiveHud();
    this.player.setPassiveMaxed(passive !== null && passive.max > 0 && passive.stacks >= passive.max);

    // Cast animation is a pure read of the cast timer.
    const aim = this.cast.aim;
    this.player.setCastVisual({
      ability: this.cast.castingAbility,
      progress: this.cast.progress,
      aimX: aim ? aim.x : null,
      aimY: aim ? aim.y : null,
      windowMs: this.cast.durationMs,
      tempo: this.castTempo,
    });
    const casting = this.cast.castingAbility;
    const castDef = casting ? this.champion.slots[casting] : undefined;
    this.castTelegraph.draw(
      castDef?.telegraph ?? null, castDef?.fx ?? 'q', this.player.x, this.player.y, aim ? aim.x : 0, aim ? aim.y : 0, this.cast.progress,
    );

    // A cast that resolved this frame starts its follow-through before the redraw,
    // so the release pose is on screen the very frame the spell goes off.
    if (this.cast.lastResolveAt > this.lastCastShownAt) {
      this.lastCastShownAt = this.cast.lastResolveAt;
      this.player.playCastRelease(this.cast.lastResolvedAbility);
    }

    // 3. ...and only now does the player move and redraw.
    this.player.update(dt);

    this.metrics.update(dt, {
      attackState: this.attacks.state,
      enemyInRange: this.attacks.hasTargetInRange(this.enemies),
      playerMoving: this.player.isMoving,
    });


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
      damagePlayer: (amount, source, kind) => this.combat.enemyHit(amount, source, kind),
      spells: this.hostileSpells,
      attackTokens: this.attackTokens,
      enemiesRemaining: this.director.enemiesRemaining,
      allies: this.director.enemies,
    });
    this.enemies = this.director.enemies;

    this.projectiles.update(dt, now, this.enemies);
    this.enemyProjectiles.update(dt, now);
    this.hostileSpells.update(dt, now);

    // Decoration last: it reads what this frame decided and changes nothing.
    this.fx.update(dt);

    // The run is endless: it ends only on death. There is no timer end.
    if (!this.player.isAlive) this.endRound();
  }

  // ---------------------------------------------------------------- combat

  /**
   * The hit funnel, for the suites and for systems that are handed a scene:
   * the same calls the ability systems make through their callbacks. See Combat.
   */
  onTargetHit(target: Enemy, killed: boolean): void {
    this.combat.hit(target, killed);
  }

  onPlayerHit(damage: number, source: string): void {
    this.combat.playerHit(damage, source);
  }

  onEnemyHit(damage: number, source: EnemyArchetype, kind: DamageKind = 'attack'): void {
    this.combat.enemyHit(damage, source, kind);
  }

  /** The player died: freeze the field, build the result, log the run. */
  private endRound(): void {
    this.attacks.cancel();
    this.cast.cancel();
    this.inputs.cancelPending();
    this.player.setRangeRingState(false, false, 0);
    this.player.stop();

    this.run.finish({
      stageReached: this.director.stage,
      waveReached: this.director.wave,
      wavesInStage: this.director.wavesInStage,
      wavesCleared: this.director.wavesCleared,
      score: Math.round(this.scoring.score),
      hitsLanded: this.scoring.hitsLanded,
      targetsKilled: this.scoring.targetsKilled,
      projectileHitsTaken: this.scoring.projectileHitsTaken,
      champion: this.champion.id,
      kit: this.kit.stats(),
      kitRows: this.kit.statRows(),
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
      level: this.progression.level,
    });
  }

  // ---------------------------------------------------------------- HUD API

  /** Polled by UIScene each frame; safe to call before create() finishes. */
  getHudState(): HudState {
    const passive = this.kit ? this.kit.passiveHud() : null;
    return {
      round: this.roundId,
      runTime: this.run ? this.run.clock.now / 1000 : 0,
      score: this.scoring ? Math.round(this.scoring.score) : 0,
      champion: this.champion ? this.champion.id : 'ezreal',
      hp: this.player ? this.player.hp : 0,
      maxHp: this.player ? this.player.maxHp : 1,
      castingAbility: this.cast ? this.cast.castingAbility : null,
      castProgress: this.cast ? this.cast.progress : 0,
      abilityCooldowns: {
        q: this.abilityCooldown('q'),
        w: this.abilityCooldown('w'),
        e: this.abilityCooldown('e'),
        r: this.abilityCooldown('r'),
        flash: this.abilityCooldown('flash'),
      },
      attackMovePending: this.inputs ? this.inputs.attackMovePending : false,
      apm: this.apm && this.run ? this.apm.valueAt(this.run.clock.now) : 0,
      stage: this.director ? this.director.stage : 1,
      wave: this.director ? this.director.wave : 1,
      wavesInStage: this.director ? this.director.wavesInStage : 0,
      enemiesRemaining: this.director ? this.director.enemiesRemaining : 0,
      wavePhase: this.director ? this.director.phase : 'wave',
      nextTransition: this.director ? this.director.nextTransition : null,
      passiveStacks: passive ? passive.stacks : 0,
      passiveMaxStacks: passive ? passive.max : 0,
      passiveFraction: passive ? passive.fraction : 0,
      level: this.progression ? this.progression.level : 1,
      levelProgress: this.progression ? this.progression.progress : 0,
    };
  }

  private abilityCooldown(id: AbilityId): { remaining: number; total: number; sinceReduced: number } {
    if (!this.cooldowns) return { remaining: 0, total: 0, sinceReduced: Infinity };
    return { remaining: this.cooldowns.remainingMs(id), total: this.cooldowns.totalMs(id), sinceReduced: this.cooldowns.msSinceReduced(id) };
  }

  getRoundResult(): RoundResult | null {
    return this.run ? this.run.roundResult : null;
  }

  /** The playing champion's auto range. */
  get attackRange(): number {
    return this.champion.attack.range;
  }
}
