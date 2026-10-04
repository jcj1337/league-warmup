import type { Enemy } from './entities/Enemy';
import type { ClearedWave } from './systems/WaveDirector';

/**
 * What happens during a run, as events. Gameplay emits them from the one
 * place each thing is decided (the Combat hit funnel, the WaveDirector
 * callbacks, the round end); presentation and bookkeeping listen.
 *
 * Kill gold, the level-up ring, the stage-clear popups, the hit shake, and
 * later currency, cosmetic unlocks, the death card and sound cues are all
 * listeners here instead of lines inside the gameplay methods.
 *
 * Deliberately one-way: nothing that listens reaches back into gameplay, so
 * the order of listeners never changes what the game does.
 */
export interface RunEventMap {
  /** A pip-removing hit landed on an enemy (autos, Q, the E bolt, a mark detonation). */
  hit: { target: Enemy; killed: boolean };
  /** An enemy died, whatever landed it, and what the kill scored. */
  kill: { target: Enemy; points: number };
  /** A W mark cashed in on this enemy. */
  markDetonated: { target: Enemy };
  /** The player reached a new level. */
  levelUp: { level: number };
  /** A wave was cleared; `points` is its speed bonus (0 when over par). */
  waveCleared: ClearedWave & { points: number };
  /** A stage was cleared: the HP bonus, whether it was flawless, and the HP the heal restored. */
  stageCleared: { stage: number; points: number; flawless: boolean; healed: number };
  /** The player lost HP (hits eaten by i-frames never emit). */
  playerHit: { damage: number; source: string; lethal: boolean };
}

export type RunEventName = keyof RunEventMap;
type Listener<K extends RunEventName> = (event: RunEventMap[K]) => void;

export class RunEvents {
  // One set per event name; the `on` / `emit` signatures keep the pairing typed.
  private readonly listeners = new Map<RunEventName, Set<(event: never) => void>>();

  /** Listen for `name`. Returns an unsubscribe. */
  on<K extends RunEventName>(name: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as (event: never) => void);
    return () => set.delete(fn as (event: never) => void);
  }

  emit<K extends RunEventName>(name: K, event: RunEventMap[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const fn of set) (fn as Listener<K>)(event);
  }

  /** Drop every listener (a round ending). */
  clear(): void {
    this.listeners.clear();
  }
}
