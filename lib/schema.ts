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

// ---- Waivers and trades ----
//
// Every array here is bounded. `MAX_OUTPUT_TOKENS` in lib/llm/gemini.ts is shared with
// the thinking budget, so an unbounded list of richly-described candidates is the most
// likely way these calls end as truncated JSON — which surfaces to the user as "the
// answer was cut off", with nothing to show for the wait.

/** One row of the 100-point framework in content/waiver-rules.md. */
export type ScoreLine = z.infer<typeof ScoreLineSchema>;
const ScoreLineSchema = z.object({
  category: z.string().describe("The scoring category from the ruleset"),
  points: z.number().describe("Points awarded in that category"),
  why: z.string().describe("One clause on what earned or cost the points"),
});

export type IfThen = z.infer<typeof IfThenSchema>;
const IfThenSchema = z.object({
  condition: z.string().describe("The specific news or event, e.g. 'the starter is ruled out Friday'"),
  then: z.string().describe("What to do differently when it happens"),
});

export const WaiverCandidate = z.object({
  rank: z.number().int().describe("1 is the best claim this week"),
  player_id: z.string().describe("Sleeper player id exactly as given in the CANDIDATES list"),
  name: z.string(),
  position: z.string(),
  team: z.string(),
  addType: z.enum(["starter", "multi-week replacement", "one-week stream", "stash", "avoid"]),
  score: z.number().min(0).max(100).describe("The ruleset's 100-point total"),
  scoreBreakdown: z.array(ScoreLineSchema).max(7).describe("The ruleset's scoring categories, only those worth explaining"),
  profile: z.enum(["high floor", "high ceiling", "one-week stream", "multi-week replacement", "speculative stash", "trap"]),
  confidence: z.enum(["confirmed", "probable", "uncertain", "speculative"]).describe("How settled the role is, per the ruleset's news rules"),
  role: z.string().describe("Expected snaps/routes/touches, and whether they are rising, stable or fragile"),
  news: z.string().describe("Injury or depth-chart information behind this, and how well established it is"),
  matchup: z.string().describe("Only the matchup detail that materially changes the projection"),
  formatFit: z.string().describe("Why this league's scoring, size or lineup changes the call"),
  outlook: z.string().describe("Floor-to-ceiling summary for the coming week"),
  whyNow: z.string().describe("The usage, news and role evidence that makes this actionable this week"),
  mainRisk: z.string().describe("Named plainly: committee, unconfirmed injury, weak offence, fragile role"),
  // Nullable because a league on rolling waivers has no budget to bid. The prompt says so;
  // a required number would force the model to invent a percentage.
  faabPctLow: z.number().min(0).max(100).nullable().describe("Low end of the suggested bid, or null in a non-FAAB league"),
  faabPctHigh: z.number().min(0).max(100).nullable().describe("High end of the suggested bid, or null in a non-FAAB league"),
  priorityAdvice: z.string().describe("Whether to spend waiver priority here, in a league that uses it"),
  // Flattened rather than a nullable object: no schema in this app has sent Gemini a
  // nullable object, and the keyword check in schema.test.ts would not catch it failing.
  dropPlayerId: z.string().nullable().describe("Sleeper id of who to drop, from THIS team's roster. Null if a spot is open"),
  dropName: z.string().nullable(),
  dropWhy: z.string().nullable().describe("Why that player is the right drop, per the ruleset's drop rules"),
  decision: z.enum(["add", "conditional add", "stash", "stream", "avoid"]),
});

export type WaiverCandidate = z.infer<typeof WaiverCandidate>;

export const WaiverRecommendation = z.object({
  assumptions: z.object({
    format: z.string().describe("Scoring, league size and lineup requirements as you understood them"),
    needAddressed: z.string().describe("The roster need this run is solving"),
    newsCutoff: z.string().describe("How current the information is, and what is still unknown"),
    unknowns: z.array(z.string()).max(6).describe("Anything unavailable, labelled rather than assumed"),
  }),
  candidates: z.array(WaiverCandidate).min(1).max(8).describe("Ranked claims, best first"),
  contingencies: z.array(IfThenSchema).max(6).describe("Explicit if/then pivots for news that lands before claims process"),
  watchList: z.array(z.string()).max(8).describe("Players worth monitoring but not claiming yet"),
});
export type WaiverRecommendation = z.infer<typeof WaiverRecommendation>;

export const WaiverRecommendRequest = z.object({
  leagueId: z.string(),
  week: z.number().int().min(1).max(18),
  rosterId: z.number().int().describe("Which team in the league to find pickups for"),
  // Deliberately lower than the draft and start/sit default: this is the largest
  // structured answer in the app, and thinking shares the output budget with it.
  effort: Effort.default("medium"),
  rankings: z.array(RankingRowInput).nullable(),
  question: z.string().max(500).optional().describe("Optional user note, e.g. 'I need a RB, my WRs are fine'"),
  refreshNews: z.boolean().optional(),
});
export type WaiverRecommendRequest = z.infer<typeof WaiverRecommendRequest>;

// ---- Trades ----

export const TradeAsset = z.object({
  player_id: z.string(),
  name: z.string(),
  roleUsage: z.string().describe("Current role and usage, and whether it is rising, stable or declining"),
  rosOutlook: z.string().describe("Rest-of-season outlook, with the uncertainty stated"),
  floorCeiling: z.enum(["high", "medium", "low"]).describe("Reliability of the weekly floor"),
  mainRisk: z.string().describe("Injury, role, schedule or age"),
  formatNote: z.string().describe("How this league's scoring or lineup changes the value"),
});

