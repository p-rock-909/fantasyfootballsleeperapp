// Server-side player pool, shared by both recommendation routes.
//
// /players/nfl is Sleeper's ~15 MB blob and their docs ask for at most one call per day,
// so this is cached for the life of a warm lambda. `age` is exported alongside it because
// `injury_status` here can be hours old — the prompt says so explicitly, and the grounded
// news brief supersedes it when the two disagree.

import { sleeperFetch, type Player } from "./sleeper";
import { trimPlayers } from "./players";

const TTL_MS = 6 * 3600 * 1000;

let cache: { at: number; players: Player[] } | null = null;

export interface PlayerPool {
  players: Player[];
  /** How stale the injury designations are, in minutes. 0 on a fresh fetch. */
  ageMinutes: number;
}

export async function getPlayerPool(): Promise<PlayerPool> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { players: cache.players, ageMinutes: Math.round((Date.now() - cache.at) / 60000) };
  }
  const raw = await sleeperFetch<Record<string, never>>("/players/nfl");
  cache = { at: Date.now(), players: trimPlayers(raw) };
  return { players: cache.players, ageMinutes: 0 };
}

/** Convenience for callers that don't care how old the pool is. */
export const getPlayers = async (): Promise<Player[]> => (await getPlayerPool()).players;
