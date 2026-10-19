import Phaser from 'phaser';
import type { AutoLook, CastStyle, FxKey, Motion, Slot } from '../../champions/types';
import { THEME, actorDepth } from '../../config/theme';
import type { PlayerFrames } from '../art/look';
import { TEX } from '../art/textures';
import { Fx } from './Fx';
import { DEFAULT_CAST_MOTION, defaultAutoMotion, followThroughMs, REST_POSE, sampleMotion, type MotionPose } from './motion';
import { PixelBar } from './PixelBar';
import { dottedRing, pixelDisc } from './pixelDraw';

/** What the scene hands the player each frame so it can animate the attack. */
export interface AttackVisual {
  /** 0 outside a windup, 0 -> 1 through it. Comes straight from AttackSystem. */
  windupProgress: number;
  /** Time since the last missile release, for the follow-through. */
  msSinceRelease: number;
  /** The windup's real length, which decides the motion keys that play. */
  windupMs: number;
  /** The follow-through's compression: the auto cycle now against level 1's (see tempoOf). */
  tempo: number;
  /** Where the attack is aimed, if anywhere. */
  targetX: number | null;
  targetY: number | null;
}

/** The authoritative player numbers a frame of animation needs. */
export interface PlayerViewState {
  x: number;
  y: number;
  radius: number;
  moving: boolean;
  destX: number | null;
  destY: number | null;
  hp: number;
  maxHp: number;
  /** Drawn attack-range radius (attackReach for the standard target). */
  rangeRadius: number;
  /** Crowd control from hostile spells. */
  stunned: boolean;
  slowed: boolean;
}

export type CastKind = Slot;

/** What the scene hands the player each frame about the cast window. */
export interface CastVisual {
  ability: CastKind | null;
  /** 0 -> 1 across the window. Comes straight from CastSystem. */
  progress: number;
  aimX: number | null;
  aimY: number | null;
  /** The window's real length, which decides the motion keys that play. */
  windowMs: number;
  /** The follow-through's compression: this window against the slot's level-1 window. */
  tempo: number;
}

/** How a slot's cast is drawn on the slime: the charge-up over it, its colours, and what the body does. */
export interface CastLook {
  style: CastStyle;
  fx: FxKey;
  motion: Motion;
}
const NO_LOOK: CastLook = { style: 'none', fx: 'q', motion: DEFAULT_CAST_MOTION };
export type PlayerPose = 'idle' | 'walk' | 'windup' | 'release' | 'cast' | 'stunned';

/** Plain readouts of the dotted rings, so they can be inspected without touching Graphics. */
export interface RingReadout {
  visible: boolean;
  radius: number;
  strokeAlpha: number;
}

