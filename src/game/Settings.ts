import { DEBUG, PREFERENCES } from '../config/balance';

/**
 * The pause menu's on/off and cycling settings, saved in this browser's
 * localStorage so they outlive the tab, like key bindings and Mouse Speed.
 *
 * Range Indicator and Damage Numbers stay in the DEBUG config, which gameplay
 * already re-reads every frame: this store only writes the saved values into
 * it at boot and saves it after each change. Pause on Focus Loss has no DEBUG
 * twin, so it lives here.
 *
 * Storage can be unavailable (private windows, blocked site data), so every
 * read and write is guarded: the defaults always work.
 */

const STORAGE_KEY = 'warmup.settings.v1';

const RANGE_MODES = ['contextual', 'always', 'off'] as const;
type RangeMode = (typeof RANGE_MODES)[number];

interface Saved {
  attackRangeDisplay: RangeMode;
  showDamageNumbers: boolean;
  pauseOnFocusLoss: boolean;
}

class SettingsStore {
  private pauseOnBlur: boolean;

  constructor() {
    const saved = load();
    if (saved.attackRangeDisplay !== undefined) DEBUG.attackRangeDisplay = saved.attackRangeDisplay;
    if (saved.showDamageNumbers !== undefined) DEBUG.showDamageNumbers = saved.showDamageNumbers;
    this.pauseOnBlur = saved.pauseOnFocusLoss ?? PREFERENCES.pauseOnFocusLoss;
  }

  get pauseOnFocusLoss(): boolean {
    return this.pauseOnBlur;
  }

  set pauseOnFocusLoss(on: boolean) {
    this.pauseOnBlur = on;
    this.save();
  }

  /** contextual → always → off → contextual. */
  cycleRangeIndicator(): void {
    const next = (RANGE_MODES.indexOf(DEBUG.attackRangeDisplay) + 1) % RANGE_MODES.length;
    DEBUG.attackRangeDisplay = RANGE_MODES[next];
    this.save();
  }

  toggleDamageNumbers(): void {
    DEBUG.showDamageNumbers = !DEBUG.showDamageNumbers;
    this.save();
  }

  togglePauseOnFocusLoss(): void {
    this.pauseOnFocusLoss = !this.pauseOnBlur;
  }

  /** Every saved setting, as stored. */
  all(): Saved {
    return {
      attackRangeDisplay: DEBUG.attackRangeDisplay,
      showDamageNumbers: DEBUG.showDamageNumbers,
      pauseOnFocusLoss: this.pauseOnBlur,
    };
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.all()));
    } catch {
      // Storage blocked: the settings still hold for this page.
    }
  }
}

/** Saved settings that are present and valid; anything else falls back to its default. */
function load(): Partial<Saved> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Saved> = {};
    if (RANGE_MODES.includes(parsed.attackRangeDisplay as RangeMode)) out.attackRangeDisplay = parsed.attackRangeDisplay as RangeMode;
    if (typeof parsed.showDamageNumbers === 'boolean') out.showDamageNumbers = parsed.showDamageNumbers;
    if (typeof parsed.pauseOnFocusLoss === 'boolean') out.pauseOnFocusLoss = parsed.pauseOnFocusLoss;
    return out;
  } catch {
    return {};
  }
}

export const Settings = new SettingsStore();
