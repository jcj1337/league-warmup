import { KEYBINDS } from '../config/balance';
import { Profile } from '../profile/Profile';

/**
 * The player's key bindings: which physical key triggers which action.
 *
 * Keys are identified by `KeyboardEvent.code` (the physical key: 'KeyQ',
 * 'CapsLock', 'Digit1'), not by the character it types, so a binding survives
 * Shift, Caps Lock and keyboard layouts. Defaults come from KEYBINDS in
 * balance.ts; the player's changes are layered on top.
 *
 * Saved in the player's Profile (this browser's localStorage): they survive
 * closing the tab and restarting the browser, on this device only.
 *
 * Escape and the end-screen restart keys are not rebindable: Escape backs out
 * of everything, including a rebind in progress.
 */

/** The rebindable actions, in the order the pause menu lists them. */
export const BINDABLE = [
  { action: 'skillshotQ', label: 'Q: damage skillshot' },
  { action: 'skillshotW', label: 'W: mark skillshot' },
  { action: 'blinkE', label: 'E: blink + homing bolt' },
  { action: 'flash', label: 'Flash' },
  { action: 'attackMoveClick', label: 'Attack-move at cursor' },
  { action: 'attackMove', label: 'Attack-move (then LMB)' },
  { action: 'stop', label: 'Stop' },
  { action: 'chatMode', label: 'Chat light / dark' },
] as const;

export type BindableAction = (typeof BINDABLE)[number]['action'];

/** What `set` did: the action now on the key, and the action that was swapped onto its old key (if any). */
export interface RebindResult {
  ok: boolean;
  swappedWith: BindableAction | null;
}

class KeybindStore {
  private binds: Record<BindableAction, string>;
  private readonly listeners = new Set<() => void>();
  private stopCapture: (() => void) | null = null;

  constructor() {
    this.binds = { ...defaults(), ...load() };
  }

  /** The physical key bound to `action`. */
  code(action: BindableAction): string {
    return this.binds[action];
  }

  /** The action bound to this physical key, if any. */
  actionFor(code: string): BindableAction | null {
    if (!code) return null;
    for (const { action } of BINDABLE) if (this.binds[action] === code) return action;
    return null;
  }

  /** Short on-screen name of the key bound to `action` ('Q', 'CAPS', 'SPACE'). */
  label(action: BindableAction): string {
    return keyLabel(this.binds[action]);
  }

  /** Every binding, as { action: code }. */
  all(): Record<BindableAction, string> {
    return { ...this.binds };
  }

  /**
   * Bind `action` to `code`. If another action already had that key, the two
   * swap, so no action is ever left without a key. Reserved keys are refused.
   */
  set(action: BindableAction, code: string): RebindResult {
    if (!code || isReserved(code)) return { ok: false, swappedWith: null };
    const other = this.actionFor(code);
    if (other === action) return { ok: true, swappedWith: null };
    if (other) this.binds[other] = this.binds[action];
    this.binds[action] = code;
    this.changed();
    return { ok: true, swappedWith: other };
  }

  /** Back to the defaults in balance.ts. */
  reset(): void {
    this.binds = defaults();
    this.changed();
  }

  /** Call `fn` after every change. Returns an unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Hand the next key press to `onKey` and to nothing else in the game (it is
   * caught on the window before Phaser sees it). Escape calls `onCancel`
   * instead. Starting a new capture, or calling the returned function, ends
   * the current one without calling either.
   */
  captureNext(onKey: (code: string) => void, onCancel: () => void): () => void {
    this.cancelCapture();
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || !event.code) return;
      this.cancelCapture();
      if (event.code === KEYBINDS.cancel) onCancel();
      else onKey(event.code);
    };
    window.addEventListener('keydown', handler, true);
    this.stopCapture = () => window.removeEventListener('keydown', handler, true);
    return () => this.cancelCapture();
  }

  /** True while a capture is waiting for its key. */
  get capturing(): boolean {
    return this.stopCapture !== null;
  }

  cancelCapture(): void {
    this.stopCapture?.();
    this.stopCapture = null;
  }

  private changed(): void {
    save(this.binds);
    for (const fn of this.listeners) fn();
  }
}

export const Keybinds = new KeybindStore();

/** Keys that can never be bound to an action. */
export function isReserved(code: string): boolean {
  return code === KEYBINDS.cancel;
}

function defaults(): Record<BindableAction, string> {
  const out = {} as Record<BindableAction, string>;
  for (const { action } of BINDABLE) out[action] = KEYBINDS[action];
  return out;
}

/** Saved bindings, or nothing if they're inconsistent (two actions on one key). */
function load(): Partial<Record<BindableAction, string>> {
  const saved = Profile.data.keybinds;
  const merged = defaults();
  for (const { action } of BINDABLE) {
    const code = saved[action];
    if (typeof code === 'string' && code && !isReserved(code)) merged[action] = code;
  }
  const codes = Object.values(merged);
  return new Set(codes).size === codes.length ? merged : {};
}

function save(binds: Record<BindableAction, string>): void {
  Profile.update((data) => {
    data.keybinds = { ...binds };
  });
}

const NAMED: Record<string, string> = {
  Space: 'SPACE', CapsLock: 'CAPS', Tab: 'TAB', Enter: 'ENTER', Backspace: 'BKSP',
  ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL',
  AltLeft: 'LALT', AltRight: 'RALT', MetaLeft: 'META', MetaRight: 'META',
  Backquote: 'GRAVE', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: 'BSLASH',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  NumpadAdd: 'NUM+', NumpadSubtract: 'NUM-', NumpadMultiply: 'NUM*', NumpadDivide: 'NUM/',
  NumpadDecimal: 'NUM.', NumpadEnter: 'NUMENT',
};

/** On-screen name for a physical key, using only characters the pixel font has. */
export function keyLabel(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const pad = /^Numpad(\d)$/.exec(code);
  if (pad) return `NUM${pad[1]}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return NAMED[code] ?? code.toUpperCase().slice(0, 6);
}
