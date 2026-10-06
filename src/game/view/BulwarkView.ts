import Phaser from 'phaser';
import { BULWARK } from '../../config/balance';
import { THEME, actorDepth } from '../../config/theme';
import { TEX } from '../art/textures';
import type { Bulwark } from '../entities/Bulwark';
import { EnemyView, type EnemyArt } from './EnemyView';
import { Fx } from './Fx';
import { easeOut, popEase, smoothRing, smoothStrip, stripPoints } from './pixelDraw';

const T = THEME.bulwark;

const SHARED = {
  frameMs: T.frameMs,
  originY: T.originY,
  shadow: TEX.shadow.xl,
  shadowOffsetY: T.shadowOffsetY,
  hpBarOffsetY: T.hpBarOffsetY,
  hpBarWidth: T.hpBarWidth,
};

const ARMOURED: EnemyArt = {
  ...SHARED, idle: TEX.bulwark.walk.slice(0, 1), move: TEX.bulwark.walk, windup: TEX.bulwark.windup, burst: T.burst,
};
/** All Out: the plates are gone. */
const BARE: EnemyArt = {
  ...SHARED, idle: TEX.bulwark.bareWalk.slice(0, 1), move: TEX.bulwark.bareWalk, windup: TEX.bulwark.bareWindup, burst: T.bareBurst,
};

/** Where one club is held, relative to the body's centre. */
interface ClubPose {
  x: number;
  y: number;
  rot: number;
}

/**
 * The Bulwark (a wide sand slime under iron plates, a club in each hand). On
 * top of the shared enemy view, everything it does is eased, not snapped:
 *
 *   - its body: a heavy waddle, rearing up through a Strike windup and
 *     flattening into the slam, hunkering and trembling through the brace,
 *     stretched down the ram, heaving while it is winded
 *   - its clubs: raised overhead, brought down along the line, crossed ahead
 *     of it for the brace, hanging at its sides when it is winded
 *   - its telegraphs: red ground under a smooth outline. A Strike's line
 *     fills from its body outward (white-hot outline and a "!" for the Heavy
 *     one); Path Maker's path fills the same way with chevrons running down it
 *   - a pale ring around it while nothing can stop it
 *   - All Out: its plates fly off in a flare; after it, a narrower ember-seamed
 *     body with blades for clubs, shedding sparks
 *
 * Reads the entity only; never changes gameplay.
 */
export class BulwarkView extends EnemyView {
  readonly clubs: Phaser.GameObjects.Image[];
  readonly alert: Phaser.GameObjects.Image;
  /** Plain readout of the ground telegraph, for inspection. */
  readonly telegraph = { visible: false, kind: 'none' as 'none' | 'strike' | 'heavy' | 'path', angle: 0, length: 0 };

  private readonly held: ClubPose[] = [{ x: 0, y: 0, rot: 0 }, { x: 0, y: 0, rot: 0 }];
  private clubsPlaced = false;
  /** Visual ms of the last trail puff and ember, so they come at a steady rate at any frame rate. */
  private lastTrailAt = 0;
  private lastEmberAt = 0;

  constructor(scene: Phaser.Scene, private readonly bulwark: Bulwark) {
    super(scene, bulwark, ARMOURED);
    const S = THEME.art.scale;
    this.clubs = [0, 1].map(() => scene.add.image(bulwark.x, bulwark.y, TEX.bulwark.club).setOrigin(0.15, 0.5).setScale(S).setVisible(false));
    this.alert = scene.add.image(bulwark.x, bulwark.y, TEX.pursuer.alert).setScale(S).setDepth(THEME.depth.mark).setVisible(false);
  }

  // ------------------------------------------------------------- events

  /** A Strike landed on the ground (and on the player, if `landed`). */
  slam(angle: number, length: number, halfWidth: number, heavy: boolean, landed: boolean): void {
    const b = this.bulwark;
    const L = T.slam;
    const fx = Fx.of(this.scene);
    const color = heavy ? L.heavyColor : L.color;
    const tipX = b.x + Math.cos(angle) * length;
    const tipY = b.y + Math.sin(angle) * length;
    fx.flashStrip(b.x, b.y, angle, length, halfWidth, L.ms, color, heavy ? 0.7 : 0.5);
    fx.wave(tipX, tipY, 6, halfWidth * 1.7, L.ms, color, 0.9, heavy ? 3 : 2, angle, 1.3);
    for (const along of [0.35, 0.7, 1]) {
      fx.sparks(b.x + Math.cos(angle) * length * along, b.y + Math.sin(angle) * length * along, L.dust, 4, 110, L.ms * 1.3, 3);
    }
    // force: the generic hit shake (RunFeedback) has already started this frame and would swallow this one.
    if (landed) this.scene.cameras.main.shake(L.shakeMs, L.shakeIntensity * (heavy ? 1.5 : 1), true);
  }

