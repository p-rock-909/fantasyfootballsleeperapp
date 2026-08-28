"use client";

// Browser-side persistence (localStorage). Everything is optional and guarded.
import type { Player } from "./sleeper";
import type { RankingRow } from "./rankings";

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
