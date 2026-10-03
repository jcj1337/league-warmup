import Phaser from 'phaser';
import { Projectile } from '../entities/Projectile';
import { Fx } from '../view/Fx';
import { HostileSpellView } from '../view/HostileSpellView';
import { PROJECTILE_ART } from '../view/projectileArt';
import type { ProjectileArt } from '../view/ProjectileView';
import { THEME } from '../../config/theme';
import type { Player } from '../entities/Player';
import type { EnemyArchetype } from '../entities/Enemy';

/** A line that lands `delayMs` after it is placed (Magus Lance). */
export interface LineSpell {
  /** Who cast it, for the damage log. */
  source: EnemyArchetype;
  /** Where the line starts and which way it points. */
  x: number;
  y: number;
  angle: number;
  length: number;
  halfWidth: number;
  delayMs: number;
  damage: number;
}

/** A circle that lands `delayMs` after it is placed (Magus Eye, Rite). */
export interface CircleSpell {
  /** Who cast it, for the damage log. */
  source: EnemyArchetype;
  x: number;
  y: number;
  radius: number;
  delayMs: number;
  damage: number;
  /** Optional sweet spot: the player's CENTRE inside `radius` takes this instead. */
  centre?: { radius: number; damage: number; slowFraction: number; slowMs: number };
}

/** A straight, visible projectile that only deals damage (basic spit). */
export interface GlobSpell {
  /** Who fired it, for the damage log. */
  source: EnemyArchetype;
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  range: number;
  damage: number;
}

/** A shot that also stuns on contact, longer the farther it flew (Magus Orb). */
export interface OrbSpell extends GlobSpell {
  stunMinMs: number;
  stunMaxMs: number;
}

/** What an enemy may cast. Handed to enemy AI through EnemyContext.spells. */
export interface HostileSpellSink {
  castLine(spell: LineSpell, nowMs: number): void;
  castCircle(spell: CircleSpell, nowMs: number): void;
  fireOrb(spell: OrbSpell): void;
  fireGlob(spell: GlobSpell): void;
}

export type ZoneShape = ({ kind: 'line' } & LineSpell) | ({ kind: 'circle' } & CircleSpell);

/** A placed zone and its deadline. Read by HostileSpellView. */
export type SpellZone = ZoneShape & { placedAt: number; resolveAt: number };

interface LiveShot {
  missile: Projectile;
  spell: GlobSpell;
  /** Orbs only: the stun range, by distance flown. */
  stun?: { minMs: number; maxMs: number };
}

interface HostileSpellCallbacks {
  onPlayerHit: (damage: number, source: EnemyArchetype) => void;
  onPlayerStunned: (ms: number) => void;
  onPlayerSlowed: (fraction: number, ms: number) => void;
}

/**
 * Every hostile spell an enemy has cast and that has not landed yet: delayed
 * ground zones, and shots in flight (Magus orbs, basic spit).
 *
 * Spells live here, not on their caster, so that a zone already placed still
 * lands after the caster dies — only a spell still being CHARGED dies with it.
 * Zones resolve exactly at their GameClock deadline: the player is hit only if
 * they are inside the shape at that instant, so walking out during the
 * telegraph is always the counterplay.
 *
 * Wave boundaries follow the edge-fire rule: once the wave is cleared,
 * everything still pending fizzles, so a breather can never hurt.
 */
export class HostileSpellSystem implements HostileSpellSink {
  readonly zones: SpellZone[] = [];
  private readonly shots: LiveShot[] = [];
  private readonly view: HostileSpellView;
  private now = 0;

