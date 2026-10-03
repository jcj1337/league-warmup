import { KEYBINDS } from '../config/balance';
import { MouseSpeed } from './MouseSpeed';

/** What CursorLock needs from the game. */
export interface CursorLockHost {
  /** True while gameplay owns the mouse: a round running and not paused. */
  wantsLock(): boolean;
  /** The lock was lost without the game asking (Escape, alt-tab): treat it like Escape. */
  onLockLost(): void;
}

/** An Escape press and a lock loss this close together are the same press. */
const ESCAPE_PAIR_MS = 150;
/** Minimum gap between automatic lock attempts (the browser refuses for ~1s after the player exits one). */
const RETRY_MS = 250;

/**
 * Mouse Speed, the way League does it: the cursor moves `MouseSpeed.value` ×
 * as far as the OS would move it, and stays inside the game.
 *
 * A browser cannot change the OS cursor's speed, so at any speed other than 1
 * the canvas takes a pointer lock during play: the OS cursor is hidden and
 * frozen, and this class keeps its own cursor position, adding each mouse
 * delta (`movementX/Y`, already scaled by the OS pointer speed) times the
 * Mouse Speed and clamping to the canvas, and draws a cursor there.
 *
 * Every mouse event is then rewritten to carry that position before Phaser
 * sees it (window capture phase runs first), so clicks, hover, menu buttons
 * and the cursor-aimed keys all use the game cursor with no other code
 * knowing about it.
 *
 * At speed 1 nothing is locked or rewritten: the plain OS cursor is the
 * cursor. The pause menu and end screen always use the OS cursor: the lock is
 * released whenever gameplay stops, and re-taken on the next click (or right
 * after a click / key press, like the Resume button).
 *
 * Escape exits a pointer lock in the browser itself, usually without the page
 * seeing the key, so losing the lock unasked is reported as an Escape press.
 */
export class CursorLock {
  /** The cursor, in page (CSS) pixels. Fractional, so slow speeds still creep. */
  private x = 0;
  private y = 0;
  /** False until the page has seen the mouse: a lock taken before that starts mid-canvas. */
  private known = false;
  /** We asked for the unlock that is coming. */
  private releasing = false;
  private requesting = false;
  private lastTryAt = -Infinity;
  private lastEscapeAt = -Infinity;
  private lostAt = -Infinity;
  private readonly sprite: HTMLDivElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: CursorLockHost,
  ) {
    this.sprite = makeCursorSprite();
    document.body.appendChild(this.sprite);

    for (const type of ['mousemove', 'mousedown', 'mouseup', 'wheel'] as const) {
      window.addEventListener(type, this.onMouse, true);
    }
    window.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** The cursor position, in page pixels. */
  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Call every frame: takes or releases the lock as play starts and stops. */
  update(): void {
    const wanted = this.wanted();
    if (this.locked && !wanted) {
      this.releasing = true;
      document.exitPointerLock();
    } else if (!this.locked && wanted && hasUserActivation()) {
      // Straight after a click or key press (Resume, R to restart): no extra click needed.
      this.request();
    }
  }

  private wanted(): boolean {
    return MouseSpeed.value !== 1 && this.host.wantsLock();
  }

  private request(): void {
    const now = performance.now();
    if (this.requesting || now - this.lastTryAt < RETRY_MS) return;
    this.requesting = true;
    this.lastTryAt = now;
    try {
      // A promise in current browsers, undefined in older ones (they report through pointerlockerror).
      const pending = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      pending?.catch?.(() => {
        this.requesting = false;
      });
    } catch {
      this.requesting = false;
    }
  }

  private readonly onMouse = (event: MouseEvent): void => {
    if (!this.locked) {
      // Track the OS cursor, so a lock starts exactly where it is.
      this.x = event.pageX;
      this.y = event.pageY;
      this.known = true;
      // The click that takes the lock still lands normally, at the OS cursor.
      if (event.type === 'mousedown' && event.target === this.canvas && this.wanted()) this.request();
      return;
    }

    if (event.type === 'mousemove') {
      const speed = MouseSpeed.value;
      this.moveTo(this.x + event.movementX * speed, this.y + event.movementY * speed);
    }
    rewritePosition(event, this.x, this.y);
  };

  /** Put the cursor at (x, y), kept inside the canvas. */
  private moveTo(x: number, y: number): void {
    const r = this.canvas.getBoundingClientRect();
    const left = r.left + window.scrollX;
    const top = r.top + window.scrollY;
    // One pixel inside the far edges, so the cursor never leaves the game.
    this.x = clamp(x, left, left + r.width - 1);
    this.y = clamp(y, top, top + r.height - 1);
    this.drawSprite();
  }

  /** Where a new lock starts: the OS cursor (pulled in from the letterbox), or mid-canvas if it was never seen. */
  private startCursor(): void {
    if (this.known) {
      this.moveTo(this.x, this.y);
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    this.moveTo(r.left + window.scrollX + r.width / 2, r.top + window.scrollY + r.height / 2);
    this.known = true;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== KEYBINDS.cancel) return;
    const now = performance.now();
    // This Escape already exited the lock and was handled as one: don't let it toggle the menu back.
    if (now - this.lostAt < ESCAPE_PAIR_MS) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.lastEscapeAt = now;
  };

  private readonly onLockChange = (): void => {
    this.requesting = false;
    if (this.locked) {
      this.startCursor();
      this.sprite.style.display = 'block';
      return;
    }
    this.sprite.style.display = 'none';
    if (this.releasing) {
      this.releasing = false;
      return;
    }
    const now = performance.now();
    this.lostAt = now;
    // The page saw the Escape that did this, and the game already handled it.
    if (now - this.lastEscapeAt < ESCAPE_PAIR_MS) return;
    this.host.onLockLost();
  };

  private readonly onLockError = (): void => {
    this.requesting = false;
  };

  private drawSprite(): void {
    this.sprite.style.transform = `translate(${Math.round(this.x - window.scrollX)}px, ${Math.round(this.y - window.scrollY)}px)`;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Transient user activation (a recent click or key press), where the browser reports it. */
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation?.isActive ?? false;
}

/** Make a mouse event report (x, y) as its page position, and the matching client position. */
function rewritePosition(event: MouseEvent, x: number, y: number): void {
  const clientX = x - window.scrollX;
  const clientY = y - window.scrollY;
  const props: Record<string, number> = { pageX: x, pageY: y, clientX, clientY, x: clientX, y: clientY };
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
}

/** The game cursor shown while locked: a plain white arrow with a dark outline, hotspot at its tip. */
function makeCursorSprite(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:13px;height:20px;pointer-events:none;z-index:1000;display:none;will-change:transform;';
  el.innerHTML =
    '<svg width="13" height="20" viewBox="0 0 13 20" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M0.5 0.5 L0.5 16.5 L4.5 12.5 L7.5 19 L10 18 L7 11.5 L12.5 11.5 Z" fill="#fff" stroke="#000" stroke-width="1" stroke-linejoin="miter"/>' +
    '</svg>';
  return el;
}
