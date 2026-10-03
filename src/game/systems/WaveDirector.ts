import Phaser from 'phaser';
import {
  ARENA,
  ENDLESS,
  ENEMIES,
  MAGUS,
  PURSUER,
  RUN,
  STAGES,
  STAGE_RAMPS,
  TARGETS,
  type EnemyEntry,
  type WaveRoster,
} from '../../config/balance';
import { Enemy, type EnemyArchetype, type EnemyContext } from '../entities/Enemy';
import { Target } from '../entities/Target';
import { Pursuer } from '../entities/Pursuer';
import { Magus } from '../entities/Magus';
import { mulberry32 } from '../art/pixel';
import type { GameClock } from './GameClock';
import type { AttackPacing } from './AttackSystem';
import type { EnemyFirePressure } from './EnemyProjectileSystem';
import { scaled, stageDifficulty, type StageDifficulty } from './Difficulty';

/**
 * How a mob is built. Its tuning (cost, unlock stage, pips…) lives in the
 * ENEMIES registry in balance.ts; this is only the class and spawn spacing.
 * Adding a mob: an ENEMIES entry, its entity + view, and one line here.
 */
interface ArchetypeSpec {
  /** `stage` is 1-based: mobs unlock behaviours (spit, dash) and scale stats by stage. */
  create(scene: Phaser.Scene, clock: GameClock, x: number, y: number, pips: number, stage: number): Enemy;
  /** Body radius, for packing spawn spots. */
  radius: number;
  /** Keep this much clear space from the player when spawning. */
  minSpawnDistance: number;
}

const ARCHETYPES: Record<EnemyArchetype, ArchetypeSpec> = {
  basic: {
    create: (scene, clock, x, y, pips, stage) => new Target(scene, clock, x, y, pips, stage),
    radius: TARGETS.radius,
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer,
  },
  pursuer: {
    create: (scene, clock, x, y, pips, stage) => new Pursuer(scene, clock, x, y, pips, stage),
    radius: PURSUER.radius,
    // Pursuers walk you down, so they get a wider berth on spawn.
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer + 120,
  },
  magus: {
    create: (scene, clock, x, y, pips, stage) => new Magus(scene, clock, x, y, pips, stage),
    radius: MAGUS.radius,
    // An artillery caster: it arrives roughly where it wants to stand.
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer + 160,
  },
};

/** Every mob id, in registry order (ties and listings follow it). */
const IDS = Object.keys(ENEMIES) as EnemyArchetype[];
const entry = (id: EnemyArchetype): EnemyEntry => ENEMIES[id];

/** Where the run is: fighting a wave, or in the breather after one. The run ends only on death. */
export type WavePhase = 'wave' | 'intermission';

/** A roster entry that has not started arriving yet. */
interface PendingArrival {
  archetype: EnemyArchetype;
  /** GameClock time its arrival begins. */
  startsAt: number;
  /** Arrivals sharing a pack spawn around one anchor spot. */
  pack: number;
}

/** What a wave actually fields, per mob. */
export type ScaledRoster = Record<EnemyArchetype, number>;

/** A roster as a flat list of mobs, in registry order. */
function expandRoster(roster: WaveRoster): EnemyArchetype[] {
  const out: EnemyArchetype[] = [];
  for (const id of IDS) {
    for (let i = 0; i < (roster[id] ?? 0); i++) out.push(id);
  }
  return out;
}

