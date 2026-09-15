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
};

/** Where the run is: fighting a wave, in the breather after one, or finished. */
export type WavePhase = 'wave' | 'intermission' | 'complete';

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
 *   spawnWave() ─► fight ─► last enemy killed ─► intermission (GameClock) ─┐
 *        ▲                                                                 │
 *        └──────────── next wave, or Wave 1 of the next stage ◄────────────┘
 *
 * Every wave is a finite, authored roster from STAGES. A killed enemy stays in
 * the roster, inactive, so its death animation plays out — nothing refills it.
 * The next wave spawns only after every enemy of this one is dead AND the
 * breather has elapsed; the old roster is destroyed at that moment. Clearing
 * the last wave of the last stage completes the run. Elapsed time never
 * advances anything: progression is kills alone.
 *
 * It is also the one source of stage-scoped tuning for other systems — enemy
 * health pips here, the player's base auto cycle (AttackPacing) and enemy fire
 * (EnemyFirePressure) — all read from the current stage's STAGES row.
 */
export class WaveDirector implements AttackPacing, EnemyFirePressure {
  private readonly roster: Enemy[] = [];
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

  /** The current wave's enemies, including ones still playing their death. */
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

  get enemiesRemaining(): number {
    return this.roster.filter((e) => e.active).length;
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

  // ---------------------------------------------------------------- loop

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    if (this.currentPhase === 'intermission' && nowMs >= this.intermissionEndsAt) {
      this.advance();
    }

    for (const enemy of this.roster) enemy.update(deltaSeconds, nowMs, ctx);
    this.separate();
  }

  /**
   * Called by the scene when a kill is registered. Killing the last living
   * enemy of the wave clears it on the spot: the breather starts now, or the
   * run completes if that was the final wave.
   */
  onEnemyKilled(enemy: Enemy, nowMs: number): void {
    if (this.currentPhase !== 'wave' || !this.roster.includes(enemy)) return;
    if (this.roster.some((e) => e.active)) return;

    const finalStage = this.stageIndex === STAGES.length - 1;
    if (this.isLastWaveOfStage && finalStage) {
      this.currentPhase = 'complete';
      return;
    }

    this.currentPhase = 'intermission';
    this.intermissionEndsAt =
      nowMs + (this.isLastWaveOfStage ? RUN.interStageDelayMs : RUN.interWaveDelayMs);
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

  /** Replace the previous (fully dead) roster with the current wave's authored one. */
  private spawnWave(): void {
    for (const enemy of this.roster) enemy.destroy();
    this.roster.length = 0;

    const wave = this.stageDefinition.waves[this.waveIndex];
    for (const archetype of expandRoster(wave)) {
      this.roster.push(this.spawnEnemy(archetype));
    }
    this.currentPhase = 'wave';
  }

  private spawnEnemy(archetype: EnemyArchetype): Enemy {
    const spec = ARCHETYPES[archetype];
    const spot = this.findSpawnSpot(spec.minSpawnDistance);
    return spec.create(this.scene, this.clock, spot.x, spot.y, this.pipsFor(archetype));
  }

  /** Rejection sampling: away from the player, and not on top of another enemy. */
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
        (e) => e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < e.radius * 4,
      );
      if (crowded) continue;

      return { x, y };
    }

    return { x: Phaser.Math.Between(minX, maxX), y: Phaser.Math.Between(minY, maxY) };
  }

  /**
   * Soft body-blocking so enemies do not stack into one ambiguous blob.
   * Heavier enemies shove lighter ones: the push is split by radius.
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
  }
}