/**
 * Everything the player looks like: the champion's slime (idle breathing, hop
 * while moving, and its motions: what the body does through each auto and
 * cast, see src/game/view/motion.ts), the glow on its art, the shot flash at
 * its edge, shadow, health bar, range / charge / release rings and cast
 * charge-ups.
 *
 * A pure observer. It is handed attack, cast and movement state every frame
 * and never feeds anything back: gameplay position stays on the Player; this
 * only draws a (possibly offset) picture of it.
 */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Image;
  /** The art's glow pixels over the body, lit by a motion's `glow`. Null when the art has none. */
  readonly glowSprite: Phaser.GameObjects.Image | null;
  readonly muzzle: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  readonly destPip: Phaser.GameObjects.Image;
  readonly hpBar: PixelBar;
  /** Ground layer: range ring, max-stack aura. */
  private readonly groundGfx: Phaser.GameObjects.Graphics;
  /** Over the unit: charge ring, release ring, cast charge-ups. */
  private readonly overGfx: Phaser.GameObjects.Graphics;

  readonly rangeRing: RingReadout = { visible: false, radius: 0, strokeAlpha: 0 };
  readonly chargeRing: RingReadout = { visible: false, radius: 0, strokeAlpha: 0 };
  readonly releaseRing: RingReadout = { visible: false, radius: 0, strokeAlpha: 0 };

  pose: PlayerPose = 'idle';
  /** The body frame drawn this frame, by name ('idle', 'charge', or a champion's own pose like 'gulp'). */
  motionFrame = 'idle';
  /** The motion's channels this frame, for inspection. */
  motionPose: MotionPose = { ...REST_POSE };
  /** 1 = facing right, -1 = facing left. */
  facing: 1 | -1 = 1;
  /** Visual-only offset of the sprite from the gameplay position: the motion's lean, recoil, hop and shake. */
  offsetX = 0;
  offsetY = 0;

  private windup = 0;
  private windupMs = 0;
  private autoTempo = 1;
  private autoMotion: Motion = defaultAutoMotion();
  /** Which THEME.fx entry colours the auto's muzzle burst and release ring. */
  private autoFx: 'auto' | FxKey = 'auto';
  private aimAngle: number | null = null;
  /** Last direction the slime aimed or faced, for the shot flash. */
  private lastAim = 0;
  private msSinceRelease = Number.POSITIVE_INFINITY;
  private castKind: CastKind | null = null;
  private castProgress = 0;
  private castAngle: number | null = null;
  private castWindowMs = 0;
  private castTempo = 1;
  /** The last cast's aim, kept past its release for its follow-through. */
  private lastCastAngle = 0;
  private rangeVisibility = 0;
  private rangeInRange = false;
  private rangePending = false;
  private passiveMaxed = false;
  private visualMs = 0;
  private castReleaseAge = Number.POSITIVE_INFINITY;
  private castReleaseKind: CastKind = 'q';
  /** Per slot, from the champion. Unknown slots draw nothing. */
  private castLooks: Partial<Record<Slot, CastLook>> = {};
  private hitAge = Number.POSITIVE_INFINITY;
  private ghostHp = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    /** The champion's frames wearing the profile's cosmetics, and where the body sits in them. */
    private readonly look: PlayerFrames,
  ) {
    const S = THEME.art.scale;
    this.shadow = scene.add.image(x, y, TEX.shadow.m).setScale(S).setDepth(THEME.depth.shadow);
    this.destPip = scene.add.image(x, y, TEX.fx.dest).setScale(S).setAlpha(0.7).setDepth(THEME.depth.ping).setVisible(false);
    this.groundGfx = scene.add.graphics().setDepth(THEME.depth.groundFx);
    this.sprite = scene.add.image(x, y, look.frames.idle[0]).setOrigin(0.5, look.originY).setScale(S);
    this.glowSprite = look.glow ? scene.add.image(x, y, look.frames.idle[0]).setOrigin(0.5, look.originY).setVisible(false) : null;
    this.muzzle = scene.add.image(x, y, TEX.player.muzzle).setScale(S).setDepth(THEME.depth.fx).setVisible(false);
    this.overGfx = scene.add.graphics().setDepth(THEME.depth.fx);
    this.hpBar = new PixelBar(scene, THEME.player.hpBarWidth, THEME.hpBar.player);
  }

  /** Screen pixels the hat adds above the head: text over the slime starts this much higher. */
  get hatPx(): number {
    return this.look.hatPx;
  }

  // ------------------------------------------------------------ state feeds

  /** The champion's cast looks, auto motion and auto look, once per run. */
  setCastLooks(looks: Partial<Record<Slot, CastLook>>, autoMotion?: Motion, autoLook?: AutoLook): void {
    this.castLooks = looks;
    this.autoMotion = autoMotion ?? defaultAutoMotion();
    this.autoFx = autoLook?.fx ?? 'auto';
    this.muzzle.setTexture(autoLook?.muzzle ?? TEX.player.muzzle);
  }

  private lookOf(slot: Slot): CastLook {
    return this.castLooks[slot] ?? NO_LOOK;
  }

  applyAttackVisual(v: AttackVisual, x: number, y: number): void {
    this.windup = v.windupProgress;
    this.windupMs = v.windupMs;
    this.autoTempo = v.tempo;
    this.msSinceRelease = v.msSinceRelease;
    this.aimAngle = null;
    if (v.targetX !== null && v.targetY !== null && (v.windupProgress > 0 || this.autoFollowing)) {
      this.aimAngle = Math.atan2(v.targetY - y, v.targetX - x);
    }
  }

  setCastVisual(v: CastVisual, x: number, y: number): void {
    this.castKind = v.ability;
    this.castProgress = Phaser.Math.Clamp(v.progress, 0, 1);
    this.castAngle = v.ability !== null && v.aimX !== null && v.aimY !== null ? Math.atan2(v.aimY - y, v.aimX - x) : null;
    if (this.castAngle !== null) this.lastCastAngle = this.castAngle;
    if (v.ability !== null) {
      this.castWindowMs = v.windowMs;
      this.castTempo = v.tempo;
    }
  }

  /** The auto's follow-through is still playing. */
  private get autoFollowing(): boolean {
    return this.msSinceRelease < followThroughMs(this.autoMotion) * this.autoTempo;
  }

  /** The last cast's follow-through is still playing. */
  private get castFollowing(): boolean {
    return this.castReleaseAge < followThroughMs(this.lookOf(this.castReleaseKind).motion) * this.castTempo;
  }

  setRangeRingState(inRange: boolean, attackMovePending: boolean, visibility: number): void {
    this.rangeVisibility = Phaser.Math.Clamp(visibility, 0, 1);
    this.rangeInRange = inRange;
    this.rangePending = attackMovePending;
  }

  setPassiveMaxed(maxed: boolean): void {
    this.passiveMaxed = maxed;
  }

  // ---------------------------------------------------------- one-shot cues

  playReleaseBurst(): void {
    const tip = this.muzzlePoint();
    const f = THEME.fx[this.autoFx];
    Fx.of(this.scene).sparks(tip.x, tip.y, [f.core, f.color], 4, 150, 140, 3, tip.angle, 1.2);
  }

  playCastRelease(ability: CastKind): void {
    this.castReleaseAge = 0;
    this.castReleaseKind = ability;
    Fx.of(this.scene).castRelease(this.sprite.x, this.sprite.y, this.lookOf(ability).fx);
  }

  playPassivePulse(radius: number, maxed: boolean): void {
    Fx.of(this.scene).passivePulse(this.sprite.x, this.sprite.y, radius, maxed);
  }

  showCancelTag(radius: number): void {
    Fx.of(this.scene).popup(this.sprite.x, this.sprite.y - radius - 16 - this.look.hatPx, 'CANCEL', THEME.fx.cancel, 420, 18);
  }

  flashHit(): void {
    this.hitAge = 0;
  }

  // ------------------------------------------------------------------ frame

  sync(s: PlayerViewState, deltaSeconds: number): void {
    const P = THEME.player;
    const A = P.attack;
    const ms = deltaSeconds * 1000;
    this.visualMs += ms;
    this.castReleaseAge += ms;
    this.hitAge += ms;

    // Facing: aim while attacking/casting, otherwise the way we are walking.
    const desired = this.aimAngle ?? this.castAngle ?? this.moveAngle(s);
    if (desired !== null && Math.abs(Math.cos(desired)) > 0.15) this.facing = Math.cos(desired) >= 0 ? 1 : -1;

    // A new windup cuts any follow-through: the next cue is never hidden behind the last.
    const autoFollowing = this.autoFollowing;
    const castFollowing = this.castFollowing;
    this.pose = s.stunned ? 'stunned'
      : this.castKind !== null ? 'cast'
      : this.windup > 0 ? 'windup'
      : autoFollowing || castFollowing ? 'release'
      : s.moving ? 'walk'
      : 'idle';

    // Stunned: slumped in the squash frame, no breathing, until it wears off.
    const baseFrame = this.pose === 'stunned' ? 'squash'
      : s.moving ? (Math.floor(this.visualMs / P.walkFrameMs) % 2 ? 'squash' : 'stretch')
      : Math.floor(this.visualMs / P.idleFrameMs) % 2 ? 'squash' : 'idle';

    const { pose, frame, angle, glowColor } = this.sampleBody(baseFrame, autoFollowing, castFollowing);
    this.motionPose = pose;
    this.motionFrame = frame;

    const shake = pose.tremble > 0 ? this.trembleOffset(pose.tremble) : { x: 0, y: 0 };
    this.offsetX = Math.cos(angle) * pose.along - Math.sin(angle) * pose.side + shake.x;
    this.offsetY = Math.sin(angle) * pose.along + Math.cos(angle) * pose.side - pose.up + shake.y;
    const S = THEME.art.scale;
    this.sprite.setTexture(this.look.named[frame]);
    // Scaled about the feet, so a squash sinks into the ground rather than shrinking toward the middle.
    const footPx = (1 - this.look.originY) * this.sprite.height * S;
    const bx = Math.round(s.x + this.offsetX);
    const by = Math.round(s.y + this.offsetY + footPx * (1 - pose.sy));

    this.sprite.setFlipX(this.facing < 0).setPosition(bx, by).setScale(S * pose.sx, S * pose.sy).setDepth(actorDepth(s.y));
    // Hit: a brief white pop, then a red wash; the hero never vanishes into a silhouette.
    this.applyHitTint(this.sprite, P.hitFlashMs);

    const glowKey = this.look.glow?.[frame];
    if (this.glowSprite && glowKey && pose.glow > 0.01) {
      this.glowSprite.setVisible(true).setTexture(glowKey).setTintFill(glowColor).setAlpha(Math.min(1, pose.glow))
        .setFlipX(this.facing < 0).setPosition(bx, by).setScale(S * pose.sx, S * pose.sy).setDepth(actorDepth(s.y) + 0.001);
    } else {
      this.glowSprite?.setVisible(false);
    }

    // Shots and casts visibly leave from the slime's edge toward the aim.
    this.lastAim = this.aimAngle ?? this.castAngle ?? (this.facing > 0 ? 0 : Math.PI);
    const hand = this.edgePoint(bx, by, this.lastAim, P.castEmitDistance);

    if (this.msSinceRelease < A.muzzleMs) {
      const tip = this.muzzlePoint();
      this.muzzle.setVisible(true).setPosition(tip.x, tip.y).setAlpha(1 - this.msSinceRelease / A.muzzleMs);
    } else {
      this.muzzle.setVisible(false);
    }

    this.shadow.setPosition(Math.round(s.x), Math.round(s.y + P.shadowOffsetY));

    if (s.destX !== null && s.destY !== null) this.destPip.setVisible(true).setPosition(Math.round(s.destX), Math.round(s.destY));
    else this.destPip.setVisible(false);

    if (this.ghostHp < 0 || this.ghostHp < s.hp) this.ghostHp = s.hp;
    else this.ghostHp = Math.max(s.hp, this.ghostHp - s.maxHp * 1.2 * deltaSeconds);
    this.hpBar.update(s.x, s.y + P.hpBarOffsetY, s.hp / s.maxHp, this.ghostHp / s.maxHp);

    this.drawGround(s);
    this.drawOver(s, bx, by, hand);
  }

  // --------------------------------------------------------------- drawing

  private drawGround(s: PlayerViewState): void {
    const g = this.groundGfx;
    const R = THEME.player.rangeRing;
    g.clear();

    if (this.rangeVisibility > 0) {
      const color = this.rangePending ? R.pending : this.rangeInRange ? R.inRange : R.idle;
      const alpha = (this.rangePending ? 0.85 : this.rangeInRange ? 0.7 : 0.5) * this.rangeVisibility;
      dottedRing(g, s.x, s.y, s.rangeRadius, color, alpha, 3);
      this.rangeRing.visible = true;
      this.rangeRing.strokeAlpha = alpha;
    } else {
      this.rangeRing.visible = false;
      this.rangeRing.strokeAlpha = 0;
    }
    this.rangeRing.radius = s.rangeRadius;

    if (s.slowed) {
      const S = THEME.player.slow;
      dottedRing(g, s.x, s.y + 8, s.radius + 4, S.color, S.alpha, 3);
    }

    if (this.passiveMaxed) {
      const pulse = Math.sin(this.visualMs * 0.006) * 1.5;
      dottedRing(g, s.x, s.y + 6, s.radius + 8 + pulse, THEME.passive.maxStackColor, 0.75, 3);
    }
  }

  private drawOver(s: PlayerViewState, bx: number, by: number, hand: { x: number; y: number }): void {
    const g = this.overGfx;
    const A = THEME.player.attack;
    g.clear();

    // Charge ring: collapses onto the body across the real windup, landing as the shot leaves.
    if (this.windup > 0) {
      const radius = s.radius + Phaser.Math.Linear(A.chargeRingStartPad, A.chargeRingEndPad, this.windup);
      const alpha = 0.4 + 0.6 * this.windup;
      dottedRing(g, bx, by, radius, A.chargeColor, alpha, 3);
      Object.assign(this.chargeRing, { visible: true, radius, strokeAlpha: alpha });
    } else {
      Object.assign(this.chargeRing, { visible: false, strokeAlpha: 0 });
    }

    // Release ring: snaps outward from the moment of release, read from the real timestamp.
    if (this.msSinceRelease < A.releaseRingMs) {
      const t = this.msSinceRelease / A.releaseRingMs;
      const radius = Phaser.Math.Linear(s.radius + A.chargeRingEndPad, A.releaseRingRadius, t);
      dottedRing(g, s.x, s.y, radius, this.autoFx === 'auto' ? A.releaseColor : THEME.fx[this.autoFx].core, 1 - t, 3);
      Object.assign(this.releaseRing, { visible: true, radius, strokeAlpha: 1 - t });
    } else {
      Object.assign(this.releaseRing, { visible: false, strokeAlpha: 0 });
    }

    if (this.castKind !== null && this.castProgress > 0) this.drawCast(g, s, bx, by, hand);

    if (s.stunned) this.drawStun(g, bx, by);

    if (this.castReleaseAge < THEME.cast.releaseFlashMs && this.lookOf(this.castReleaseKind).style !== 'none') {
      const t = this.castReleaseAge / THEME.cast.releaseFlashMs;
      pixelDisc(g, hand.x, hand.y, 9 * (1 - t) + 3, THEME.fx[this.lookOf(this.castReleaseKind).fx].core, 1 - t, 3);
    }
  }

  /**
   * The body this frame: the motion of whatever owns it (the cast window, the
   * auto windup, or the latest follow-through), sampled from the real timing.
   * Walking and idling are the plain breathing / hop frames at rest.
   */
  private sampleBody(baseFrame: string, autoFollowing: boolean, castFollowing: boolean): { pose: MotionPose; frame: string; angle: number; glowColor: number } {
    const facingAngle = this.facing > 0 ? 0 : Math.PI;
    if (this.pose === 'cast' && this.castKind !== null) {
      const look = this.lookOf(this.castKind);
      const pose = sampleMotion(look.motion.windup, this.castProgress, this.castWindowMs);
      return { pose, frame: pose.frame ?? 'cast', angle: this.castAngle ?? facingAngle, glowColor: look.motion.glowColor ?? THEME.fx[look.fx].core };
    }
    if (this.pose === 'windup') {
      const pose = sampleMotion(this.autoMotion.windup, this.windup, this.windupMs);
      return { pose, frame: pose.frame ?? 'charge', angle: this.aimAngle ?? facingAngle, glowColor: this.autoMotion.glowColor ?? THEME.fx[this.autoFx].core };
    }
    if (this.pose === 'release') {
      // Both playing (a cast resolved just after an auto, or the reverse): the newer one owns the body.
      if (autoFollowing && (!castFollowing || this.msSinceRelease <= this.castReleaseAge)) {
        const pose = sampleMotion(this.autoMotion.followThrough, this.msSinceRelease / this.autoTempo);
        return { pose, frame: pose.frame ?? baseFrame, angle: this.aimAngle ?? facingAngle, glowColor: this.autoMotion.glowColor ?? THEME.fx[this.autoFx].core };
      }
      const look = this.lookOf(this.castReleaseKind);
      const pose = sampleMotion(look.motion.followThrough, this.castReleaseAge / this.castTempo);
      return { pose, frame: pose.frame ?? baseFrame, angle: this.lastCastAngle, glowColor: look.motion.glowColor ?? THEME.fx[look.fx].core };
    }
    return { pose: { ...REST_POSE }, frame: baseFrame, angle: facingAngle, glowColor: 0xffffff };
  }

  /** A strained shake: two out-of-step swings, up to `px` either way. */
  private trembleOffset(px: number): { x: number; y: number } {
    const phase = (this.visualMs / THEME.motion.trembleMs) * Math.PI;
    return { x: Math.sin(phase) * px, y: Math.sin(phase * 1.37 + 1) * px * 0.6 };
  }

  /** Cast charge-ups, driven only by cast progress. */
  private drawCast(g: Phaser.GameObjects.Graphics, s: PlayerViewState, bx: number, by: number, hand: { x: number; y: number }): void {
    const C = THEME.cast;
    const t = Math.pow(this.castProgress, C.anticipationCurve);
    const a = this.castAngle ?? (this.facing > 0 ? 0 : Math.PI);
    const tipX = hand.x + Math.cos(a) * 16;
    const tipY = hand.y + Math.sin(a) * 16;

    const look = this.lookOf(this.castKind as Slot);
    if (look.style === 'none') return;
    const f = THEME.fx[look.fx];

    if (look.style === 'bolt') {
      for (let i = 1; i <= 3; i++) {
        const d = 6 * i * t;
        pixelDisc(g, hand.x + Math.cos(a) * d, hand.y + Math.sin(a) * d, 2, f.color, 0.4 + 0.2 * i * t, 3);
      }
      pixelDisc(g, tipX, tipY, Phaser.Math.Linear(2, 6, t), f.color, 0.7 + 0.3 * t, 3);
      pixelDisc(g, tipX, tipY, Phaser.Math.Linear(1, 3, t), f.core, 1, 3);
      return;
    }

    if (look.style === 'fang') {
      // Jaws opening at the mouth: two fangs parting either side of the aim, venom welling between.
      const open = C.fangJawPx * t;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      pixelDisc(g, tipX, tipY, 3 + 3 * t, f.deep, 0.6 + 0.4 * t, 3);
      pixelDisc(g, tipX, tipY, 2 + 2 * t, f.color, 0.8, 3);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          // Base at the mouth, out to the side; the point reaches forward and curls in.
          const along = 7 + i * 6;
          const spread = (open + 4) * (1 - i * 0.28);
          pixelDisc(g, hand.x + Math.cos(a) * along + nx * spread * side, hand.y + Math.sin(a) * along + ny * spread * side, 4.5 - i, f.core, 1, 3);
        }
      }
      return;
    }

    if (look.style === 'orb') {
      const r = Phaser.Math.Linear(C.wOrbStartRadius, C.wOrbEndRadius, t);
      for (let i = -1; i <= 1; i++) {
        const spread = a + Math.PI + i * 0.9;
        const d = (1 - t) * 22 + r + 4;
        pixelDisc(g, tipX + Math.cos(spread) * d, tipY + Math.sin(spread) * d, 2, f.color, 0.3 + 0.6 * t, 3);
      }
      pixelDisc(g, tipX, tipY, r, f.deep, 0.9, 3);
      pixelDisc(g, tipX, tipY, r * 0.7, f.color, 1, 3);
      pixelDisc(g, tipX, tipY, r * 0.35, f.core, 1, 3);
      return;
    }

    const pad = Phaser.Math.Linear(C.eRingStartPad, C.eRingEndPad, t);
    const second = 'blue' in f ? f.blue : f.color;
    dottedRing(g, bx, by, s.radius + pad, f.color, 0.4 + 0.6 * t, 3);
    dottedRing(g, bx, by, s.radius + pad + 6, second, 0.25 + 0.4 * t, 3);
    pixelDisc(g, tipX, tipY, 3 + 3 * t, f.core, 0.8, 3);
  }

  /** Little arcane stars circling over the head while stunned. */
  private drawStun(g: Phaser.GameObjects.Graphics, bx: number, by: number): void {
    const S = THEME.player.stun;
    const spin = (this.visualMs / S.spinMs) * Math.PI * 2;
    for (let i = 0; i < S.stars; i++) {
      const a = spin + (i * Math.PI * 2) / S.stars;
      const x = Math.round(bx + Math.cos(a) * S.orbitPx);
      const y = Math.round(by - S.liftPx + Math.sin(a) * 4);
      // A 3x3-pixel plus: core in the middle, arms around it.
      g.fillStyle(S.color, 1);
      g.fillRect(x - 4, y - 1, 3, 3);
      g.fillRect(x + 2, y - 1, 3, 3);
      g.fillRect(x - 1, y - 4, 3, 3);
      g.fillRect(x - 1, y + 2, 3, 3);
      g.fillStyle(S.core, 1);
      g.fillRect(x - 1, y - 1, 3, 3);
    }
  }

  // --------------------------------------------------------------- helpers

  private applyHitTint(img: Phaser.GameObjects.Image, flashMs: number): void {
    if (this.hitAge < 45) img.setTintFill(THEME.fx.hit.color);
    else if (this.hitAge < flashMs) img.setTint(THEME.ui.danger);
    else img.clearTint();
  }

  private edgePoint(bx: number, by: number, angle: number, distance: number): { x: number; y: number } {
    return { x: Math.round(bx + Math.cos(angle) * distance), y: Math.round(by + Math.sin(angle) * distance) };
  }

  private muzzlePoint(): { x: number; y: number; angle: number } {
    const angle = this.aimAngle ?? this.lastAim;
    return { ...this.edgePoint(this.sprite.x, this.sprite.y, angle, THEME.player.muzzleDistance), angle };
  }

  private moveAngle(s: PlayerViewState): number | null {
    if (!s.moving || s.destX === null || s.destY === null) return null;
    const dx = s.destX - s.x;
    const dy = s.destY - s.y;
    if (Math.hypot(dx, dy) < 1) return null;
    return Math.atan2(dy, dx);
  }

  destroy(): void {
    this.glowSprite?.destroy();
    for (const o of [this.sprite, this.muzzle, this.shadow, this.destPip, this.groundGfx, this.overGfx]) o.destroy();
    this.hpBar.destroy();
  }
}