/** Authoring guard: fail loudly on a malformed table or registry instead of playing it. */
function validateConfig(): void {
  STAGES.forEach((stage, s) => {
    if (stage.waves.length === 0) throw new Error(`STAGES[${s}] defines no waves`);
    stage.waves.forEach((wave, w) => {
      if (expandRoster(wave).length < 1) throw new Error(`STAGES[${s}].waves[${w}] fields no enemies`);
    });
  });
  for (const id of IDS) {
    const e = entry(id);
    if (!(e.cost > 0) || e.weight < 0 || !(e.maxShare > 0) || !(e.unlockStage >= 1)) {
      throw new Error(`ENEMIES.${id} needs cost > 0, weight >= 0, maxShare > 0 and unlockStage >= 1`);
    }
    if (!ARCHETYPES[id]) throw new Error(`ENEMIES.${id} has no class registered in WaveDirector.ARCHETYPES`);
  }
  if (!(ENDLESS.wavesPerStage >= 1)) throw new Error('ENDLESS.wavesPerStage must be at least 1');
}

/** A per-stage ramp value: index stage - 1, the last value holding past the end. */
function ramp(values: readonly number[], stage: number): number {
  return values[Math.min(stage, values.length) - 1];
}

/**
 * Stage / wave progression, and the enemies of the wave being fought. The run
 * is endless: it ends only when the player dies.
 *
 *   spawnWave() ─► staggered arrivals + fight ─► last enemy killed ─► intermission ─┐
 *        ▲                                                                          │
 *        └───────────────── next wave, or Wave 1 of the next stage ◄────────────────┘
 *
 * Stages 1..STAGES.length are hand-written; every later stage is generated
 * (ENDLESS.wavesPerStage waves each, rosters bought from a budget — see
 * rosterFor). Either way a wave is a finite roster, shuffled into a queue and
 * grouped into packs:
 *
 *   pending  ─(startsAt)─►  spawning  ─(activeAt)─►  active  ─(killed)─►  dead
 *
 * Pending entries are not objects yet. When one's start time comes — and the
 * field has room under DIFFICULTY.maxAlive — it gets a fixed spawn spot (near
 * its pack's anchor) and becomes a `spawning` Enemy in `enemies`, inert until
 * its GameClock activation deadline (RUN.spawn).
 *
 * A wave is cleared only by a kill that leaves nothing pending, nothing
 * spawning and nothing active. A killed enemy stays in the roster, dead, so its
 * death animation plays out — nothing refills it. The next wave spawns once the
 * breather elapses; the old roster is destroyed at that moment. Elapsed time
 * never advances a wave: progression is kills alone.
 *
 * It is also the one source of stage-scoped tuning for other systems — enemy
 * health pips, the player's base auto cycle (AttackPacing) and enemy fire
 * (EnemyFirePressure).
 */
