import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';

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
 * The Escape menu: a scrim plus a centred panel with actions and settings.
 *
 * It lives in UIScene, which is never paused, so its buttons keep working while
 * the simulation is frozen. It owns no gameplay state — buttons call into
 * `actions`, and settings rows read/write the DEBUG config directly, which the
 * game already re-reads every frame.
 */
export class PauseMenu {
  private readonly container: Phaser.GameObjects.Container;
  private readonly rows: Array<{ row: SettingRow; value: Phaser.GameObjects.Text }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    actions: PauseMenuActions,
    settings: SettingRow[],
    controls: string[] = [],
  ) {
    const w = 430;
    const h = 400 + (controls.length ? 40 + controls.length * 18 : 0);
    const x = ARENA.width / 2;
    const y = ARENA.height / 2;
    const left = x - w / 2;
    const top = y - h / 2;

    const parts: Phaser.GameObjects.GameObject[] = [];

    // Scrim: also swallows stray clicks so nothing lands on the arena behind.
    const scrim = scene.add
      .rectangle(0, 0, ARENA.width, ARENA.height, THEME.menu.scrimColor, THEME.menu.scrimAlpha)
      .setOrigin(0, 0)
      .setInteractive();
    parts.push(scrim);

    const panel = scene.add.graphics();
    panel.fillStyle(THEME.menu.panelColor, THEME.menu.panelAlpha);
    panel.fillRoundedRect(left, top, w, h, 12);
    panel.lineStyle(1, THEME.menu.panelStroke, 0.95);
    panel.strokeRoundedRect(left, top, w, h, 12);
    // Accent rule under the title, in the same language as the arena brackets.
    // (numeric accent — THEME.ui.accent is the CSS string form, for Text styles)
    panel.lineStyle(2, THEME.menu.buttonStrokeHover, 0.75);
    panel.lineBetween(left + 28, top + 68, left + w - 28, top + 68);
    parts.push(panel);

    parts.push(
      scene.add
        .text(x, top + 34, 'PAUSED', {
          fontFamily: THEME.ui.fontFamily,
          fontSize: '26px',
          color: THEME.ui.text,
        })
        .setOrigin(0.5),
    );

    // ---- actions ---------------------------------------------------------
    parts.push(...this.button(x, top + 108, 240, 42, 'RESUME', actions.resume));
    parts.push(...this.button(x, top + 160, 240, 42, 'RESTART ROUND', actions.restart));

    // ---- settings --------------------------------------------------------
    parts.push(
      scene.add
        .text(x, top + 212, '— SETTINGS —', {
          fontFamily: THEME.ui.fontFamily,
          fontSize: '13px',
          color: THEME.ui.faint,
        })
        .setOrigin(0.5),
    );

    settings.forEach((row, i) => {
      const rowY = top + 246 + i * 38;
      parts.push(
        scene.add
          .text(left + 30, rowY, row.label, {
            fontFamily: THEME.ui.fontFamily,
            fontSize: '14px',
            color: THEME.ui.dim,
          })
          .setOrigin(0, 0.5),
      );

      const value = scene.add
        .text(left + w - 30, rowY, row.read(), {
          fontFamily: THEME.ui.fontFamily,
          fontSize: '14px',
          color: THEME.ui.accent,
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });

      value.on('pointerover', () => value.setColor(THEME.ui.text));
      value.on('pointerout', () => value.setColor(THEME.ui.accent));
      value.on('pointerdown', () => {
        row.cycle();
        value.setText(row.read());
      });

      parts.push(value);
      this.rows.push({ row, value });
    });

    // ---- controls reference ----------------------------------------------
    if (controls.length) {
      const controlsTop = top + 246 + settings.length * 38 + 18;
      panel.lineStyle(1, THEME.menu.panelStroke, 0.8);
      panel.lineBetween(left + 28, controlsTop, left + w - 28, controlsTop);

      parts.push(
        scene.add
          .text(x, controlsTop + 14, '— CONTROLS —', {
            fontFamily: THEME.ui.fontFamily,
            fontSize: '11px',
            color: THEME.ui.faint,
          })
          .setOrigin(0.5),
      );

      controls.forEach((line, i) => {
        const [keys, action] = line.split('|');
        const rowY = controlsTop + 38 + i * 18;
        parts.push(
          scene.add
            .text(left + 30, rowY, keys.trim(), {
              fontFamily: THEME.ui.fontFamily,
              fontSize: '11px',
              color: THEME.ui.dim,
            })
            .setOrigin(0, 0.5),
        );
        parts.push(
          scene.add
            .text(left + w - 30, rowY, (action ?? '').trim(), {
              fontFamily: THEME.ui.fontFamily,
              fontSize: '11px',
              color: THEME.ui.faint,
            })
            .setOrigin(1, 0.5),
        );
      });
    }

    parts.push(
      scene.add
        .text(x, top + h - 18, 'ESC to resume', {
          fontFamily: THEME.ui.fontFamily,
          fontSize: '11px',
          color: THEME.ui.faint,
        })
        .setOrigin(0.5),
    );

    this.container = scene.add.container(0, 0, parts).setDepth(400).setVisible(false);
  }

  /** Rectangle + label with hover states; returns the objects to be contained. */
  private button(
    cx: number,
    cy: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const rect = this.scene.add
      .rectangle(cx, cy, w, h, THEME.menu.buttonFill)
      .setStrokeStyle(1, THEME.menu.buttonStroke)
      .setInteractive({ useHandCursor: true });

    const text = this.scene.add
      .text(cx, cy, label, {
        fontFamily: THEME.ui.fontFamily,
        fontSize: '15px',
        color: THEME.ui.accent,
      })
      .setOrigin(0.5);

    rect.on('pointerover', () => {
      rect.setFillStyle(THEME.menu.buttonFillHover);
      rect.setStrokeStyle(1, THEME.menu.buttonStrokeHover);
      text.setColor(THEME.ui.text);
    });
    rect.on('pointerout', () => {
      rect.setFillStyle(THEME.menu.buttonFill);
      rect.setStrokeStyle(1, THEME.menu.buttonStroke);
      text.setColor(THEME.ui.accent);
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
