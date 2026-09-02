// Who is available, and which of them the model actually gets to see.
//
// The second half matters more than it looks: a player who is not on the shortlist can
// never be recommended, so the rule that builds it has to be deterministic and
// explainable, and the UI shows the result. Nothing here is "always included regardless
// of the cap" — every inclusion competes for a bounded number of slots.

import type { RosterAnalysis } from "./rosterNeeds";
import type { RankedPlayer } from "./rankings";
import { ids, type Position, type SleeperRoster } from "./sleeper";

/**
 * Everyone in the pool who is not on a roster in this league.
 *
 * `reserve` and `taxi` are subsets of `players` in every shape Sleeper produces, so
 * subtracting all three is belt-and-braces rather than a correctness requirement — but a
 * player leaking into the free-agent list because of it would be recommended as an add
 * while sitting on someone's IR, so the union stays.
 *
 * Two boundaries the caller has to disclose, because both are invisible here:
 *  - `trimPlayers` drops anyone without an NFL team, so a just-released player — exactly
 *    the kind of name a waiver ruleset cares about — is not in the pool at all.
 *  - Unrostered is not the same as claimable. A player dropped in the last day or two is
 *    on waivers, and telling the two apart needs the transactions endpoint.
 */
export function freeAgents(pool: RankedPlayer[], rosters: SleeperRoster[]): RankedPlayer[] {
  const taken = new Set<string>();
  for (const r of rosters) {
    for (const id of ids(r.players)) taken.add(id);
    for (const id of ids(r.reserve)) taken.add(id);
    for (const id of ids(r.taxi)) taken.add(id);
  }
  return pool.filter((p) => !taken.has(p.id));
}

/** Sleeper's league-wide 24h add counts, most-added first. */
export type TrendingAdds = Map<string, number>;

/** Why a player is on the shortlist. Rendered in the UI so an omission is answerable. */
export type ShortlistReason = "trending" | "ranked" | "pool";

export interface ShortlistEntry {
  player: RankedPlayer;
  reason: ShortlistReason;
  /** League-wide adds in the last 24h, when Sleeper reported any for this player. */
  adds: number | null;
}

export interface ShortlistResult {
  entries: ShortlistEntry[];
  /** How many free agents there were before the cut, so the UI can say what was skipped. */
  considered: number;
}

// Roughly a standard bench's worth of realistic adds per position, before needs. Kickers
// and defenses are one-week streams (content/waiver-rules.md is explicit about not
// spending on them), so they get token representation rather than a real slice.
const BASE_CAPS: Record<Position, number> = { QB: 3, RB: 8, WR: 8, TE: 4, K: 2, DEF: 3 };
const NEED_BONUS = 4;
const DEFAULT_LIMIT = 60;

// Only the top slice of the trending list is treated as a signal. Past that the add
// counts are noise, and without a cutoff "most added" would outrank everything else all
// the way down the list.
const TREND_CUTOFF = 25;

/** Positions that can fill a flex-type opening, and so benefit from a bigger slice. */
const FLEX_POSITIONS: Position[] = ["RB", "WR", "TE"];

export interface ShortlistOptions {
  needs: RosterAnalysis;
  trending?: TrendingAdds;
  limit?: number;
}

/**
 * The candidate set sent to the model.
 *
 * Ordering is trending-first by design. The rankings sheet this app ships is a *preseason
 * draft* sheet: by midseason essentially no free agent appears on it, so `order` collapses
 * to Sleeper's static `search_rank`, which measures name recognition rather than whether
 * someone just inherited a starting job. League-wide add velocity is the one current
 * signal available without a paid data feed, so it leads — bounded to the top
 * `TREND_CUTOFF`, below which players fall back to `order`.
 *
 * Position caps are applied on the way out, so a run of trending kickers cannot crowd out
 * the running backs, and the total is bounded by `limit` whatever the inputs look like.
 */
export function shortlist(candidates: RankedPlayer[], opts: ShortlistOptions): ShortlistResult {
  const { needs, trending, limit = DEFAULT_LIMIT } = opts;

  // Rank within the trending list once, rather than comparing raw add counts: the counts
  // are wildly scaled (a breakout back can have 50x a streamer) and only the order matters.
  const trendRank = new Map<string, number>();
  if (trending) {
    [...trending.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TREND_CUTOFF)
      .forEach(([id], i) => trendRank.set(id, i));
  }

  const caps = { ...BASE_CAPS };
  for (const pos of Object.keys(caps) as Position[]) {
    const wantsStarter = (needs.starterGaps[pos] ?? 0) > 0;
    const wantsFlex = needs.flexOpen > 0 && FLEX_POSITIONS.includes(pos);
    const wantsSuperflex = needs.superflexOpen > 0 && pos !== "K" && pos !== "DEF";
    if (wantsStarter || wantsFlex || wantsSuperflex) caps[pos] += NEED_BONUS;
  }

  const scored = candidates.map((player, i) => ({
    player,
    trend: trendRank.get(player.id) ?? TREND_CUTOFF,
    i,
  }));
  // Trending first, then the ranking sheet / search rank, then input order so the result
  // is stable rather than dependent on the sort implementation.
  scored.sort((a, b) => a.trend - b.trend || a.player.order - b.player.order || a.i - b.i);

  const entries: ShortlistEntry[] = [];
  for (const s of scored) {
    if (entries.length >= limit) break;
    // `caps` is a local copy, so spending from it directly is the whole cap bookkeeping.
    if (caps[s.player.pos]-- <= 0) continue;
    entries.push({
      player: s.player,
      // A player can be here on more than one basis; report the strongest.
      reason: s.trend < TREND_CUTOFF ? "trending" : s.player.rank != null || s.player.adp != null ? "ranked" : "pool",
      adds: trending?.get(s.player.id) ?? null,
    });
  }

  return { entries, considered: candidates.length };
}

/**
 * The players a waiver add would realistically be dropped for, worst first.
 *
 * Computed here rather than left to the model because the news lookup has to be capped
 * before the model runs, and "the roster players worth researching" is part of that cap.
 * Kickers and defenses come first — content/waiver-rules.md treats both as replaceable
 * streams — then the lowest-ranked bench players.
 */
export function dropCandidates(roster: RankedPlayer[], startingIds: Set<string>, count: number): RankedPlayer[] {
  const bench = roster.filter((p) => !startingIds.has(p.id));
  const streamable = (p: RankedPlayer) => (p.pos === "K" || p.pos === "DEF" ? 0 : 1);
  return [...bench]
    .sort((a, b) => streamable(a) - streamable(b) || b.order - a.order)
    .slice(0, count);
}
