"use client";

import type { Player, SleeperDraft, SleeperLeague, SleeperMatchup, SleeperPick, SleeperRoster, SleeperState, SleeperUser } from "./sleeper";
import { loadPlayers, savePlayers } from "./storage";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${url} -> ${res.status}`);
  return body as T;
}

export const api = {
  user: (username: string) => j<SleeperUser>(`/api/sleeper/user/${encodeURIComponent(username)}`),
  state: () => j<SleeperState>("/api/sleeper/state/nfl"),
  leagues: (userId: string, season: string) => j<SleeperLeague[]>(`/api/sleeper/user/${userId}/leagues/nfl/${season}`),
  userDrafts: (userId: string, season: string) => j<SleeperDraft[]>(`/api/sleeper/user/${userId}/drafts/nfl/${season}`),
  leagueDrafts: (leagueId: string) => j<SleeperDraft[]>(`/api/sleeper/league/${leagueId}/drafts`),
  league: (leagueId: string) => j<SleeperLeague>(`/api/sleeper/league/${leagueId}`),
  draft: (draftId: string) => j<SleeperDraft>(`/api/sleeper/draft/${draftId}`),
  picks: (draftId: string) => j<SleeperPick[]>(`/api/sleeper/draft/${draftId}/picks`),
  leagueUsers: (leagueId: string) => j<SleeperUser[]>(`/api/sleeper/league/${leagueId}/users`),
  rosters: (leagueId: string) => j<SleeperRoster[]>(`/api/sleeper/league/${leagueId}/rosters`),
  // Sleeper 404s a week with no schedule; the board renders an empty state rather than an error.
  matchups: (leagueId: string, week: number) =>
    j<SleeperMatchup[]>(`/api/sleeper/league/${leagueId}/matchups/${week}`).catch(() => [] as SleeperMatchup[]),
  rankingsTemplate: () => j<{ csv: string | null; source: string }>("/api/rankings"),
  // League-wide 24h add counts. Optional everywhere it is used — the waiver preview just
  // shows a slightly different order without it, and the run itself fetches its own.
  trendingAdds: () =>
    j<{ player_id: string; count: number }[]>("/api/sleeper/players/nfl/trending/add?lookback_hours=24&limit=50").catch(() => []),
};

export async function getPlayers(force = false): Promise<Player[]> {
  if (!force) {
    const cached = loadPlayers();
    if (cached) return cached;
  }
  const { players } = await j<{ players: Player[] }>("/api/players");
  savePlayers(players);
  return players;
}
