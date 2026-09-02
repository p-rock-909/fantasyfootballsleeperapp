// The whole league as one value: every team, what each of them needs, what each can
// still spend, and who is unrostered.
//
// The matchup feature only ever needed two teams. Waivers and trades need all of them —
// a waiver bid competes with eleven other budgets, and a trade has to be rational for
// the other manager — so this assembles once and both routes read from it.

import { bestLineup, buildTeam, type MatchupTeam, type OrderedLineup, type StartingSlot } from "./lineup";
import { analyzeRoster, type RosterAnalysis } from "./rosterNeeds";
import type { RankedPlayer } from "./rankings";
import { freeAgents } from "./freeAgents";
import {
  ids,
  slotCountsFromPositions,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperUser,
} from "./sleeper";

/** Sleeper's `waiver_type`: 2 is FAAB bidding, anything else is a priority order. */
const FAAB_WAIVER_TYPE = 2;

export interface LeagueRules {
  faab: boolean;
  /** Starting budget, when the league bids. Null when it doesn't, or didn't set one. */
  waiverBudget: number | null;
  /** Week after which trades are locked, when the league sets one. */
  tradeDeadline: number | null;
  playoffWeekStart: number | null;
}

export interface LeagueTeam {
  team: MatchupTeam;
  needs: RosterAnalysis;
  /** Every rostered player, IR and taxi included. */
  players: RankedPlayer[];
  /** The subset of `players` on IR or the taxi squad — they cannot be started at all. */
  reservedIds: Set<string>;
  /** Roster spots left, counting only real bench space — IR and taxi are not that. */
  openSpots: number;
  /** Null in a league that doesn't bid. */
  faabRemaining: number | null;
  waiverPosition: number | null;
}

export interface LeagueState {
  league: SleeperLeague;
  rules: LeagueRules;
  teams: LeagueTeam[];
  byRosterId: Map<number, LeagueTeam>;
  /** The whole pool by id, so callers do not rebuild the same 1,000-entry map. */
  byId: Map<string, RankedPlayer>;
  /** Everyone in the pool nobody has rostered. */
  available: RankedPlayer[];
}

export interface BuildLeagueStateInput {
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  pool: RankedPlayer[];
  lineup: OrderedLineup;
  week: number;
  byeOf: (p: RankedPlayer) => number | null;
}

export function buildLeagueState(input: BuildLeagueStateInput): LeagueState {
  const { league, users, rosters, matchups, pool, lineup, week, byeOf } = input;
  const settings = league.settings ?? {};

  const rules: LeagueRules = {
    faab: settings.waiver_type === FAAB_WAIVER_TYPE,
    waiverBudget: settings.waiver_budget ?? null,
    tradeDeadline: settings.trade_deadline ?? null,
    playoffWeekStart: settings.playoff_week_start ?? null,
  };

  const byId = new Map(pool.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const matchupByRoster = new Map(matchups.map((m) => [m.roster_id, m]));

  const slotCounts = slotCountsFromPositions(league.roster_positions ?? []);

  const teams: LeagueTeam[] = rosters.map((roster) => {
    const team = buildTeam({ roster, matchup: matchupByRoster.get(roster.roster_id), users: userById, byId, lineup, week });
    const reserved = new Set([...ids(roster.reserve), ...ids(roster.taxi)]);
    const players = ids(roster.players).map((id) => byId.get(id)).filter((p): p is RankedPlayer => !!p);
    // IR and taxi hold players but are neither startable nor bench space, so someone
    // parked there has not used up a roster spot.
    const active = players.filter((p) => !reserved.has(p.id));
    const needs = analyzeRoster(active, slotCounts, byeOf);

    const rosterSettings = roster.settings ?? {};
    const faabRemaining = rules.faab && rules.waiverBudget != null
      ? Math.max(0, rules.waiverBudget - (rosterSettings.waiver_budget_used ?? 0))
      : null;

    return {
      team,
      needs,
      players,
      reservedIds: reserved,
      // Read from `needs` rather than recounted here. Counting it twice produced two
      // different answers in an IDP league — and this number decides whether an add
      // forces a drop, which the meta banner and the prompt both state.
      openSpots: needs.totalOpen,
      faabRemaining,
      waiverPosition: rosterSettings.waiver_position ?? null,
    };
  });

  return {
    league,
    rules,
    teams,
    byRosterId: new Map(teams.map((t) => [t.team.rosterId, t])),
    byId,
    available: freeAgents(pool, rosters),
  };
}

/**
 * A team's best legal lineup, valued by the rankings sheet.
 *
 * `order` is lower-is-better, so it is negated for `bestLineup`, which maximizes.
 *
 * `excludeIds` MUST carry the team's IR and taxi players — pass `team.reservedIds`. They
 * are on the roster but cannot be started, and leaving them in silently starts a player
 * who is unavailable in both the before and the after lineup, hiding the very hole a trade
 * might be meant to fix. Players on bye are deliberately NOT excluded: a trade is a
 * rest-of-season decision, and dropping this week's bye players would quietly turn the
 * comparison into a statement about one week.
 */
export function rosterLineup(players: RankedPlayer[], slots: StartingSlot[], excludeIds: Set<string>) {
  return bestLineup(players.filter((p) => !excludeIds.has(p.id)), slots, (p) => -p.order);
}
