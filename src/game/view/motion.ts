import type { Motion, MotionEase, MotionKey } from '../../champions/types';
import { THEME } from '../../config/theme';

/**
 * Sampling a champion's Motion: where the body is at a point in a windup or
 * follow-through. Pure, so a suite can ask it questions without drawing.
 */

/** A fully resolved pose: every channel set. */
export interface MotionPose {
  frame: string | null;
  sx: number;
  sy: number;
  along: number;
  side: number;
  up: number;
  tremble: number;
  glow: number;
}

export const REST_POSE: Readonly<MotionPose> = { frame: null, sx: 1, sy: 1, along: 0, side: 0, up: 0, tremble: 0, glow: 0 };

const NUMERIC = ['sx', 'sy', 'along', 'side', 'up', 'tremble', 'glow'] as const;

const EASES: Record<MotionEase, (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  snap: (u) => (u >= 1 ? 1 : 0),
};

interface Resolved {
  at: number;
  ease: MotionEase;
  pose: MotionPose;
}

/** The keys that play at this window length, each carrying forward what the key before it set. */
function resolve(keys: readonly MotionKey[], windowMs: number): Resolved[] {
  const out: Resolved[] = [];
  let pose: MotionPose = { ...REST_POSE };
  for (const key of keys) {
    if (key.minWindowMs !== undefined && windowMs < key.minWindowMs) continue;
    pose = { ...pose };
    if (key.frame !== undefined) pose.frame = key.frame;
    for (const ch of NUMERIC) if (key[ch] !== undefined) pose[ch] = key[ch]!;
    out.push({ at: key.at, ease: key.ease ?? 'linear', pose });
  }
  // Every phase starts at rest: a first key after 0 is eased into from it.
  if (out.length === 0 || out[0].at > 0) out.unshift({ at: 0, ease: 'linear', pose: { ...REST_POSE, frame: out[0]?.pose.frame ?? null } });
  return out;
}

/**
 * The pose at `t` through `keys`: a 0..1 fraction for a windup, ms (already
 * divided by tempo) for a follow-through. `windowMs` decides which keys play.
 */
export function sampleMotion(keys: readonly MotionKey[], t: number, windowMs = Number.POSITIVE_INFINITY): MotionPose {
  const list = resolve(keys, windowMs);
  let i = 0;
  while (i + 1 < list.length && list[i + 1].at <= t) i++;
  const prev = list[i];
  const next = list[i + 1];
  if (!next) return { ...prev.pose };
  const span = next.at - prev.at;
  const u = EASES[next.ease](span > 0 ? Math.min(1, Math.max(0, (t - prev.at) / span)) : 1);
  const pose: MotionPose = { ...prev.pose };
  for (const ch of NUMERIC) pose[ch] = prev.pose[ch] + (next.pose[ch] - prev.pose[ch]) * u;
  return pose;
}

/** How long a follow-through runs at level-1 tempo: its last key. */
export function followThroughMs(motion: Motion): number {
  const keys = motion.followThrough;
  return keys.length ? keys[keys.length - 1].at : 0;
}

/**
 * How much a follow-through is compressed: the window now against the window
 * it was authored for, never below THEME.motion.minTempo. 1 at level 1.
 */
export function tempoOf(windowMs: number, baseWindowMs: number): number {
  if (!(baseWindowMs > 0)) return 1;
  return Math.min(1, Math.max(THEME.motion.minTempo, windowMs / baseWindowMs));
}

/** Every frame name a motion uses, so a missing one fails at load, not mid-run. */
export function motionFrames(motion: Motion | undefined): string[] {
  if (!motion) return [];
  return [...motion.windup, ...motion.followThrough].flatMap((k) => (k.frame !== undefined ? [k.frame] : []));
}

/** The engine's auto when a champion authors none: hunker and lean in, pop and kick back. */
export function defaultAutoMotion(): Motion {
  const A = THEME.player.attack;
  return {
    windup: [{ at: 0, frame: 'charge' }, { at: 1, along: A.windupLeanPx }],
    followThrough: [{ at: 0, frame: 'stretch', along: -A.releaseKickPx }, { at: A.releaseKickMs, along: 0 }],
  };
}

/** The engine's cast when a slot authors none: the "o" mouth for the window, nothing after. */
export const DEFAULT_CAST_MOTION: Motion = {
  windup: [{ at: 0, frame: 'cast' }],
  followThrough: [],
};
