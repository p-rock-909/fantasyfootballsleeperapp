// Sleeper API types + server-side fetch helpers. Docs: https://docs.sleeper.com/

export const SLEEPER_BASE = "https://api.sleeper.app/v1";

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperState {
  season: string;
  league_season: string;
  previous_season: string;
  season_type: string;
  week: number;
}

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
  QB: number; RB: number; WR: number; TE: number; FLEX: number; SUPER_FLEX: number; REC_FLEX: number; K: number; DEF: number; BN: number;
}

export function slotCounts(draft: SleeperDraft, league: SleeperLeague | null): SlotCounts {
  const c: SlotCounts = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, REC_FLEX: 0, K: 0, DEF: 0, BN: 0 };
  if (league?.roster_positions?.length) {
    for (const p of league.roster_positions) {
      if (p in c) c[p as keyof SlotCounts]++;
      else if (p === "IDP_FLEX" || p === "DL" || p === "LB" || p === "DB") continue;
      else c.BN++;
    }
    return c;
  }
  const s = draft.settings;
  return {
    QB: s.slots_qb ?? 1, RB: s.slots_rb ?? 2, WR: s.slots_wr ?? 2, TE: s.slots_te ?? 1,
    FLEX: s.slots_flex ?? 1, SUPER_FLEX: s.slots_super_flex ?? 0, REC_FLEX: s.slots_rec_flex ?? 0,
    K: s.slots_k ?? 1, DEF: s.slots_def ?? 1, BN: s.slots_bn ?? 6,
  };
}

export interface LeagueFormat {
  teams: number;
  rounds: number;
  scoring: "ppr" | "half_ppr" | "standard" | string;
  ppr: number;
  tePremium: number; // extra points per TE reception over the base ppr
  superflex: boolean;
  passTdPts: number;
  slots: SlotCounts;
  draftType: string;
  pickTimer: number;
}

export function leagueFormat(draft: SleeperDraft, league: SleeperLeague | null): LeagueFormat {
  const slots = slotCounts(draft, league);
  const ss = league?.scoring_settings ?? {};
  const ppr = ss.rec ?? (draft.metadata.scoring_type === "ppr" ? 1 : draft.metadata.scoring_type === "half_ppr" ? 0.5 : 0);
  const teRec = ss.bonus_rec_te ?? 0;
  const scoring = ppr >= 1 ? "ppr" : ppr > 0 ? "half_ppr" : "standard";
  return {
    teams: draft.settings.teams,
    rounds: draft.settings.rounds,
    scoring: draft.metadata.scoring_type ?? scoring,
    ppr,
    tePremium: teRec,
    superflex: slots.SUPER_FLEX > 0,
    passTdPts: ss.pass_td ?? 4,
    slots,
    draftType: draft.type,
    pickTimer: draft.settings.pick_timer,
  };
}
