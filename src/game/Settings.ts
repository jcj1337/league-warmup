import { DEBUG } from '../config/balance';
import { Profile } from '../profile/Profile';

/**
 * The pause menu's on/off and cycling settings, saved in the player's Profile
 * so they outlive the tab, like key bindings and Mouse Speed.
 *
 * Damage Numbers stays in the DEBUG config, which gameplay already re-reads
 * every frame: this store only writes the saved value into it at boot and
 * saves it after each change. Pause on Focus Loss has no DEBUG
 * twin, so it lives here.
 */

class SettingsStore {
  private pauseOnBlur: boolean;

  constructor() {
    const saved = Profile.data.settings;
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

  toggleDamageNumbers(): void {
    DEBUG.showDamageNumbers = !DEBUG.showDamageNumbers;
    this.save();
  }

  togglePauseOnFocusLoss(): void {
    this.pauseOnFocusLoss = !this.pauseOnBlur;
  }

  /** Every saved setting, as stored. */
  all(): { showDamageNumbers: boolean; pauseOnFocusLoss: boolean } {
    return {
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
