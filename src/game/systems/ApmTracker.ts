import { APM } from '../../config/balance';

/**
 * Actions per minute over a rolling window of GameClock time.
 *
 * InputController reports every raw player input (each non-repeat key press
 * and mouse-button press, bound or not); this only counts them. Nothing reads it except the HUD, so it can
 * never influence scoring or gameplay.
 *
 *   apm = actionsInWindow / max(min(elapsed, windowMs), minWindowMs) * 60000
 *
 * Measuring against the elapsed run time until the window fills keeps early
 * readings honest; the minWindowMs floor stops the first second's two or three
 * clicks from reading as hundreds of APM.
 */
export class ApmTracker {
  /** Lifetime count of recorded actions this round. */
  public total = 0;

  /** Timestamps inside the window, oldest first. */
  private readonly times: number[] = [];

  constructor(private startMs = 0) {}

  record(nowMs: number): void {
    this.times.push(nowMs);
    this.total++;
    this.prune(nowMs);
  }

  /** Actions per minute as of `nowMs`, rounded to a whole number. */
  valueAt(nowMs: number): number {
    this.prune(nowMs);
    const elapsed = Math.min(Math.max(0, nowMs - this.startMs), APM.windowMs);
    const span = Math.max(elapsed, APM.minWindowMs);
    return Math.round((this.times.length / span) * 60000);
  }

  reset(startMs: number): void {
    this.startMs = startMs;
    this.times.length = 0;
    this.total = 0;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - APM.windowMs;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] <= cutoff) drop++;
    if (drop > 0) this.times.splice(0, drop);
  }
}
