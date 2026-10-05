import Phaser from 'phaser';
import type { Champion } from '../../champions/types';
import { ARENA, ENEMIES, type EnemyId } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { ensurePlayerFrames, type PlayerLook } from '../art/look';
import { TEX } from '../art/textures';
import { modeOf } from '../Mode';
import type { RoundResult } from '../Run';
import type { RunSummary } from '../RunHistory';
import { easeOut, pixelPanel } from '../view/pixelDraw';
import { deathTaunt } from './missionMessages';
import { modeTint } from './ModeRow';

/** The panel, and the left / right edge of what sits inside it. */
const PANEL_W = 920;
const PANEL_TOP = 36;
const PANEL_H = 652;
const LEFT = ARENA.width / 2 - PANEL_W / 2 + 48;
const RIGHT = ARENA.width / 2 + PANEL_W / 2 - 48;

/** Each block's line, top to bottom. */
const Y = {
  title: 84,
  taunt: 124,
  summary: 152,
  card: 176,
  trackHeader: 300,
  trackNode: 364,
  trackLabel: 386,
  score: 430,
  scoreBar: 456,
  scoreLegend: 484,
  kills: 544,
  kit: 578,
  buttons: 634,
};

const PORTRAIT = 96;
const DAMAGE_X = 640;
const DAMAGE_BAR_W = 150;
/** Line height of the score legend. */
const LEGEND_LINE = 22;

/** The sprite that stands for a damage source or mob; an unlisted one is named without a picture. */
const PORTRAITS: Record<string, string> = {
  basic: TEX.basic.frames[0],
  pursuer: TEX.pursuer.walk[0],
  magus: TEX.magus.idle[0],
  sovereign: TEX.sovereign.idle[0],
  bulwark: TEX.bulwark.walk[0],
  edgeFire: TEX.proj.hostile[0],
};

/** Damage sources that aren't a mob (mobs are named by ENEMIES). */
const HAZARD_NAMES: Record<string, string> = { edgeFire: 'Edge fire' };

const SCORE_PARTS = [
  { key: 'kills', label: 'KILLS' },
  { key: 'speed', label: 'CLEAR SPEED BONUS' },
  { key: 'hp', label: 'HP BONUS' },
  { key: 'clear', label: 'STAGE CLEAR BONUS' },
  { key: 'kit', label: 'ABILITY BONUS', optional: true },
] as const satisfies readonly { key: string; label: string; optional?: boolean }[];

/** The order the blocks arrive in. */
const STEP = { header: 0, card: 1, track: 2, score: 3, details: 4 };

interface Source {
  id: string;
  label: string;
  color: number;
  texture: string | null;
}

interface Tally extends Source {
  amount: number;
}

/** A mob or hazard as the end screen shows it. A mob's body contact ('basicContact') is that mob. */
function sourceOf(raw: string): Source {
  const id = raw.endsWith('Contact') ? raw.slice(0, -'Contact'.length) : raw;
  const name = id in ENEMIES ? ENEMIES[id as EnemyId].name : HAZARD_NAMES[id] ?? id;
  return {
    id,
    label: name.toUpperCase(),
    color: THEME.endScreen.sources[id] ?? THEME.ui.text,
    texture: PORTRAITS[id] ?? null,
  };
}

/** Amounts per source, a mob's contact folded into the mob, largest first; zeroes dropped. */
function tally(amounts: Record<string, number>): Tally[] {
  const bySource = new Map<string, Tally>();
  for (const [raw, amount] of Object.entries(amounts)) {
    if (amount <= 0) continue;
    const source = sourceOf(raw);
    const entry = bySource.get(source.id) ?? { ...source, amount: 0 };
    entry.amount += amount;
    bySource.set(source.id, entry);
  }
  return [...bySource.values()].sort((a, b) => b.amount - a.amount);
}

