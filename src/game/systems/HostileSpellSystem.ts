import Phaser from 'phaser';
import { Projectile } from '../entities/Projectile';
import { Fx } from '../view/Fx';
import { HostileSpellView } from '../view/HostileSpellView';
import { PROJECTILE_ART } from '../view/projectileArt';
import type { ProjectileArt } from '../view/ProjectileView';
import { THEME } from '../../config/theme';
import type { Player } from '../entities/Player';
import type { Enemy, EnemyArchetype } from '../entities/Enemy';

/** Telegraph colouring: the Magus's arcane gold (default) or the Sovereign's void lavender. */
export type SpellStyle = 'arcane' | 'void';

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
  style?: SpellStyle;
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
  /** Optional slow on any hit (not just the sweet spot). */
  slow?: { fraction: number; ms: number };
  /** Leave a Dark Sphere where it lands (Sovereign Q): owned by `owner`, at most `cap` of theirs at once. */
  leaveSphere?: { owner: Enemy; lifeMs: number; cap: number };
  style?: SpellStyle;
}

/** A cone from (x, y) toward `angle` that lands `delayMs` after it is placed (Sovereign Scatter). */
export interface ConeSpell {
  source: EnemyArchetype;
  x: number;
  y: number;
  angle: number;
  radius: number;
  /** Half the cone's opening, in radians. */
  halfAngle: number;
  delayMs: number;
  damage: number;
  style?: SpellStyle;
}

/** A Dark Sphere resting on the ground. Its owner's other spells use it. */
export interface DarkSphere {
  id: number;
  owner: Enemy;
  x: number;
  y: number;
  landedAt: number;
  expiresAt: number;
}

/** A launched sphere: a straight shot that stuns on contact for a fixed time. */
export interface SphereShot {
  source: EnemyArchetype;
  speed: number;
  radius: number;
  range: number;
  damage: number;
  stunMs: number;
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
  castCone(spell: ConeSpell, nowMs: number): void;
  fireOrb(spell: OrbSpell): void;
  fireGlob(spell: GlobSpell): void;
  /** `owner`'s Dark Spheres on the ground, oldest first. */
  spheresOf(owner: Enemy): readonly DarkSphere[];
  /** Pick a sphere up off the ground (Force of Will). @returns whether it was still there. */
  takeSphere(sphere: DarkSphere): boolean;
  /** Fling a sphere off the ground along `angle` as a stunning shot (Scatter). */
  launchSphere(sphere: DarkSphere, angle: number, shot: SphereShot): void;
}

export type ZoneShape =
  | ({ kind: 'line' } & LineSpell)
  | ({ kind: 'circle' } & CircleSpell)
  | ({ kind: 'cone' } & ConeSpell);

/** A placed zone and its deadline. Read by HostileSpellView. */
export type SpellZone = ZoneShape & { placedAt: number; resolveAt: number };

interface LiveShot {
  missile: Projectile;
  spell: GlobSpell;
  /** Orbs only: the stun range, by distance flown. */
  stun?: { minMs: number; maxMs: number };
  /** A launched Dark Sphere (drawn and counted apart from Magus orbs). */
  sphere?: boolean;
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
  /** Dark Spheres resting on the ground (Sovereign), oldest first. */
  readonly spheres: DarkSphere[] = [];
  private readonly shots: LiveShot[] = [];
  private nextSphereId = 1;
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

  /** Launched spheres in flight. */
  get sphereShotCount(): number {
    return this.shots.filter((s) => s.sphere).length;
  }

  // ------------------------------------------------------------ sink

  castLine(spell: LineSpell, nowMs: number): void {
    this.zones.push({ kind: 'line', ...spell, placedAt: nowMs, resolveAt: nowMs + spell.delayMs });
  }

  castCircle(spell: CircleSpell, nowMs: number): void {
    this.zones.push({ kind: 'circle', ...spell, placedAt: nowMs, resolveAt: nowMs + spell.delayMs });
  }

  castCone(spell: ConeSpell, nowMs: number): void {
    this.zones.push({ kind: 'cone', ...spell, placedAt: nowMs, resolveAt: nowMs + spell.delayMs });
  }

  spheresOf(owner: Enemy): readonly DarkSphere[] {
    return this.spheres.filter((s) => s.owner === owner);
  }

  takeSphere(sphere: DarkSphere): boolean {
    const i = this.spheres.indexOf(sphere);
    if (i < 0) return false;
    this.spheres.splice(i, 1);
    return true;
  }

