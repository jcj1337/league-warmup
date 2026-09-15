/** The game's name as players see it. */
export const GAME_TITLE = "qwer's Backyard";

/**
 * System-message wording for the chat feed. A gameplay stage is presented to
 * the player as a "Mission"; the numbers passed in always come from the
 * authoritative stage state, never from a copy of the table.
 */
export function welcomeMessage(): string {
  return `Welcome to ${GAME_TITLE}!`;
}

export function missionBriefing(mission: number, waves: number, isFinal: boolean): string {
  const count = `${waves} wave${waves === 1 ? '' : 's'}`;
  return isFinal ? `Mission ${mission}: Final mission — clear ${count}.` : `Mission ${mission}: Clear ${count}.`;
}

export function missionComplete(mission: number): string {
  return `Mission ${mission} complete!`;
}
