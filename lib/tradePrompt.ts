// Prompts for the trade call, in both directions: score a proposal, or generate some.
//
// The system prompt is content/trade-rules.md plus the league's own format. Like the
// start/sit and waiver prompts it excludes content/preferences.md, which is draft
// strategy and claims an authority it has not earned on this question.

import type { LiveContextResult } from "./liveContext";
import { newsIndex, renderLiveContext, type NewsIndex } from "./liveContext";
import type { BestLineup } from "./lineup";
import type { LeagueState, LeagueTeam } from "./leagueState";
import type { TradeMode } from "./schema";
import type { RankedPlayer } from "./rankings";
import type { ScoringFormat } from "./sleeper";
import { leagueFormatBlock } from "./promptShared";

export interface TradeLineupChange {
  before: BestLineup<RankedPlayer>;
  after: BestLineup<RankedPlayer>;
}

export interface TradePromptInput {
  state: LeagueState;
  mode: TradeMode;
  fmt: ScoringFormat;
  week: number;
  teamA: LeagueTeam;
  teamB: LeagueTeam | null;
  aSends: RankedPlayer[];
  bSends: RankedPlayer[];
  /** Before/after startable lineups, computed in code, keyed by roster id. */
  lineups: Map<number, TradeLineupChange>;
  live: LiveContextResult | null;
  pastDeadline: boolean;
  poolAgeMinutes: number;
  rankingsLoaded: boolean;
  question?: string;
}

export function buildTradeSystemPrompt(rules: string, fmt: ScoringFormat, state: LeagueState, mode: TradeMode): string {
  const task = mode === "evaluate"
    ? `You are evaluating ONE proposed trade. Score it separately for each side using the ruleset's scoring framework, and use its Recommended Output Format as the shape of your answer.

Hard constraints:
- Score BOTH teams. A trade can be good for both sides at once, and saying so is a real answer.
- Judge the change in each manager's STARTING LINEUP, not the sum of player rankings. Bench depth that cannot enter a lineup is worth little; the before/after lineups are given to you, computed from this league's actual slots.
- Use the exact player_id given for every asset you discuss.
- Only flag fairness when the imbalance is extreme AND there is no plausible good-faith explanation. A contender trading future value for present production is normal, not collusion.`
    : `You are generating trade offers for ONE manager to send. Use the ruleset's Negotiation Rules: an offer has to solve a real problem for the OTHER manager, not just improve the proposer's team.

Hard constraints:
- Every player you move must currently be on the roster you say is sending them, using the exact player_id given.
- Never move a player who is already listed as moving in the same proposal, and never propose a team trade with itself.
- Lead with a reasonable offer, not a lowball fishing offer. State plainly what problem it solves for the partner.
- Say which of the proposer's starting slots improves, and what it costs them.`;

  return `You are an expert fantasy football advisor working the trade market in one league.

The rules document below is the highest authority. Follow it over any general instinct.

<trade-rules>
${rules.trim()}
</trade-rules>

${leagueFormatBlock(fmt, state.rules.playoffWeekStart)}
${state.rules.tradeDeadline ? `- Trade deadline: week ${state.rules.tradeDeadline}` : "- No trade deadline set"}

${task}`;
}

const playerLine = (p: RankedPlayer, news: NewsIndex, starting?: boolean): string => {
  const n = news.get(p.id);
  const bits = [
    p.id,
    p.name,
    `${p.pos}/${p.team}`,
    starting === undefined ? "" : starting ? "starter" : "bench",
    p.bye ? `bye ${p.bye}` : "",
    p.age != null ? `age ${p.age}` : "",
    p.inj ? `Sleeper: ${p.inj}` : "",
    n ? `news: ${n.status}${n.confirmed ? " (confirmed)" : " (unconfirmed)"}` : "",
  ].filter(Boolean);
  return `  - ${bits.join(" | ")}`;
};

const lineupLine = (l: BestLineup<RankedPlayer>): string =>
  l.filled.map((f) => `${f.slot}: ${f.player.name}`).join(", ") + (l.empty.length ? ` | UNFILLED: ${l.empty.join(", ")}` : "");

function teamBlock(t: LeagueTeam, label: string, news: NewsIndex, lineups: Map<number, TradeLineupChange>): string[] {
  const startingIds = new Set(t.team.starters.map((r) => r.player.id));
  const out = [`${label}: ${t.team.name}${t.team.record ? ` (${t.team.record})` : ""}`];
  out.push(` SHAPE: ${t.needs.inSeasonSummary}`);
  out.push(" ROSTER:");
  out.push(...t.players.map((p) => playerLine(p, news, startingIds.has(p.id))));
  const change = lineups.get(t.team.rosterId);
  if (change) {
    out.push(` BEST LINEUP BEFORE: ${lineupLine(change.before)}`);
    out.push(` BEST LINEUP AFTER:  ${lineupLine(change.after)}`);
  }
  return out;
}

/** One line per team, for the teams that are context rather than participants. */
function rivalLine(t: LeagueTeam): string {
  return `  - [roster ${t.team.rosterId}] ${t.team.name}${t.team.record ? ` (${t.team.record})` : ""} | unfilled starters: ${t.needs.starterGapsLine} | ${t.needs.inSeasonSummary}`;
}

