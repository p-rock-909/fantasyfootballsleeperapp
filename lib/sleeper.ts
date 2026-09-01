// Sleeper API types + server-side fetch helpers. Docs: https://docs.sleeper.com/

export const SLEEPER_BASE = "https://api.sleeper.app/v1";

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  /** League-scoped extras; `team_name` is what the manager named their team. */
  metadata?: { team_name?: string | null } | null;
}

export interface SleeperState {
  season: string;
  league_season: string;
  previous_season: string;
  season_type: string;
  week: number;
  /** The week Sleeper's own UI is showing; lags `week` during the days after a week ends. */
  display_week?: number;
}

/**
 * A team in an in-season league. Sleeper sends `null` — not `[]` — for the player
 * arrays on leagues without IR/taxi slots and for rosters with nobody on them,
 * so every one of them is nullable. Run them through `ids()` before use.
 */
export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null; // injured reserve
  taxi: string[] | null;
  settings: { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; [k: string]: number | undefined };
}

/** One team's week. Two entries sharing a `matchup_id` are playing each other. */
export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null; // null when the team is unscheduled that week
  starters: string[] | null;
  players: string[] | null;
  points: number | null;
  starters_points: number[] | null; // positionally aligned with `starters`
  players_points: Record<string, number> | null;
}

/**
 * Sleeper's player-id arrays carry `"0"` as the placeholder for an empty starting
 * slot, and are `null` rather than empty. This is the only way they should be read.
 */
export const ids = (list: string[] | null | undefined): string[] => (list ?? []).filter((id) => id && id !== "0");

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  draft_id: string | null;
  roster_positions: string[]; // e.g. ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN",...]
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string | null;
  season: string;
  status: "pre_draft" | "drafting" | "paused" | "complete";
  type: "snake" | "linear" | "auction";
  start_time: number | null;
  last_picked: number | null;
  draft_order: Record<string, number> | null; // user_id -> slot (1-based)
  slot_to_roster_id: Record<string, number> | null;
  metadata: { name?: string; scoring_type?: string; description?: string };
  settings: {
    teams: number;
    rounds: number;
    pick_timer: number;
    slots_qb?: number;
    slots_rb?: number;
    slots_wr?: number;
    slots_te?: number;
    slots_flex?: number;
    slots_super_flex?: number;
    slots_rec_flex?: number;
    slots_k?: number;
    slots_def?: number;
    slots_bn?: number;
    reversal_round?: number;
    [k: string]: number | undefined;
  };
}

export interface SleeperPick {
  draft_id: string;
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number | null;
  picked_by: string; // user_id ("" for autopick)
  player_id: string;
  is_keeper: boolean | null;
  metadata: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    injury_status?: string;
  };
}

/** Trimmed player shape served by /api/players (~90 KB for the whole pool). */
export interface Player {
  id: string;
  name: string;
  pos: Position;
  team: string;
  age: number | null;
  exp: number | null; // years_exp
  inj: string | null; // injury_status
  depth: number | null; // depth_chart_order
  srank: number | null; // Sleeper search_rank (their own overall ordering)
}

