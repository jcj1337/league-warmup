import { Profile } from '../profile/Profile';
import { AXE_MAN } from './axeman';
import { SNAKE_LADY } from './snakelady';
import { MAGIC_BOY } from './magicboy';
import type { Champion } from './types';

export type { Champion, Kit, KitContext, Slot } from './types';
export { SLOTS } from './types';

/** Every playable champion, by id. Adding one is one line here plus its folder. */
export const CHAMPIONS = {
  magicboy: MAGIC_BOY,
  snakelady: SNAKE_LADY,
  axeman: AXE_MAN,
} satisfies Record<string, Champion>;

export type ChampionId = keyof typeof CHAMPIONS;
export const DEFAULT_CHAMPION: ChampionId = 'magicboy';

export function isChampionId(id: string): id is ChampionId {
  return id in CHAMPIONS;
}

/** The champion the next run uses: the profile's pick, or the default if that's unknown. */
export function activeChampion(): Champion {
  const id = Profile.data.champion;
  return isChampionId(id) ? CHAMPIONS[id] : CHAMPIONS[DEFAULT_CHAMPION];
}