  /** Readouts for tests: zones resolved, and how many caught the player. */
  public zonesResolved = 0;
  public zonesHit = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly wave: { readonly isWaveActive: boolean },
    private readonly callbacks: HostileSpellCallbacks,
  ) {
    this.view = new HostileSpellView(scene);
  }

  get orbCount(): number {
    return this.shots.filter((s) => s.stun).length;
  }

  get globCount(): number {
    return this.shots.filter((s) => !s.stun).length;
  }

  // ------------------------------------------------------------ sink

  castLine(spell: LineSpell, nowMs: number): void {
    this.zones.push({ kind: 'line', ...spell, placedAt: nowMs, resolveAt: nowMs + spell.delayMs });
  }

  castCircle(spell: CircleSpell, nowMs: number): void {
    this.zones.push({ kind: 'circle', ...spell, placedAt: nowMs, resolveAt: nowMs + spell.delayMs });
  }

  fireOrb(spell: OrbSpell): void {
    this.shots.push({
      missile: this.launch(spell, PROJECTILE_ART.orb),
      spell,
      stun: { minMs: spell.stunMinMs, maxMs: spell.stunMaxMs },
    });
  }

  fireGlob(spell: GlobSpell): void {
    this.shots.push({ missile: this.launch(spell, PROJECTILE_ART.glob), spell });
  }

  private launch(spell: GlobSpell, art: ProjectileArt): Projectile {
    return new Projectile(this.scene, {
      x: spell.x,
      y: spell.y,
      angle: spell.angle,
      speed: spell.speed,
      radius: spell.radius,
      damage: spell.damage,
      team: 'enemy',
      maxRange: spell.range,
      art,
    });
  }

  // ------------------------------------------------------------ frame

  update(deltaSeconds: number, nowMs: number): void {
    this.now = nowMs;
    if (!this.wave.isWaveActive) {
      if (this.zones.length > 0 || this.shots.length > 0) this.clear();
      return;
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (nowMs < zone.resolveAt) continue;
      this.zones.splice(i, 1);
      this.resolve(zone);
    }

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const { missile, spell, stun } = this.shots[i];
      missile.update(deltaSeconds);
      if (missile.alive && missile.hits(this.player.x, this.player.y, this.player.radius)) {
        this.callbacks.onPlayerHit(spell.damage, spell.source);
        if (stun) {
          const t = Phaser.Math.Clamp(missile.distanceTravelled / spell.range, 0, 1);
          this.callbacks.onPlayerStunned(Phaser.Math.Linear(stun.minMs, stun.maxMs, t));
          Fx.of(this.scene).arcaneBurst(missile.x, missile.y, spell.radius * 2.5);
        } else {
          Fx.of(this.scene).hit(missile.x, missile.y, THEME.basic.burst);
        }
        missile.kill();
      }
      if (!missile.alive) this.shots.splice(i, 1);
    }

    this.view.draw(this.zones, nowMs);
  }

  /** The zone's deadline: is the player inside it right now? */
  private resolve(zone: SpellZone): void {
    this.zonesResolved++;
    const px = this.player.x;
    const py = this.player.y;
    const pr = this.player.radius;
    const fx = Fx.of(this.scene);

    if (zone.kind === 'line') {
      fx.arcaneBeam(zone.x, zone.y, zone.angle, zone.length);
      if (distanceToSegment(px, py, zone) <= zone.halfWidth + pr) {
        this.zonesHit++;
        this.callbacks.onPlayerHit(zone.damage, zone.source);
      }
      return;
    }

    fx.arcaneBurst(zone.x, zone.y, zone.radius);
    const dist = Math.hypot(px - zone.x, py - zone.y);
    if (dist > zone.radius + pr) return;
    this.zonesHit++;
    const centre = zone.centre;
    if (centre && dist <= centre.radius) {
      this.callbacks.onPlayerHit(centre.damage, zone.source);
      this.callbacks.onPlayerSlowed(centre.slowFraction, centre.slowMs);
    } else {
      this.callbacks.onPlayerHit(zone.damage, zone.source);
    }
  }

  /** Drop everything without resolving it (wave clear, restart). */
  clear(): void {
    this.zones.length = 0;
    for (const { missile } of this.shots) missile.kill();
    this.shots.length = 0;
    this.view.draw(this.zones, this.now);
  }
}

/** Distance from a point to a line spell's centre segment. */
function distanceToSegment(px: number, py: number, line: LineSpell): number {
  const dx = Math.cos(line.angle);
  const dy = Math.sin(line.angle);
  const along = Phaser.Math.Clamp((px - line.x) * dx + (py - line.y) * dy, 0, line.length);
  return Math.hypot(px - (line.x + dx * along), py - (line.y + dy * along));
}
