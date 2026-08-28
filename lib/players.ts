import { FANTASY_POSITIONS, type Player, type Position } from "./sleeper";

/** Raw Sleeper player record (only the fields we read). */
interface RawPlayer {
  player_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  injury_status?: string | null;
  depth_chart_order?: number | null;
  search_rank?: number | null;
  status?: string | null;
  active?: boolean;
}

/** Trim the ~15 MB Sleeper blob to ~1,000 rostered fantasy-relevant players (~90 KB). */
export function trimPlayers(raw: Record<string, RawPlayer>): Player[] {
  const out: Player[] = [];
  for (const p of Object.values(raw)) {
    const pos = p.position as Position | undefined;
    if (!pos || !FANTASY_POSITIONS.includes(pos)) continue;
    if (!p.team) continue; // free agents / retired
    if (p.active === false || p.status === "Inactive" || p.status === "Retired") continue;
    const name = p.full_name ?? (pos === "DEF" ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : `${p.first_name} ${p.last_name}`);
    out.push({
      id: p.player_id,
      name,
      pos,
      team: p.team,
      age: p.age ?? null,
      exp: p.years_exp ?? null,
      inj: p.injury_status || null,
      depth: p.depth_chart_order ?? null,
      srank: p.search_rank != null && p.search_rank < 9_000_000 ? p.search_rank : null,
    });
  }
  out.sort((a, b) => (a.srank ?? 1e9) - (b.srank ?? 1e9));
  return out;
}

/**
 * Fallback bye weeks by team when the rankings CSV has no BYE column.
 * Fill this in from the NFL schedule for the current season (team abbr -> week). Empty = unknown.
 */
export const BYE_WEEKS: Record<string, number> = {};

export const byeForTeam = (team: string): number | null => BYE_WEEKS[team] ?? null;
