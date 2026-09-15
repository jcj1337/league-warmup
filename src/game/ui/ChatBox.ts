import Phaser from 'phaser';
import { ARENA } from '../../config/balance';
import { THEME } from '../../config/theme';
import { pixelText } from '../art/font';
import { pixelPanel } from '../view/pixelDraw';

/** What a message is. Only decides its colour. */
export type ChatKind = 'welcome' | 'mission' | 'complete';

interface ChatEntry {
  text: string;
  kind: ChatKind;
}

/**
 * The bottom-left system-message feed: a compact pixel panel of recent
 * messages, newest at the bottom, older ones fading. League-like in how it
 * behaves, not in how it looks. There is no typing.
 *
 *   - `toggleMode()` (Z) flips instantly between light mode (translucent, for
 *     normal play) and dark mode (near-opaque plate, full-strength frame and
 *     text). No fade and no timeout: it stays until toggled again.
 *   - The bottom border is the only drag handle; its hit strip is a little
 *     taller than the drawn line. Dragging is clamped to the viewport.
 *
 * Input isolation: the panel body and the handle are interactive zones in
 * UIScene, the top scene, and Phaser's globalTopOnly input stops a pointer
 * event that hits them from reaching GameScene at all — so a click or drag
 * here can never issue a move, attack or attack-move. The body swallows every
 * press but never starts a drag. Clicks anywhere else pass through untouched.
 *
 * Pure UI: it owns no gameplay state and is told what to say by UIScene. The
 * instance lives as long as UIScene, so the dragged position and the selected
 * mode survive GameScene restarts; `reset()` clears only the messages.
 */
export class ChatBox {
  readonly width: number = THEME.chat.width;
  readonly height: number = THEME.chat.height;
  x: number;
  y: number;
  /** Dark mode (Z). Light mode when false. */
  dark = false;
  /** True between a left press on the bottom-edge handle and its release. */
  dragging = false;
  /** Pointer is over the handle, for the hover cue. */
  handleHover = false;
  /** Plate opacity the panel was last drawn with. Readout only. */
  drawnFillAlpha = 0;

  private readonly entries: ChatEntry[] = [];
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Zone;
  private readonly handle: Phaser.GameObjects.Zone;
  private readonly lines: Phaser.GameObjects.BitmapText[] = [];
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dirty = true;

  constructor(scene: Phaser.Scene) {
    const C = THEME.chat;
    this.x = C.margin;
    this.y = ARENA.height - C.bottomGap - C.height;

    this.panel = scene.add.graphics().setDepth(C.depth);
    for (let i = 0; i < C.maxMessages; i++) {
      this.lines.push(
        pixelText(scene, 0, 0, '', C.textScale)
          .setMaxWidth(this.width - C.padding * 2)
          .setDepth(C.depth + 1)
          .setVisible(false),
      );
    }

    // The body swallows every press on the panel so nothing reaches the game,
    // but it never starts a drag.
    this.body = scene.add.zone(0, 0, this.width, this.height).setOrigin(0, 0).setDepth(C.depth).setInteractive();

    // The handle sits above the body, so over the bottom edge it wins the hit test.
    this.handle = scene.add
      .zone(0, 0, this.width, C.handleHitHeight)
      .setOrigin(0, 0)
      .setDepth(C.depth + 2)
      .setInteractive({ cursor: 'move' });
    this.handle.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.dragging = true;
      this.dragOffsetX = pointer.x - this.x;
      this.dragOffsetY = pointer.y - this.y;
      this.dirty = true;
    });
    this.handle.on('pointerover', () => {
      this.handleHover = true;
      this.dirty = true;
    });
    this.handle.on('pointerout', () => {
      this.handleHover = false;
      this.dirty = true;
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      if (!pointer.leftButtonDown()) {
        this.endDrag();
        return;
      }
      this.moveTo(pointer.x - this.dragOffsetX, pointer.y - this.dragOffsetY);
    });
    scene.input.on('pointerup', () => this.endDrag());
    scene.input.on('pointerupoutside', () => this.endDrag());

    this.placeZones();
  }

  /** Messages of the current run, oldest first. */
  get messages(): string[] {
    return this.entries.map((e) => e.text);
  }

  push(text: string, kind: ChatKind): void {
    this.entries.push({ text, kind });
    const overflow = this.entries.length - THEME.chat.maxMessages;
    if (overflow > 0) this.entries.splice(0, overflow);
    this.dirty = true;
  }

  /** Forget every message (a new run). Position and mode are kept. */
  reset(): void {
    this.entries.length = 0;
    this.dirty = true;
  }

  /** Z: flip light/dark, drawn right away. */
  toggleMode(): void {
    this.dark = !this.dark;
    this.redraw();
  }

  /** Top-left corner, clamped so the whole panel stays inside the viewport. */
  moveTo(x: number, y: number): void {
    const nx = Math.round(Phaser.Math.Clamp(x, 0, ARENA.width - this.width));
    const ny = Math.round(Phaser.Math.Clamp(y, 0, ARENA.height - this.height));
    if (nx === this.x && ny === this.y) return;
    this.x = nx;
    this.y = ny;
    this.placeZones();
    this.dirty = true;
  }

  /** Is a screen point over the panel (optionally grown by `pad`)? */
  contains(px: number, py: number, pad = 0): boolean {
    return px >= this.x - pad && px <= this.x + this.width + pad && py >= this.y - pad && py <= this.y + this.height + pad;
  }

  update(): void {
    if (!this.dirty) return;
    this.redraw();
  }

  private endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.dirty = true;
  }

  private placeZones(): void {
    const C = THEME.chat;
    this.body.setPosition(this.x, this.y);
    // A strip over the bottom border, reaching handleOverhang px below the panel.
    this.handle.setPosition(this.x, this.y + this.height + C.handleOverhang - C.handleHitHeight);
  }

  private redraw(): void {
    this.dirty = false;
    const C = THEME.chat;
    const fillAlpha = this.dark ? C.darkFillAlpha : C.lightFillAlpha;
    this.drawnFillAlpha = fillAlpha;

    const g = this.panel.clear().setAlpha(this.dark ? C.darkFrameAlpha : C.lightFrameAlpha);
    pixelPanel(g, this.x, this.y, this.width, this.height, {
      fill: THEME.ui.panel,
      fillAlpha,
      edge: THEME.ui.panelEdge,
      highlight: THEME.ui.panelHighlight,
    });
    // Hover / drag cue: the bottom border brightens slightly.
    if (this.handleHover || this.dragging) {
      g.fillStyle(THEME.ui.panelHighlight, C.handleHoverAlpha);
      g.fillRect(this.x + 4, this.y + this.height - 2, this.width - 8, 2);
    }

    // Newest at the bottom; older messages stack upward, fading, until the
    // panel is full.
    const textAlpha = this.dark ? C.darkTextAlpha : C.lightTextAlpha;
    const top = this.y + C.padding;
    let bottom = this.y + this.height - C.padding;
    this.lines.forEach((line) => line.setVisible(false));
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[this.entries.length - 1 - i];
      const line = this.lines[i].setText(entry.text);
      const lineTop = bottom - line.height;
      if (lineTop < top) break;
      const age = Math.max(C.oldestAlpha, 1 - i * C.fadePerMessage);
      line
        .setPosition(this.x + C.padding, Math.round(lineTop))
        .setTint(C.colors[entry.kind])
        .setAlpha(age * textAlpha)
        .setVisible(true);
      bottom = lineTop - C.messageGap;
    }
  }
}
