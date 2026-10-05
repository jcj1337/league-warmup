import { DIFFICULTY, ENEMIES, type Mode } from '../../config/balance';
import type { DamageKind, Enemy, EnemyArchetype } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { RunEvents } from '../RunEvents';
import type { GameClock } from './GameClock';
import type { Progression } from './Progression';
import type { ScoreSystem } from './ScoreSystem';
import type { ClearedWave, WaveDirector } from './WaveDirector';

/**
 * The hit funnel: every pip an enemy loses and every HP the player loses
 * passes through here once, so score, kill tallies, XP, the wave's
 * bookkeeping and the run log can never disagree about what happened.
 *
 * It decides nothing visual. Each outcome is emitted on the run's events, and
 * the presentation (kill gold, the level-up ring, the hit shake) listens.
 */
export class Combat {
  constructor(
    private readonly clock: GameClock,
    private readonly events: RunEvents,
    private readonly player: Player,
    private readonly scoring: ScoreSystem,
    private readonly director: WaveDirector,
    private readonly progression: Progression,
    private readonly mode: Mode,
  ) {}

  /**
   * A pip-removing hit landed, AFTER the enemy has already lost its pip:
   * autos and ability pips. Emitted so a kit can react (Magic Boy's W mark
   * detonates on the next counted hit) without this knowing any kit.
   */
  hit(target: Enemy, killed: boolean): void {
    this.scoring.addHit();
    this.events.emit('hit', { target, killed });
    if (killed) this.kill(target);
  }

  /** A kit's own score award (Magic Boy's E), × the stage multiplier like every award. */
  bonus(points: number): void {
    const awarded = this.scoring.addKitBonus(points, this.director.stage);
    if (awarded > 0) this.events.emit('kitBonus', { points: awarded });
  }

  /**
   * Every kill, whatever landed it: score and kill tallies (per archetype, so
   * a Pursuer is worth more), the wave's bookkeeping, and the kill's XP.
   */
  kill(target: Enemy): void {
    const points = this.scoring.addKill(target.archetype, target.scoreMultiplier, this.director.stage);
    this.director.onEnemyKilled(target, this.clock.now);
    this.events.emit('kill', { target, points });
    if (this.progression.addXp(ENEMIES[target.archetype].xp, this.clock.now) > 0) {
      this.events.emit('levelUp', { level: this.progression.level });
    }
  }

  /**
   * Damage from an enemy, scaled by the stage: attacks (swings, spit, Magus
   * spells) by DIFFICULTY.damage, body contact by DIFFICULTY.contactDamage.
   * Contact is logged as its own source ('basicContact', …). Edge fire has
   * its own ramp and calls playerHit() directly.
   */
  enemyHit(damage: number, source: EnemyArchetype, kind: DamageKind = 'attack'): void {
    const diff = this.director.difficulty;
    const mult = kind === 'contact' ? diff.contactDamage : diff.damage;
    this.playerHit(Math.round(damage * mult), kind === 'contact' ? `${source}Contact` : source);
  }

  /**
   * Every hit on the player lands here, tagged with its source for the run
   * log, and is multiplied by the mode (Mode.damageMultiplier) whatever dealt it.
   */
  playerHit(damage: number, source: string): void {
    const hpBefore = this.player.hp;
    const taken = this.player.takeDamage(damage * this.mode.damageMultiplier, this.clock.now);
    if (taken <= 0) return;
    // Log the HP actually lost: overkill on the final hit is not damage taken.
    const lethal = !this.player.isAlive;
    this.scoring.addDamageTaken(source ?? 'unknown', hpBefore - this.player.hp, lethal);
    this.scoring.addProjectileHit();
    this.events.emit('playerHit', { damage: hpBefore - this.player.hp, source, lethal });
  }

  /** A wave was cleared: its speed bonus (SCORE.waveClear). */
  waveCleared(wave: ClearedWave): void {
    const points = this.scoring.addWaveClear(wave.enemies, wave.elapsedMs, wave.parMs, wave.stage);
    this.events.emit('waveCleared', { ...wave, points });
  }

  /**
   * A stage was cleared: the HP bonus for what you finished it with (before
   * the heal) and the mode's flat bonus, then back to full HP
   * (DIFFICULTY.stageClearHeal) for the next.
   */
  stageCleared(): void {
    const stage = this.director.stage;
    const { points, flawless } = this.scoring.addStageClear(this.player.hp, stage);
    const bonus = this.scoring.addStageClearBonus(this.mode.stageClearBonus, stage);
    this.scoring.startStage();
    const healed = this.player.heal(Math.round(this.player.maxHp * DIFFICULTY.stageClearHeal));
    this.events.emit('stageCleared', { stage, points, bonus, flawless, healed });
  }
}
