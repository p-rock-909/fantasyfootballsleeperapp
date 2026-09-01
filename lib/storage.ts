"use client";

// Browser-side persistence (localStorage). Everything is optional and guarded.
import type { Player } from "./sleeper";
import type { RankingRow } from "./rankings";
import type { LlmUsage } from "./llm/types";
import type { MatchupRecommendation, RecommendationResponse } from "./schema";
import type { LiveContextResult } from "./liveContext";

export interface Settings {
  userId: string | null;
  username: string | null;
  draftId: string | null;
  leagueId: string | null;
  mySlotOverride: number | null;
  effort: "low" | "medium" | "high";
  autoRecommend: boolean;
  autoWithinPicks: number;
  appPassword: string;
}

export const DEFAULT_SETTINGS: Settings = {
  userId: null, username: null, draftId: null, leagueId: null, mySlotOverride: null,
  effort: "high", autoRecommend: true, autoWithinPicks: 3, appPassword: "",
};

const KEYS = { settings: "sda:settings", players: "sda:players", rankings: "sda:rankings", rankingsCsv: "sda:rankingsCsv" };
const REC_LOG_PREFIX = "sda:recs:";
const MATCHUP_LOG_PREFIX = "sda:matchup:";
const LOG_PREFIXES = [REC_LOG_PREFIX, MATCHUP_LOG_PREFIX];

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(KEYS.settings) ?? {}) });
export const saveSettings = (s: Settings) => write(KEYS.settings, s);

const PLAYERS_TTL = 24 * 3600 * 1000;
export function loadPlayers(): Player[] | null {
  const v = read<{ at: number; players: Player[] }>(KEYS.players);
  return v && Date.now() - v.at < PLAYERS_TTL ? v.players : null;
}
export const savePlayers = (players: Player[]) => write(KEYS.players, { at: Date.now(), players });

export const loadRankings = (): RankingRow[] | null => read<RankingRow[]>(KEYS.rankings);
export const saveRankings = (rows: RankingRow[] | null) => (rows ? write(KEYS.rankings, rows) : localStorage.removeItem(KEYS.rankings));
export const loadRankingsCsv = (): string => read<string>(KEYS.rankingsCsv) ?? "";
export const saveRankingsCsv = (csv: string) => write(KEYS.rankingsCsv, csv);

export function clearAll() {
  for (const k of Object.values(KEYS)) try { localStorage.removeItem(k); } catch { /* ignore */ }
  for (const k of keysWithPrefix(...LOG_PREFIXES)) try { localStorage.removeItem(k); } catch { /* ignore */ }
}

// ---- React hook: settings as an external store (hydration-safe, no setState-in-effect) ----
import { useSyncExternalStore, useCallback } from "react";

const listeners = new Set<() => void>();
let snapCache: { raw: string | null; value: Settings } | null = null;

function settingsSnapshot(): Settings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEYS.settings); } catch { /* ignore */ }
  if (snapCache && snapCache.raw === raw) return snapCache.value;
  snapCache = { raw, value: { ...DEFAULT_SETTINGS, ...(raw ? (safeParse(raw) ?? {}) : {}) } };
  return snapCache.value;
}
function safeParse(raw: string): Partial<Settings> | null { try { return JSON.parse(raw); } catch { return null; } }
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const serverSnapshot = () => null;

export function updateSettings(patch: Partial<Settings>) {
  saveSettings({ ...settingsSnapshot(), ...patch });
  for (const l of listeners) l();
}

/** Returns null during SSR / first client render, then the persisted settings. */
export function useSettings(): [Settings | null, (patch: Partial<Settings>) => void] {
  const s = useSyncExternalStore(subscribe, settingsSnapshot, serverSnapshot);
  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), []);
  return [s, update];
}

// ---- Recommendation log: every model response for a draft, newest first ----

export interface RecMeta { provider?: string; model?: string; pick?: number; usage?: LlmUsage; candidates?: number }

