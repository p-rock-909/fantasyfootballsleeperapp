import type { Player, Position } from "./sleeper";

/** One row from a pasted rankings/ADP CSV, matched (or not) to a Sleeper player. */
export interface RankingRow {
  name: string;
  pos: Position | null;
  team: string | null;
  rank: number | null; // overall rank
  adp: number | null;
  tier: number | null;
  bye: number | null;
  proj: number | null; // projected points
  posRank: number | null;
  playerId: string | null; // matched Sleeper id
}

export interface ParsedRankings {
  rows: RankingRow[];
  matched: number;
  unmatched: RankingRow[];
  columns: Record<string, string | null>; // detected header mapping
}

const HEADER_ALIASES: Record<keyof Omit<RankingRow, "playerId">, string[]> = {
  name: ["player name", "player", "name", "playername", "full name"],
  pos: ["pos", "position"],
  team: ["team", "tm", "nfl team"],
  rank: ["rk", "rank", "overall", "ovr", "overall rank", "ecr", "avg", "consensus"],
  adp: ["adp", "avg pick", "average draft position", "avg. pick", "sleeper adp"],
  tier: ["tier", "tiers"],
  bye: ["bye", "bye week", "byeweek", "bye wk"],
  proj: ["proj", "projection", "projected points", "fpts", "points", "proj pts", "proj. pts"],
  posRank: ["pos rank", "position rank", "posrank", "pos rk"],
};

/** Minimal CSV parser (handles quoted fields, commas inside quotes, CRLF). Tabs accepted as delimiter. */
export function parseCsv(text: string): string[][] {
  const delim = text.split("\n")[0]?.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;
export function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\(.*?\)/g, "").replace(SUFFIXES, "").replace(/[^a-z]/g, "");
}

const POS_RE = /^(QB|RB|WR|TE|K|DEF|DST|D\/ST|PK)\d*$/i;
export function normalizePos(p: string | null | undefined): Position | null {
  if (!p) return null;
  const m = p.trim().toUpperCase().match(POS_RE);
  if (!m) return null;
  const base = m[1].replace(/\d+$/, "");
  if (base === "DST" || base === "D/ST") return "DEF";
  if (base === "PK") return "K";
  return base as Position;
}

const TEAM_FIX: Record<string, string> = { JAC: "JAX", WSH: "WAS", LA: "LAR", KCC: "KC", GBP: "GB", NEP: "NE", NOS: "NO", TBB: "TB", SFO: "SF", LVR: "LV", OAK: "LV", SD: "LAC", STL: "LAR", FA: "" };
export function normalizeTeam(t: string | null | undefined): string | null {
  if (!t) return null;
  const u = t.trim().toUpperCase();
  const f = TEAM_FIX[u] ?? u;
  return f || null;
}

// DEF rows are usually team names ("Baltimore Ravens", "Ravens", "BAL") - map to Sleeper's team-abbr DEF ids.
const TEAM_NAMES: Record<string, string> = {
  cardinals: "ARI", falcons: "ATL", ravens: "BAL", bills: "BUF", panthers: "CAR", bears: "CHI", bengals: "CIN", browns: "CLE",
  cowboys: "DAL", broncos: "DEN", lions: "DET", packers: "GB", texans: "HOU", colts: "IND", jaguars: "JAX", chiefs: "KC",
  raiders: "LV", chargers: "LAC", rams: "LAR", dolphins: "MIA", vikings: "MIN", patriots: "NE", saints: "NO", giants: "NYG",
  jets: "NYJ", eagles: "PHI", steelers: "PIT", niners: "SF", "49ers": "SF", seahawks: "SEA", buccaneers: "TB", titans: "TEN", commanders: "WAS",
};

function num(s: string | undefined): number | null {
  if (s == null) return null;
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : null;
}

function detectColumns(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[_\-]+/g, " "));
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[key] = idx;
  }
  // FantasyPros exports use "POS" like "RB1" -> gives both pos and posRank.
  if (map.name === undefined) {
    // fall back: first column that looks like a name
    const idx = norm.findIndex((h) => h.includes("name") || h.includes("player"));
    if (idx >= 0) map.name = idx;
  }
  return map;
}

