import Phaser from 'phaser';
import { KEYBINDS } from '../../config/balance';
import type { Enemy } from '../entities/Enemy';

/**
 * Everything the input layer is allowed to ask the game to do. GameScene
 * implements it; InputController is the only thing that knows which physical
 * input triggers which command.
 */
export interface CommandHandler {
  /** Plain move order to a world point. */
  commandMove(x: number, y: number): void;
  /** Direct attack order on one specific enemy. */
  commandAttackTarget(target: Enemy): void;
  /**
   * Attack Move toward a world point. `showRangeHint` is a purely cosmetic flag
   * set by the instant (T) path — the underlying order is identical either way.
   */
  commandAttackMove(x: number, y: number, opts?: { showRangeHint?: boolean }): void;
  /** Stop: freeze in place, drop pending orders. */
  commandStop(): void;

  /** Q: quick-cast the damage skillshot toward a world point. */
  castSkillshot(x: number, y: number): void;
  /** W: quick-cast the mark skillshot. */
  castMark(x: number, y: number): void;
  /** E: blink toward the cursor, then a homing bolt. */
  castBlink(x: number, y: number): void;
  /** F: summoner-style blink. */
  castFlash(x: number, y: number): void;

  /** Enemy under a world point, if any (click hit test). */
  targetAt(x: number, y: number): Enemy | null;

  /**
   * One raw player input for the APM readout: any physical key press (not
   * auto-repeat) or mouse-button press, bound or not, gameplay or UI. Never
   * called for mouse movement or anything the game generates itself.
   */
  recordAction(): void;

  isRoundRunning(): boolean;
  /** False while paused: gameplay input is swallowed, UI input still works. */
  acceptsGameplayInput(): boolean;
  isPaused(): boolean;
  togglePause(): void;
  restartRound(): void;
}

/**
 * Translates raw mouse/keyboard input into game commands.
 *
 * Command shapes:
 *   - Attack Move has two input paths that produce the SAME command:
 *       A then left-click  (targeting mode, confirm with a click)
 *       T                  (League's Attack Move Click — fires at the cursor)
 *     Both call `cmd.commandAttackMove(...)`, so targeting rules, attack
 *     timing, cancellation and metrics are identical by construction.
 *   - Q is quick-cast: it fires at the cursor the moment the key goes down.
 *
 * Adding W/E/R or Flash later means a case here plus a binding in KEYBINDS.
 */
export class InputController {
  /** True while waiting for the A-click to land. */
  public attackMovePending = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cmd: CommandHandler,
  ) {
    // No browser context menu on right-click inside the canvas.
    scene.input.mouse?.disableContextMenu();

    scene.input.on('pointerdown', this.onPointerDown, this);
    // One keyboard listener + a binding table, so keys stay rebindable.
    scene.input.keyboard?.on('keydown', this.onKeyDown, this);

    // APM counts RAW input straight from the DOM, before Phaser decides who (if
    // anyone) handles it — so menu clicks and unbound keys count too. These
    // listeners outlive the scene unless removed, so drop them on shutdown.
    window.addEventListener('keydown', this.onRawKeyDown);
    scene.game.canvas.addEventListener('pointerdown', this.onRawPointerDown);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private readonly onRawKeyDown = (event: KeyboardEvent): void => {
    if (!event.repeat) this.cmd.recordAction();
  };

  private readonly onRawPointerDown = (): void => {
    this.cmd.recordAction();
  };

  /** Leave Attack Move targeting without issuing anything. */
  cancelPending(): void {
    this.attackMovePending = false;
  }

  /** Cursor position in world space, for the keyboard-issued commands. */
  private cursor(): { x: number; y: number } {
    const p = this.scene.input.activePointer;
    return { x: p.worldX, y: p.worldY };
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // While the pause menu is up, clicks belong to the menu alone — this is what
    // stops a button press from also issuing a move order underneath it.
    if (!this.cmd.acceptsGameplayInput()) return;

    const x = pointer.worldX;
    const y = pointer.worldY;

    if (pointer.rightButtonDown()) {
      // Right-click cancels a pending A-mode and still issues its normal order,
      // so backing out of attack-move targeting never eats a command.
      this.cancelPending();

      // Contextual, like League: on an enemy it is a direct attack order,
      // on empty ground it is a move order.
      const enemy = this.cmd.targetAt(x, y);
      if (enemy) {
        this.cmd.commandAttackTarget(enemy);
      } else {
        this.cmd.commandMove(x, y);
      }
      return;
    }

    if (!pointer.leftButtonDown()) return;

    // Left-click confirms a pending attack move.
    if (this.attackMovePending) {
      this.attackMovePending = false;
      this.cmd.commandAttackMove(x, y);
      return;
    }

    // Plain left-click on an enemy still issues a direct attack order — a
    // convenience carried over from V0.1, harmless alongside right-click.
    const enemy = this.cmd.targetAt(x, y);
    if (enemy) this.cmd.commandAttackTarget(enemy);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const key = normalizeKey(event.key);

    if (KEYBINDS.restart.includes(key) && !this.cmd.isRoundRunning()) {
      this.cmd.restartRound();
      return;
    }
    if (!this.cmd.isRoundRunning()) return;

    // Escape is contextual: it backs out of armed attack-move targeting first,
    // and only opens/closes the pause menu when there is nothing to back out of.
    if (KEYBINDS.cancel.includes(key)) {
      if (this.attackMovePending) {
        this.cancelPending();
      } else {
        this.cmd.togglePause();
      }
      return;
    }

    // Everything below is a gameplay command, so it stops at the pause menu.
    if (!this.cmd.acceptsGameplayInput()) return;

    if (KEYBINDS.attackMove.includes(key)) {
      // A toggles targeting mode: pressing it again backs out.
      this.attackMovePending = !this.attackMovePending;
      return;
    }

    if (KEYBINDS.attackMoveClick.includes(key)) {
      // T: the exact same command A + left-click produces, issued straight at
      // the cursor with no targeting mode and no second input. The range hint
      // flag is the only difference, and it is cosmetic.
      this.attackMovePending = false;
      const { x, y } = this.cursor();
      this.cmd.commandAttackMove(x, y, { showRangeHint: true });
      return;
    }

    if (KEYBINDS.stop.includes(key)) {
      this.cancelPending();
      this.cmd.commandStop();
      return;
    }

    // All four abilities are quick-cast: they resolve this frame toward the
    // cursor, are no-ops on cooldown, and never disturb a pending attack move.
    const { x, y } = this.cursor();

    if (KEYBINDS.skillshotQ.includes(key)) {
      this.cmd.castSkillshot(x, y);
      return;
    }

    if (KEYBINDS.skillshotW.includes(key)) {
      this.cmd.castMark(x, y);
      return;
    }

    if (KEYBINDS.blinkE.includes(key)) {
      this.cmd.castBlink(x, y);
      return;
    }

    if (KEYBINDS.flash.includes(key)) {
      this.cmd.castFlash(x, y);
      return;
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.keyboard?.off('keydown', this.onKeyDown, this);
    window.removeEventListener('keydown', this.onRawKeyDown);
    this.scene.game.canvas.removeEventListener('pointerdown', this.onRawPointerDown);
  }
}

/** 'a' -> 'A', ' ' -> 'SPACE', 'Escape' -> 'ESCAPE'. */
function normalizeKey(key: string): string {
  if (key === ' ') return 'SPACE';
  return key.toUpperCase();
}
