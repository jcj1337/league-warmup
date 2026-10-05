import { MOUSE, PREFERENCES } from '../config/balance';

/**
 * The player's data, in one place: settings, key bindings, Mouse Speed, the
 * run log, and (later) the chosen champion, currency and cosmetics.
 *
 * Saved in this browser's localStorage under one key. `Keybinds`, `MouseSpeed`,
 * `Settings` and `RunHistory` keep their APIs and read/write through here, so
 * there is exactly one guarded read (at boot) and one guarded write path.
 *
 * Schema changes are a migration step in `migrate()`. The first one folds in
 * the four keys the stores used before the profile existed, so nobody loses
 * their bindings, settings or run log. Storage can be unavailable (private
 * windows, blocked site data): every read and write is guarded and the
 * defaults always work, for this page.
 *
 * Nothing leaves the machine, and anyone can edit it from the console, which
 * is why currency must only ever gate cosmetics, never gameplay.
 */

export const PROFILE_KEY = 'warmup.profile.v1';
const CURRENT_VERSION = 2;

/** Key-binding actions renamed since they were first saved (v1 named Magic Boy's abilities). */
const KEYBIND_RENAMES: Record<string, string> = { skillshotQ: 'abilityQ', skillshotW: 'abilityW', blinkE: 'abilityE' };

/** Saved bindings under their current action names. */
function upgradeKeybinds(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [action, code] of Object.entries(raw)) out[KEYBIND_RENAMES[action] ?? action] = code;
  return out;
}

/** Champion ids renamed since they were first saved. */
const CHAMPION_RENAMES: Record<string, string> = { ezreal: 'magicboy', cassiopeia: 'snakelady' };

function upgradeChampion(id: string): string {
  return CHAMPION_RENAMES[id] ?? id;
}

/** Keys the stores used before the profile existed; read once and removed by `migrate`. */
const LEGACY_KEYS = {
  keybinds: 'warmup.keybinds.v1',
  mouseSpeed: 'warmup.mouseSpeed.v1',
  settings: 'warmup.settings.v1',
  runs: 'warmup.runHistory.v1',
} as const;

/** A finished run, as logged. See RunHistory for the field notes. */
export interface RunRecord {
  at: string;
  outcome: 'completed' | 'defeated';
  stage: number;
  wave: number;
  runTimeSeconds: number;
  growth: number;
  balanceVersion?: number;
  level?: number;
  score?: number;
  killedBy: string | null;
  damageTaken: Record<string, number>;
  stageDamage?: Record<string, number>;
  /** Who was played (absent on runs logged before champions existed: Magic Boy). */
  champion?: string;
  /** The difficulty mode it was played on (absent on runs logged before modes existed: Normal). */
  mode?: string;
}

export interface ProfileSettings {
  showDamageNumbers: boolean;
  pauseOnFocusLoss: boolean;
}

export interface ProfileData {
  version: typeof CURRENT_VERSION;
  /** The champion the next run uses. Only Magic Boy exists until champions arrive. */
  champion: string;
  /** The difficulty mode the next run uses (a key of MODES). */
  mode: string;
  /** Physical key per rebindable action; missing actions use the KEYBINDS default. */
  keybinds: Record<string, string>;
  mouseSpeed: number;
  settings: ProfileSettings;
  /** Cosmetic currency, earned from score at the end of a run. Spends only on cosmetics. */
  currency: number;
  /** Cosmetic ids owned. */
  unlocked: string[];
  /** Cosmetic id worn per slot ('hat', 'skin', ...). */
  equipped: Record<string, string>;
  /** Finished runs, oldest first, capped at MAX_RUNS. */
  runs: RunRecord[];
}

/** Oldest runs are dropped past this. */
export const MAX_RUNS = 500;

export function defaultProfile(): ProfileData {
  return {
    version: CURRENT_VERSION,
    champion: 'magicboy',
    mode: 'normal',
    keybinds: {},
    mouseSpeed: MOUSE.defaultSpeed,
    settings: {
      showDamageNumbers: true,
      pauseOnFocusLoss: PREFERENCES.pauseOnFocusLoss,
    },
    currency: 0,
    unlocked: [],
    equipped: {},
    runs: [],
  };
}

class ProfileStore {
  private current: ProfileData;
  private readonly listeners = new Set<() => void>();

  constructor() {
    this.current = load();
  }

  /** The live profile. Treat as read-only: change it through `update`. */
  get data(): ProfileData {
    return this.current;
  }