/** The largest `rows` tallies, with the rest folded into one OTHER row. */
function topRows(all: Tally[], rows: number): Tally[] {
  if (all.length <= rows) return all;
  const rest = all.slice(rows - 1).reduce((sum, t) => sum + t.amount, 0);
  return [...all.slice(0, rows - 1), { id: 'other', label: 'OTHER', color: THEME.ui.dim, texture: null, amount: rest }];
}

/** "STAGE 9  SCORE 45200  (8 RUNS)": your best on the current balance version. */
function bestLine(s: RunSummary): string {
  if (s.runs === 0) return 'not logged';
  const score = s.bestScore !== null ? `  SCORE ${s.bestScore}` : '';
  return `STAGE ${s.best}${score}  (${s.runs} ${s.runs === 1 ? 'RUN' : 'RUNS'})`;
}

export interface EndScreenRun {
  result: RoundResult;
  /** Your logged runs like this one (champion, mode, growth, balance version), this run included. */
  best: RunSummary;
  champion: Champion;
  look: PlayerLook;
  /** The run time as the HUD writes it. */
  time: string;
}

type Fading = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.AlphaSingle;

interface Segment {
  text: string;
  color?: number;
  scale?: number;
}

/**
 * The end screen: one block per question a finished run raises.
 *   what killed me?   the killer's portrait and name, and who took your HP in the last stage
 *   how far did I get? a track of stages with your best marked on it
 *   how did I score?  the score over a bar of where it came from
 *   what did I do?    kills by mob, and the champion's own lines
 * Pure view: it is handed a finished run and draws it. The blocks arrive one
 * after another on the scene's own time (the run is over, so nothing here is
 * a gameplay deadline); a click or a key shows the rest at once.
 */
export class EndScreen {
  readonly container: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  /** Everything drawn for the run on show, rebuilt for the next one. */
  private body: Phaser.GameObjects.GameObject[] = [];
  private fades: { target: Fading; step: number }[] = [];
  private scoreValue: Phaser.GameObjects.BitmapText | null = null;
  private stamp: Phaser.GameObjects.BitmapText | null = null;
  private score = 0;
  /** How far the kills and kit rows sit below their usual lines (a long score legend). */
  private detailsShift = 0;
  /** Scene time the screen came up at; -Infinity once the reveal is skipped. */
  private shownAt = 0;
  private settled = true;
  private lines: string[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    actions: { playAgain: () => void; returnToSelect: () => void },
  ) {
    const bg = scene.add
      .rectangle(0, 0, ARENA.width, ARENA.height, THEME.ui.scrim, 0.8)
      .setOrigin(0, 0)
      .setInteractive();
    bg.on('pointerdown', () => this.skip());
    scene.input.keyboard?.on('keydown', () => {
      if (this.container.visible) this.skip();
    });

    this.plate = scene.add.graphics();
    const title = pixelText(scene, ARENA.width / 2, Y.title, 'DEFEATED', 6, THEME.ui.danger).setOrigin(0.5);
    title.setName('title');

    const button = (cx: number, label: string, onClick: () => void): Phaser.GameObjects.GameObject[] => {
      const box = scene.add
        .rectangle(cx, Y.buttons, 280, 48, THEME.menu.button)
        .setStrokeStyle(3, THEME.ui.accent)
        .setInteractive({ useHandCursor: true });
      const text = pixelText(scene, cx, Y.buttons, label, 2, THEME.ui.accent).setOrigin(0.5);
      box.on('pointerover', () => box.setFillStyle(THEME.menu.buttonHover));
      box.on('pointerout', () => box.setFillStyle(THEME.menu.button));
      box.on('pointerdown', onClick);
      return [box, text];
    };

    this.container = scene.add
      .container(0, 0, [
        bg,
        this.plate,
        title,
        ...button(ARENA.width / 2 - 160, 'PLAY AGAIN  [R]', actions.playAgain),
        ...button(ARENA.width / 2 + 160, 'RETURN TO SELECT', actions.returnToSelect),
      ])
      .setDepth(200)
      .setVisible(false);
  }

