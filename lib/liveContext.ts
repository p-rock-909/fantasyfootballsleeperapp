// The only part of the app that reaches past Sleeper for information.
//
// content/start-sit-rules.md is built around injury reports, practice participation,
// depth-chart moves, weather and betting markets — none of which Sleeper exposes. This
// module fetches them with one Gemini call using Google Search grounding, and returns
// them as validated, cited facts.
//
// Failure is never fatal: any problem here returns null and the caller produces an
// un-grounded recommendation that says so.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { geminiJsonSchema } from "./llm/gemini";
import type { LineupPlayer } from "./lineup";

const MODEL = process.env.GEMINI_MODEL || "gemini-pro-latest";
const TTL_MS = 15 * 60 * 1000;
// Three features share this cache now (start/sit, waivers, trades), and a waiver run
// keys on its candidate set, so distinct entries accumulate faster than they used to.
const CACHE_MAX = 40;
const MAX_OUTPUT_TOKENS = 16000;

/**
 * What a lookup is for. It shapes the query — a start/sit call needs kickoff weather and
 * betting lines, a waiver call needs usage trend and depth-chart movement, and a trade is
 * a rest-of-season question where this week's forecast is noise.
 */
export type LiveFocus = "matchup" | "waivers" | "trade";

// NOTHING HERE IS NULLABLE, for the reason set out at the top of lib/schema.ts: zod
// encodes `.nullable()` as a `type` array or an `anyOf` with a null branch, and Gemini's
// schema model — one `type` plus a separate nullable flag — takes neither. "Not reported"
// is an empty string, and an unknown number is 0. Every reader below already treats those
// as absent, because they were written against `null` and both are falsy.
export const LivePlayerNews = z.object({
  player_id: z.string().describe("Echo back the exact id from the PLAYERS list"),
  status: z.enum(["active", "questionable", "doubtful", "out", "ir", "suspended", "unknown"]),
  practice: z.string().describe("Practice participation across this week. Empty string if not reported"),
  role: z.string().describe("Depth chart, snap share, target share or role change since last week. Empty string if nothing changed"),
  confirmed: z.boolean().describe("true only for an official injury report, transaction wire, or direct team/coach statement"),
  note: z.string().describe("One sentence a fantasy manager can act on"),
  // Only a trade lookup asks for this; the system prompt says to leave it empty otherwise,
  // so a start/sit call doesn't spend output tokens on season-long narrative it must not use.
  rosOutlook: z.string().describe("Rest-of-season outlook and current positional ranking. Empty string unless the query asks for it"),
  sources: z.array(z.string()).describe("URLs this came from"),
});
export type LivePlayerNews = z.infer<typeof LivePlayerNews>;

export const LiveGameContext = z.object({
  home: z.string().describe("Home team abbreviation"),
  away: z.string().describe("Away team abbreviation"),
  kickoff: z.string().describe("ISO 8601 kickoff time, so late-window pivots can be reasoned about. Empty string if unknown"),
  roof: z.enum(["dome", "retractable", "outdoor", "unknown"]),
  weather: z.string().describe("Conditions at kickoff: sustained wind, precipitation, temperature. Empty string if unknown"),
  spread: z.string().describe("Empty string if unknown"),
  total: z.number().describe("Game total. 0 if unknown"),
  // An array of pairs, not a map: z.record() emits `propertyNames`, which Gemini rejects.
  impliedTotals: z.array(z.object({ team: z.string(), total: z.number() })),
  sources: z.array(z.string()),
});

/** What the model is asked to return. `retrievedAt` and `sources` are stamped by us. */
export const LiveContext = z.object({
  players: z.array(LivePlayerNews),
  games: z.array(LiveGameContext),
  unresolved: z.array(z.string()).describe("Questions the search could not settle, each naming the pivot it affects"),
});
export type LiveContext = z.infer<typeof LiveContext>;

export interface LiveSource {
  uri: string;
  title: string | null;
}

export interface LiveContextResult extends LiveContext {
  retrievedAt: string;
  sources: LiveSource[];
  model: string;
}

/**
 * Why there is no news, when there isn't any. Without this the headline feature can fail
 * permanently — a rejected request shape, say — while the UI only ever says "the search
 * failed", and nothing distinguishes that from "no key configured".
 */
export interface LiveContextOutcome {
  value: LiveContextResult | null;
  unavailable: string | null;
}

const TIMEOUT_MS = 90_000;

