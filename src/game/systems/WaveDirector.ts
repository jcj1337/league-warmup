import Phaser from 'phaser';
import {
  ARENA,
  RUN,
  STAGES,
  TARGETS,
  type StageDefinition,
  type WaveRoster,
} from '../../config/balance';
import { Enemy, type EnemyArchetype, type EnemyContext } from '../entities/Enemy';
import { Target } from '../entities/Target';
import { Pursuer } from '../entities/Pursuer';
import { Magus } from '../entities/Magus';
import type { GameClock } from './GameClock';
import type { AttackPacing } from './AttackSystem';
import type { EnemyFirePressure } from './EnemyProjectileSystem';

/**
 * How an archetype is built. Adding a third enemy means adding one entry here,
 * its count key in `WaveRoster` and `EnemyPips`, and using it in STAGES —
 * every system downstream only knows about `Enemy`.
 */
interface ArchetypeSpec {
  create(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number): Enemy;
  /** Keep this much clear space from the player when spawning. */
  minSpawnDistance: number;
}

const ARCHETYPES: Record<EnemyArchetype, ArchetypeSpec> = {
  basic: {
    create: (scene, clock, x, y, pips) => new Target(scene, clock, x, y, pips),
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer,
  },
  pursuer: {
    create: (scene, clock, x, y, pips) => new Pursuer(scene, clock, x, y, pips),
    // Pursuers walk you down, so they get a wider berth on spawn.
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer + 120,
  },
  magus: {
    create: (scene, clock, x, y, pips) => new Magus(scene, clock, x, y, pips),
    // An artillery caster: it arrives roughly where it wants to stand.
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer + 160,
  },
};

/** Where the run is: fighting a wave, in the breather after one, or finished. */
export type WavePhase = 'wave' | 'intermission' | 'complete';

/** A roster entry that has not started arriving yet. */
interface PendingArrival {
  archetype: EnemyArchetype;
  /** GameClock time its arrival begins. */
  startsAt: number;
}

/** A roster as a flat list of archetypes, in ARCHETYPES order. */
function expandRoster(roster: WaveRoster): EnemyArchetype[] {
  const out: EnemyArchetype[] = [];
  for (const id of Object.keys(ARCHETYPES) as EnemyArchetype[]) {
    for (let i = 0; i < (roster[id] ?? 0); i++) out.push(id);
  }
  return out;
}

/** Authoring guard: fail loudly on a malformed stage table instead of playing it. */
function validateStages(): void {
  if (STAGES.length === 0) throw new Error('STAGES must define at least one stage');
  STAGES.forEach((stage, s) => {
    if (stage.waves.length === 0) throw new Error(`STAGES[${s}] defines no waves`);
    for (const id of Object.keys(ARCHETYPES) as EnemyArchetype[]) {
      const pips = stage.enemyPips[id];
      if (!Number.isInteger(pips) || pips < 1) {
        throw new Error(`STAGES[${s}].enemyPips.${id} is ${pips}; pips must be a whole number >= 1`);
      }
    }
    stage.waves.forEach((wave, w) => {
      const count = expandRoster(wave).length;
      if (count < 1 || count > RUN.maxAliveEnemies) {
        throw new Error(
          `STAGES[${s}].waves[${w}] fields ${count} enemies; a wave needs 1-${RUN.maxAliveEnemies}`,
        );
      }
    });
  });
}

/**
 * Stage / wave progression, and the enemies of the wave being fought.
 *
 *   spawnWave() ─► staggered arrivals + fight ─► last enemy killed ─► intermission ─┐
 *        ▲                                                                          │
 *        └───────────────── next wave, or Wave 1 of the next stage ◄────────────────┘
 *
 * Every wave is a finite, authored roster from STAGES. Its enemies do not all
 * appear at once: the roster is shuffled into a queue and each entry is
 *
 *   pending  ─(startsAt)─►  spawning  ─(activeAt)─►  active  ─(killed)─►  dead
 *
 * Pending entries are not objects yet. When one's start time comes it gets a
 * fixed spawn spot and becomes a `spawning` Enemy in `enemies`, inert until its
 * GameClock activation deadline (RUN.spawn). The composition never changes —
 * only the order, timing and spots are random.
 *
 * A wave is cleared only by a kill that leaves nothing pending, nothing
 * spawning and nothing active. A killed enemy stays in the roster, dead, so its
 * death animation plays out — nothing refills it. The next wave spawns once the
 * breather elapses; the old roster is destroyed at that moment. Clearing the
 * last wave of the last stage completes the run. Elapsed time never advances a
 * wave: progression is kills alone.
 *
 * It is also the one source of stage-scoped tuning for other systems — enemy
 * health pips here, the player's base auto cycle (AttackPacing) and enemy fire
 * (EnemyFirePressure) — all read from the current stage's STAGES row.
 */
