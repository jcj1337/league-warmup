import type { Aim, Slot } from '../../champions/types';
import type { Player } from '../entities/Player';

/**
 * Slots that have a commitment window. Flash stays instant by design.
 * A slot whose castTimeMs is 0 skips this system entirely (see GameScene).
 */
export type CastAbility = Slot;

/**
 * What was committed at the moment the key went down: the aim as the engine
 * resolved it and the kit committed it (a blink's destination, a picked
 * target). Frozen here, which is the whole point of the cast: moving the
 * mouse during the window cannot re-aim the spell.
 */
export type CastPayload = Aim;

interface PendingCast {
  ability: CastAbility;
  payload: CastPayload;
  /** Where she stood when the key went down; the aim travels with her from here. */
  fromX: number;
  fromY: number;
  /** Stays where it began: no shift, and resolves with `from`. */
  anchored: boolean;
  startedAt: number;
  endsAt: number;
  durationMs: number;
}

interface CastCallbacks {
  /** The cast completed: fire the projectile / perform the blink. */
  onResolve: (ability: CastAbility, payload: CastPayload) => void;
}

/**
 * The player's ability cast state.
 *
 * This is GAMEPLAY state, not animation state: the timer here decides when a
 * spell actually happens, and the visuals only read `progress`. No animation
 * callback is ever authoritative, so retuning castTimeMs or replacing the
 * animation entirely cannot desync the mechanic.
 *
 * While a cast is pending the player is rooted (movement is locked) and further
 * ability inputs are ignored, but move, attack-move and attack orders are
 * BUFFERED and replayed the instant the cast resolves — committed, but never
 * unresponsive. Stop discards a buffered order without touching the cast.
 *
 * Flash is the one thing that can move her mid-cast, and the cast goes with
 * her, as in League (W-Flash, R-Flash): it resolves from where she is at the
 * end of the window, aimed the same relative to her as when it was committed.
 * An anchored cast stays put instead: its aim is never shifted, and it carries
 * `from`, the spot the key went down, to fire from (Ezreal's R).
 *
 * All timing is GameClock time, so a pause preserves partial cast progress
 * exactly: nothing is rescheduled, the clock simply stops advancing.
 */
export class CastSystem {
  private pending: PendingCast | null = null;
  private now = 0;

  /** A move, attack-move or attack order issued mid-cast, replayed on resolve. */
  private buffered: (() => void) | null = null;

  /** Bumped each time a cast completes, so the scene can flash once. */
  public lastResolveAt = -Infinity;
  /** Which ability that last resolve was — `castingAbility` is null by then. */
  public lastResolvedAbility: CastAbility = 'q';

  constructor(
    private readonly player: Player,
    private readonly callbacks: CastCallbacks,
  ) {}

  get isCasting(): boolean {
    return this.pending !== null;
  }

  get castingAbility(): CastAbility | null {
    return this.pending?.ability ?? null;
  }

  /** 0 -> 1 across the cast window. 0 when nothing is casting. */
  get progress(): number {
    if (!this.pending) return 0;
    const remaining = this.pending.endsAt - this.now;
    return Math.min(1, Math.max(0, 1 - remaining / this.pending.durationMs));
  }

  /** The pending window's full length; 0 when nothing is casting. */
  get durationMs(): number {
    return this.pending?.durationMs ?? 0;
  }

  /** Where the pending cast is aimed right now: the committed aim, carried along by a mid-cast Flash. */
  get aim(): CastPayload | null {
    return this.pending ? this.carried(this.pending) : null;
  }

  private carried(cast: PendingCast): CastPayload {
    if (cast.anchored) return { ...cast.payload, from: { x: cast.fromX, y: cast.fromY } };
    const dx = this.player.x - cast.fromX;
    const dy = this.player.y - cast.fromY;
    if (dx === 0 && dy === 0) return cast.payload;
    return { ...cast.payload, x: cast.payload.x + dx, y: cast.payload.y + dy };
  }

  /**
   * Start a cast. The caller has already checked the cooldown and started it —
   * cooldowns run from cast START so the window never extends the cooldown.
   */
  begin(ability: CastAbility, payload: CastPayload, durationMs: number, nowMs: number, anchored = false): void {
    this.pending = {
      ability,
      payload,
      fromX: this.player.x,
      fromY: this.player.y,
      anchored,
      startedAt: nowMs,
      endsAt: nowMs + durationMs,
      durationMs,
    };
    this.buffered = null;

    // Lock movement for the window. Reference-counted, so it composes with the
    // auto-attack windup root rather than fighting it.
    this.player.stop();
    this.player.root();
  }

  /**
   * Hold a move, attack-move or attack order issued during the cast. Only the
   * most recent one survives, matching how re-clicking works everywhere else.
   */
  bufferCommand(run: () => void): void {
    this.buffered = run;
  }

  /** Drop the buffered order (Stop mid-cast). The cast itself still resolves. */
  clearBufferedCommand(): void {
    this.buffered = null;
  }

  update(nowMs: number): void {
    this.now = nowMs;
    if (!this.pending || nowMs < this.pending.endsAt) return;

    const { ability } = this.pending;
    const payload = this.carried(this.pending);
    this.pending = null;
    this.player.releaseRoot();
    this.lastResolveAt = nowMs;
    this.lastResolvedAbility = ability;

    // Resolve first, then replay the buffered order — so E's blink lands before
    // the movement it was queued behind starts from the new position.
    this.callbacks.onResolve(ability, payload);

    const buffered = this.buffered;
    this.buffered = null;
    buffered?.();
  }

  /**
   * Abort without resolving (a stun). Returns what was interrupted, so the
   * caller can refund its cooldown and keep the order queued behind it.
   */
  interrupt(): { ability: CastAbility; buffered: (() => void) | null } | null {
    if (!this.pending) return null;
    const interrupted = { ability: this.pending.ability, buffered: this.buffered };
    this.pending = null;
    this.buffered = null;
    this.player.releaseRoot();
    return interrupted;
  }

  /** Abort without resolving (round end, death). */
  cancel(): void {
    this.interrupt();
  }
}