  /** What the screen says, as plain lines: the same facts the blocks draw. */
  get text(): string {
    return this.lines.join('\n');
  }

  show(run: EndScreenRun): void {
    this.clearBody();
    const { result } = run;

    // A new best frames the whole card in gold.
    this.plate.clear();
    pixelPanel(this.plate, ARENA.width / 2 - PANEL_W / 2, PANEL_TOP, PANEL_W, PANEL_H, {
      fill: THEME.ui.panel,
      fillAlpha: 0.96,
      edge: result.newBest ? THEME.ui.accent : THEME.ui.panelEdge,
      highlight: THEME.ui.panelHighlight,
      border: 3,
    });

    const row = (label: string, value: string) => `${label.padEnd(16, ' ')}${value}`;
    this.lines = [];

    this.drawHeader(run, row);
    this.drawDeathCard(result, row);
    this.drawTrack(run);
    this.drawScore(run, row);
    this.drawDetails(result, row);
    this.lines.push(row('YOUR BEST', bestLine(run.best)));

    this.shownAt = this.scene.time.now;
    this.settled = false;
    this.container.setVisible(true);
    this.update();
  }

  hide(): void {
    this.container.setVisible(false);
  }

  /** Show everything now. */
  skip(): void {
    this.shownAt = Number.NEGATIVE_INFINITY;
  }

  /** Advance the reveal. Called every frame by the scene that owns the screen. */
  update(): void {
    if (this.settled || !this.container.visible) return;
    const R = THEME.endScreen.reveal;
    const elapsed = this.scene.time.now - this.shownAt;
    const through = (startMs: number, lengthMs: number) => Phaser.Math.Clamp((elapsed - startMs) / lengthMs, 0, 1);

    let lastStep = 0;
    for (const { target, step } of this.fades) {
      target.setAlpha(through(step * R.stepMs, R.fadeMs));
      lastStep = Math.max(lastStep, step);
    }
    const counted = through(STEP.score * R.stepMs, R.scoreCountMs);
    this.scoreValue?.setText(`${Math.round(this.score * easeOut(counted))}`);
    const stampStart = (lastStep + 1) * R.stepMs;
    const stamped = through(stampStart, R.stampMs);
    this.stamp
      ?.setAlpha(elapsed >= stampStart ? 1 : 0)
      .setScale(Phaser.Math.Linear(R.stampFromScale, 1, Phaser.Math.Easing.Back.Out(stamped)));

    this.settled = elapsed >= Math.max(stampStart + R.stampMs, STEP.score * R.stepMs + R.scoreCountMs);
  }

  private clearBody(): void {
    for (const obj of this.body) obj.destroy();
    this.body = [];
    this.fades = [];
    this.scoreValue = null;
    this.stamp = null;
  }

  /** Put a run's object on the card, fading in with its block. */
  private put<T extends Fading>(step: number, obj: T): T {
    this.container.add(obj);
    this.body.push(obj);
    this.fades.push({ target: obj, step });
    return obj;
  }

  /**
   * A line of differently coloured pieces, `gap` apart, on the centre line `y`.
   * `anchor` 0 starts it at `x`, 0.5 centres it there, 1 ends it there.
   * @returns the x just past its last piece.
   */
  private line(step: number, x: number, y: number, parts: Segment[], anchor: 0 | 0.5 | 1 = 0, gap = 12): number {
    const texts = parts.map((p) =>
      this.put(step, pixelText(this.scene, 0, y, p.text, p.scale ?? 2, p.color ?? THEME.ui.text).setOrigin(0, 0.5)),
    );
    const width = texts.reduce((sum, t) => sum + t.width, 0) + gap * Math.max(0, texts.length - 1);
    let at = Math.round(x - width * anchor);
    for (const t of texts) {
      t.setX(at);
      at += t.width + gap;
    }
    return at - gap;
  }