export class WaveDirector implements AttackPacing, EnemyFirePressure {
  private readonly roster: Enemy[] = [];
  /** The rest of the current wave, soonest first. */
  private readonly pending: PendingArrival[] = [];
  private stageIndex = 0;
  private waveIndex = 0;
  private currentPhase: WavePhase = 'wave';
  /** GameClock time the current intermission ends. Only meaningful in 'intermission'. */
  private intermissionEndsAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly clock: GameClock,
    private readonly playerPos: () => { x: number; y: number },
  ) {
    validateStages();
    this.spawnWave();
  }

  // ------------------------------------------------------------- read-outs

  /** The current wave's arrived enemies: spawning, active, and dead ones still playing their death. */
  get enemies(): Enemy[] {
    return this.roster;
  }

  /** 1-based stage number. */
  get stage(): number {
    return this.stageIndex + 1;
  }

  get stageCount(): number {
    return STAGES.length;
  }

  /** 1-based wave number within the current stage. */
  get wave(): number {
    return this.waveIndex + 1;
  }

  get wavesInStage(): number {
    return this.stageDefinition.waves.length;
  }

  get phase(): WavePhase {
    return this.currentPhase;
  }

  get isWaveActive(): boolean {
    return this.currentPhase === 'wave';
  }

  get isRunComplete(): boolean {
    return this.currentPhase === 'complete';
  }

  /** Roster entries still waiting to begin arriving. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Enemies inside their arrival window: placed, but not yet in play. */
  get spawningCount(): number {
    return this.roster.filter((e) => e.spawning).length;
  }

  /** Enemies in play: targetable, damageable, moving and attacking. */
  get aliveCount(): number {
    return this.roster.filter((e) => e.active).length;
  }

  get deadCount(): number {
    return this.roster.filter((e) => e.dead).length;
  }

  /** Everything still standing between the player and a wave clear: pending + spawning + alive. */
  get enemiesRemaining(): number {
    return this.pending.length + this.roster.filter((e) => !e.dead).length;
  }

  /** During a breather, what comes next; null while fighting or once complete. */
  get nextTransition(): 'wave' | 'stage' | null {
    if (this.currentPhase !== 'intermission') return null;
    return this.isLastWaveOfStage ? 'stage' : 'wave';
  }

  get intermissionRemainingMs(): number {
    return this.currentPhase === 'intermission'
      ? Math.max(0, this.intermissionEndsAt - this.clock.now)
      : 0;
  }

  /** Waves fully cleared this run, including the one just finished. */
  get wavesCleared(): number {
    let cleared = 0;
    for (let s = 0; s < this.stageIndex; s++) cleared += STAGES[s].waves.length;
    return cleared + this.waveIndex + (this.currentPhase === 'wave' ? 0 : 1);
  }

  get wavesTotal(): number {
    return STAGES.reduce((sum, stage) => sum + stage.waves.length, 0);
  }

  get stageDefinition(): StageDefinition {
    return STAGES[this.stageIndex];
  }

  /** Health pips an archetype spawns with on the current stage. */
  pipsFor(archetype: EnemyArchetype): number {
    return this.stageDefinition.enemyPips[archetype];
  }

  /** AttackPacing: the player's base auto cycle for the current stage. */
  get baseAttackCooldownMs(): number {
    return this.stageDefinition.baseAttackCooldownMs;
  }

  /** EnemyFirePressure: 0..1 along the enemy projectile ramps. */
  get fireIntensity(): number {
    return this.stageDefinition.enemyFire;
  }

  private get isLastWaveOfStage(): boolean {
    return this.waveIndex === this.stageDefinition.waves.length - 1;
  }

  /** Nothing pending, nothing spawning, nothing alive. */
  private get isRosterExhausted(): boolean {
    return this.pending.length === 0 && this.roster.every((e) => e.dead);
  }

  // ---------------------------------------------------------------- loop

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    if (this.currentPhase === 'intermission' && nowMs >= this.intermissionEndsAt) {
      this.advance();
    }
    if (this.currentPhase === 'wave') this.beginDueArrivals(nowMs);

    // Each enemy activates itself at its own activeAt before its AI runs.
    for (const enemy of this.roster) enemy.update(deltaSeconds, nowMs, ctx);
    this.separate();
  }

  /**
   * Called by the scene when a kill is registered. The wave clears on the spot
   * only if that kill exhausted the roster — enemies still scheduled or
   * mid-arrival keep it going. Then the breather starts, or the run completes
   * if that was the final wave.
   */
  onEnemyKilled(enemy: Enemy, nowMs: number): void {
    if (this.currentPhase !== 'wave' || !this.roster.includes(enemy)) return;
    if (!this.isRosterExhausted) return;

    const finalStage = this.stageIndex === STAGES.length - 1;
    if (this.isLastWaveOfStage && finalStage) {
      this.currentPhase = 'complete';
      return;
    }

    this.currentPhase = 'intermission';
    this.intermissionEndsAt =
      nowMs + (this.isLastWaveOfStage ? RUN.interStageDelayMs : RUN.interWaveDelayMs);
  }

  /**
   * Skip the stagger: start every pending arrival now and activate everything
   * mid-arrival. The composition and spots are unchanged. Test / debug hook.
   */
  arriveAllNow(): void {
    const now = this.clock.now;
    for (const entry of this.pending) entry.startsAt = now;
    this.beginDueArrivals(now);
    for (const enemy of this.roster) {
      if (!enemy.spawning) continue;
      enemy.activeAt = now;
      enemy.lifecycle = 'active';
    }
  }

  // ------------------------------------------------------------- spawning

  /** After a breather: the next wave of this stage, or Wave 1 of the next. */
  private advance(): void {
    if (this.isLastWaveOfStage) {
      this.stageIndex++;
      this.waveIndex = 0;
    } else {
      this.waveIndex++;
    }
    this.spawnWave();
  }

  /**
   * Replace the previous (fully dead) roster with the current wave's authored
   * one, queued in a shuffled order. The first arrival begins immediately.
   */
  private spawnWave(): void {
    for (const enemy of this.roster) enemy.destroy();
    this.roster.length = 0;
    this.pending.length = 0;

    const { staggerMs } = RUN.spawn;
    const now = this.clock.now;
    const order = Phaser.Utils.Array.Shuffle(expandRoster(this.stageDefinition.waves[this.waveIndex]));
    let startsAt = now;
    order.forEach((archetype, i) => {
      if (i > 0) startsAt += Phaser.Math.Between(staggerMs.min, staggerMs.max);
      this.pending.push({ archetype, startsAt });
    });

    this.currentPhase = 'wave';
    this.beginDueArrivals(now);
  }

  /** Move every pending entry whose time has come onto the field, mid-arrival. */
  private beginDueArrivals(nowMs: number): void {
    while (this.pending.length > 0 && this.pending[0].startsAt <= nowMs) {
      const { archetype } = this.pending.shift()!;
      this.roster.push(this.spawnEnemy(archetype, RUN.spawn.manifestMs));
    }
  }

  /**
   * Build one enemy on a spot picked now and fixed for its arrival. With
   * `manifestMs` 0 it is active immediately.
   */
  private spawnEnemy(archetype: EnemyArchetype, manifestMs = 0): Enemy {
    const spec = ARCHETYPES[archetype];
    const spot = this.findSpawnSpot(spec.minSpawnDistance);
    const enemy = spec.create(this.scene, this.clock, spot.x, spot.y, this.pipsFor(archetype));
    if (manifestMs > 0) enemy.beginArrival(this.clock.now, manifestMs);
    return enemy;
  }

  /** Rejection sampling: away from the player, and not on top of another living or arriving enemy. */
  private findSpawnSpot(minPlayerDistance: number): { x: number; y: number } {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    const minX = margin;
    const maxX = ARENA.width - margin;
    const minY = margin;
    const maxY = ARENA.height - margin;
    const player = this.playerPos();

    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Phaser.Math.Between(minX, maxX);
      const y = Phaser.Math.Between(minY, maxY);

      if (Phaser.Math.Distance.Between(x, y, player.x, player.y) < minPlayerDistance) continue;

      const crowded = this.roster.some(
        (e) => !e.dead && Phaser.Math.Distance.Between(x, y, e.x, e.y) < e.radius * 4,
      );
      if (crowded) continue;

      return { x, y };
    }

    return { x: Phaser.Math.Between(minX, maxX), y: Phaser.Math.Between(minY, maxY) };
  }

  /**
   * Soft body-blocking so enemies do not stack into one ambiguous blob.
   * Heavier enemies shove lighter ones: the push is split by radius. Only
   * active enemies take part — an arriving enemy never moves.
   */
  private separate(): void {
    const list = this.roster;

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.active) continue;

      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.active) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius + 6;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist >= minDist) continue;

        const overlap = minDist - dist;
        const total = a.radius + b.radius;
        // Bigger bodies move less.
        const aShare = overlap * (b.radius / total);
        const bShare = overlap * (a.radius / total);
        a.x -= (dx / dist) * aShare;
        a.y -= (dy / dist) * aShare;
        b.x += (dx / dist) * bShare;
        b.y += (dy / dist) * bShare;
      }
    }
  }

  destroy(): void {
    for (const enemy of this.roster) enemy.destroy();
    this.roster.length = 0;
    this.pending.length = 0;
  }
}