export class WaveDirector implements AttackPacing, EnemyFirePressure {
  private readonly roster: Enemy[] = [];
  /** The rest of the current wave, soonest first. */
  private readonly pending: PendingArrival[] = [];
  /** Where each pack of the current wave lands, once its first member arrives. */
  private readonly packAnchors = new Map<number, { x: number; y: number }>();
  private stageIndex = 0;
  private waveIndex = 0;
  private currentPhase: WavePhase = 'wave';
  /** GameClock time the current intermission ends. Only meaningful in 'intermission'. */
  private intermissionEndsAt = 0;
  /** Seeds generated rosters: fixed for the run, so a generated wave always fields the same mobs. */
  private readonly seed = Math.floor(Math.random() * 0x7fffffff);
  private readonly generated = new Map<string, ScaledRoster>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly clock: GameClock,
    private readonly playerPos: () => { x: number; y: number },
    private readonly callbacks: { onStageCleared?: () => void } = {},
  ) {
    validateConfig();
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

  /** Stages with a hand-written table; every later stage is generated. */
  get authoredStages(): number {
    return STAGES.length;
  }

  /** 1-based wave number within the current stage. */
  get wave(): number {
    return this.waveIndex + 1;
  }

  get wavesInStage(): number {
    return this.wavesIn(this.stageIndex);
  }

  /** How many waves a stage has: its table row's, or ENDLESS.wavesPerStage once generated. */
  wavesIn(stageIndex: number): number {
    return STAGES[stageIndex]?.waves.length ?? ENDLESS.wavesPerStage;
  }

  get phase(): WavePhase {
    return this.currentPhase;
  }

  get isWaveActive(): boolean {
    return this.currentPhase === 'wave';
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

  /** During a breather, what comes next; null while fighting. */
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
    for (let s = 0; s < this.stageIndex; s++) cleared += this.wavesIn(s);
    return cleared + this.waveIndex + (this.currentPhase === 'wave' ? 0 : 1);
  }

  /** Every scaled number for the current stage (see Difficulty). */
  get difficulty(): StageDifficulty {
    return stageDifficulty(this.stage);
  }

  /** The mobs that unlock on a 1-based stage (their first appearance). */
  unlocksOn(stage: number): EnemyArchetype[] {
    return IDS.filter((id) => entry(id).unlockStage === stage);
  }

  /**
   * The roster a wave fields.
   *
   * Hand-written stages: the authored MIX from STAGES, grown to the stage's
   * DIFFICULTY.waveSize (never below the authored size), shared out by largest
   * remainder so the counts sum exactly, then each mob held to its maxPerWave
   * (never below its authored count), the excess going to the first mob.
   *
   * Generated stages: see generateRoster(). Both are deterministic for the
   * run, so the same wave always fields the same roster.
   */
  rosterFor(stageIndex: number, waveIndex: number): ScaledRoster {
    const authored = STAGES[stageIndex]?.waves[waveIndex];
    if (!authored) return this.generateRoster(stageIndex, waveIndex);

    const authoredTotal = IDS.reduce((n, id) => n + (authored[id] ?? 0), 0);
    const total = Math.max(authoredTotal, stageDifficulty(stageIndex + 1).waveSize);

    const exact = IDS.map((id) => ((authored[id] ?? 0) * total) / authoredTotal);
    const counts = exact.map(Math.floor);
    let left = total - counts.reduce((a, b) => a + b, 0);
    // Stable sort: ties go to the mob listed first (basic).
    const byRemainder = IDS.map((_, i) => i).sort((a, b) => (exact[b] - counts[b]) - (exact[a] - counts[a]));
    for (const i of byRemainder) {
      if (left <= 0) break;
      counts[i]++;
      left--;
    }

    const roster = Object.fromEntries(IDS.map((id, i) => [id, counts[i]])) as ScaledRoster;
    for (const id of IDS) {
      const cap = Math.max(this.perWaveCap(id, stageIndex + 1), authored[id] ?? 0);
      if (roster[id] > cap) {
        roster[IDS[0]] += roster[id] - cap;
        roster[id] = cap;
      }
    }
    return roster;
  }

  /**
   * A generated wave, bought from a budget of DIFFICULTY.waveSize points:
   *   1. a mob's first appearance — Wave 1 of its unlockStage — fields exactly
   *      one of it, first;
   *   2. then mobs are drawn by weight among those unlocked whose cost still
   *      fits the budget, each held to its maxShare of the budget and its
   *      maxPerWave, until nothing fits.
   * Heavier mobs cost more, so a wave of them fields fewer bodies. Seeded per
   * run and wave, so the roster is fixed once rolled.
   */
  private generateRoster(stageIndex: number, waveIndex: number): ScaledRoster {
    const key = `${stageIndex}:${waveIndex}`;
    const cached = this.generated.get(key);
    if (cached) return cached;

    const stage = stageIndex + 1;
    const rand = mulberry32(this.seed ^ (stage * 7919 + waveIndex * 104729));
    let budget = stageDifficulty(stage).waveSize;
    const roster = Object.fromEntries(IDS.map((id) => [id, 0])) as ScaledRoster;

    const debuts = waveIndex === 0 ? this.unlocksOn(stage) : [];
    for (const id of debuts) {
      roster[id] = 1;
      budget -= entry(id).cost;
    }
    const cap = (id: EnemyArchetype) => Math.min(
      Math.max(1, Math.floor(entry(id).maxShare * stageDifficulty(stage).waveSize / entry(id).cost)),
      this.perWaveCap(id, stage),
    );

    for (;;) {
      const options = IDS.filter((id) => !debuts.includes(id) && entry(id).unlockStage <= stage
        && entry(id).weight > 0 && entry(id).cost <= budget + 1e-9 && roster[id] < cap(id));
      if (options.length === 0) break;
      const total = options.reduce((n, id) => n + entry(id).weight, 0);
      let pick = rand() * total;
      const id = options.find((o) => (pick -= entry(o).weight) < 0) ?? options[options.length - 1];
      roster[id]++;
      budget -= entry(id).cost;
    }
    if (IDS.every((id) => roster[id] === 0)) roster[IDS[0]] = 1;

    this.generated.set(key, roster);
    return roster;
  }

  /**
   * Everything one stage plays with, hand-written or generated: health pips
   * per mob, the player's base auto cycle, edge-fire intensity and the rosters
   * its waves field. A readout for the console and tests.
   */
  describeStage(stageIndex: number): {
    stage: number;
    generated: boolean;
    enemyPips: Record<EnemyArchetype, number>;
    baseAttackCooldownMs: number;
    enemyFire: number;
    waves: ScaledRoster[];
  } {
    const stage = stageIndex + 1;
    return {
      stage,
      generated: stageIndex >= STAGES.length,
      enemyPips: Object.fromEntries(IDS.map((id) => [id, this.pipsFor(id, stage)])) as Record<EnemyArchetype, number>,
      baseAttackCooldownMs: ramp(STAGE_RAMPS.baseAttackCooldownMs, stage),
      enemyFire: ramp(STAGE_RAMPS.enemyFire, stage),
      waves: Array.from({ length: this.wavesIn(stageIndex) }, (_, w) => this.rosterFor(stageIndex, w)),
    };
  }

  /** A mob's per-wave cap on a stage: its maxPerWave curve (rounded down), or no cap. */
  private perWaveCap(id: EnemyArchetype, stage: number): number {
    const curve = entry(id).maxPerWave;
    return curve ? Math.floor(scaled(curve, stage)) : Number.POSITIVE_INFINITY;
  }

  /** Health pips a mob spawns with on a stage: `start`, +1 every `every` stages, capped. */
  pipsFor(archetype: EnemyArchetype, stage = this.stage): number {
    const p = entry(archetype).pips;
    return Math.min(p.max, p.start + Math.floor((stage - 1) / p.every));
  }

  /** AttackPacing: the player's base auto cycle for the current stage. */
  get baseAttackCooldownMs(): number {
    return ramp(STAGE_RAMPS.baseAttackCooldownMs, this.stage);
  }

  /** EnemyFirePressure: 0..1 along the enemy projectile ramps. */
  get fireIntensity(): number {
    return ramp(STAGE_RAMPS.enemyFire, this.stage);
  }

  private get isLastWaveOfStage(): boolean {
    return this.waveIndex === this.wavesInStage - 1;
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
   * mid-arrival keep it going. Then the breather starts.
   */
  onEnemyKilled(enemy: Enemy, nowMs: number): void {
    if (this.currentPhase !== 'wave' || !this.roster.includes(enemy)) return;
    if (!this.isRosterExhausted) return;

    if (this.isLastWaveOfStage) this.callbacks.onStageCleared?.();
    this.currentPhase = 'intermission';
    this.intermissionEndsAt =
      nowMs + (this.isLastWaveOfStage ? RUN.interStageDelayMs : RUN.interWaveDelayMs);
  }

  /**
   * Skip the stagger: start every pending arrival now and activate everything
   * mid-arrival, ignoring the maxAlive cap. The composition and spots are
   * unchanged. Test / debug hook.
   */
  arriveAllNow(): void {
    const now = this.clock.now;
    for (const entry of this.pending) entry.startsAt = now;
    this.beginDueArrivals(now, Number.POSITIVE_INFINITY);
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
   * Replace the previous (fully dead) roster with the current wave's, queued
   * in a shuffled order and grouped into packs of DIFFICULTY.packSize. Packs
   * are spaced so the average arrival rate stays DIFFICULTY.arrivalGapMs per
   * enemy; members of a pack follow each other closely. The first arrival
   * begins immediately.
   */
  private spawnWave(): void {
    for (const enemy of this.roster) enemy.destroy();
    this.roster.length = 0;
    this.pending.length = 0;
    this.packAnchors.clear();

    const now = this.clock.now;
    const { arrivalGapMs: gap, packSize } = this.difficulty;
    const jitter = RUN.spawn.gapJitter;
    const order = Phaser.Utils.Array.Shuffle(expandRoster(this.rosterFor(this.stageIndex, this.waveIndex)));
    let packStart = now;
    order.forEach((archetype, i) => {
      const pack = Math.floor(i / packSize);
      const inPack = i % packSize;
      if (i > 0 && inPack === 0) packStart += gap * packSize * Phaser.Math.FloatBetween(1 - jitter, 1 + jitter);
      this.pending.push({ archetype, startsAt: packStart + inPack * RUN.spawn.packMemberGapMs, pack });
    });

    this.currentPhase = 'wave';
    this.beginDueArrivals(now);
  }

  /**
   * Move every pending entry whose time has come onto the field, mid-arrival —
   * as long as there is room under the stage's DIFFICULTY.maxAlive. An entry
   * that finds the field full waits, and arrives as soon as a slot frees up.
   */
  private beginDueArrivals(nowMs: number, cap = this.difficulty.maxAlive): void {
    let onField = this.roster.filter((e) => !e.dead).length;
    while (this.pending.length > 0 && this.pending[0].startsAt <= nowMs && onField < cap) {
      onField++;
      const { archetype, pack } = this.pending.shift()!;
      this.roster.push(this.spawnEnemy(archetype, RUN.spawn.manifestMs, pack));
    }
  }

  /**
   * Build one enemy on a spot picked now and fixed for its arrival: next to
   * its pack's anchor when the pack already has one, otherwise a fresh spot
   * that becomes the anchor. With `manifestMs` 0 it is active immediately.
   */
  private spawnEnemy(archetype: EnemyArchetype, manifestMs = 0, pack?: number): Enemy {
    const spec = ARCHETYPES[archetype];
    const anchor = pack === undefined ? undefined : this.packAnchors.get(pack);
    const spot = (anchor && this.findSpotNear(anchor, spec)) ?? this.findSpawnSpot(spec.minSpawnDistance);
    if (pack !== undefined && !anchor) this.packAnchors.set(pack, spot);
    const enemy = spec.create(this.scene, this.clock, spot.x, spot.y, this.pipsFor(archetype), this.stage);
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
   * A spot beside a pack's anchor: in the arena, clear of every other body,
   * and still well away from the player. Null if none is found quickly.
   */
  private findSpotNear(anchor: { x: number; y: number }, spec: ArchetypeSpec): { x: number; y: number } | null {
    const margin = ARENA.padding + TARGETS.edgeMargin;
    const player = this.playerPos();
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.FloatBetween(40, 110);
      const x = anchor.x + Math.cos(a) * d;
      const y = anchor.y + Math.sin(a) * d;
      if (x < margin || x > ARENA.width - margin || y < margin || y > ARENA.height - margin) continue;
      if (Phaser.Math.Distance.Between(x, y, player.x, player.y) < spec.minSpawnDistance * 0.75) continue;
      const crowded = this.roster.some(
        (e) => !e.dead && Phaser.Math.Distance.Between(x, y, e.x, e.y) < e.radius + spec.radius + 10,
      );
      if (!crowded) return { x, y };
    }
    return null;
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