  /** The ram caught the player. */
  rammed(x: number, y: number): void {
    const fx = Fx.of(this.scene);
    fx.flashDisc(x, y, 40, 220, T.ram.hit, 0.5);
    fx.wave(x, y, 8, 52, 280, T.ram.hit, 1, 3);
    fx.sparks(x, y, T.slam.dust, 8, 200, 320, 3);
    this.scene.cameras.main.shake(T.slam.shakeMs, T.slam.shakeIntensity * 1.5, true);
  }

  /** It goes All Out: rings off the body, its plates thrown clear. */
  flare(): void {
    const b = this.bulwark;
    const F = T.flare;
    const fx = Fx.of(this.scene);
    fx.flashDisc(b.x, b.y, b.radius * 1.9, F.ms, F.color, 0.45);
    fx.wave(b.x, b.y, b.radius * 0.8, b.radius * 2.6, F.ms, F.core, 1, 3);
    fx.wave(b.x, b.y, b.radius * 0.4, b.radius * 1.8, F.ms * 1.3, F.color, 0.9, 2);
    for (let i = 0; i < F.plates; i++) {
      const a = -Math.PI / 2 + (i - (F.plates - 1) / 2) * 0.55;
      fx.particle(TEX.bulwark.plate, b.x + Math.cos(a) * b.radius * 0.6, b.y - b.radius * 0.5, {
        vx: Math.cos(a) * 230, vy: Math.sin(a) * 260, gravity: 900, drag: 0.5, life: 620,
        rotation: a, alpha: 1, alphaTo: 0, depth: THEME.depth.fx,
      });
    }
  }

  // -------------------------------------------------------------- frame

  protected override animate(nowMs: number): void {
    const b = this.bulwark;
    const M = T.motion;
    const body = this.body;
    const t = Math.max(0, b.stateProgress(nowMs));
    // Through the flare it flickers between what it was and what it becomes.
    const bare = b.allOut && (b.state !== 'flare' || Math.floor(this.visualMs / 60) % 2 === 0);
    this.art = bare ? BARE : ARMOURED;
    const tremble = (px: number) => (Math.floor(this.visualMs / THEME.motion.trembleMs) % 2 === 0 ? px : -px);

    switch (b.state) {
      case 'chase': {
        if (!b.pose.moving) break;
        const phase = (this.visualMs / M.waddleMs) * Math.PI * 2;
        body.sy = 1 + M.waddle * Math.sin(phase);
        body.sx = 1 - M.waddle * Math.sin(phase);
        body.dx = M.swayPx * Math.sin(phase / 2);
        break;
      }
      case 'strike': {
        const e = easeOut(t);
        body.sy = 1 + M.rear * e;
        body.sx = 1 - M.rear * 0.5 * e;
        if (t > 0.6) body.dx = tremble(M.tremblePx);
        break;
      }
      case 'recover': {
        const squash = M.slamSquash * (1 - popEase(t));
        const lunge = M.slamLungePx * (1 - easeOut(t));
        body.sy = 1 - squash;
        body.sx = 1 + squash * 0.7;
        body.dx = Math.cos(b.strikeAngle) * lunge;
        body.dy = Math.sin(b.strikeAngle) * lunge * 0.6;
        break;
      }
      case 'brace': {
        const e = easeOut(t);
        body.sy = 1 - M.hunker * e;
        body.sx = 1 + M.hunker * 0.6 * e;
        body.dx = tremble(M.tremblePx * t);
        break;
      }
      case 'ram':
        body.sx = 1 + M.ramStretch;
        body.sy = 1 - M.ramStretch * 0.7;
        break;
      case 'winded': {
        const heave = Math.sin((this.visualMs / M.heaveMs) * Math.PI * 2);
        body.sy = 0.93 + M.heave * heave;
        body.sx = 1.04 - M.heave * 0.5 * heave;
        break;
      }
      case 'flare': {
        const swell = M.flareSwell * Math.sin(Math.PI * t);
        body.sx = 1 + swell;
        body.sy = 1 + swell;
        break;
      }
    }
  }

