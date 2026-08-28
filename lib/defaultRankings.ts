// The rankings template that ships with the app. Used whenever nothing has been
// imported in the browser, so a fresh session still gets ranks, tiers and ADP
// instead of falling back to Sleeper's own ordering. Server-only (reads from disk).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRankings, type RankingRow } from "./rankings";
import type { Player } from "./sleeper";

export const DEFAULT_RANKINGS_PATH = "content/rankings-template.csv";

const CSV_TTL = 6 * 3600 * 1000;
let csvCache: { at: number; csv: string | null } | null = null;

/** Raw template text, or null if the file isn't deployed. Cached per warm lambda. */
export async function defaultRankingsCsv(): Promise<string | null> {
  if (csvCache && Date.now() - csvCache.at < CSV_TTL) return csvCache.csv;
  let csv: string | null = null;
  try {
    csv = await readFile(path.join(process.cwd(), ...DEFAULT_RANKINGS_PATH.split("/")), "utf8");
  } catch { /* no template deployed — callers fall back to Sleeper order */ }
  csvCache = { at: Date.now(), csv };
  return csv;
}

/** Template rows matched to the Sleeper pool, or null when the file is missing or unusable. */
export async function defaultRankingRows(players: Player[]): Promise<RankingRow[] | null> {
  const csv = await defaultRankingsCsv();
  if (!csv) return null;
  try {
    const matched = parseRankings(csv, players).rows.filter((r) => r.playerId);
    return matched.length ? matched : null;
  } catch {
    // A hand-edited template with no name column shouldn't break recommendations.
    return null;
  }
}