export interface RecLogEntry {
  id: string;
  at: number; // epoch ms
  forPick: number; // overall pick number the run was made for
  round: number;
  effort: Settings["effort"];
  question: string | null; // the note sent with this run, if any
  data: RecommendationResponse | null;
  error: string | null; // set instead of `data` when the run failed
  meta: RecMeta | null;
}

// A 12-team draft auto-runs a handful of times per round; 100 covers a full draft plus re-runs.
const REC_LOG_MAX = 100;

function keysWithPrefix(...prefixes: string[]): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) out.push(k);
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * A newest-first, capped list persisted per key — the same external-store shape as
 * settings above, so a snapshot is stable until the underlying string changes and
 * `useSyncExternalStore` doesn't loop. Both the draft and matchup logs are built on it.
 */
function createLogStore<T>(prefix: string, max: number) {
  const EMPTY: T[] = [];
  const listeners = new Set<() => void>();
  const snapCache = new Map<string, { raw: string | null; value: T[] }>();
  const storageKey = (id: string) => `${prefix}${id}`;

  function snapshot(id: string): T[] {
    let raw: string | null = null;
    try { raw = localStorage.getItem(storageKey(id)); } catch { /* ignore */ }
    const cached = snapCache.get(id);
    if (cached && cached.raw === raw) return cached.value;
    let value: T[] = EMPTY;
    try { const v = raw ? JSON.parse(raw) : null; if (Array.isArray(v)) value = v as T[]; } catch { /* ignore */ }
    snapCache.set(id, { raw, value });
    return value;
  }

  const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
  const notify = () => { for (const l of listeners) l(); };

  return {
    /** Adds one entry at the front and drops anything past the cap. */
    append(id: string, entry: T) {
      write(storageKey(id), [entry, ...snapshot(id)].slice(0, max));
      notify();
    },
    clear(id: string) {
      try { localStorage.removeItem(storageKey(id)); } catch { /* ignore */ }
      notify();
    },
    /** Empty during SSR / first client render, then the persisted log. */
    use(id: string): T[] {
      return useSyncExternalStore(subscribe, () => snapshot(id), () => EMPTY);
    },
  };
}

const recLog = createLogStore<RecLogEntry>(REC_LOG_PREFIX, REC_LOG_MAX);

export const appendRecLog = (draftId: string, entry: RecLogEntry) => recLog.append(draftId, entry);
export const clearRecLog = (draftId: string) => recLog.clear(draftId);
export const useRecLog = (draftId: string): RecLogEntry[] => recLog.use(draftId);

export function newRecId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}

// ---- Matchup evaluation log: one list per league+week, newest first ----

export interface MatchupLogEntry {
  id: string;
  at: number;
  week: number;
  /** Which matchup and which side — a week holds several, and a bare list is unreadable later. */
  matchupKey: string;
  myRosterId: number;
  myTeam: string;
  opponentTeam: string | null;
  effort: Settings["effort"];
  question: string | null;
  data: MatchupRecommendation | null;
  liveContext: LiveContextResult | null;
  /** App-generated lineup problems. Kept apart from the model's own `alerts`. */
  validation: { ok: boolean; issues: string[] } | null;
  error: string | null;
  meta: Record<string, unknown> | null;
}

// Entries carry a whole news brief, so they are much larger than a draft entry and
// `write()` swallows QuotaExceededError silently. 20 covers a full season of re-runs.
const MATCHUP_LOG_MAX = 20;

const matchupLog = createLogStore<MatchupLogEntry>(MATCHUP_LOG_PREFIX, MATCHUP_LOG_MAX);
const matchupLogId = (leagueId: string, week: number) => `${leagueId}:${week}`;

export const appendMatchupLog = (leagueId: string, week: number, entry: MatchupLogEntry) =>
  matchupLog.append(matchupLogId(leagueId, week), entry);
export const clearMatchupLog = (leagueId: string, week: number) => matchupLog.clear(matchupLogId(leagueId, week));
export const useMatchupLog = (leagueId: string, week: number): MatchupLogEntry[] => matchupLog.use(matchupLogId(leagueId, week));
