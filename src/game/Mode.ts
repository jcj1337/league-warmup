import { DEFAULT_MODE, MODES, type Mode, type ModeId } from '../config/balance';
import { Profile } from '../profile/Profile';

export function isModeId(id: string): id is ModeId {
  return id in MODES;
}

/** The registered mode with this id, or the default for an unknown one. */
export function modeOf(id: string): Mode {
  return isModeId(id) ? MODES[id] : MODES[DEFAULT_MODE];
}

/** The difficulty mode the next run uses: the profile's pick, or the default if that's unknown. */
export function activeMode(): Mode {
  return modeOf(Profile.data.mode);
}
