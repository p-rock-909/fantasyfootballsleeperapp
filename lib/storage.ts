"use client";

// Browser-side persistence (localStorage). Everything is optional and guarded.
import type { Player } from "./sleeper";
import type { RankingRow } from "./rankings";
import type { RecommendationResponse } from "./schema";

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
  for (const k of recLogKeys()) try { localStorage.removeItem(k); } catch { /* ignore */ }
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

// ---- Recommendation log: every Claude response for a draft, newest first ----

export interface RecMeta { model?: string; pick?: number; usage?: unknown; candidates?: number }

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

const recLogKey = (draftId: string) => `${REC_LOG_PREFIX}${draftId}`;

function recLogKeys(): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(REC_LOG_PREFIX)) out.push(k);
    }
  } catch { /* ignore */ }
  return out;
}

// Same external-store shape as settings above, keyed per draft.
const EMPTY_LOG: RecLogEntry[] = [];
const recListeners = new Set<() => void>();
const recSnapCache = new Map<string, { raw: string | null; value: RecLogEntry[] }>();

function recLogSnapshot(draftId: string): RecLogEntry[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(recLogKey(draftId)); } catch { /* ignore */ }
  const cached = recSnapCache.get(draftId);
  if (cached && cached.raw === raw) return cached.value;
  const value = (raw ? safeParseLog(raw) : null) ?? EMPTY_LOG;
  recSnapCache.set(draftId, { raw, value });
  return value;
}
function safeParseLog(raw: string): RecLogEntry[] | null {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? (v as RecLogEntry[]) : null; } catch { return null; }
}
const subscribeRecLog = (cb: () => void) => { recListeners.add(cb); return () => { recListeners.delete(cb); }; };
const emptyLog = () => EMPTY_LOG;
const notifyRecLog = () => { for (const l of recListeners) l(); };

/** Adds one entry at the front and drops anything past the cap. */
export function appendRecLog(draftId: string, entry: RecLogEntry) {
  write(recLogKey(draftId), [entry, ...recLogSnapshot(draftId)].slice(0, REC_LOG_MAX));
  notifyRecLog();
}

export function clearRecLog(draftId: string) {
  try { localStorage.removeItem(recLogKey(draftId)); } catch { /* ignore */ }
  notifyRecLog();
}

/** Empty during SSR / first client render, then the persisted log for this draft. */
export function useRecLog(draftId: string): RecLogEntry[] {
  return useSyncExternalStore(subscribeRecLog, () => recLogSnapshot(draftId), emptyLog);
}

export function newRecId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}