// The ruleset's own source hierarchy, so retrieval and reasoning rank evidence the same way.
const RETRIEVAL_SYSTEM = `You are a fantasy football news researcher. Search the web for the current status of specific NFL players and games, and report only what you find.

Rank sources in this order, and say which tier a claim came from:
1. Official team injury reports, transaction wires, active/inactive lists, league announcements.
2. Direct quotes from coaches or team officials, when specific and current.
3. Established local beat reporters who attend practices.
4. Reputable national reporters and major fantasy-news outlets.
5. Analyst interpretation and social-media speculation.

Rules:
- Set confirmed=true ONLY for tier 1 or 2. Everything else is confirmed=false, however widely repeated.
- Never present a rumor, repost, or last-week narrative as a current fact.
- Prefer this week's reporting over anything older. If the newest thing you can find is stale, say so in the note.
- If you cannot establish something, do not guess: put it in "unresolved" and name the decision it affects.
- Report every player you are given. If you find nothing, return status "unknown" with an empty sources list rather than inventing a designation.
- Leave rosOutlook as an empty string unless the query explicitly asks for a rest-of-season outlook, and return an empty games list when the query says not to report games.
- Use an empty string for any text you cannot establish, and 0 for an unknown number. Never write the word "null".`;

interface CacheEntry {
  at: number;
  value: LiveContextResult;
}
const cache = new Map<string, CacheEntry>();

/**
 * A stable fingerprint of the player set. FNV-1a over the sorted ids — not a security
 * hash, just enough to tell two candidate sets apart.
 */
