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
const CACHE_MAX = 20;
const MAX_OUTPUT_TOKENS = 16000;

export const LivePlayerNews = z.object({
  player_id: z.string().describe("Echo back the exact id from the PLAYERS list"),
  status: z.enum(["active", "questionable", "doubtful", "out", "ir", "suspended", "unknown"]),
  practice: z.string().nullable().describe("Practice participation across this week, if reported"),
  role: z.string().nullable().describe("Depth chart, snap share, target share or role change since last week"),
  confirmed: z.boolean().describe("true only for an official injury report, transaction wire, or direct team/coach statement"),
  note: z.string().describe("One sentence a fantasy manager can act on"),
  sources: z.array(z.string()).describe("URLs this came from"),
});
export type LivePlayerNews = z.infer<typeof LivePlayerNews>;

export const LiveGameContext = z.object({
  home: z.string().describe("Home team abbreviation"),
  away: z.string().describe("Away team abbreviation"),
  kickoff: z.string().nullable().describe("ISO 8601 kickoff time, so late-window pivots can be reasoned about"),
  roof: z.enum(["dome", "retractable", "outdoor", "unknown"]),
  weather: z.string().nullable().describe("Conditions at kickoff: sustained wind, precipitation, temperature"),
  spread: z.string().nullable(),
  total: z.number().nullable(),
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
- Report every player you are given. If you find nothing, return status "unknown" with an empty sources list rather than inventing a designation.`;

interface CacheEntry {
  at: number;
  value: LiveContextResult;
}
const cache = new Map<string, CacheEntry>();

/**
 * Keyed per matchup, not per week: a week holds several matchups with different players,
 * and a league-and-week key would serve one matchup's news for another.
 */
const cacheKey = (leagueId: string, week: number, matchupKey: string) => `${leagueId}:${week}:${matchupKey}`;

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
  matchupKey: string;
  season: string;
  players: LineupPlayer[];
  refresh?: boolean;
}

function buildQuery({ week, season, players }: LiveContextRequest): string {
  const lines = players.map((p) => `${p.id} | ${p.name} | ${p.pos} | ${p.team}${p.inj ? ` | Sleeper lists: ${p.inj}` : ""}`);
  const teams = [...new Set(players.map((p) => p.team))].filter(Boolean).sort();
  return [
    `NFL ${season} season, week ${week}. Today is ${new Date().toISOString().slice(0, 10)}.`,
    "",
    "PLAYERS (player_id | name | position | team | Sleeper's stored designation, which may be days old):",
    ...lines,
    "",
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
export async function fetchLiveContext(req: LiveContextRequest): Promise<LiveContextResult | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!req.players.length) return null;

  const key = cacheKey(req.leagueId, req.week, req.matchupKey);
  if (!req.refresh) {
    const hit = readCache(key);
    if (hit) return hit;
  }

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: MODEL,
      contents: buildQuery(req),
      config: {
        systemInstruction: RETRIEVAL_SYSTEM,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseJsonSchema: geminiJsonSchema(LiveContext),
      },
    });

    const text = response.text;
    if (!text) return null;
    const parsed = LiveContext.safeParse(safeJson(text));
    if (!parsed.success) return null;

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
    return value;
  } catch {
    // Deliberately swallowed: a start/sit answer without news beats no answer at kickoff.
    return null;
  }
}

/** The news brief as the start/sit prompt sees it. */
export function renderLiveContext(ctx: LiveContextResult, byId: Map<string, LineupPlayer>): string {
  const lines: string[] = [`NEWS BRIEF (retrieved ${ctx.retrievedAt} via web search; treat "confirmed: no" as unverified):`];
  for (const n of ctx.players) {
    const p = byId.get(n.player_id);
    lines.push(
      `- ${p ? `${p.name} (${p.pos}/${p.team})` : n.player_id}: status ${n.status}, confirmed: ${n.confirmed ? "yes" : "no"}` +
        `${n.practice ? `, practice: ${n.practice}` : ""}${n.role ? `, role: ${n.role}` : ""}. ${n.note}`,
    );
  }
  for (const g of ctx.games) {
    const implied = g.impliedTotals.map((t) => `${t.team} ${t.total}`).join(", ");
    lines.push(
      `- ${g.away} @ ${g.home}: ${g.roof}${g.kickoff ? `, kickoff ${g.kickoff}` : ""}${g.weather ? `, ${g.weather}` : ""}` +
        `${g.spread ? `, spread ${g.spread}` : ""}${g.total != null ? `, total ${g.total}` : ""}${implied ? `, implied ${implied}` : ""}.`,
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