  /** Change the profile in place and save it. One write, however many fields changed. */
  update(change: (data: ProfileData) => void): void {
    change(this.current);
    this.current.runs = this.current.runs.slice(-MAX_RUNS);
    save(this.current);
    for (const fn of this.listeners) fn();
  }

  /** Back to a fresh profile (the console's `__profile.reset()`). */
  reset(): void {
    this.current = defaultProfile();
    save(this.current);
    for (const fn of this.listeners) fn();
  }

  /** Call `fn` after every change. Returns an unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

// ---------------------------------------------------------------- storage

function load(): ProfileData {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PROFILE_KEY);
  } catch {
    return defaultProfile();
  }
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const data = parsed ? sanitize(parsed) : migrate();
  // A migrated or repaired profile is written back at once, so the legacy keys can go.
  if (!parsed) save(data);
  return data;
}

function save(data: ProfileData): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  } catch {
    // Storage blocked or full: the profile still holds for this page.
  }
}

/**
 * No profile yet: build one from the keys the stores used before it existed,
 * then remove them. Each legacy value is validated the same way as a profile
 * field, so a corrupt one simply falls back to its default.
 */
function migrate(): ProfileData {
  const data = defaultProfile();
  const legacy = (key: string): unknown => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const keybinds = legacy(LEGACY_KEYS.keybinds);
  if (isRecord(keybinds)) data.keybinds = upgradeKeybinds(stringMap(keybinds));
  let mouseRaw: string | null = null;
  try {
    mouseRaw = window.localStorage.getItem(LEGACY_KEYS.mouseSpeed);
  } catch {
    mouseRaw = null;
  }
  if (mouseRaw !== null && Number.isFinite(Number(mouseRaw))) data.mouseSpeed = Number(mouseRaw);
  const settings = legacy(LEGACY_KEYS.settings);
  if (isRecord(settings)) data.settings = sanitizeSettings(settings, data.settings);
  const runs = legacy(LEGACY_KEYS.runs);
  if (Array.isArray(runs)) data.runs = runs.filter(isRun).slice(-MAX_RUNS);
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  }
  return data;
}

/** A parsed profile, field by field: anything missing or wrong falls back to its default. */
function sanitize(parsed: unknown): ProfileData {
  const data = defaultProfile();
  if (!isRecord(parsed)) return data;
  if (typeof parsed.champion === 'string' && parsed.champion) data.champion = upgradeChampion(parsed.champion);
  if (typeof parsed.mode === 'string' && parsed.mode) data.mode = parsed.mode;
  if (isRecord(parsed.keybinds)) data.keybinds = upgradeKeybinds(stringMap(parsed.keybinds));
  if (typeof parsed.mouseSpeed === 'number' && Number.isFinite(parsed.mouseSpeed)) data.mouseSpeed = parsed.mouseSpeed;
  if (isRecord(parsed.settings)) data.settings = sanitizeSettings(parsed.settings, data.settings);
  if (typeof parsed.currency === 'number' && Number.isFinite(parsed.currency) && parsed.currency >= 0) {
    data.currency = Math.floor(parsed.currency);
  }
  if (Array.isArray(parsed.unlocked)) data.unlocked = parsed.unlocked.filter((id): id is string => typeof id === 'string');
  if (isRecord(parsed.equipped)) data.equipped = stringMap(parsed.equipped);
  if (Array.isArray(parsed.runs)) {
    data.runs = parsed.runs.filter(isRun).slice(-MAX_RUNS)
      .map((run) => (typeof run.champion === 'string' ? { ...run, champion: upgradeChampion(run.champion) } : run));
  }
  return data;
}

function sanitizeSettings(raw: Record<string, unknown>, defaults: ProfileSettings): ProfileSettings {
  const out = { ...defaults };
  if (typeof raw.showDamageNumbers === 'boolean') out.showDamageNumbers = raw.showDamageNumbers;
  if (typeof raw.pauseOnFocusLoss === 'boolean') out.pauseOnFocusLoss = raw.pauseOnFocusLoss;
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only the string-valued entries of a record. */
function stringMap(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v) out[k] = v;
  return out;
}

/** The shape every logged run must have; optional fields are left to the readers. */
function isRun(value: unknown): value is RunRecord {
  return isRecord(value) && typeof value.at === 'string' && typeof value.stage === 'number' && typeof value.wave === 'number'
    && typeof value.growth === 'number' && (value.outcome === 'completed' || value.outcome === 'defeated');
}

export const Profile = new ProfileStore();