function playersFingerprint(players: LineupPlayer[]): string {
  const ids = players.map((p) => p.id).sort().join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < ids.length; i++) {
    h ^= ids.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Keyed per scope, not per week: a week holds several matchups with different players, and
 * a league-and-week key would serve one matchup's news for another.
 *
 * The player fingerprint is part of the key because a scope does NOT always determine the
 * player list. `waivers:<rosterId>` covers a shortlist that shifts with the rankings sheet
 * and the trending-adds snapshot, so without this a re-run inside the 15-minute TTL would
 * be handed a brief for a different candidate set — and the "was this player researched"
 * validation would then report problems that aren't real.
 */
const cacheKey = (leagueId: string, week: number, scope: string, players: LineupPlayer[]) =>
  `${leagueId}:${week}:${scope}:${playersFingerprint(players)}`;

function readCache(key: string): LiveContextResult | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key: string, value: LiveContextResult) {
  cache.set(key, { at: Date.now(), value });
  // Warm serverless instances live for hours; without a cap this grows with every matchup viewed.
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export interface LiveContextRequest {
  leagueId: string;
  week: number;
  /** What this lookup is for: `<matchupKey>`, `waivers:<rosterId>`, `trade:<a>-<b>`. */
  scope: string;
  season: string;
  players: LineupPlayer[];
  focus?: LiveFocus;
  refresh?: boolean;
}

/**
 * The search query. Each focus asks for what its ruleset actually reasons from, because
 * retrieval is not free: a trade is a rest-of-season decision and this week's forecast is
 * noise in it, while a start/sit call is the opposite.
 *
 * The `matchup` branch is deliberately unchanged from when it was the only one — it is
 * what makes the start/sit feature grounded, and liveContext.test.ts pins it.
 */
export function buildQuery({ week, season, players, focus = "matchup" }: LiveContextRequest): string {
  const lines = players.map((p) => `${p.id} | ${p.name} | ${p.pos} | ${p.team}${p.inj ? ` | Sleeper lists: ${p.inj}` : ""}`);
  const teams = [...new Set(players.map((p) => p.team))].filter(Boolean).sort();
  const head = [
    `NFL ${season} season, week ${week}. Today is ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "PLAYERS (player_id | name | position | team | Sleeper's stored designation, which may be days old):",
    ...lines,
    "",
  ];

  if (focus === "waivers") {
    return [
      ...head,
      "These players are UNROSTERED in a fantasy league and are being considered as waiver-wire pickups.",
      "The decision turns on OPPORTUNITY, not on last week's fantasy points. Lead with opportunity for every player:",
      "- Offensive snap share, and whether it rose, held or fell across the last 2-4 games.",
      "- Route participation and routes per dropback; target share and air-yard share for receivers and tight ends.",
      "- Carries, total touches, work inside the 10 and inside the 5, third-down and two-minute role for running backs.",
      "- Current depth-chart position and who is ahead of them.",
      "Then report what created or threatens that role: an injury, trade, suspension, release, benching or coaching decision; whether a displaced teammate is expected back and when; and the player's own injury designation and practice participation this week.",
      "",
      `GAMES: for each of these teams report the week ${week} opponent, implied team total, spread and expected pace: ${teams.join(", ")}. Matchup is a tiebreaker here, so keep it brief.`,
    ].join("\n");
  }

  if (focus === "trade") {
    return [
      ...head,
      "These players are assets in a proposed fantasy-football trade. This is a REST-OF-SEASON decision, not a one-week one.",
      "Do NOT report kickoff weather or a single game's betting line, and return an empty games list.",
      "For every player report:",
      "- Current role and usage (snap share, route participation, target or touch share), and whether it is rising, stable or declining.",
      "- Depth-chart security and the competition for that role.",
      "- Injury status with an expected return timeline, plus any re-injury or snap-count risk.",
      "- The quarterback, offensive line and scoring environment around them, and their remaining schedule and bye week.",
      "In rosOutlook, give the player's current rest-of-season outlook: where they are ranked at their position now, and whether that view is rising or falling. Say where the ranking came from.",
    ].join("\n");
  }

  return [
    ...head,
    `GAMES: report the week ${week} game for each of these teams: ${teams.join(", ")}.`,
    "",
    "For every player: current injury designation, practice participation this week, and any role, snap-share, depth-chart or usage change.",
    "For every game: roof type, forecast at kickoff (sustained wind, precipitation, temperature), kickoff time in ISO 8601, betting spread, game total, and each team's implied total.",
  ].join("\n");
}

/**
 * Fetch current news for both rosters. Returns null — never throws — when the key is
 * missing, the call fails, grounding returns nothing, or the answer misses the schema.
 * The caller degrades to an un-grounded recommendation and tells the user.
 */
export async function fetchLiveContext(req: LiveContextRequest): Promise<LiveContextOutcome> {
  if (!process.env.GEMINI_API_KEY) return { value: null, unavailable: "GEMINI_API_KEY is not set on the server." };
  if (!req.players.length) return { value: null, unavailable: "No startable players to look up." };

  const key = cacheKey(req.leagueId, req.week, req.scope, req.players);
  if (!req.refresh) {
    const hit = readCache(key);
    if (hit) return { value: hit, unavailable: null };
  }

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // A hang is not an error, so try/catch alone would let a stalled connection eat the
    // whole 300s budget and take the recommendation down with it.
    const response = await withTimeout(
      client.models.generateContent({
        model: MODEL,
        contents: buildQuery(req),
        config: {
          systemInstruction: RETRIEVAL_SYSTEM,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseJsonSchema: geminiJsonSchema(LiveContext),
        },
      }),
      TIMEOUT_MS,
    );

    const text = response.text;
    if (!text) return fail("The news search returned an empty answer.");
    const parsed = LiveContext.safeParse(safeJson(text));
    if (!parsed.success) return fail(`The news search returned an answer that missed the schema: ${parsed.error.issues[0]?.message ?? "unknown"}`);

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: LiveSource[] = [];
    const seen = new Set<string>();
    for (const c of chunks) {
      const uri = c.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ uri, title: c.web?.title ?? null });
    }

    const value: LiveContextResult = {
      ...parsed.data,
      retrievedAt: new Date().toISOString(),
      sources,
      model: response.modelVersion || MODEL,
    };
    writeCache(key, value);
    return { value, unavailable: null };
  } catch (e) {
    // Never fatal — a start/sit answer without news beats no answer at kickoff — but it
    // is reported, not swallowed, so a permanently broken lookup is diagnosable.
    return fail((e as Error).message || "The news search failed.");
  }
}

function fail(reason: string): LiveContextOutcome {
  console.warn(`[liveContext] ${reason}`);
  return { value: null, unavailable: reason };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`The news search timed out after ${Math.round(ms / 1000)}s.`)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** The news for one player, by id — every prompt builder needs this lookup. */
export type NewsIndex = Map<string, LivePlayerNews>;
export const newsIndex = (live: LiveContextResult | null): NewsIndex =>
  new Map((live?.players ?? []).map((n) => [n.player_id, n]));

/** The news brief as the start/sit prompt sees it. */
export function renderLiveContext(ctx: LiveContextResult, byId: Map<string, LineupPlayer>): string {
  const lines: string[] = [`NEWS BRIEF (retrieved ${ctx.retrievedAt} via web search; treat "confirmed: no" as unverified):`];
  for (const n of ctx.players) {
    const p = byId.get(n.player_id);
    lines.push(
      `- ${p ? `${p.name} (${p.pos}/${p.team})` : n.player_id}: status ${n.status}, confirmed: ${n.confirmed ? "yes" : "no"}` +
        `${n.practice ? `, practice: ${n.practice}` : ""}${n.role ? `, role: ${n.role}` : ""}. ${n.note}` +
        // Only a trade lookup fills this; rendering it unconditionally keeps one code path.
        `${n.rosOutlook ? ` Rest of season: ${n.rosOutlook}` : ""}`,
    );
  }
  for (const g of ctx.games) {
    const implied = g.impliedTotals.map((t) => `${t.team} ${t.total}`).join(", ");
    lines.push(
      `- ${g.away} @ ${g.home}: ${g.roof}${g.kickoff ? `, kickoff ${g.kickoff}` : ""}${g.weather ? `, ${g.weather}` : ""}` +
        `${g.spread ? `, spread ${g.spread}` : ""}${g.total ? `, total ${g.total}` : ""}${implied ? `, implied ${implied}` : ""}.`,
    );
  }
  if (ctx.unresolved.length) lines.push(`UNRESOLVED: ${ctx.unresolved.join(" | ")}`);
  return lines.join("\n");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