/** Parse a rankings CSV and match rows to the Sleeper player pool. */
export function parseRankings(text: string, players: Player[]): ParsedRankings {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], matched: 0, unmatched: [], columns: {} };
  const header = table[0];
  const col = detectColumns(header);
  if (col.name === undefined) throw new Error("Could not find a player name column. Header row must include a column like 'Player' or 'Name'.");

  const byName = new Map<string, Player[]>();
  for (const p of players) {
    const k = normalizeName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const defByTeam = new Map(players.filter((p) => p.pos === "DEF").map((p) => [p.team, p]));

  const rows: RankingRow[] = [];
  let autoRank = 0;
  for (const r of table.slice(1)) {
    const rawName = (r[col.name] ?? "").trim();
    if (!rawName) continue;
    autoRank++;
    const posRaw = col.pos !== undefined ? r[col.pos] : null;
    const pos = normalizePos(posRaw);
    const posRank = col.posRank !== undefined ? num(r[col.posRank]) : posRaw ? num(posRaw.replace(/^[A-Za-z\/]+/, "")) : null;
    const row: RankingRow = {
      name: rawName,
      pos,
      team: normalizeTeam(col.team !== undefined ? r[col.team] : null),
      rank: col.rank !== undefined ? num(r[col.rank]) : autoRank,
      adp: col.adp !== undefined ? num(r[col.adp]) : null,
      tier: col.tier !== undefined ? num(r[col.tier]) : null,
      bye: col.bye !== undefined ? num(r[col.bye]) : null,
      proj: col.proj !== undefined ? num(r[col.proj]) : null,
      posRank,
      playerId: null,
    };
    row.playerId = matchPlayer(row, byName, defByTeam);
    rows.push(row);
  }
  const unmatched = rows.filter((r) => !r.playerId);
  const columns: Record<string, string | null> = {};
  for (const k of Object.keys(HEADER_ALIASES)) columns[k] = col[k] !== undefined ? header[col[k]] : null;
  return { rows, matched: rows.length - unmatched.length, unmatched, columns };
}

function matchPlayer(row: RankingRow, byName: Map<string, Player[]>, defByTeam: Map<string, Player>): string | null {
  // Defenses
  if (row.pos === "DEF" || /defense|d\/st|dst/i.test(row.name)) {
    const t = row.team ?? normalizeTeam(row.name.length <= 3 ? row.name : null);
    if (t && defByTeam.has(t)) return defByTeam.get(t)!.id;
    const lower = row.name.toLowerCase();
    for (const [nick, abbr] of Object.entries(TEAM_NAMES)) if (lower.includes(nick)) return defByTeam.get(abbr)?.id ?? null;
    return null;
  }
  const cands = byName.get(normalizeName(row.name)) ?? [];
  if (cands.length === 0) return null;
  if (cands.length === 1) {
    const c = cands[0];
    if (row.pos && c.pos !== row.pos) return null;
    return c.id;
  }
  const byPos = row.pos ? cands.filter((c) => c.pos === row.pos) : cands;
  if (byPos.length === 1) return byPos[0].id;
  const byTeam = row.team ? byPos.filter((c) => c.team === row.team) : byPos;
  if (byTeam.length >= 1) return byTeam[0].id;
  return byPos[0]?.id ?? null;
}

/** Merge of Sleeper player + ranking data used everywhere in the UI/prompt. */
export interface RankedPlayer extends Player {
  rank: number | null;
  adp: number | null;
  tier: number | null;
  bye: number | null;
  proj: number | null;
  posRank: number | null;
  /** Sort key: rankings rank > ADP > Sleeper search_rank */
  order: number;
}

export function mergeRankings(players: Player[], rankings: RankingRow[] | null, fallbackBye: (team: string) => number | null): RankedPlayer[] {
  const byId = new Map<string, RankingRow>();
  for (const r of rankings ?? []) if (r.playerId && !byId.has(r.playerId)) byId.set(r.playerId, r);
  const out: RankedPlayer[] = players.map((p) => {
    const r = byId.get(p.id);
    const order = r?.rank ?? r?.adp ?? (p.srank != null ? 1000 + p.srank : 99999);
    return { ...p, rank: r?.rank ?? null, adp: r?.adp ?? null, tier: r?.tier ?? null, bye: r?.bye ?? fallbackBye(p.team), proj: r?.proj ?? null, posRank: r?.posRank ?? null, order };
  });
  out.sort((a, b) => a.order - b.order);
  // Derive positional rank when the CSV lacks it.
  const seen: Record<string, number> = {};
  for (const p of out) {
    seen[p.pos] = (seen[p.pos] ?? 0) + 1;
    if (p.posRank == null) p.posRank = seen[p.pos];
  }
  return out;
}

/** The subset of a rankings row the recommendation routes accept. */
export const serializeRankings = (rows: RankingRow[] | null) =>
  rows?.filter((r) => r.playerId).map((r) => ({
    playerId: r.playerId as string,
    rank: r.rank, adp: r.adp, tier: r.tier, bye: r.bye, proj: r.proj, posRank: r.posRank,
  })) ?? null;
