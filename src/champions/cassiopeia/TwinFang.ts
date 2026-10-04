import type Phaser from 'phaser';
import { THEME } from '../../config/theme';
import { TEX } from '../../game/art/textures';
import type { Enemy } from '../../game/entities/Enemy';
import { Fx } from '../../game/view/Fx';
import { PROJECTILE_ART } from '../../game/view/projectileArt';
import { ProjectileView } from '../../game/view/ProjectileView';

/**
 * Twin Fang in flight: two fangs that leave her together, weave apart, and
 * meet again in the target, where they snap shut in a bite. It homes, like a
 * League point-and-click, and fizzles if the target dies first.
 *
 * Gameplay is one point travelling at `speed`; the two fangs are drawn either
 * side of it, `weavePx * sin(pi * travelled)` apart, so they start and end
 * together.
 */
export class TwinFang {
  alive = true;
  private x: number;
  private y: number;
  private readonly startDist: number;
  /** The target's life when we left: a respawned enemy in the same slot isn't it. */
  private readonly spawnId: number;
  private readonly fangs: [ProjectileView, ProjectileView];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly target: Enemy,
    private readonly speed: number,
    private readonly onHit: (target: Enemy, angle: number) => void,
  ) {
    this.x = x;
    this.y = y;
    this.spawnId = target.spawnId;
    this.startDist = Math.max(1, Math.hypot(target.x - x, target.y - y) - target.radius);
    const angle = Math.atan2(target.y - y, target.x - x);
    this.fangs = [
      new ProjectileView(scene, PROJECTILE_ART.fang, x, y, angle),
      new ProjectileView(scene, PROJECTILE_ART.fang, x, y, angle),
    ];
  }

  update(deltaSeconds: number): void {
    if (!this.alive) return;
    if (!this.target.active || this.target.spawnId !== this.spawnId) {
      this.kill();
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const angle = Math.atan2(dy, dx);
    const step = this.speed * deltaSeconds;
    if (step >= dist - this.target.radius) {
      this.onHit(this.target, angle);
      this.kill();
      return;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;

    const travelled = Math.min(1, 1 - (dist - step - this.target.radius) / this.startDist);
    const spread = THEME.twinFang.weavePx * Math.sin(Math.PI * Math.max(0, travelled));
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    // Each fang angles out, then back in, along with its weave.
    const lean = Math.cos(Math.PI * travelled) * 0.35;
    this.fangs[0].sync(this.x + nx * spread, this.y + ny * spread, deltaSeconds, angle + lean);
    this.fangs[1].sync(this.x - nx * spread, this.y - ny * spread, deltaSeconds, angle - lean);
  }

  kill(): void {
    this.alive = false;
    for (const f of this.fangs) f.destroy();
  }
}

/**
 * The bite on arrival: a pair of fangs snapping shut across the line of
 * flight, a venom burst and sparks. On a poisoned target, a second wider pair
 * turned across the first closes a beat later, the burst is bigger, and the
 * screen gives a short shake.
 */
export function playBite(scene: Phaser.Scene, target: Enemy, angle: number, poisoned: boolean): void {
  const T = THEME.twinFang;
  const f = THEME.fx.fang;
  const fx = Fx.of(scene);
  const { x, y, radius } = target;
  const end = radius * T.biteDepth;
  // All fangs close at one speed, so the poisoned bite's wider pair lands a beat after the first.
  const v = (radius + T.biteGapPx - end) / (T.biteMs / 1000);
  const pair = (turn: number, gap: number) => {
    const a = angle + Math.PI / 2 + turn;
    for (const dir of [a, a + Math.PI]) {
      // Each fang starts outside the target's edge on its side and snaps inward, point first.
      const start = radius + gap;
      fx.particle(TEX.fx.fang, x - Math.cos(dir) * start, y - Math.sin(dir) * start, {
        vx: Math.cos(dir) * v,
        vy: Math.sin(dir) * v,
        life: ((start - end) / v) * 1000,
        rotation: dir,
        alpha: 1,
        alphaTo: 0.8,
      });
    }
  };
  pair(0, T.biteGapPx);
  if (poisoned) pair(T.poisonedTurn, T.poisonedGapPx);

  const r = radius + (poisoned ? T.poisonedBurstPx : T.burstPx);
  fx.ring(x, y, 4, r, T.burstMs, f.color, 1);
  fx.ring(x, y, 2, r * 0.6, T.burstMs * 0.8, f.core, 1);
  fx.sparks(x, y, [f.core, f.color, f.deep], poisoned ? T.poisonedSparks : T.sparks, 200, T.burstMs * 1.3);
  if (poisoned) scene.cameras.main.shake(T.shakeMs, T.shakeIntensity);
}