export class SleeperError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function sleeperFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SLEEPER_BASE}${path}`, { ...init, headers: { accept: "application/json" } });
  if (!res.ok) throw new SleeperError(`Sleeper ${path} -> ${res.status}`, res.status);
  const data = (await res.json()) as T | null;
  if (data === null) throw new SleeperError(`Sleeper ${path} -> not found`, 404);
  return data;
}

/** Accepts a raw draft id, a sleeper.com draft URL, or a league URL and extracts the id. */
export function parseSleeperId(input: string): { kind: "draft" | "league" | "unknown"; id: string } {
  const s = input.trim();
  const draft = s.match(/draft\/nfl\/(\d+)/) ?? s.match(/draft\/(\d+)/);
  if (draft) return { kind: "draft", id: draft[1] };
  const league = s.match(/leagues?\/(\d+)/);
  if (league) return { kind: "league", id: league[1] };
  if (/^\d{6,}$/.test(s)) return { kind: "unknown", id: s };
  return { kind: "unknown", id: "" };
}

/** Roster slot counts, from league.roster_positions when available, else draft.settings.slots_*. */
export interface SlotCounts {
  QB: number; RB: number; WR: number; TE: number; FLEX: number; SUPER_FLEX: number; REC_FLEX: number; WRRB_FLEX: number; K: number; DEF: number; BN: number;
}

const EMPTY_SLOTS = (): SlotCounts => ({ QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0, K: 0, DEF: 0, BN: 0 });

/** Count a league's `roster_positions` without needing a draft (the in-season path has no draft). */
export function slotCountsFromPositions(positions: string[]): SlotCounts {
  const c = EMPTY_SLOTS();
  for (const p of positions) {
    if (p in c) c[p as keyof SlotCounts]++;
    else if (p === "IDP_FLEX" || p === "DL" || p === "LB" || p === "DB") continue;
    else c.BN++;
  }
  return c;
}

export function slotCounts(draft: SleeperDraft, league: SleeperLeague | null): SlotCounts {
  if (league?.roster_positions?.length) return slotCountsFromPositions(league.roster_positions);
  const s = draft.settings;
  return {
    ...EMPTY_SLOTS(),
    QB: s.slots_qb ?? 1, RB: s.slots_rb ?? 2, WR: s.slots_wr ?? 2, TE: s.slots_te ?? 1,
    FLEX: s.slots_flex ?? 1, SUPER_FLEX: s.slots_super_flex ?? 0, REC_FLEX: s.slots_rec_flex ?? 0,
    K: s.slots_k ?? 1, DEF: s.slots_def ?? 1, BN: s.slots_bn ?? 6,
  };
}

/** Scoring and lineup rules — everything that is true of a league with or without a draft. */
export interface ScoringFormat {
  teams: number;
  scoring: "ppr" | "half_ppr" | "standard" | string;
  ppr: number;
  tePremium: number; // extra points per TE reception over the base ppr
  superflex: boolean;
  passTdPts: number;
  slots: SlotCounts;
}

export interface LeagueFormat extends ScoringFormat {
  rounds: number;
  draftType: string;
  pickTimer: number;
}

const scoringName = (ppr: number) => (ppr >= 1 ? "ppr" : ppr > 0 ? "half_ppr" : "standard");

/** In-season format, derived from the league alone. */
export function formatFromLeague(league: SleeperLeague): ScoringFormat {
  const ss = league.scoring_settings ?? {};
  const ppr = ss.rec ?? 0;
  const slots = slotCountsFromPositions(league.roster_positions ?? []);
  return {
    teams: league.total_rosters,
    scoring: scoringName(ppr),
    ppr,
    tePremium: ss.bonus_rec_te ?? 0,
    superflex: slots.SUPER_FLEX > 0,
    passTdPts: ss.pass_td ?? 4,
    slots,
  };
}

export function leagueFormat(draft: SleeperDraft, league: SleeperLeague | null): LeagueFormat {
  const slots = slotCounts(draft, league);
  const ss = league?.scoring_settings ?? {};
  const ppr = ss.rec ?? (draft.metadata.scoring_type === "ppr" ? 1 : draft.metadata.scoring_type === "half_ppr" ? 0.5 : 0);
  return {
    teams: draft.settings.teams,
    rounds: draft.settings.rounds,
    scoring: draft.metadata.scoring_type ?? scoringName(ppr),
    ppr,
    tePremium: ss.bonus_rec_te ?? 0,
    superflex: slots.SUPER_FLEX > 0,
    passTdPts: ss.pass_td ?? 4,
    slots,
    draftType: draft.type,
    pickTimer: draft.settings.pick_timer,
  };
}
