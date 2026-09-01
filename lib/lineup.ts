// Weekly lineup math. Everything here is pure and deterministic — who is legally
// startable, which players fit which slot, who plays whom — so the model is only
// ever asked for judgment, never for counting. Unit-tested in lineup.test.ts.

import { ids, type Position, type SleeperMatchup, type SleeperRoster, type SleeperUser } from "./sleeper";

export type StartingSlot = "QB" | "RB" | "WR" | "TE" | "FLEX" | "REC_FLEX" | "WRRB_FLEX" | "SUPER_FLEX" | "K" | "DEF";

export const SLOT_ELIGIBILITY: Record<StartingSlot, Position[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  FLEX: ["RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  K: ["K"],
  DEF: ["DEF"],
};

const STARTING_SLOTS = new Set<string>(Object.keys(SLOT_ELIGIBILITY));
// Positions that hold players but never start a lineup.
const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

/** The minimum a player needs for lineup math; `RankedPlayer` satisfies it structurally. */
export interface LineupPlayer {
  id: string;
  name: string;
  pos: Position;
  team: string;
  inj: string | null;
  bye: number | null;
}

/**
 * The ordered starting lineup from a league's `roster_positions`.
 *
 * Allowlist, not "everything except BN": Sleeper emits IDP tokens (DL/LB/DB/IDP_FLEX)
 * and can add new ones, and `trimPlayers` drops IDP players from the pool entirely, so
 * treating an unknown token as a startable slot would render a slot nothing can fill.
 * They come back in `unsupported` instead, for the UI to disclose.
 */
export function orderedSlots(positions: string[] | null | undefined): { slots: StartingSlot[]; unsupported: string[] } {
  const slots: StartingSlot[] = [];
  const unsupported: string[] = [];
  for (const p of positions ?? []) {
    if (STARTING_SLOTS.has(p)) slots.push(p as StartingSlot);
    else if (!NON_STARTING.has(p)) unsupported.push(p);
  }
  return { slots, unsupported };
}

export type Startability = "startable" | "ir" | "taxi" | "bye" | "out";

// Designations that mean "cannot be counted on to play". `Questionable` is deliberately
// absent — the ruleset wants those evaluated, not excluded.
const OUT_STATUSES = new Set(["out", "doubtful", "ir", "injured reserve", "sus", "suspended", "na", "pup", "dnr", "cov"]);

export interface StartabilityContext {
  reserve: Set<string>;
  taxi: Set<string>;
  week: number;
}

/**
 * Why a player can or cannot be started this week. Precedence is roster status first
 * (IR/taxi are hard league rules), then the bye, then the injury designation — a player
 * who is both on bye and questionable is more usefully reported as on bye.
 */
export function startability(player: LineupPlayer, ctx: StartabilityContext): Startability {
  if (ctx.reserve.has(player.id)) return "ir";
  if (ctx.taxi.has(player.id)) return "taxi";
  if (player.bye != null && player.bye === ctx.week) return "bye";
  if (player.inj && OUT_STATUSES.has(player.inj.trim().toLowerCase())) return "out";
  return "startable";
}

export const isEligible = (slot: StartingSlot, pos: Position): boolean => SLOT_ELIGIBILITY[slot].includes(pos);

export function candidatesForSlot<T extends LineupPlayer>(slot: StartingSlot, players: T[]): T[] {
  return players.filter((p) => isEligible(slot, p.pos));
}

// ---- Team assembly ----

export interface TeamRow {
  player: LineupPlayer;
  status: Startability;
  slot: StartingSlot | null; // the slot Sleeper currently has them in, if any
  points: number | null;
}

export interface MatchupTeam {
  rosterId: number;
  name: string;
  ownerIds: string[];
  record: string | null;
  points: number | null;
  starters: TeamRow[]; // aligned with `slots`
  bench: TeamRow[];
  slots: StartingSlot[];
  unsupportedSlots: string[];
}

export const teamName = (roster: SleeperRoster, users: Map<string, SleeperUser>): string => {
  const owner = roster.owner_id ? users.get(roster.owner_id) : undefined;
  return owner?.metadata?.team_name?.trim() || owner?.display_name || `Team ${roster.roster_id}`;
};

/** Every user id that can act for this roster — `owner_id` alone misses co-owners. */
export const rosterOwnerIds = (roster: SleeperRoster): string[] =>
  [roster.owner_id, ...(roster.co_owners ?? [])].filter((id): id is string => !!id);

export interface BuildTeamInput {
  roster: SleeperRoster;
  matchup: SleeperMatchup | undefined;
  users: Map<string, SleeperUser>;
  byId: Map<string, LineupPlayer>;
  slots: StartingSlot[];
  unsupportedSlots: string[];
  week: number;
}

// Named rather than positional: `slots` and `unsupportedSlots` are both string-ish and
// adjacent, so a transposition would type-check and silently build the wrong team.
export function buildTeam({ roster, matchup, users, byId, slots, unsupportedSlots, week }: BuildTeamInput): MatchupTeam {
  const ctx: StartabilityContext = { reserve: new Set(ids(roster.reserve)), taxi: new Set(ids(roster.taxi)), week };
  const points = matchup?.players_points ?? null;
  const row = (id: string, slot: StartingSlot | null): TeamRow | null => {
    const player = byId.get(id);
    if (!player) return null; // dropped from the pool (inactive/retired) — nothing to say about them
    return { player, status: startability(player, ctx), slot, points: points?.[id] ?? null };
  };

  // `starters` is positionally aligned with `roster_positions` minus bench, and carries
  // "0" for an empty slot — so index by slot, and let `ids()` handle the placeholder.
  const rawStarters = matchup?.starters ?? roster.starters ?? [];
  const starters: TeamRow[] = [];
  const startedIds = new Set<string>();
  slots.forEach((slot, i) => {
    const id = rawStarters[i];
    if (!id || id === "0") return;
    const r = row(id, slot);
    startedIds.add(id);
    if (r) starters.push(r);
  });

  const rostered = ids(matchup?.players ?? roster.players);
  const bench = rostered.filter((id) => !startedIds.has(id)).map((id) => row(id, null)).filter((r): r is TeamRow => !!r);

  const s = roster.settings ?? {};
  const record = s.wins != null ? `${s.wins}-${s.losses ?? 0}${s.ties ? `-${s.ties}` : ""}` : null;

  return {
    rosterId: roster.roster_id,
    name: teamName(roster, users),
    ownerIds: rosterOwnerIds(roster),
    record,
    points: matchup?.points ?? null,
    starters,
    bench,
    slots,
    unsupportedSlots,
  };
}

// ---- Pairing ----

export interface MatchupPair {
  /** Stable id for selection. Sleeper's `matchup_id`, or `bye-<rosterId>` when unscheduled. */
  key: string;
  matchupId: number | null;
  rosterIds: number[];
  isBye: boolean;
}

/**
 * Group a week's matchup rows into pairs. Handles the three shapes Sleeper actually
 * produces: a normal pair, `matchup_id: null` (unscheduled), and an odd roster left over.
 * A group of 3+ is not something Sleeper should emit, but it is kept whole rather than
 * silently truncated so the UI can show what is really there.
 */
export function pairMatchups(matchups: SleeperMatchup[] | null | undefined): MatchupPair[] {
  const byId = new Map<number, number[]>();
  const byes: MatchupPair[] = [];
  for (const m of matchups ?? []) {
    if (m.matchup_id == null) {
      byes.push({ key: `bye-${m.roster_id}`, matchupId: null, rosterIds: [m.roster_id], isBye: true });
      continue;
    }
    byId.set(m.matchup_id, [...(byId.get(m.matchup_id) ?? []), m.roster_id]);
  }
  const pairs = [...byId.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([matchupId, rosterIds]) => ({
      key: String(matchupId),
      matchupId,
      rosterIds,
      isBye: rosterIds.length < 2,
    }));
  return [...pairs, ...byes];
}

export type MatchupPhase = "pre" | "live" | "final";

export interface PhaseInput {
  week: number;
  /** The league's season, so a completed prior-season league isn't read as "not started". */
  leagueSeason: string;
  stateSeason: string;
  /**
   * `state.week` — the week that is actually scoring. Deliberately NOT `display_week`:
   * that one is for labelling the week picker, and using it here would shift the
   * live/final boundary by a day.
   */
  stateWeek: number;
  matchups: SleeperMatchup[] | null | undefined;
}

/**
 * Whether the week is upcoming, in progress, or done.
 *
 * Deliberately not derived from `starters_points[i] > 0`: a QB can score negative, a
 * receiver can genuinely score 0.0, and an inactive starter stays at 0 forever — all
 * three would read as "hasn't played yet" indefinitely.
 *
 * The points check is dominant over the week arithmetic so a populated week can never
 * come back as `pre`. That covers the Monday-night window, where `state.week` has not
 * rolled over yet but the games are finished.
 */
export function matchupPhase({ week, leagueSeason, stateSeason, stateWeek, matchups }: PhaseInput): MatchupPhase {
  const anyPoints = (matchups ?? []).some((m) => !!m.points);
  if (leagueSeason !== stateSeason) return leagueSeason > stateSeason ? "pre" : "final";
  if (week > stateWeek) return "pre";
  if (week < stateWeek) return anyPoints ? "final" : "pre";
  return anyPoints ? "live" : "pre";
}

// ---- Validating what the model sent back ----

export interface LineupCheck<T> {
  kept: T[];
  alerts: string[];
}

/**
 * Filtering ids against the legal set is necessary but not sufficient: nothing stops the
 * model starting one RB in both RB and FLEX, skipping a slot, or returning more rows than
 * there are slots. Violations are reported rather than silently repaired, so an incomplete
 * answer is visible as incomplete.
 */
export function checkLineup<T extends { slot: string; player_id: string; name: string }>(
  lineup: T[],
  slots: StartingSlot[],
  legalForSlot: (slot: StartingSlot, playerId: string) => boolean,
): LineupCheck<T> {
  const alerts: string[] = [];
  const remaining = [...slots];
  const seen = new Map<string, string>(); // player_id -> slot it was already used in
  const kept: T[] = [];

  for (const row of lineup) {
    const slot = row.slot as StartingSlot;
    const at = remaining.indexOf(slot);
    if (at === -1) {
      alerts.push(`Dropped ${row.name}: this league has no unfilled ${row.slot} slot.`);
      continue;
    }
    if (!legalForSlot(slot, row.player_id)) {
      alerts.push(`Dropped ${row.name} from ${slot}: not an eligible, startable player for that slot.`);
      continue;
    }
    const already = seen.get(row.player_id);
    if (already) {
      alerts.push(`Dropped ${row.name} from ${slot}: already started at ${already}.`);
      continue;
    }
    remaining.splice(at, 1);
    seen.set(row.player_id, slot);
    kept.push(row);
  }
  if (remaining.length) alerts.push(`No recommendation returned for: ${remaining.join(", ")}.`);
  return { kept, alerts };
}
