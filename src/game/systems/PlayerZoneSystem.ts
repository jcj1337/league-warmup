import Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import { PlayerZoneView } from '../view/PlayerZoneView';

/**
 * Ground spells the player owns: telegraphed shapes that resolve against the
 * enemies inside them at their deadline (or at once: `strike`), and clouds
 * (one or more overlapping puffs) that linger and act on whoever is inside at
 * each tick. A cloud can be thrown: each puff is a bolt lobbed from the
 * caster, and the cloud acts once they have all landed.
 *
 * The mirror of HostileSpellSystem, which resolves against the player. A kit
 * places zones and says what landing means; this does the geometry and the
 * timing, on the GameClock, so a pause freezes every deadline.
 */

/** How a burst looks (THEME.playerZone.styles). */
export type BurstStyle = 'venom' | 'stone';

/** A burst of opaque puffs (a bite), or a clean splash: a ring and droplets, no puffs (Q landing, the gaze catching). */
export type BurstShape = 'puffs' | 'splash';

export interface CircleZone {
  kind: 'circle';
  x: number;
  y: number;
  radius: number;
  delayMs: number;
  /** The deadline: every active enemy whose body overlaps the circle. */
  onLand: (inside: Enemy[]) => void;
}

export interface ConeZone {
  kind: 'cone';
  x: number;
  y: number;
  angle: number;
  radius: number;
  /** Half the cone's opening, in radians. */
  halfAngle: number;
  delayMs: number;
  onLand: (inside: Enemy[]) => void;
}

export type ZoneSpec = CircleZone | ConeZone;
/** A placed zone and its deadline. Read by PlayerZoneView. */
export type PlacedZone = ZoneSpec & { placedAt: number; resolveAt: number };

export interface CloudSpec {
  /** The aim point. */
  x: number;
  y: number;
  /** Where each puff sits; an enemy touching any of them is inside the cloud. */
  puffs: readonly { x: number; y: number }[];
  /** Every puff's radius. */
  radius: number;
  /** Thrown: each puff flies from here at `speed` px/s. Without it the cloud is there at once. */
  thrownFrom?: { x: number; y: number; speed: number };
  /** From the moment it lands. */
  durationMs: number;
  tickMs: number;
  /** Every tick (the first on landing): the active enemies inside right now. */
  onTick: (inside: Enemy[]) => void;
}
export type PlacedCloud = CloudSpec & {
  placedAt: number;
  /** When each puff's bolt lands (placedAt when not thrown). Read by the view. */
  puffLandsAt: number[];
  /** The last bolt is down: the cloud acts from here. */
  landsAt: number;
  expiresAt: number;
  nextTickAt: number;
};

export class PlayerZoneSystem {
  readonly zones: PlacedZone[] = [];
  readonly clouds: PlacedCloud[] = [];
  /** Readouts for the suites. */
  zonesResolved = 0;
  ticks = 0;
  private readonly view: PlayerZoneView;
  private now = 0;

  constructor(scene: Phaser.Scene) {
    this.view = new PlayerZoneView(scene);
  }

  place(spec: ZoneSpec, nowMs: number): void {
    this.zones.push({ ...spec, placedAt: nowMs, resolveAt: nowMs + spec.delayMs });
  }

  /** Resolve a zone right now, against the enemies inside it this instant (its delayMs is ignored). */
  strike(spec: ZoneSpec, nowMs: number, enemies: readonly Enemy[]): void {
    this.resolve({ ...spec, placedAt: nowMs, resolveAt: nowMs }, nowMs, enemies);
  }

  placeCloud(spec: CloudSpec, nowMs: number): void {
    const from = spec.thrownFrom;
    const puffLandsAt = spec.puffs.map((p) => (from && from.speed > 0 ? nowMs + (Math.hypot(p.x - from.x, p.y - from.y) / from.speed) * 1000 : nowMs));
    const landsAt = Math.max(nowMs, ...puffLandsAt);
    this.clouds.push({ ...spec, placedAt: nowMs, puffLandsAt, landsAt, expiresAt: landsAt + spec.durationMs, nextTickAt: landsAt });
  }

  private resolve(zone: PlacedZone, nowMs: number, enemies: readonly Enemy[]): void {
    this.zonesResolved++;
    this.view.landed(zone, nowMs);
    zone.onLand(enemies.filter((e) => e.active && inside(zone, e)));
  }

  update(_deltaSeconds: number, nowMs: number, enemies: readonly Enemy[]): void {
    this.now = nowMs;

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (nowMs < zone.resolveAt) continue;
      this.zones.splice(i, 1);
      this.resolve(zone, nowMs, enemies);
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      if (nowMs >= cloud.expiresAt) {
        this.clouds.splice(i, 1);
        continue;
      }
      // Ticks are deadlines too: a long frame never skips one, a pause never fast-forwards one.
      while (nowMs >= cloud.nextTickAt && nowMs < cloud.expiresAt) {
        cloud.nextTickAt += cloud.tickMs;
        this.ticks++;
        cloud.onTick(enemies.filter((e) => e.active && inCloud(cloud, e)));
      }
    }

    this.view.draw(this.zones, this.clouds, nowMs);
  }

  /** A burst where a kit asks for one: a bite landing, an enemy caught by a gaze. Look only. */
  burst(x: number, y: number, radius: number, style: BurstStyle, shape: BurstShape = 'puffs'): void {
    this.view.burst(x, y, radius, style, this.now, shape);
  }

  /** Drop everything without resolving it (round end, restart). */
  clear(): void {
    this.zones.length = 0;
    this.clouds.length = 0;
    this.view.clearSplashes();
    this.view.draw(this.zones, this.clouds, this.now);
  }
}

/** Does the enemy's body reach into any of the cloud's puffs? Each enemy counts once per tick. */
function inCloud(cloud: PlacedCloud, e: Enemy): boolean {
  return cloud.puffs.some((p) => Math.hypot(e.x - p.x, e.y - p.y) <= cloud.radius + e.radius);
}

/** Does the enemy's body reach into the zone? */
function inside(zone: PlacedZone, e: Enemy): boolean {
  const dist = Math.hypot(e.x - zone.x, e.y - zone.y);
  if (zone.kind === 'circle') return dist <= zone.radius + e.radius;
  if (dist > zone.radius + e.radius) return false;
  const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - zone.y, e.x - zone.x) - zone.angle));
  const widen = dist > e.radius ? Math.asin(Math.min(1, e.radius / dist)) : Math.PI;
  return off <= zone.halfAngle + widen;
}
