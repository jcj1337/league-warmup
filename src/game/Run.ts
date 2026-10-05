import { BALANCE_VERSION, DIFFICULTY } from '../config/balance';
import { RunEvents } from './RunEvents';
import { RunHistory } from './RunHistory';
import { GameClock } from './systems/GameClock';
import type { KitStat } from '../champions/types';

/**
 * One run, from the start screen to the end screen: its simulated clock, its
 * events, where it is (held, running, paused, over) and, once it's over, its
 * result. No Phaser in here: the scene owns the drawing and the tweens, and
 * asks this for every "may the game advance right now?" decision.
 *
 *   awaitingStart ──start()──► running ◄──setPaused──► paused
 *                                 │
 *                              finish()
 *                                 ▼
 *                                over
 *
 * Only the first run after a page load waits on the start screen; a restart
 * goes straight to running.
 */

export type RoundState = 'running' | 'over';

export interface RoundResult {
  /** How the run ended. The run is endless, so it always ends in defeat. */
  outcome: 'defeated';
  /** The stage and wave in play when the run ended. */
  stageReached: number;
  waveReached: number;
  wavesInStage: number;
  wavesCleared: number;
  /** Best stage of earlier logged runs as this champion in this mode, on this growth setting (null: none), and whether this run beat it. */
  previousBest: number | null;
  newBest: boolean;
  /** Total run time on the GameClock, in seconds. */
  runTimeSeconds: number;
  score: number;
  /** Pip-removing hits landed by autos and abilities. */
  hitsLanded: number;
  targetsKilled: number;
  projectileHitsTaken: number;
  /** Who was played, their raw counters for the log, and their end-screen lines. */
  champion: string;
  /** The difficulty mode it was played on (a key of MODES). */
  mode: string;
  kit: Record<string, number>;
  kitRows: KitStat[];
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

/** What the scene hands over at the end: everything in the result except what the run itself knows. */
export type RoundSummary = Omit<RoundResult, 'outcome' | 'previousBest' | 'newBest' | 'runTimeSeconds' | 'growth'>;

export class Run {
  /**
   * Simulated time. Every gameplay deadline is measured against this, never
   * against Phaser's wall clock, so pausing cannot fast-forward anything.
   */
  readonly clock = new GameClock();
  readonly events = new RunEvents();

  private state: RoundState = 'running';
  /** True while the pause menu is up. Freezes the entire simulation. */
  private paused = false;
  /** True while the start screen holds the round at time 0, until the player clicks or presses a key. */
  private awaitingStart: boolean;
  private result: RoundResult | null = null;

  constructor(awaitingStart: boolean) {
    this.awaitingStart = awaitingStart;
  }

  /** The round is live: not held, not paused, not over. Only then does the simulation advance. */
  get isActive(): boolean {
    return this.state === 'running' && !this.paused && !this.awaitingStart;
  }

  get isRunning(): boolean {
    return this.state === 'running';
  }

  get isOver(): boolean {
    return this.state === 'over';
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isAwaitingStart(): boolean {
    return this.awaitingStart;
  }

  get roundResult(): RoundResult | null {
    return this.result;
  }

  /** Leave the start screen. Returns false if the run was not waiting on it. */
  start(): boolean {
    if (!this.awaitingStart) return false;
    this.awaitingStart = false;
    return true;
  }

  /**
   * Freeze / unfreeze the simulation. Nothing is rescheduled on resume: the
   * clock simply stops, so every stored deadline (windup, cooldowns, wave
   * breathers, spawn ticks) keeps exactly the remaining time it had. Returns
   * false if nothing changed (already in that state, held, or over).
   */
  setPaused(paused: boolean): boolean {
    if (this.state !== 'running' || this.awaitingStart || this.paused === paused) return false;
    this.paused = paused;
    return true;
  }

  /**
   * The run is over. Builds the result against the logged runs on this
   * growth setting and balance version, then logs this one. Only finished
   * runs are logged: a restart mid-run never reaches here.
   */
  finish(summary: RoundSummary): RoundResult {
    this.state = 'over';
    const previousBest = RunHistory.summary(DIFFICULTY.growth, BALANCE_VERSION, summary.champion, summary.mode).best;
    const result: RoundResult = {
      ...summary,
      outcome: 'defeated',
      previousBest,
      newBest: previousBest === null || summary.stageReached > previousBest,
      runTimeSeconds: this.clock.now / 1000,
      growth: DIFFICULTY.growth,
    };
    this.result = result;
    RunHistory.record({
      at: new Date().toISOString(),
      outcome: result.outcome,
      stage: result.stageReached,
      wave: result.waveReached,
      runTimeSeconds: Math.round(result.runTimeSeconds * 10) / 10,
      growth: result.growth,
      balanceVersion: BALANCE_VERSION,
      level: result.level,
      score: result.score,
      killedBy: result.killedBy,
      damageTaken: result.damageTaken,
      stageDamage: result.stageDamage,
      champion: result.champion,
      mode: result.mode,
    });
    return result;
  }
}
