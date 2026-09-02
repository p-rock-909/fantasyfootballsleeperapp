import { z } from "zod";

export const PickRec = z.object({
  player_id: z.string().describe("Sleeper player id exactly as given in the available list"),
  name: z.string(),
  position: z.string(),
  confidence: z.number().min(0).max(100).describe("0-100 how strongly this is the right pick now"),
  reasoning: z.string().describe("2-3 sentences: value vs ADP, roster fit, tier/scarcity, preference-file fit"),
});

export const RecommendationResponse = z.object({
  picks: z.array(PickRec).min(1).max(5).describe("Best picks right now, best first"),
  likelyGoneBeforeNextPick: z.array(z.string()).describe("Players to grab now if wanted; will not survive to your next turn"),
  targetsNextRound: z.array(z.string()).describe("Players likely still available at your following pick worth planning around"),
  rosterNotes: z.string().describe("One short paragraph on roster construction status and strategy for the next 2-3 picks"),
  warnings: z.array(z.string()).describe("Bye-week clashes, injury flags, reaches, preference-file conflicts"),
});
export type RecommendationResponse = z.infer<typeof RecommendationResponse>;

/** One row of the browser's rankings, as posted to either recommendation route. */
export const RankingRowInput = z.object({
  playerId: z.string(),
  rank: z.number().nullable(),
  adp: z.number().nullable(),
  tier: z.number().nullable(),
  bye: z.number().nullable(),
  proj: z.number().nullable(),
  posRank: z.number().nullable(),
});

export type RankingRowInput = z.infer<typeof RankingRowInput>;

export const Effort = z.enum(["low", "medium", "high"]);

export const RecommendRequest = z.object({
  draftId: z.string(),
  effort: Effort.default("high"),
  mySlot: z.number().int().positive().nullable(),
  rankings: z.array(RankingRowInput).nullable(),
  question: z.string().max(500).optional().describe("Optional user note, e.g. 'I want a QB this round'"),
});
export type RecommendRequest = z.infer<typeof RecommendRequest>;

// ---- In-season start/sit ----
//
// One field per numbered section of content/start-sit-rules.md's "Recommendation Output
// Format". Note for anyone extending these: they are sent to Gemini as JSON Schema, whose
// supported keyword list excludes what z.record() and z.tuple() emit. lib/schema.test.ts
// enforces that mechanically.

export const LineupSlotRec = z.object({
  slot: z.string().describe("The lineup slot this player fills, exactly as spelled in the SLOTS list"),
  player_id: z.string().describe("Sleeper player id exactly as given in that team's roster list"),
  name: z.string(),
  position: z.string(),
  confidence: z.number().min(0).max(100).describe("0-100 how strongly this is the right start"),
  reasoning: z.string().describe("1-2 sentences: role, matchup, game environment, floor/ceiling fit"),
});

export const BenchOrderRec = z.object({
  player_id: z.string(),
  name: z.string(),
  reasoning: z.string().describe("Why this player is next in line if late news forces a change"),
});

export const StartSitCall = z.object({
  recommended: z.string().describe("The player being started"),
  alternative: z.string().describe("The player being benched in this comparison"),
  reasons: z.string().describe("Role, health, matchup, game environment, weather, floor/ceiling fit"),
  confidence: z.enum(["high", "medium", "low"]),
  changesIf: z.string().describe("The exact news condition that would flip this call"),
});

export const MatchupRecommendation = z.object({
  recommendedLineup: z.array(LineupSlotRec).describe("The best legal starter for every required slot, one entry per slot"),
  benchOrder: z.array(BenchOrderRec).describe("Only viable bench players, in the order they should replace a starter on late news"),
  startSitCalls: z.array(StartSitCall).describe("Every genuinely close decision, explained"),
  strategy: z.object({
    posture: z.enum(["floor", "ceiling", "balanced"]),
    reasoning: z.string().describe("Why this posture, given the opponent's roster and the projected margin"),
  }),
  alerts: z.array(z.string()).describe("Injuries to re-check before kickoff, weather games, snap-count risk, late pivots, bye/roster problems"),
});
export type MatchupRecommendation = z.infer<typeof MatchupRecommendation>;

export const MatchupRecommendRequest = z.object({
  leagueId: z.string(),
  week: z.number().int().min(1).max(18),
  matchupKey: z.string().describe("Which matchup in that week, from pairMatchups()"),
  myRosterId: z.number().int().describe("Which side of the matchup to optimize for"),
  effort: Effort.default("high"),
  rankings: z.array(RankingRowInput).nullable(),
  question: z.string().max(500).optional().describe("Optional user note, e.g. 'I need a ceiling week'"),
  refreshNews: z.boolean().optional().describe("Bypass the cached live-context lookup"),
});
export type MatchupRecommendRequest = z.infer<typeof MatchupRecommendRequest>;

/** The envelope /api/matchup/recommend returns alongside the recommendation. */
export interface MatchupMeta {
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; thinkingTokens?: number; cachedInputTokens?: number };
  week: number;
  phase: "pre" | "live" | "final";
  grounded: boolean;
  newsModel: string | null;
  /** Why the news lookup produced nothing, when it did. Null when grounded. */
  newsUnavailable: string | null;
  retrievedAt: string | null;
  poolAgeMinutes: number;
  myTeam: string;
  opponentTeam: string | null;
}
