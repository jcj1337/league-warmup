import { PALETTE as P } from '../config/theme';
import type { PixelLayer, PlayerLook, SkinPalette } from '../game/art/look';
import type { ProfileData } from '../profile/Profile';

/**
 * Every cosmetic the player can wear, and how a profile's `equipped` resolves
 * to a look. A hat is a pixel layer stacked on the slime's head; a skin is a
 * palette override on its body. Nothing here touches gameplay.
 *
 * The crown is worn by default: it is the player's signature in qwer's
 * backyard. Equipping 'none' in a slot takes it off.
 */
export type CosmeticSlot = 'hat' | 'skin';

export interface Cosmetic {
  name: string;
  slot: CosmeticSlot;
  /** Hats. */
  layer?: PixelLayer;
  /** Skins. */
  palette?: SkinPalette;
}

export const COSMETICS: Record<string, Cosmetic> = {
  crown: {
    name: 'Crown',
    slot: 'hat',
    // A small gold crown riding on top of the dome, one pixel toward the face
    // like the rest of it.   W glint · g gold · o dark gold · r ruby
    layer: {
      rows: [
        '....W..W..W...',
        '....g.ggg.g...',
        '....ggrgrgg...',
        '....ooooooo...',
      ],
      pal: { W: P.eyeHot, g: P.gold, o: P.goldDark, r: P.red },
    },
  },
};

export const DEFAULT_EQUIPPED: Record<CosmeticSlot, string> = { hat: 'crown', skin: 'none' };

/** What the profile wears, falling back to the defaults for an empty or unknown slot. */
export function resolveLook(profile: ProfileData): PlayerLook {
  const pick = (slot: CosmeticSlot): Cosmetic | null => {
    const id = profile.equipped[slot] ?? DEFAULT_EQUIPPED[slot];
    if (id === 'none') return null;
    const cosmetic = COSMETICS[id];
    return cosmetic && cosmetic.slot === slot ? cosmetic : COSMETICS[DEFAULT_EQUIPPED[slot]] ?? null;
  };
  const hat = pick('hat');
  const skin = pick('skin');
  return {
    id: `${hat ? profile.equipped.hat ?? DEFAULT_EQUIPPED.hat : 'none'}-${skin ? profile.equipped.skin ?? DEFAULT_EQUIPPED.skin : 'base'}`,
    hat: hat?.layer ?? null,
    skin: skin?.palette ?? null,
  };
}