  /** The taunt, and the run in one line: where it ended, on what, as what level, how long it took. */
  private drawHeader(run: EndScreenRun, row: (label: string, value: string) => string): void {
    const { result } = run;
    const mode = modeOf(result.mode);
    const taunt = deathTaunt(mode.id, result.stageReached);
    const cx = ARENA.width / 2;

    this.line(STEP.header, cx, Y.taunt, [{ text: taunt.toUpperCase(), color: THEME.ui.dim }], 0.5);
    this.line(STEP.header, cx, Y.summary, [
      { text: `STAGE ${result.stageReached}` },
      { text: `WAVE ${result.waveReached}/${result.wavesInStage}`, color: THEME.ui.dim },
      { text: mode.name.toUpperCase(), color: modeTint(mode.id) },
      { text: `LV ${result.level}`, color: THEME.ui.dim },
      { text: run.time, color: THEME.ui.dim },
    ], 0.5, 28);

    this.lines.push(
      taunt,
      row(
        'STAGE REACHED',
        `${result.stageReached}  (wave ${result.waveReached}/${result.wavesInStage})  LV ${result.level}${result.newBest ? '  NEW BEST!' : ''}`,
      ),
      row('DIFFICULTY', mode.name.toUpperCase()),
      row('TIME', run.time),
    );
  }

  /** The killer's portrait and name, beside who took your HP in the stage that ended the run. */
  private drawDeathCard(result: RoundResult, row: (label: string, value: string) => string): void {
    const step = STEP.card;
    const killer = result.killedBy ? sourceOf(result.killedBy) : null;

    if (killer) {
      const frame = this.put(step, this.scene.add.graphics());
      pixelPanel(frame, LEFT, Y.card, PORTRAIT, PORTRAIT, {
        fill: THEME.menu.button, fillAlpha: 1, edge: killer.color, border: 3,
      });
      if (killer.texture) {
        const source = this.scene.textures.get(killer.texture).getSourceImage();
        const scale = Math.max(1, Math.floor((PORTRAIT - 18) / Math.max(source.width, source.height)));
        this.put(step, this.scene.add.image(LEFT + PORTRAIT / 2, Y.card + PORTRAIT / 2, killer.texture).setScale(scale));
      }
      this.line(step, LEFT + PORTRAIT + 20, Y.card + 26, [{ text: 'SLAIN BY', color: THEME.ui.dim }]);
      this.line(step, LEFT + PORTRAIT + 20, Y.card + 62, [{ text: killer.label, color: killer.color, scale: 4 }]);
      this.lines.push(row('SLAIN BY', killer.label));
    }

    const lost = tally(result.stageDamage);
    if (lost.length === 0) return;
    const total = lost.reduce((sum, t) => sum + t.amount, 0);
    const rows = topRows(lost, THEME.endScreen.damageRows);

    this.line(step, DAMAGE_X, Y.card + 10, [{ text: 'HP LOST THIS STAGE', color: THEME.ui.dim }]);
    const bars = this.put(step, this.scene.add.graphics());
    rows.forEach((t, i) => {
      const y = Y.card + 38 + i * 24;
      bars.fillStyle(THEME.ui.panelEdge, 1);
      bars.fillRect(DAMAGE_X, y - 5, DAMAGE_BAR_W, 10);
      bars.fillStyle(t.color, 1);
      bars.fillRect(DAMAGE_X, y - 5, Math.max(2, Math.round((DAMAGE_BAR_W * t.amount) / total)), 10);
      this.line(step, DAMAGE_X + DAMAGE_BAR_W + 14, y, [{ text: t.label, color: t.color }, { text: `${Math.round(t.amount)}` }]);
    });
    this.lines.push(row('LOST THIS STAGE', rows.map((t) => `${t.label} ${Math.round(t.amount)}`).join('  ')));
  }

