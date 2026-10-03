/**
 * A local log of finished runs, for tuning the difficulty curve against real
 * play: where each run ended, what killed it, and which growth setting it was
 * played on. Kept in this browser's localStorage only — nothing leaves the
 * machine.
 *
 * Self-contained on purpose: to discard the feature, delete this file, its two
 * call sites (GameScene.endRound, the UIScene end screen) and the `__runs`
 * console hook in main.ts. To discard the data, run `__runs.clear()`.
 *
 * Storage can be unavailable (private windows, blocked site data), so every
 * read and write is guarded: the game never depends on it.
 */

export interface RunRecord {
  /** ISO timestamp of when the run ended. */
  at: string;
  outcome: 'completed' | 'defeated';
  stage: number;
  wave: number;
  runTimeSeconds: number;
  /** DIFFICULTY.growth the run was played on. Runs are only compared within one setting. */
  growth: number;
  /** Source of the hit that took the last HP ('pursuer', 'basic', 'magus', 'edgeFire'), or null. */
  killedBy: string | null;
  /** Damage actually taken over the run, per source. */
  damageTaken: Record<string, number>;
}

export interface RunSummary {
  growth: number;
  runs: number;
  /** Median stage reached; null with no runs. */
  median: number | null;
  best: number | null;
  /** Stages reached by the most recent runs, oldest first. */
  recent: number[];
  /** How often each source dealt the killing blow. */
  killedBy: Record<string, number>;
}

const KEY = 'warmup.runHistory.v1';
/** Oldest runs are dropped past this. */
const MAX_RUNS = 500;

function read(): RunRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(runs: RunRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    // Storage unavailable or full: the run simply isn't logged.
  }
}

export const RunHistory = {
  /** Every logged run, oldest first. */
  list(): RunRecord[] {
    return read();
  },

  record(run: RunRecord): void {
    const runs = read();
    runs.push(run);
    write(runs);
  },

  /** Delete the whole log. */
  clear(): void {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  },

  /** Stats over the runs played on one growth setting. */
  summary(growth: number, recentCount = 10): RunSummary {
    const runs = read().filter((r) => r.growth === growth);
    const stages = runs.map((r) => r.stage).sort((a, b) => a - b);
    const mid = Math.floor(stages.length / 2);
    const median = stages.length === 0 ? null
      : stages.length % 2 === 1 ? stages[mid]
      : (stages[mid - 1] + stages[mid]) / 2;
    const killedBy: Record<string, number> = {};
    for (const r of runs) if (r.killedBy) killedBy[r.killedBy] = (killedBy[r.killedBy] ?? 0) + 1;
    return {
      growth,
      runs: runs.length,
      median,
      best: stages.length ? stages[stages.length - 1] : null,
      recent: runs.slice(-recentCount).map((r) => r.stage),
      killedBy,
    };
  },
};
