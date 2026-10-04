import { MOUSE } from '../config/balance';
import { Profile } from '../profile/Profile';

/**
 * The player's Mouse Speed: a multiplier on cursor movement, MOUSE.minSpeed to
 * MOUSE.maxSpeed in MOUSE.step increments. `CursorLock` applies it.
 *
 * Saved in the player's Profile like the key bindings: it survives closing
 * the tab.
 */

class MouseSpeedStore {
  private speed: number;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.speed = load() ?? MOUSE.defaultSpeed;
  }

  get value(): number {
    return this.speed;
  }

  /** Set the speed, snapped to the step and clamped to the range. Returns the value kept. */
  set(value: number): number {
    const next = snap(value);
    if (next !== this.speed) {
      this.speed = next;
      save(next);
      for (const fn of this.listeners) fn();
    }
    return this.speed;
  }

  reset(): number {
    return this.set(MOUSE.defaultSpeed);
  }

  /** On-screen value: '1.0', '0.5', '10.0'. */
  label(): string {
    return this.speed.toFixed(1);
  }

  /** Call `fn` after every change. Returns an unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const MouseSpeed = new MouseSpeedStore();

/** Clamp to the range and round to the nearest step (without float drift: 0.1 * 3 is 0.3, not 0.30000000000000004). */
function snap(value: number): number {
  if (!Number.isFinite(value)) return MOUSE.defaultSpeed;
  const clamped = Math.min(MOUSE.maxSpeed, Math.max(MOUSE.minSpeed, value));
  const steps = Math.round((clamped - MOUSE.minSpeed) / MOUSE.step);
  return Number((MOUSE.minSpeed + steps * MOUSE.step).toFixed(6));
}

function load(): number | null {
  const saved = Profile.data.mouseSpeed;
  return Number.isFinite(saved) ? snap(saved) : null;
}

function save(speed: number): void {
  Profile.update((data) => {
    data.mouseSpeed = speed;
  });
}
