import { DEFAULT_MODE, ENEMIES, MODES, PURSUER, TARGETS, enemyEntry, type EnemyId, type Mode } from '../../config/balance';

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

/**
 * What a difficulty mode changes, one short line per number that differs from
 * the default mode's, read off MODES so a retune rewrites it. The default mode
 * itself is described as the standard run.
 */
export function modeChanges(mode: Mode): string[] {
  const base: Mode = MODES[DEFAULT_MODE];
  const out: string[] = [];
  const percent = (ratio: number) => Math.round(Math.abs(ratio - 1) * 100);

  if (mode.damageMultiplier !== base.damageMultiplier) {
    out.push(`Damage taken x${+(mode.damageMultiplier / base.damageMultiplier).toFixed(2)}`);
  }
  const size = mode.waveSizeMultiplier / base.waveSizeMultiplier;
  if (size !== 1) out.push(`Waves ${percent(size)}% ${size < 1 ? 'smaller' : 'larger'}`);
  const aim = mode.aimSpeedMultiplier / base.aimSpeedMultiplier;
  if (aim !== 1) out.push(`Enemy aim ${percent(aim)}% ${aim < 1 ? 'slower' : 'faster'}`);

  const ids = Object.keys(ENEMIES) as EnemyId[];
  const moved = ids.filter((id) => enemyEntry(id, mode).unlockStage !== enemyEntry(id, base).unlockStage);
  if (moved.length > 0) {
    out.push(moved.map((id, i) => `${enemyEntry(id, mode).name} ${i === 0 ? 'from stage ' : ''}${enemyEntry(id, mode).unlockStage}`).join(', '));
  }
  // How often a generated wave draws a caster, against the default mode.
  const casterWeight = (m: Mode) =>
    ids.reduce((sum, id) => sum + (enemyEntry(id, m).spellcaster ? enemyEntry(id, m).weight : 0), 0);
  const casters = casterWeight(mode) - casterWeight(base);
  if (casters !== 0) out.push(`Casters appear ${casters < 0 ? 'less' : 'more'} often`);

  if (mode.stageClearBonus !== base.stageClearBonus || out.length === 0) {
    out.push(mode.stageClearBonus > 0 ? `Stage clear bonus ${mode.stageClearBonus}` : 'No stage clear bonus');
  }
  return out.length === 1 && mode.stageClearBonus === base.stageClearBonus ? ['The standard run', ...out] : out;
}

/** A line under DEFEATED, said from the first stage it applies to. */
interface Taunt {
  fromStage: number;
  line: string;
}

/**
 * The end screen's taunts. A mode with its own list uses it; the rest share
 * the default. Within a list, the last line whose `fromStage` you reached wins.
 */
const TAUNTS: { default: Taunt[]; byMode: Record<string, Taunt[]> } = {
  default: [{ fromStage: 1, line: "qwer would've won that..." }],
  byMode: {
    hard: [
      { fromStage: 1, line: "qwer would've won that..." },
      { fromStage: 9, line: "qwer would've won that... probably..." },
    ],
  },
};

export function deathTaunt(modeId: string, stage: number): string {
  const lines = TAUNTS.byMode[modeId] ?? TAUNTS.default;
  return lines.reduce((said, t) => (stage >= t.fromStage ? t.line : said), lines[0].line);
}