  /**
   * Stage 1 to one past the furthest you have been: cleared stages lit, the one
   * that ended the run in red under your slime, your earlier best in gold.
   */
  private drawTrack(run: EndScreenRun): void {
    const step = STEP.track;
    const { result } = run;
    const reached = result.stageReached;
    const best = result.previousBest;

    this.line(step, LEFT, Y.trackHeader, [{ text: 'PROGRESS', color: THEME.ui.dim }]);
    if (result.newBest) {
      // The stamp scales about its own centre, so it is placed by it.
      const stamp = pixelText(this.scene, 0, Y.trackHeader, 'NEW BEST!', 3, THEME.ui.accent).setOrigin(0.5);
      stamp.setX(Math.round(RIGHT - stamp.width / 2));
      this.container.add(stamp);
      this.body.push(stamp);
      this.stamp = stamp;
      const gained = best === null ? null : reached - best;
      this.line(step, RIGHT - stamp.width - 20, Y.trackHeader, [
        gained === null
          ? { text: 'FIRST RUN', color: THEME.ui.dim }
          : { text: `+${gained} ${gained === 1 ? 'STAGE' : 'STAGES'}`, color: THEME.ui.good },
      ], 1);
    } else if (best !== null) {
      this.line(step, RIGHT, Y.trackHeader, [{ text: 'YOUR BEST', color: THEME.ui.dim }, { text: `STAGE ${best}`, color: THEME.ui.accent }], 1);
    }

    const last = Math.max(reached, best ?? 0) + 1;
    const pitch = Math.min(THEME.endScreen.trackMaxPitch, (RIGHT - LEFT - 40) / Math.max(1, last - 1));
    const x0 = ARENA.width / 2 - (pitch * (last - 1)) / 2;
    const xOf = (stage: number) => Math.round(x0 + pitch * (stage - 1));
    const y = Y.trackNode;

    const g = this.put(step, this.scene.add.graphics());
    g.fillStyle(THEME.ui.panelEdge, 1);
    g.fillRect(xOf(1), y - 1, xOf(last) - xOf(1), 3);
    g.fillStyle(THEME.ui.text, 1);
    g.fillRect(xOf(1), y - 1, xOf(reached) - xOf(1), 3);

    // Every number when there is room for them; on a long track only the ones that matter.
    const roomy = pitch >= 30;
    const bestHasRoom = best !== null && Math.abs(best - reached) * pitch >= 30;
    for (let stage = 1; stage <= last; stage++) {
      const x = xOf(stage);
      const died = stage === reached;
      const wasBest = stage === best && !died;
      const color = died ? THEME.ui.danger : wasBest ? THEME.ui.accent : stage < reached ? THEME.ui.text : THEME.ui.panelEdge;
      const half = died ? 8 : 6;
      g.fillStyle(THEME.ui.panel, 1);
      g.fillRect(x - half - 2, y - half - 2, half * 2 + 4, half * 2 + 4);
      g.fillStyle(color, 1);
      g.fillRect(x - half, y - half, half * 2, half * 2);
      if (stage > reached && !wasBest) {
        g.fillStyle(THEME.ui.panel, 1);
        g.fillRect(x - half + 3, y - half + 3, half * 2 - 6, half * 2 - 6);
      }

      if (roomy || stage === 1 || died || (wasBest && bestHasRoom)) {
        const tint = died ? THEME.ui.danger : wasBest ? THEME.ui.accent : stage < reached ? THEME.ui.dim : THEME.ui.faint;
        this.line(step, x, Y.trackLabel, [{ text: `${stage}`, color: tint }], 0.5);
      }
    }

    const frames = ensurePlayerFrames(this.scene, run.champion, run.look);
    this.put(step, this.scene.add.image(xOf(reached), y - 12, frames.frames.idle[0]).setOrigin(0.5, 1).setScale(2));
  }

