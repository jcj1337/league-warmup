import { Profile } from '../profile/Profile';
import { EZREAL } from './ezreal';
import type { Champion } from './types';

export type { Champion, Kit, KitContext, Slot } from './types';
export { SLOTS } from './types';

/** Every playable champion, by id. Adding one is one line here plus its folder. */
export const CHAMPIONS = {
  ezreal: EZREAL,
} satisfies Record<string, Champion>;

export type ChampionId = keyof typeof CHAMPIONS;
export const DEFAULT_CHAMPION: ChampionId = 'ezreal';

export function isChampionId(id: string): id is ChampionId {
  return id in CHAMPIONS;
}

/** The champion the next run uses: the profile's pick, or the default if that's unknown. */
export function activeChampion(): Champion {
  const id = Profile.data.champion;
  return isChampionId(id) ? CHAMPIONS[id] : CHAMPIONS[DEFAULT_CHAMPION];
}