export function buildTradeUserMessage(st: TradePromptInput): string {
  const lines: string[] = [];
  const news = newsIndex(st.live);

  lines.push(`WEEK ${st.week} TRADE ${st.mode === "evaluate" ? "EVALUATION" : "SEARCH"} in ${st.state.league.name}.`);
  if (st.pastDeadline) {
    lines.push(
      `NOTE: the trade deadline was week ${st.state.rules.tradeDeadline}, which has passed. This deal cannot actually be made — say so plainly and evaluate it as hypothetical.`,
    );
  }
  lines.push("");

  if (st.mode === "evaluate" && st.teamB) {
    lines.push(...teamBlock(st.teamA, "TEAM A", news, st.lineups));
    lines.push("");
    lines.push(...teamBlock(st.teamB, "TEAM B", news, st.lineups));
    lines.push("");
    lines.push("THE PROPOSED TRADE:");
    lines.push(` ${st.teamA.team.name} sends:`);
    lines.push(...(st.aSends.length ? st.aSends.map((p) => playerLine(p, news)) : ["  (nothing)"]));
    lines.push(` ${st.teamB.team.name} sends:`);
    lines.push(...(st.bSends.length ? st.bSends.map((p) => playerLine(p, news)) : ["  (nothing)"]));
    lines.push("");
    lines.push("THE REST OF THE LEAGUE — context for how scarce each position is here:");
    lines.push(...st.state.teams.filter((t) => t.team.rosterId !== st.teamA.team.rosterId && t.team.rosterId !== st.teamB?.team.rosterId).map(rivalLine));
  } else {
    lines.push(...teamBlock(st.teamA, "TRADE FOR THIS TEAM", news, st.lineups));
    lines.push("");
    if (st.aSends.length) {
      // The manager ticked these on the way in. Not a constraint — they are saying what
      // they are comfortable losing, and an offer that leaves them out is still valid.
      lines.push("PLAYERS THIS MANAGER IS WILLING TO MOVE — prefer building offers around these, but you may use others from the roster if a better deal exists:");
      lines.push(...st.aSends.map((p) => playerLine(p, news)));
      lines.push("");
    }
    if (st.teamB) {
      lines.push(...teamBlock(st.teamB, "PROPOSED PARTNER — build the offer against this roster", news, st.lineups));
      lines.push("");
      lines.push("Every proposal must be with this partner.");
    } else {
      // Full rosters, not summaries: you cannot name which players change hands against a
      // team you can only see as positional counts.
      lines.push("POSSIBLE PARTNERS — every other team in the league, in full. Any of them can be the partner:");
      for (const t of st.state.teams.filter((t) => t.team.rosterId !== st.teamA.team.rosterId)) {
        const startingIds = new Set(t.team.starters.map((r) => r.player.id));
        lines.push(` [roster ${t.team.rosterId}] ${t.team.name}${t.team.record ? ` (${t.team.record})` : ""} — ${t.needs.inSeasonSummary}`);
        lines.push(...t.players.map((p) => playerLine(p, news, startingIds.has(p.id))));
      }
    }
  }
  lines.push("");

  const available = st.state.available.slice(0, 25);
  if (available.length) {
    lines.push(
      "BEST PLAYERS ON WAIVERS — the realistic replacement level in this league, which is what makes a position scarce or not:",
    );
    lines.push(...available.map((p) => `  - ${p.name} (${p.pos}/${p.team})`));
    lines.push("");
  }

  if (st.live) {
    const byId = new Map<string, RankedPlayer>(
      [...st.teamA.players, ...(st.teamB?.players ?? []), ...st.aSends, ...st.bSends].map((p) => [p.id, p]),
    );
    lines.push(renderLiveContext(st.live, byId));
  } else {
    lines.push(
      "NEWS BRIEF: unavailable — the live news lookup did not run or failed. You have no current injury timeline, role update, or rest-of-season ranking beyond the stored Sleeper designations above, which are up to " +
        `${st.poolAgeMinutes} minutes old. Treat this as a structural read of both rosters rather than a valuation, say so plainly in your assumptions, and label every value judgement as uncertain.`,
    );
  }
  lines.push("");

  lines.push(
    "NOTE ON VALUE: this app has NO rest-of-season projections." +
      (st.rankingsLoaded
        ? " The rank/ADP/tier values behind the lineups above come from a PRESEASON DRAFT sheet, and the before/after lineups were solved using them, so treat the lineup SHAPE as reliable and the implied ordering as a weak prior."
        : " The before/after lineups were solved from Sleeper's own static player ordering, so treat the lineup SHAPE as reliable and the implied ordering as a weak prior.") +
      " Where the news brief gives a current rest-of-season outlook, that outranks both.",
  );
  lines.push(`Sleeper's stored injury designations above are up to ${st.poolAgeMinutes} minutes old.`);
  if (st.question) lines.push("", `MANAGER NOTE: ${st.question}`);
  lines.push("", st.mode === "evaluate" ? "Evaluate the trade now." : "Find the trades now.");
  return lines.join("\n");
}
