import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';

/** Space inside the edge, and between the title and the lines under it. */
const PAD = 14;
const TITLE_GAP = 8;

/**
 * A floating panel hung under something the mouse is over: a title in the
 * subject's colour, then a few short lines. Pure view. Whoever owns it adds
 * `container` above everything else on its card.
 */
export class Tooltip {
  readonly container: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.BitmapText;
  private readonly lines: Phaser.GameObjects.BitmapText;
  private shown: string[] = [];

  constructor(scene: Phaser.Scene) {
    this.plate = scene.add.graphics();
    this.title = pixelText(scene, 0, 0, '', 2);
    this.lines = pixelText(scene, 0, 0, '', 2, THEME.ui.dim).setLineSpacing(6);
    this.container = scene.add.container(0, 0, [this.plate, this.title, this.lines]).setVisible(false);
  }

  /** What it says while it is up (the title, then each line); null when it isn't. */
  get text(): string[] | null {
    return this.container.visible ? this.shown : null;
  }

  /** Hang it centred on `cx` with its top at `top`, kept on the screen. */
  show(cx: number, top: number, title: string, color: number, lines: string[]): void {
    this.shown = [title, ...lines];
    this.title.setText(title.toUpperCase()).setTint(color);
    this.lines.setText(lines);
    const w = Math.max(this.title.width, this.lines.width) + PAD * 2;
    const h = PAD * 2 + this.title.height + TITLE_GAP + this.lines.height;
    const x = Math.round(Phaser.Math.Clamp(cx - w / 2, 8, ARENA.width - w - 8));
    const y = Math.round(Math.min(top, ARENA.height - h - 8));
    this.plate.clear();
    pixelPanel(this.plate, x, y, w, h, {
      fill: THEME.ui.panel, fillAlpha: 1, edge: color, highlight: THEME.ui.panelHighlight, border: 3,
    });
    this.title.setPosition(x + PAD, y + PAD);
    this.lines.setPosition(x + PAD, y + PAD + this.title.height + TITLE_GAP);
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}
