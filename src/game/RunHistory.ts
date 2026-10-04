import { Profile, type RunRecord } from '../profile/Profile';

/**
 * A local log of finished runs, for tuning the difficulty curve against real
 * play: where each run ended, what killed it, and which growth setting it was
 * played on. Kept in the player's Profile (this browser's localStorage):
 * nothing leaves the machine. To discard the data, run `__runs.clear()`.
 *
 * RunRecord fields (see Profile.ts for the type):
 *   at              ISO timestamp of when the run ended
 *   growth          DIFFICULTY.growth the run was played on; runs are only compared within one setting
 *   balanceVersion  BALANCE_VERSION it was played on (absent on runs logged before it existed)
 *   level / score   the player's level and final score (absent on older runs)
 *   killedBy        source of the hit that took the last HP ('pursuer', 'basic', 'magus', 'edgeFire'), or null
 *   damageTaken     HP actually lost over the run, per source
 *   stageDamage     the same for the stage that ended the run (HP is restored at every stage clear)
 *   champion        who was played (absent on runs from before champions: Ezreal)
 */

export type { RunRecord } from '../profile/Profile';

export interface RunSummary {
  growth: number;
  balanceVersion: number;
  champion: string;
  runs: number;
  /** Median stage reached; null with no runs. */
  median: number | null;
  best: number | null;
  /** Highest score among these runs; null with none recorded. */
  bestScore: number | null;
  /** Stages reached by the most recent runs, oldest first. */
  recent: number[];
  /** How often each source dealt the killing blow. */
  killedBy: Record<string, number>;
}

const read = (): RunRecord[] => Profile.data.runs;

export const RunHistory = {
  /** Every logged run, oldest first. */
  list(): RunRecord[] {
    return [...read()];
  },

  /** Log a finished run. The Profile caps the log (oldest dropped). */
  record(run: RunRecord): void {
    Profile.update((data) => {
      data.runs.push(run);
    });
  },

  /** Delete the whole log. */
  clear(): void {
    Profile.update((data) => {
      data.runs = [];
    });
  },

  /** Stats over the runs played as one champion on one growth setting and balance version. */
  summary(growth: number, balanceVersion: number, champion = 'ezreal', recentCount = 10): RunSummary {
    const runs = read().filter(
      (r) => r.growth === growth && (r.balanceVersion ?? 0) === balanceVersion && (r.champion ?? 'ezreal') === champion,
    );
    const stages = runs.map((r) => r.stage).sort((a, b) => a - b);
    const mid = Math.floor(stages.length / 2);
    const median = stages.length === 0 ? null
      : stages.length % 2 === 1 ? stages[mid]
      : (stages[mid - 1] + stages[mid]) / 2;
    const killedBy: Record<string, number> = {};
    for (const r of runs) if (r.killedBy) killedBy[r.killedBy] = (killedBy[r.killedBy] ?? 0) + 1;
    return {
      growth,
      balanceVersion,
      champion,
      runs: runs.length,
      median,
      best: stages.length ? stages[stages.length - 1] : null,
      bestScore: runs.some((r) => r.score !== undefined) ? Math.max(...runs.map((r) => r.score ?? 0)) : null,
      recent: runs.slice(-recentCount).map((r) => r.stage),
      killedBy,
    };
  },
};
