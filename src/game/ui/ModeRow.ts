import Phaser from 'phaser';
import type { Mode } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';
import { modeChanges } from './missionMessages';
import { Tooltip } from './Tooltip';

/** Button size and the clear space between neighbours, in screen pixels. */
const BUTTON_W = 116;
const BUTTON_H = 30;
const GAP = 14;
/** The gap between a button and the tooltip hung under it. */
const TIP_GAP = 8;

/**
 * The difficulty picker on the start screen: a caption over one button per
 * mode, the picked one framed in gold and named in its own colour. Hovering
 * a button hangs a tooltip under it saying what that mode changes.
 * Pure view, like ChampionRow: clicking a button calls `onPick`.
 */
export class ModeRow {
  readonly container: Phaser.GameObjects.Container;
  /** The hover tooltip. Its owner adds it above everything else on the card. */
  readonly tooltip: Phaser.GameObjects.Container;
  private readonly tip: Tooltip;
  private readonly buttons = new Map<string, { frame: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.BitmapText; cx: number; cy: number }>();
  private selected: string;

  constructor(
    scene: Phaser.Scene,
    cx: number,
    cy: number,
    private readonly modes: readonly Mode[],
    selected: string,
    private readonly onPick: (id: string) => void,
  ) {
    this.selected = selected;
    const parts: Phaser.GameObjects.GameObject[] = [
      pixelText(scene, cx, cy - BUTTON_H / 2 - 14, 'DIFFICULTY', 2, THEME.ui.faint).setOrigin(0.5),
    ];
    const pitch = BUTTON_W + GAP;
    const left = cx - ((modes.length - 1) * pitch) / 2;

    modes.forEach((mode, i) => {
      const x = Math.round(left + i * pitch);
      const frame = scene.add.graphics();
      const name = pixelText(scene, x, cy, mode.name.toUpperCase(), 2, THEME.ui.dim).setOrigin(0.5);
      const hit = scene.add.rectangle(x, cy, BUTTON_W, BUTTON_H, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        if (mode.id !== this.selected) this.drawButton(mode.id, 'hover');
        this.showTooltip(mode);
      });
      hit.on('pointerout', () => {
        if (mode.id !== this.selected) this.drawButton(mode.id, 'idle');
        this.hideTooltip();
      });
      hit.on('pointerup', () => this.onPick(mode.id));
      this.buttons.set(mode.id, { frame, name, cx: x, cy });
      parts.push(frame, name, hit);
    });

    this.container = scene.add.container(0, 0, parts);
    this.tip = new Tooltip(scene);
    this.tooltip = this.tip.container;
    this.setSelected(selected);
  }

  /** What the tooltip says while it is up; null when it isn't. */
  get tooltipText(): string[] | null {
    return this.tip.text;
  }

  hideTooltip(): void {
    this.tip.hide();
  }

  /** Hang the tooltip under `mode`'s button. */
  private showTooltip(mode: Mode): void {
    const button = this.buttons.get(mode.id);
    if (!button) return;
    this.tip.show(button.cx, button.cy + BUTTON_H / 2 + TIP_GAP, mode.name, modeTint(mode.id), modeChanges(mode));
  }

  get selectedId(): string {
    return this.selected;
  }

  setSelected(id: string): void {
    this.selected = id;
    for (const mode of this.modes) this.drawButton(mode.id, mode.id === id ? 'selected' : 'idle');
  }

  /** The mode `step` buttons along from the picked one, wrapping. */
  neighbour(step: number): string {
    const ids = this.modes.map((m) => m.id);
    const i = Math.max(0, ids.indexOf(this.selected));
    return ids[(i + step + ids.length) % ids.length];
  }

  private drawButton(id: string, state: 'idle' | 'hover' | 'selected'): void {
    const button = this.buttons.get(id);
    if (!button) return;
    const edge = state === 'selected' ? THEME.ui.accent : state === 'hover' ? THEME.menu.buttonEdgeHover : THEME.menu.buttonEdge;
    button.frame.clear();
    pixelPanel(button.frame, button.cx - BUTTON_W / 2, button.cy - BUTTON_H / 2, BUTTON_W, BUTTON_H, {
      fill: state === 'selected' ? THEME.menu.buttonHover : THEME.menu.button,
      fillAlpha: 1,
      edge,
      highlight: state === 'selected' ? THEME.ui.panelHighlight : undefined,
      border: 3,
    });
    button.name.setTint(state === 'selected' ? modeTint(id) : THEME.ui.dim);
  }
}

/** A mode's colour on the start screen and the HUD; an unlisted mode reads as plain text. */
export function modeTint(id: string): number {
  return THEME.modes.tints[id] ?? THEME.ui.text;
}
