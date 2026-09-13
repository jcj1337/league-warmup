import Phaser from 'phaser';
import { ARENA, ENEMY_SCALING, ENEMY_SPAWN, PURSUER, TARGETS } from '../../config/balance';
import { Enemy, type EnemyArchetype, type EnemyContext } from '../entities/Enemy';
import { Target } from '../entities/Target';
import { Pursuer } from '../entities/Pursuer';
import type { GameClock } from './GameClock';
import type { DifficultyManager } from './DifficultyManager';

/**
 * How an archetype is built. Adding a third enemy means adding one entry here
 * and one weight row in ENEMY_SPAWN — nothing else in the codebase changes,
 * because every system downstream only knows about `Enemy`.
 */
interface ArchetypeSpec {
  /** Base HP before difficulty scaling. */
  baseHp(): number;
  create(scene: Phaser.Scene, clock: GameClock, x: number, y: number, hp: number): Enemy;
  /** Keep this much clear space from the player when spawning. */
  minSpawnDistance: number;
}

const ARCHETYPES: Record<EnemyArchetype, ArchetypeSpec> = {
  basic: {
    baseHp: () => TARGETS.maxHp,
    create: (scene, clock, x, y, hp) => new Target(scene, clock, x, y, hp),
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer,
  },
  pursuer: {
    baseHp: () => TARGETS.maxHp * PURSUER.baseHpMultiplier,
    create: (scene, clock, x, y, hp) => new Pursuer(scene, clock, x, y, hp),
    // Pursuers walk you down, so they get a wider berth on spawn.
    minSpawnDistance: TARGETS.minSpawnDistanceFromPlayer + 120,
  },
};

/** One enemy slot: the live enemy, plus when its replacement is due. */
interface Slot {
  enemy: Enemy;
  respawnAt: number | null;
}

/**
 * Owns the enemy roster: which archetypes exist, how many, what replaces them
 * when they die, and how tough they are at the current difficulty.
 *
 * Composition evolves through respawns — every time a slot refills, the
 * archetype is re-rolled against the current difficulty weights, so the mix
 * drifts toward Pursuers as the round escalates rather than switching abruptly.
 */
export class EnemyDirector {
  private readonly slots: Slot[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly clock: GameClock,
    private readonly difficulty: DifficultyManager,
    private readonly playerPos: () => { x: number; y: number },
  ) {
    for (let i = 0; i < TARGETS.count; i++) {
      // The opening is always basic targets, whatever the weights say.
      this.slots.push({ enemy: this.spawn('basic'), respawnAt: null });
    }
  }

  /** Live list handed to every combat system. */
  get enemies(): Enemy[] {
    return this.slots.map((s) => s.enemy);
  }

  /**
   * HP multiplier from difficulty: flat until `hpRampStartDifficulty`, then
   * +`hpPerDifficulty` per level, capped.
   */
  get hpMultiplier(): number {
    const level = this.difficulty.level;
    const over = Math.max(0, level - (ENEMY_SCALING.hpRampStartDifficulty - 1));
    return Math.min(ENEMY_SCALING.maxHpMultiplier, 1 + over * ENEMY_SCALING.hpPerDifficulty);
  }

  /** Archetype weights at the current difficulty, normalised for display/tests. */
  get spawnWeights(): Record<string, number> {
    const idx = Phaser.Math.Clamp(this.difficulty.level - 1, 0, 9);
    const raw: Record<string, number> = {};
    let total = 0;
    for (const [id, table] of Object.entries(ENEMY_SPAWN.weights)) {
      const w = table[idx] ?? 0;
      raw[id] = w;
      total += w;
    }
    if (total > 0) for (const id of Object.keys(raw)) raw[id] /= total;
    return raw;
  }

  update(deltaSeconds: number, nowMs: number, ctx: EnemyContext): void {
    for (const slot of this.slots) {
      slot.enemy.update(deltaSeconds, nowMs, ctx);

      // Dead and its replacement is due: swap in a freshly rolled archetype.
      if (slot.respawnAt !== null && nowMs >= slot.respawnAt) {
        slot.enemy.destroy();
        slot.enemy = this.spawn(this.rollArchetype());
        slot.respawnAt = null;
      }
    }

    this.separate();
  }

  /** Called by the scene when a kill is registered, to start the respawn clock. */
  onEnemyKilled(enemy: Enemy, nowMs: number): void {
    const slot = this.slots.find((s) => s.enemy === enemy);
    if (slot && slot.respawnAt === null) {
      slot.respawnAt = nowMs + TARGETS.respawnDelayMs;
    }
  }

  /** Weighted pick against the current difficulty row. */
  private rollArchetype(): EnemyArchetype {
    const weights = this.spawnWeights;
    let roll = Math.random();
    for (const [id, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) return id as EnemyArchetype;
    }
    return 'basic';
  }

  private spawn(archetype: EnemyArchetype): Enemy {
    const spec = ARCHETYPES[archetype];
    const hp = Math.round(spec.baseHp() * this.hpMultiplier);
    const spot = this.findSpawnSpot(spec.minSpawnDistance);
    return spec.create(this.scene, this.clock, spot.x, spot.y, hp);
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

      const crowded = this.slots.some(
        (s) =>
          s.enemy.active &&
          Phaser.Math.Distance.Between(x, y, s.enemy.x, s.enemy.y) < s.enemy.radius * 4,
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
    const list = this.slots.map((s) => s.enemy);

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
    for (const slot of this.slots) slot.enemy.destroy();
    this.slots.length = 0;
  }
}
