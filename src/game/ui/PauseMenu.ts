import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { BINDABLE, Keybinds, type BindableAction } from '../Keybinds';
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

/** One rebindable key row. */
interface BindRow {
  action: BindableAction;
  value: Phaser.GameObjects.BitmapText;
}

/** Pixel height of a controls row. */
const KEY_ROW_H = 22;

/**
 * The Escape menu: a scrim plus a centred pixel panel with actions, settings
 * and the key bindings.
 *
 * It lives in UIScene, which is never paused, so its buttons keep working while
 * the simulation is frozen. It owns no gameplay state — buttons call into
 * `actions`, settings rows read/write the DEBUG config directly, which the
 * game already re-reads every frame, and key rows read/write `Keybinds`.
 *
 * Rebinding: click a key row, then press the new key (Escape backs out). A key
 * already in use swaps with the row being changed, and the line under the list
 * says what moved.
 */
export class PauseMenu {
  private readonly container: Phaser.GameObjects.Container;
  private readonly rows: Array<{ row: SettingRow; value: Phaser.GameObjects.BitmapText }> = [];
  private readonly bindRows: BindRow[] = [];
  private readonly status: Phaser.GameObjects.BitmapText;
  /** The key row waiting for a key press, if any. */
  private capturing: BindableAction | null = null;

  /**
   * @param controls fixed (mouse) controls listed above the key rows, as
   *   'INPUT | what it does'.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    actions: PauseMenuActions,
    settings: SettingRow[],
    controls: string[] = [],
  ) {
    const w = 480;
    // Offsets from the panel's top edge.
    const controlsTop = 238 + Math.max(0, settings.length - 1) * 34 + 30;
    const rowsTop = controlsTop + 44;
    const lastRowY = rowsTop + (controls.length + BINDABLE.length - 1) * KEY_ROW_H;
    const resetY = lastRowY + 36;
    const statusY = resetY + 30;
    const h = statusY + 46;
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

    // ---- controls: fixed mouse rows, then the rebindable keys -------------
    panel.fillStyle(THEME.ui.panelEdge, 1);
    panel.fillRect(left + 28, top + controlsTop, w - 56, 2);
    parts.push(pixelText(scene, x, top + controlsTop + 18, '- KEYS: CLICK TO REBIND -', 2, THEME.ui.faint).setOrigin(0.5));

    controls.forEach((line, i) => {
      const [input, does] = line.split('|');
      const rowY = top + rowsTop + i * KEY_ROW_H;
      parts.push(pixelText(scene, left + 30, rowY, (does ?? '').trim(), 2, THEME.ui.faint).setOrigin(0, 0.5));
      parts.push(pixelText(scene, left + w - 30, rowY, input.trim(), 2, THEME.ui.dim).setOrigin(1, 0.5));
    });

    BINDABLE.forEach(({ action, label }, i) => {
      const rowY = top + rowsTop + (controls.length + i) * KEY_ROW_H;
      // The whole row is the click target; it lights up under the cursor.
      const hit = scene.add
        .rectangle(x, rowY, w - 40, KEY_ROW_H - 2, THEME.menu.buttonHover, 0)
        .setInteractive({ useHandCursor: true });
      const name = pixelText(scene, left + 30, rowY, label, 2, THEME.ui.dim).setOrigin(0, 0.5);
      const value = pixelText(scene, left + w - 30, rowY, '', 2, THEME.ui.accent).setOrigin(1, 0.5);
      hit.on('pointerover', () => hit.setFillStyle(THEME.menu.buttonHover, 0.6));
      hit.on('pointerout', () => hit.setFillStyle(THEME.menu.buttonHover, 0));
      hit.on('pointerdown', () => this.startRebind(action));
      parts.push(hit, name, value);
      this.bindRows.push({ action, value });
    });

    parts.push(...this.button(x, top + resetY, 220, 28, 'RESET KEYS', () => {
      this.stopRebind();
      Keybinds.reset();
      this.status.setText('KEYS RESET TO DEFAULTS');
    }));

    this.status = pixelText(scene, x, top + statusY, '', 2, THEME.ui.level).setOrigin(0.5);
    parts.push(this.status);

    parts.push(pixelText(scene, x, top + h - 20, 'ESC TO RESUME', 2, THEME.ui.faint).setOrigin(0.5));

    this.container = scene.add.container(0, 0, parts).setDepth(400).setVisible(false);
    this.refreshBinds();
    // A rebind from anywhere (this menu, a reset, the console) shows at once.
    Keybinds.onChange(() => this.refreshBinds());
  }

  /** Wait for the next key press and bind it to `action`. Escape backs out. */
  private startRebind(action: BindableAction): void {
    this.capturing = action;
    this.status.setText('PRESS A KEY  (ESC TO CANCEL)');
    this.refreshBinds();
    Keybinds.captureNext(
      (code) => {
        this.capturing = null;
        const { swappedWith } = Keybinds.set(action, code);
        this.status.setText(swappedWith ? `${shortName(swappedWith)} MOVED TO ${Keybinds.label(swappedWith)}` : '');
        this.refreshBinds();
      },
      () => {
        this.capturing = null;
        this.status.setText('');
        this.refreshBinds();
      },
    );
  }

  /** Drop a rebind that is still waiting for its key. */
  private stopRebind(): void {
    Keybinds.cancelCapture();
    this.capturing = null;
    this.refreshBinds();
  }

  /** Re-read every key row; the row waiting for a key says so. */
  private refreshBinds(): void {
    for (const { action, value } of this.bindRows) {
      const waiting = action === this.capturing;
      value.setText(waiting ? 'PRESS A KEY' : Keybinds.label(action)).setTint(waiting ? THEME.ui.danger : THEME.ui.accent);
    }
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
    // Closing drops a rebind that never got its key. (Called every frame: act on the change only.)
    if (!visible && this.container.visible) {
      this.stopRebind();
      this.status.setText('');
    }
    this.container.setVisible(visible);
  }

  get visible(): boolean {
    return this.container.visible;
  }
}

/** Short name of an action, for the status line. */
function shortName(action: BindableAction): string {
  const names: Record<BindableAction, string> = {
    skillshotQ: 'Q', skillshotW: 'W', blinkE: 'E', flash: 'FLASH',
    attackMoveClick: 'ATTACK-MOVE CLICK', attackMove: 'ATTACK-MOVE', stop: 'STOP', chatMode: 'CHAT MODE',
  };
  return names[action];
}