  launchSphere(sphere: DarkSphere, angle: number, shot: SphereShot): void {
    if (!this.takeSphere(sphere)) return;
    const spell: OrbSpell = {
      source: shot.source, x: sphere.x, y: sphere.y, angle, speed: shot.speed, radius: shot.radius,
      range: shot.range, damage: shot.damage, stunMinMs: shot.stunMs, stunMaxMs: shot.stunMs,
    };
    this.shots.push({
      missile: this.launch(spell, PROJECTILE_ART.sphere),
      spell,
      stun: { minMs: shot.stunMs, maxMs: shot.stunMs },
      sphere: true,
    });
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
      if (this.zones.length > 0 || this.shots.length > 0 || this.spheres.length > 0) this.clear();
      return;
    }

    // Spheres expire, and vanish with their owner: killing the Sovereign clears her board.
    for (let i = this.spheres.length - 1; i >= 0; i--) {
      const s = this.spheres[i];
      if (nowMs >= s.expiresAt || s.owner.dead) this.spheres.splice(i, 1);
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
          Fx.of(this.scene).arcaneBurst(missile.x, missile.y, spell.radius * 2.5, this.shots[i].sphere ? 'void' : 'arcane');
        } else {
          Fx.of(this.scene).hit(missile.x, missile.y, THEME.basic.burst);
        }
        missile.kill();
      }
      if (!missile.alive) this.shots.splice(i, 1);
    }

    this.view.draw(this.zones, this.spheres, nowMs);
  }

  /** The zone's deadline: is the player inside it right now? */
  private resolve(zone: SpellZone): void {
    this.zonesResolved++;
    const px = this.player.x;
    const py = this.player.y;
    const pr = this.player.radius;
    const fx = Fx.of(this.scene);

    const style = zone.style ?? 'arcane';

    if (zone.kind === 'line') {
      fx.arcaneBeam(zone.x, zone.y, zone.angle, zone.length, zone.halfWidth);
      if (distanceToSegment(px, py, zone) <= zone.halfWidth + pr) {
        this.zonesHit++;
        this.callbacks.onPlayerHit(zone.damage, zone.source);
      }
      return;
    }

    if (zone.kind === 'cone') {
      fx.coneBurst(zone.x, zone.y, zone.angle, zone.radius, zone.halfAngle, style);
      const dist = Math.hypot(px - zone.x, py - zone.y);
      // Inside the cone if the player's body reaches into it: within range, and
      // within the half-angle widened by the body's angular size at that distance.
      const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(py - zone.y, px - zone.x) - zone.angle));
      const widen = dist > pr ? Math.asin(Math.min(1, pr / dist)) : Math.PI;
      if (dist <= zone.radius + pr && off <= zone.halfAngle + widen) {
        this.zonesHit++;
        this.callbacks.onPlayerHit(zone.damage, zone.source);
      }
      return;
    }

    fx.arcaneBurst(zone.x, zone.y, zone.radius, style);
    if (zone.leaveSphere && !zone.leaveSphere.owner.dead) this.placeSphere(zone, zone.leaveSphere);
    const dist = Math.hypot(px - zone.x, py - zone.y);
    if (dist > zone.radius + pr) return;
    this.zonesHit++;
    const centre = zone.centre;
    if (centre && dist <= centre.radius) {
      this.callbacks.onPlayerHit(centre.damage, zone.source);
      this.callbacks.onPlayerSlowed(centre.slowFraction, centre.slowMs);
    } else {
      this.callbacks.onPlayerHit(zone.damage, zone.source);
      if (zone.slow) this.callbacks.onPlayerSlowed(zone.slow.fraction, zone.slow.ms);
    }
  }

  /** A Dark Sphere comes to rest; past its owner's cap, their oldest goes. */
  private placeSphere(at: { x: number; y: number }, spec: NonNullable<CircleSpell['leaveSphere']>): void {
    const mine = this.spheresOf(spec.owner);
    // Oldest first: drop from the front until there is room for this one.
    for (let i = 0; i <= mine.length - spec.cap; i++) this.takeSphere(mine[i]);
    this.spheres.push({
      id: this.nextSphereId++, owner: spec.owner, x: at.x, y: at.y, landedAt: this.now, expiresAt: this.now + spec.lifeMs,
    });
  }

  /** Drop everything without resolving it (wave clear, restart). */
  clear(): void {
    this.zones.length = 0;
    this.spheres.length = 0;
    for (const { missile } of this.shots) missile.kill();
    this.shots.length = 0;
    this.view.draw(this.zones, this.spheres, this.now);
  }
}

/** Distance from a point to a line spell's centre segment. */
function distanceToSegment(px: number, py: number, line: LineSpell): number {
  const dx = Math.cos(line.angle);
  const dy = Math.sin(line.angle);
  const along = Phaser.Math.Clamp((px - line.x) * dx + (py - line.y) * dy, 0, line.length);
  return Math.hypot(px - (line.x + dx * along), py - (line.y + dy * along));
}
