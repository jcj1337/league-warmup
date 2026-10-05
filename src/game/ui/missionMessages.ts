import { ENEMIES, PURSUER, TARGETS, enemyEntry, type EnemyId, type Mode } from '../../config/balance';

/** The game's name as players see it. */
export const GAME_TITLE = 'hands diff';

/**
 * System-message wording for the chat feed. A gameplay stage is presented to
 * the player as a "Mission"; the numbers passed in always come from the
 * authoritative stage state, never from a copy of the table.
 */
export function welcomeMessage(): string {
  return `Welcome to ${GAME_TITLE}!`;
}

export function missionBriefing(mission: number, waves: number): string {
  return `Mission ${mission}: Clear ${waves} wave${waves === 1 ? '' : 's'}.`;
}

/**
 * What a stage introduces: mobs on their unlock stage in this mode, and new
 * attacks on the stage they switch on. Stage 1 introduces nothing (the opening
 * is the intro).
 */
export function stageThreats(stage: number, mode: Mode): string[] {
  if (stage <= 1) return [];
  const out: string[] = [];
  for (const id of Object.keys(ENEMIES) as EnemyId[]) {
    const e = enemyEntry(id, mode);
    if (e.unlockStage === stage) out.push(`New threat: ${e.name}.`);
  }
  if (TARGETS.spit.fromStage === stage) out.push('New threat: slimes now spit.');
  if (PURSUER.dash.fromStage === stage) out.push('New threat: Pursuers now dash.');
  return out;
}

export function missionComplete(mission: number): string {
  return `Mission ${mission} complete!`;
}
