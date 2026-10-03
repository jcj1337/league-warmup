import { MOUSE } from '../config/balance';

/**
 * The player's Mouse Speed: a multiplier on cursor movement, MOUSE.minSpeed to
 * MOUSE.maxSpeed in MOUSE.step increments. `CursorLock` applies it.
 *
 * Saved in this tab's sessionStorage like the key bindings: it survives a
 * reload but not closing the tab. Storage can be unavailable, so every read and
 * write is guarded: the default always works.
 */

const STORAGE_KEY = 'warmup.mouseSpeed.v1';

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
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? snap(parsed) : null;
  } catch {
    return null;
  }
}

function save(speed: number): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(speed));
  } catch {
    // Storage blocked: the speed still holds for this page.
  }
}
