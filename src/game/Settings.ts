import { DEBUG } from '../config/balance';
import { Profile } from '../profile/Profile';

/**
 * The pause menu's on/off and cycling settings, saved in the player's Profile
 * so they outlive the tab, like key bindings and Mouse Speed.
 *
 * Range Indicator and Damage Numbers stay in the DEBUG config, which gameplay
 * already re-reads every frame: this store only writes the saved values into
 * it at boot and saves it after each change. Pause on Focus Loss has no DEBUG
 * twin, so it lives here.
 */

const RANGE_MODES = ['contextual', 'always', 'off'] as const;
type RangeMode = (typeof RANGE_MODES)[number];

class SettingsStore {
  private pauseOnBlur: boolean;

  constructor() {
    const saved = Profile.data.settings;
    DEBUG.attackRangeDisplay = saved.attackRangeDisplay;
    DEBUG.showDamageNumbers = saved.showDamageNumbers;
    this.pauseOnBlur = saved.pauseOnFocusLoss;
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
  all(): { attackRangeDisplay: RangeMode; showDamageNumbers: boolean; pauseOnFocusLoss: boolean } {
    return {
      attackRangeDisplay: DEBUG.attackRangeDisplay,
      showDamageNumbers: DEBUG.showDamageNumbers,
      pauseOnFocusLoss: this.pauseOnBlur,
    };
  }

  private save(): void {
    Profile.update((data) => {
      data.settings = this.all();
    });
  }
}

export const Settings = new SettingsStore();