  protected override drawExtras(nowMs: number, bx: number, by: number, deltaSeconds: number): void {
    const b = this.bulwark;
    const t = Math.max(0, b.stateProgress(nowMs));
    const bare = this.art === BARE;
    if (b.state === 'winded') this.sprite.setTexture(bare ? TEX.bulwark.bareWinded : TEX.bulwark.winded);

    this.drawTelegraph(t);
    this.drawClubs(bx, by, t, bare, deltaSeconds);

    if (b.unstoppable) {
      const U = T.unstoppable;
      const pulse = Math.sin((this.visualMs / U.pulseMs) * Math.PI * 2);
      smoothRing(this.overlay, bx, by, b.radius + U.padPx + pulse * 2, U.color, 0.6 + 0.3 * pulse, U.width);
    }

    const fx = Fx.of(this.scene);
    if (b.state === 'ram' && this.visualMs - this.lastTrailAt >= 24) {
      this.lastTrailAt = this.visualMs;
      fx.trail(b.x, b.y, { color: T.ram.trail, life: 200, size: 12 });
    }
    // All Out: sparks drifting up off the seams.
    if (bare && b.state !== 'flare' && this.visualMs - this.lastEmberAt >= T.flare.emberMs) {
      this.lastEmberAt = this.visualMs;
      const side = Math.sin(this.visualMs * 0.013) * b.radius * 0.7;
      fx.particle(TEX.px, bx + side, by - b.radius * 0.3, {
        vy: -46, life: 520, scale: 3, scaleTo: 1, alpha: 0.9, alphaTo: 0, tint: T.flare.color, depth: actorDepth(b.y) + 0.0001,
      });
    }

    const top = by - this.sprite.displayHeight * this.art.originY;
    this.alert
      .setVisible(b.state === 'strike' && b.strikeHeavy && Math.floor(this.visualMs / 70) % 2 === 0)
      .setPosition(bx, Math.round(top - 16));
  }

  /** The ground it is about to hit: a Strike's line, or Path Maker's path. */
  private drawTelegraph(t: number): void {
    const b = this.bulwark;
    const G = T.telegraph;
    const g = this.overlay;
    const fillAlpha = Phaser.Math.Linear(G.fillAlphaStart, G.fillAlphaEnd, t);
    const edgeAlpha = Phaser.Math.Linear(G.edgeAlphaStart, G.edgeAlphaEnd, t);

    if (b.state === 'strike') {
      const { length, halfWidth } = b.strikeShape;
      const a = b.strikeAngle;
      g.fillStyle(G.fill, fillAlpha);
      g.fillPoints(stripPoints(b.x, b.y, a, length, halfWidth), true);
      // The fill racing to the far end is the countdown.
      g.fillStyle(G.fill, G.sweepAlpha);
      g.fillPoints(stripPoints(b.x, b.y, a, length * t, halfWidth), true);
      smoothStrip(g, b.x, b.y, a, length, halfWidth, b.strikeHeavy ? G.heavyEdge : G.edge, edgeAlpha, G.edgeWidth);
      Object.assign(this.telegraph, { visible: true, kind: b.strikeHeavy ? 'heavy' : 'strike', angle: a, length });
      return;
    }

    if (b.state === 'brace') {
      const a = b.pathAngle;
      const length = BULWARK.pathMaker.distance + b.radius;
      const half = b.radius;
      g.fillStyle(G.fill, fillAlpha);
      g.fillPoints(stripPoints(b.x, b.y, a, length, half), true);
      g.fillStyle(G.fill, G.sweepAlpha);
      g.fillPoints(stripPoints(b.x, b.y, a, length * t, half), true);
      smoothStrip(g, b.x, b.y, a, length, half, G.edge, edgeAlpha, G.edgeWidth);
      // Chevrons running down the path: which way it is coming.
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const phase = (this.visualMs / G.chevronMs) % 1;
      for (let d = b.radius + phase * G.chevronGapPx; d < length - 6; d += G.chevronGapPx) {
        const fade = Math.min(1, (d - b.radius) / 30, (length - d) / 40);
        const tipX = b.x + ux * d;
        const tipY = b.y + uy * d;
        const back = 14;
        const wing = half * 0.6;
        g.lineStyle(3, G.heavyEdge, edgeAlpha * fade * 0.8);
        g.strokePoints([
          { x: tipX - ux * back - uy * wing, y: tipY - uy * back + ux * wing },
          { x: tipX, y: tipY },
          { x: tipX - ux * back + uy * wing, y: tipY - uy * back - ux * wing },
        ], false, false);
      }
      Object.assign(this.telegraph, { visible: true, kind: 'path', angle: a, length });
      return;
    }

    this.telegraph.visible = false;
    this.telegraph.kind = 'none';
  }

