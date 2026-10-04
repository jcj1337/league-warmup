/**
 * How an enemy status (a mark, a poison, a slow) is drawn: an icon bobbing
 * over the head and a dotted ring at the feet, blinking as it lapses.
 *
 * Champions register the looks of the statuses they apply; EnemyView draws
 * whichever registered statuses an enemy currently has. Nothing here is read
 * by gameplay.
 */
export interface StatusLook {
  /** Texture key of the icon over the head. */
  icon: string;
  ringColor: number;
  /** Blink once this little time is left. */
  warnMs: number;
  bobPx: number;
}

const LOOKS = new Map<string, StatusLook>();

export function registerStatusLook(id: string, look: StatusLook): void {
  LOOKS.set(id, look);
}

/** Every registered status, for the view to check against an enemy. */
export function statusLooks(): ReadonlyMap<string, StatusLook> {
  return LOOKS;
}
