import Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import { PlayerZoneView } from '../view/PlayerZoneView';

/**
 * Ground spells the player owns: telegraphed shapes that resolve against the
 * enemies inside them at their deadline, and clouds that linger and act on
 * whoever is inside at each tick.
 *
 * The mirror of HostileSpellSystem, which resolves against the player. A kit
 * places zones and says what landing means; this does the geometry and the
 * timing, on the GameClock, so a pause freezes every deadline.
 */

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
  x: number;
  y: number;
  radius: number;
  durationMs: number;
  tickMs: number;
  /** Every tick (the first at once): the active enemies inside right now. */
  onTick: (inside: Enemy[]) => void;
}
export type PlacedCloud = CloudSpec & { placedAt: number; expiresAt: number; nextTickAt: number };

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

  placeCloud(spec: CloudSpec, nowMs: number): void {
    this.clouds.push({ ...spec, placedAt: nowMs, expiresAt: nowMs + spec.durationMs, nextTickAt: nowMs });
  }

  update(_deltaSeconds: number, nowMs: number, enemies: readonly Enemy[]): void {
    this.now = nowMs;

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (nowMs < zone.resolveAt) continue;
      this.zones.splice(i, 1);
      this.zonesResolved++;
      zone.onLand(enemies.filter((e) => e.active && inside(zone, e)));
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
        cloud.onTick(enemies.filter((e) => e.active && Math.hypot(e.x - cloud.x, e.y - cloud.y) <= cloud.radius + e.radius));
      }
    }

    this.view.draw(this.zones, this.clouds, nowMs);
  }

  /** Drop everything without resolving it (round end, restart). */
  clear(): void {
    this.zones.length = 0;
    this.clouds.length = 0;
    this.view.draw(this.zones, this.clouds, this.now);
  }
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