  /** Where each club belongs right now; the drawn clubs ease toward it. */
  private clubTarget(dir: number, t: number): ClubPose {
    const b = this.bulwark;
    const C = T.clubs;
    const up = -Math.PI / 2;
    switch (b.state) {
      case 'strike': {
        const e = easeOut(t);
        return { x: dir * C.sidePx * (1 - 0.45 * e), y: -C.liftPx - C.raisePx * e, rot: up + dir * 0.25 };
      }
      case 'recover': {
        const a = b.strikeAngle;
        return {
          x: Math.cos(a) * C.reachPx - Math.sin(a) * dir * 10,
          y: Math.sin(a) * C.reachPx * 0.7 + Math.cos(a) * dir * 7 + 4,
          rot: a,
        };
      }
      case 'brace': {
        const a = b.pathAngle;
        return {
          x: Math.cos(a) * C.bracePx - Math.sin(a) * dir * 8,
          y: Math.sin(a) * C.bracePx * 0.7 + Math.cos(a) * dir * 6 - 4,
          rot: up - dir * 0.6,
        };
      }
      case 'ram': {
        const a = b.pathAngle;
        return {
          x: Math.cos(a) * (C.bracePx + 8) - Math.sin(a) * dir * 13,
          y: Math.sin(a) * (C.bracePx + 8) * 0.7 + Math.cos(a) * dir * 9,
          rot: a,
        };
      }
      case 'winded':
        return { x: dir * (C.sidePx + 2), y: 10, rot: Math.PI / 2 - dir * 0.3 };
      case 'flare':
        return { x: dir * (C.sidePx + 10), y: -C.liftPx - 14, rot: up + dir * 0.9 };
      default: {
        const bob = b.pose.moving ? Math.sin((this.visualMs / T.motion.waddleMs) * Math.PI * 2 + (dir > 0 ? Math.PI : 0)) * 3 : 0;
        return { x: dir * C.sidePx, y: -C.liftPx + bob, rot: up + dir * 0.35 };
      }
    }
  }

  private drawClubs(bx: number, by: number, t: number, bare: boolean, deltaSeconds: number): void {
    const b = this.bulwark;
    const C = T.clubs;
    const follow = 1 - Math.exp(-(b.state === 'recover' || b.state === 'ram' ? C.slamFollow : C.follow) * deltaSeconds);
    this.clubs.forEach((club, i) => {
      const target = this.clubTarget(i === 0 ? -1 : 1, t);
      const at = this.held[i];
      if (!this.clubsPlaced) Object.assign(at, target);
      else {
        at.x += (target.x - at.x) * follow;
        at.y += (target.y - at.y) * follow;
        at.rot += Phaser.Math.Angle.Wrap(target.rot - at.rot) * follow;
      }
      club
        .setTexture(bare ? TEX.bulwark.blade : TEX.bulwark.club)
        .setVisible(true)
        .setPosition(Math.round(bx + at.x), Math.round(by + at.y))
        .setRotation(at.rot)
        // In front of the body when held below its middle, behind it when raised.
        .setDepth(actorDepth(b.y) + (at.y > -C.liftPx - 4 ? 0.00005 : -0.00005));
    });
    this.clubsPlaced = true;
  }

  protected override hideExtras(): void {
    for (const club of this.clubs) club.setVisible(false);
    this.alert.setVisible(false);
    this.telegraph.visible = false;
    this.telegraph.kind = 'none';
  }

  override destroy(): void {
    for (const club of this.clubs) club.destroy();
    this.alert.destroy();
    super.destroy();
  }
}