export const TradeTeamImpact = z.object({
  rosterId: z.number().int(),
  team: z.string(),
  before: z.string().describe("Key starters and the weakness, before the trade"),
  after: z.string().describe("Key starters and the weakness, after the trade"),
  mainLineupChange: z.string().describe("The specific starting-slot upgrade or downgrade"),
  depthChange: z.enum(["stronger", "weaker", "unchanged"]),
  strategicEffect: z.string().describe("Fit with this team's record, urgency and timeline"),
  score: z.number().min(-100).max(100).describe("Total across the ruleset's scoring categories, for THIS team"),
  scoreBreakdown: z.array(ScoreLineSchema).max(7),
});

export type TradeAsset = z.infer<typeof TradeAsset>;

/** Shared by both trade answers: the same four things must be stated either way. */
const TradeAssumptions = z.object({
  format: z.string(),
  timeline: z.string().describe("Redraft, keeper or dynasty, and each team's competitive window"),
  newsCutoff: z.string(),
  unknowns: z.array(z.string()).max(6),
});

export const TradeEvaluation = z.object({
  verdict: z.enum(["accept", "accept if adjusted", "close - preference", "decline", "needs commissioner review"]),
  assumptions: TradeAssumptions,
  teamImpact: z.array(TradeTeamImpact).min(2).max(2).describe("Exactly one entry per side, scored separately"),
  assets: z.array(TradeAsset).max(12).describe("Every player moving in the deal"),
  rationale: z.string().describe("Which side has the edge, how large it is, and why"),
  adjustments: z.array(z.object({
    side: z.string().describe("Which team would add or change an asset"),
    change: z.string().describe("The concrete change, e.g. 'add a startable bye-week RB'"),
    why: z.string(),
  })).max(3).describe("Practical ways to balance the deal"),
  contingencies: z.array(IfThenSchema).max(5),
  fairness: z.object({
    flagged: z.boolean().describe("true only for an extreme imbalance with no plausible good-faith rationale"),
    reasoning: z.string().describe("Why it is or is not a concern. Do not cry collusion over a trade you merely dislike"),
  }),
});
export type TradeEvaluation = z.infer<typeof TradeEvaluation>;

export const TradeProposal = z.object({
  partnerRosterId: z.number().int().describe("The other team's roster id, exactly as given"),
  partnerTeam: z.string(),
  youSend: z.array(z.object({ player_id: z.string(), name: z.string() })).min(1).max(4),
  youGet: z.array(z.object({ player_id: z.string(), name: z.string() })).min(1).max(4),
  pitch: z.string().describe("One or two sentences the manager could actually send"),
  whyTheyAccept: z.string().describe("The problem this solves for the OTHER manager, in their terms"),
  whyYouWin: z.string().describe("The starting-lineup gain for the initiating team"),
  mainRisk: z.string(),
  confidence: z.enum(["high", "medium", "low"]).describe("How likely this is to be accepted as offered"),
});

export type TradeProposal = z.infer<typeof TradeProposal>;

export const TradeProposals = z.object({
  assumptions: TradeAssumptions,
  proposals: z.array(TradeProposal).min(1).max(5).describe("Concrete offers, most promising first"),
  notes: z.string().describe("What this roster should be trying to do in the market, in one short paragraph"),
});
export type TradeProposals = z.infer<typeof TradeProposals>;

const TradeSide = z.object({
  rosterId: z.number().int(),
  sends: z.array(z.string()).max(6).describe("Sleeper player ids leaving this roster"),
});

export type TradeMode = z.infer<typeof TradeModeEnum>;
const TradeModeEnum = z.enum(["evaluate", "propose"]);

export const TradeEvaluateRequest = z.object({
  leagueId: z.string(),
  week: z.number().int().min(1).max(18),
  mode: TradeModeEnum,
  teamA: TradeSide,
  /** In `propose` mode with no partner chosen, this is null and every other team is fair game. */
  teamB: TradeSide.nullable(),
  effort: Effort.default("medium"),
  rankings: z.array(RankingRowInput).nullable(),
  question: z.string().max(500).optional(),
  refreshNews: z.boolean().optional(),
});
export type TradeEvaluateRequest = z.infer<typeof TradeEvaluateRequest>;

/** What the waiver route returns alongside the recommendation. */
export interface WaiverMeta extends BaseMeta {
  rosterId: number;
  teamName: string;
  faabRemaining: number | null;
  waiverPosition: number | null;
  faabLeague: boolean;
  openSpots: number;
  /** How many free agents existed before the shortlist cut them down. */
  considered: number;
  shortlisted: number;
  researched: number;
}

/** What the trade route returns alongside the evaluation. */
export interface TradeMeta extends BaseMeta {
  mode: "evaluate" | "propose";
  teamAName: string;
  teamBName: string | null;
  pastDeadline: boolean;
  tradeDeadline: number | null;
}

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

/**
 * What the app itself corrected in a model's answer. Kept on the envelope and apart from
 * anything the model said, so a saved run stays able to tell the two apart.
 */
export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

/**
 * What every model-calling route reports back about the run itself. Three features share
 * it: which model answered, how much it cost, and — the part that matters most — whether
 * the answer was grounded in current news or not.
 */
export interface BaseMeta {
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; thinkingTokens?: number; cachedInputTokens?: number };
  week: number;
  grounded: boolean;
  newsModel: string | null;
  /** Why the news lookup produced nothing, when it did. Null when grounded. */
  newsUnavailable: string | null;
  retrievedAt: string | null;
  poolAgeMinutes: number;
}

/** The envelope /api/matchup/recommend returns alongside the recommendation. */
export interface MatchupMeta extends BaseMeta {
  phase: "pre" | "live" | "final";
  myTeam: string;
  opponentTeam: string | null;
}