  /** The score, large, over one bar split by where it came from. */
  private drawScore(run: EndScreenRun, row: (label: string, value: string) => string): void {
    const step = STEP.score;
    const { result, best } = run;
    this.score = result.score;

    const after = this.line(step, LEFT, Y.score, [{ text: 'SCORE', color: THEME.ui.dim }]);
    this.scoreValue = this.put(step, pixelText(this.scene, after + 16, Y.score, '0', 4, THEME.ui.accent).setOrigin(0, 0.5));
    if (best.bestScore !== null && best.runs > 1) {
      this.line(step, RIGHT, Y.score, best.bestScore <= result.score
        ? [{ text: 'YOUR BEST SCORE', color: THEME.ui.accent }]
        : [{ text: 'YOUR BEST', color: THEME.ui.dim }, { text: `${best.bestScore}`, color: THEME.ui.dim }], 1);
    }

    // A part only some champions earn (the kit's own awards) is listed when the run has any.
    const parts = SCORE_PARTS
      .map((p) => ({ ...p, points: Math.max(0, result.scoreFrom[p.key]), color: THEME.endScreen.scoreFrom[p.key] }))
      .filter((p) => !('optional' in p && p.optional) || p.points > 0);
    // A third legend line pushes the rows under it down.
    this.detailsShift = parts.length > 4 ? 12 : 0;
    const total = parts.reduce((sum, p) => sum + p.points, 0);
    const width = RIGHT - LEFT;
    const bar = this.put(step, this.scene.add.graphics());
    bar.fillStyle(THEME.ui.panelEdge, 1);
    bar.fillRect(LEFT, Y.scoreBar, width, 12);
    let x = LEFT;
    let spent = 0;
    for (const p of parts) {
      if (total <= 0 || p.points <= 0) continue;
      // Cut from the running total, so the segments always end exactly at the bar's end.
      spent += p.points;
      const end = LEFT + Math.round((width * spent) / total);
      bar.fillStyle(p.color, 1);
      bar.fillRect(x, Y.scoreBar, Math.max(1, end - x - (spent < total ? 2 : 0)), 12);
      x = end;
    }

    const legend = this.put(step, this.scene.add.graphics());
    // Two to a line, in the bar's order: the full names don't fit on one.
    parts.forEach((p, i) => {
      const at = LEFT + (i % 2) * (width / 2);
      const y = Y.scoreLegend + Math.floor(i / 2) * LEGEND_LINE;
      legend.fillStyle(p.color, p.points > 0 ? 1 : 0.35);
      legend.fillRect(at, y - 5, 10, 10);
      this.line(step, at + 18, y, [
        { text: p.label, color: THEME.ui.dim },
        { text: `${p.points}`, color: p.points > 0 ? THEME.ui.text : THEME.ui.faint },
      ]);
    });

    this.lines.push(
      row('SCORE', `${result.score}`),
      row('SCORE FROM', parts.map((p) => `${p.label} ${p.points}`).join('  ')),
    );
  }

  /** Kills as a row of the mobs themselves, then the champion's own lines. */
  private drawDetails(result: RoundResult, row: (label: string, value: string) => string): void {
    const step = STEP.details;
    const kills = tally(result.killsByType);
    const killsY = Y.kills + this.detailsShift;
    const kitY = Y.kit + this.detailsShift;

    let at = this.line(step, LEFT, killsY, [{ text: 'KILLS', color: THEME.ui.dim }, { text: `${result.targetsKilled}` }]) + 36;
    for (const k of kills) {
      if (k.texture) {
        const icon = this.put(step, this.scene.add.image(at, killsY, k.texture).setOrigin(0, 0.5).setScale(2));
        at += icon.displayWidth + 8;
        at = this.line(step, at, killsY, [{ text: `${k.amount}` }]) + 28;
      } else {
        at = this.line(step, at, killsY, [{ text: k.label, color: k.color }, { text: `${k.amount}` }]) + 28;
      }
    }

    at = LEFT;
    for (const stat of result.kitRows) {
      at = this.line(step, at, kitY, [{ text: stat.label, color: THEME.ui.dim }, { text: stat.value }]) + 48;
    }

    this.lines.push(
      row('KILLS', `${result.targetsKilled}`),
      row('KILLS BY TYPE', kills.length ? kills.map((k) => `${k.label} ${k.amount}`).join('  ') : 'none'),
      ...result.kitRows.map((stat) => row(stat.label, stat.value)),
    );
  }
}
