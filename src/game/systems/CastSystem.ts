import type { Player } from '../entities/Player';

/** Abilities that have a commitment window. Q and Flash stay instant. */
export type CastAbility = 'w' | 'e';

/**
 * What was committed at the moment the key went down.
 *
 * Both the aim (W) and the destination (E) are frozen here, which is the whole
 * point of the cast: moving the mouse during the window cannot re-aim the spell.
 */
export interface CastPayload {
  /** W: the world point the orb was aimed at. E: the blink destination. */
  x: number;
  y: number;
}

interface PendingCast {
  ability: CastAbility;
  payload: CastPayload;
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
 * ability inputs are ignored, but move / attack-move orders are BUFFERED and
 * replayed the instant the cast resolves — committed, but never unresponsive.
 *
 * All timing is GameClock time, so a pause preserves partial cast progress
 * exactly: nothing is rescheduled, the clock simply stops advancing.
 */
export class CastSystem {
  private pending: PendingCast | null = null;
  private now = 0;

  /** A move/attack-move order issued mid-cast, replayed on resolve. */
  private buffered: (() => void) | null = null;

  /** Bumped each time a cast completes, so the scene can flash once. */
  public lastResolveAt = -Infinity;
  /** Which ability that last resolve was — `castingAbility` is null by then. */
  public lastResolvedAbility: CastAbility = 'w';

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

  /** Where the pending cast is aimed, for the directional charge visual. */
  get aim(): CastPayload | null {
    return this.pending?.payload ?? null;
  }

  /**
   * Start a cast. The caller has already checked the cooldown and started it —
   * cooldowns run from cast START so the window never extends the cooldown.
   */
  begin(ability: CastAbility, payload: CastPayload, durationMs: number, nowMs: number): void {
    this.pending = {
      ability,
      payload,
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
   * Hold a move / attack-move order issued during the cast. Only the most
   * recent one survives, matching how re-clicking works everywhere else.
   */
  bufferCommand(run: () => void): void {
    this.buffered = run;
  }

  update(nowMs: number): void {
    this.now = nowMs;
    if (!this.pending || nowMs < this.pending.endsAt) return;

    const { ability, payload } = this.pending;
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

  /** Abort without resolving (round end, death). */
  cancel(): void {
    if (!this.pending) return;
    this.pending = null;
    this.buffered = null;
    this.player.releaseRoot();
  }
}
