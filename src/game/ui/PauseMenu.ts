import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';

export interface PauseMenuActions {
  resume(): void;
  restart(): void;
}

/** One settings row: a label, a cycling value, and what to do when clicked. */
interface SettingRow {
  label: string;
  /** Current value, re-read every time the menu opens. */
  read(): string;
  /** Advance to the next value. */
  cycle(): void;
}

/**
 * The Escape menu: a scrim plus a centred pixel panel with actions and settings.
 *
 * It lives in UIScene, which is never paused, so its buttons keep working while
 * the simulation is frozen. It owns no gameplay state — buttons call into
 * `actions`, and settings rows read/write the DEBUG config directly, which the
 * game already re-reads every frame.
 */
export class PauseMenu {
  private readonly container: Phaser.GameObjects.Container;
  private readonly rows: Array<{ row: SettingRow; value: Phaser.GameObjects.BitmapText }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    actions: PauseMenuActions,
    settings: SettingRow[],
    controls: string[] = [],
  ) {
    const w = 480;
    const h = 380 + (controls.length ? 44 + controls.length * 20 : 0);
    const x = ARENA.width / 2;
    const y = ARENA.height / 2;
    const left = Math.round(x - w / 2);
    const top = Math.round(y - h / 2);

    const parts: Phaser.GameObjects.GameObject[] = [];

    // Scrim: also swallows stray clicks so nothing lands on the arena behind.
    const scrim = scene.add
      .rectangle(0, 0, ARENA.width, ARENA.height, THEME.ui.scrim, THEME.menu.scrimAlpha)
      .setOrigin(0, 0)
      .setInteractive();
    parts.push(scrim);

    const panel = scene.add.graphics();
    pixelPanel(panel, left, top, w, h, {
      fill: THEME.ui.panel, fillAlpha: 0.97, edge: THEME.ui.panelEdge, highlight: THEME.ui.panelHighlight, border: 3,
    });
    panel.fillStyle(THEME.ui.accent, 0.9);
    panel.fillRect(left + 28, top + 66, w - 56, 3);
    parts.push(panel);

    parts.push(pixelText(scene, x, top + 36, 'PAUSED', 4).setOrigin(0.5));

    // ---- actions ---------------------------------------------------------
    parts.push(...this.button(x, top + 104, 260, 40, 'RESUME', actions.resume));
    parts.push(...this.button(x, top + 154, 260, 40, 'RESTART ROUND', actions.restart));

    // ---- settings --------------------------------------------------------
    parts.push(pixelText(scene, x, top + 204, '- SETTINGS -', 2, THEME.ui.faint).setOrigin(0.5));

    settings.forEach((row, i) => {
      const rowY = top + 238 + i * 34;
      parts.push(pixelText(scene, left + 30, rowY, row.label, 2, THEME.ui.dim).setOrigin(0, 0.5));

      const value = pixelText(scene, left + w - 30, rowY, row.read(), 2, THEME.ui.accent)
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });

      value.on('pointerover', () => value.setTint(THEME.ui.text));
      value.on('pointerout', () => value.setTint(THEME.ui.accent));
      value.on('pointerdown', () => {
        row.cycle();
        value.setText(row.read());
      });

      parts.push(value);
      this.rows.push({ row, value });
    });

    // ---- controls reference ----------------------------------------------
    if (controls.length) {
      const controlsTop = top + 238 + settings.length * 34 + 10;
      panel.fillStyle(THEME.ui.panelEdge, 1);
      panel.fillRect(left + 28, controlsTop, w - 56, 2);

      parts.push(pixelText(scene, x, controlsTop + 18, '- CONTROLS -', 2, THEME.ui.faint).setOrigin(0.5));

      controls.forEach((line, i) => {
        const [keys, action] = line.split('|');
        const rowY = controlsTop + 44 + i * 20;
        parts.push(pixelText(scene, left + 30, rowY, keys.trim(), 2, THEME.ui.dim).setOrigin(0, 0.5));
        parts.push(pixelText(scene, left + w - 30, rowY, (action ?? '').trim(), 2, THEME.ui.faint).setOrigin(1, 0.5));
      });
    }

    parts.push(pixelText(scene, x, top + h - 20, 'ESC TO RESUME', 2, THEME.ui.faint).setOrigin(0.5));

    this.container = scene.add.container(0, 0, parts).setDepth(400).setVisible(false);
  }

  /** Pixel button with hover states; returns the objects to be contained. */
  private button(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const rect = this.scene.add
      .rectangle(Math.round(cx), Math.round(cy), w, h, THEME.menu.button)
      .setStrokeStyle(3, THEME.menu.buttonEdge)
      .setInteractive({ useHandCursor: true });

    const text = pixelText(this.scene, cx, cy, label, 2, THEME.ui.accent).setOrigin(0.5);

    rect.on('pointerover', () => {
      rect.setFillStyle(THEME.menu.buttonHover);
      rect.setStrokeStyle(3, THEME.menu.buttonEdgeHover);
      text.setTint(THEME.ui.text);
    });
    rect.on('pointerout', () => {
      rect.setFillStyle(THEME.menu.button);
      rect.setStrokeStyle(3, THEME.menu.buttonEdge);
      text.setTint(THEME.ui.accent);
    });
    rect.on('pointerdown', onClick);

    return [rect, text];
  }

  setVisible(visible: boolean): void {
    // Re-read every setting on open, in case it was changed from the console.
    if (visible) this.rows.forEach(({ row, value }) => value.setText(row.read()));
    this.container.setVisible(visible);
  }

  get visible(): boolean {
    return this.container.visible;
  }
}
