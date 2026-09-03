// Prompts for the waiver-wire call.
//
// The system prompt is content/waiver-rules.md plus the league's own format, mirroring how
// the draft call uses content/preferences.md and the start/sit call uses
// content/start-sit-rules.md. Like the start/sit prompt, it deliberately excludes
// content/preferences.md: that file is draft strategy and claims to be the highest
// authority, and it would fight the ruleset for that title on a question it has nothing
// to say about.

import type { LiveContextResult } from "./liveContext";
import { newsIndex, renderLiveContext, type NewsIndex } from "./liveContext";
import type { ShortlistEntry } from "./freeAgents";
import type { LeagueState, LeagueTeam } from "./leagueState";
import type { RankedPlayer } from "./rankings";
import type { ScoringFormat } from "./sleeper";
import { leagueFormatBlock } from "./promptShared";

export interface WaiverPromptInput {
  state: LeagueState;
  me: LeagueTeam;
  week: number;
  fmt: ScoringFormat;
  shortlist: ShortlistEntry[];
  dropCandidates: RankedPlayer[];
  live: LiveContextResult | null;
  researchedIds: Set<string>;
  poolAgeMinutes: number;
  rankingsLoaded: boolean;
  question?: string;
}

export function buildWaiverSystemPrompt(rules: string, fmt: ScoringFormat, state: LeagueState): string {
  const waiver = state.rules.faab
    ? `- Waivers: FAAB bidding${state.rules.waiverBudget != null ? `, ${state.rules.waiverBudget} budget for the season` : ""}. Give every bid as a percentage range.`
    : "- Waivers: rolling priority, NOT FAAB. This league has no budget, so return 0 for both FAAB fields and make your recommendation in terms of whether the claim is worth spending waiver priority on.";

  return `You are an expert fantasy football advisor working one manager's waiver wire for a specific week.

The rules document below is the highest authority. Follow it over any general instinct, and use its Recommended Output Format as the shape of your answer.

<waiver-rules>
${rules.trim()}
</waiver-rules>

${leagueFormatBlock(fmt)}
${waiver}
${state.rules.tradeDeadline ? `- Trade deadline: week ${state.rules.tradeDeadline}` : ""}

Hard constraints:
- Recommend ONLY players from the CANDIDATES list, using the exact player_id given there. Anyone not on that list is either rostered by another team in this league or outside the app's player pool; recommending them is useless to the manager.
- Identify every player by player_id ALONE. The app already has their name, position and team and fills those in itself, so do not spend words repeating them.
- When a drop is required, give the player_id of someone from THIS TEAM'S ROSTER. If the roster has an open spot, say so and leave dropPlayerId and dropWhy as empty strings.
- Put the substance in two fields and do not split it further: \`evidence\` is why this is actionable now (usage and its trend, the news behind it, how well established that news is), and \`outlook\` is the week ahead (floor to ceiling, the matchup, and anything this league's scoring changes). In a league without FAAB, the advice about spending waiver priority belongs in \`outlook\`.
- Never recommend dropping a player you are also recommending be started.
- Rank by role certainty first, then upside, then next-week matchup — the ruleset's order, not last week's fantasy points.
- Say which candidates are one-week streams, which are multi-week replacements, and which are stashes. Do not call a player safe when the projection depends on a touchdown, an unresolved injury, or a role nobody has confirmed.
- State confidence explicitly as confirmed, probable, uncertain or speculative, and never present an unconfirmed report as settled.`;
}

const candidateLine = (e: ShortlistEntry, news: NewsIndex, researched: Set<string>): string => {
  const p = e.player;
  const n = news.get(p.id);
  const bits = [
    p.id,
    p.name,
    `${p.pos}/${p.team}`,
    p.bye ? `bye ${p.bye}` : "",
    p.inj ? `Sleeper: ${p.inj}` : "",
    p.depth != null ? `depth ${p.depth}` : "",
    e.adds != null ? `${e.adds} adds league-wide in 24h` : "",
    n ? `news: ${n.status}${n.confirmed ? " (confirmed)" : " (unconfirmed)"}` : researched.has(p.id) ? "news: nothing found" : "NOT RESEARCHED",
  ].filter(Boolean);
  return `  - ${bits.join(" | ")}`;
};

const rosterLine = (p: RankedPlayer, starting: boolean): string =>
  `  - ${[p.id, p.name, `${p.pos}/${p.team}`, starting ? "starter" : "bench", p.bye ? `bye ${p.bye}` : "", p.inj ? `Sleeper: ${p.inj}` : ""].filter(Boolean).join(" | ")}`;

/**
 * One line per rival team. Not their full rosters: what actually bears on a waiver claim
 * is who else needs this position and what they can outbid you with, and eleven complete
 * rosters would crowd that out with names the manager cannot act on.
 */
function rivalLine(t: LeagueTeam, faab: boolean): string {
  const bits = [
    t.team.name,
    t.team.record ? `(${t.team.record})` : "",
    faab ? `FAAB left: ${t.faabRemaining ?? "unknown"}` : `waiver priority: ${t.waiverPosition ?? "unknown"}`,
    `unfilled starters: ${t.needs.starterGapsLine}`,
    `roster spots open: ${t.openSpots}`,
  ].filter(Boolean);
  return `  - ${bits.join(" | ")}`;
}

export function buildWaiverUserMessage(st: WaiverPromptInput): string {
  const lines: string[] = [];
  const news = newsIndex(st.live);
  const startingIds = new Set(st.me.team.starters.map((r) => r.player.id));

  lines.push(`WEEK ${st.week} WAIVER RUN for ${st.me.team.name}${st.me.team.record ? ` (${st.me.team.record})` : ""}.`);
  if (st.state.rules.playoffWeekStart && st.week >= st.state.rules.playoffWeekStart) lines.push("This is a PLAYOFF week.");
  lines.push("");

  lines.push("THIS TEAM'S ROSTER:");
  lines.push(...st.me.players.map((p) => rosterLine(p, startingIds.has(p.id))));
  lines.push("");
  lines.push(`ROSTER SHAPE: ${st.me.needs.inSeasonSummary}`);
  lines.push(
    st.me.openSpots > 0
      ? `ROSTER SPACE: ${st.me.openSpots} open spot${st.me.openSpots === 1 ? "" : "s"} — an add does not have to force a drop.`
      : "ROSTER SPACE: the roster is full. Every add must name a drop.",
  );
  if (st.state.rules.faab) {
    lines.push(`BUDGET: ${st.me.faabRemaining ?? "unknown"} of ${st.state.rules.waiverBudget ?? "unknown"} FAAB left.`);
  } else {
    lines.push(`WAIVER PRIORITY: ${st.me.waiverPosition ?? "unknown"} (this league does not use FAAB).`);
  }
  if (st.me.needs.byeClashes.length) {
    lines.push(`BYE CLASHES: ${st.me.needs.byeClashes.map((b) => `week ${b.bye}: ${b.players.join(", ")}`).join(" | ")}`);
  } else {
    lines.push("BYE CLASHES: none detected. Bye weeks come from the rankings sheet, so treat this as unknown rather than confirmed when no sheet is loaded.");
  }
  lines.push("");

  lines.push("SUGGESTED DROPS — the least valuable players on this roster, worst first. Prefer these when a drop is needed:");
  lines.push(...(st.dropCandidates.length ? st.dropCandidates.map((p) => rosterLine(p, false)) : ["  (nothing obviously droppable)"]));
  lines.push("");

  lines.push("THE REST OF THE LEAGUE — who else could claim these players, and what they can spend:");
  lines.push(...st.state.teams.filter((t) => t.team.rosterId !== st.me.team.rosterId).map((t) => rivalLine(t, st.state.rules.faab)));
  lines.push("");

  lines.push(`CANDIDATES — every unrostered player available to this team (${st.shortlist.length} shown). Recommend ONLY from this list:`);
  lines.push(...st.shortlist.map((e) => candidateLine(e, news, st.researchedIds)));
  lines.push("");
  lines.push(
    "Two boundaries on that list, both worth stating in your assumptions if they matter: it is drawn from players currently on an NFL roster, so someone released in the last few days may be missing entirely; and unrostered is not the same as claimable — a player dropped in this league in the last day or two is likely still on waivers rather than a free agent.",
  );
  lines.push("");

  if (st.live) {
    const byId = new Map<string, RankedPlayer>([...st.me.players, ...st.shortlist.map((e) => e.player)].map((p) => [p.id, p]));
    lines.push(renderLiveContext(st.live, byId));
    const unresearched = st.shortlist.filter((e) => !st.researchedIds.has(e.player.id)).length;
    if (unresearched) {
      lines.push(
        `Note: ${unresearched} of the ${st.shortlist.length} candidates were not researched (the news lookup is capped). Those are marked NOT RESEARCHED above — rank them on what you know and say plainly that their current role is unverified.`,
      );
    }
  } else {
    lines.push(
      "NEWS BRIEF: unavailable — the live news lookup did not run or failed. This matters more here than anywhere else in this app: the ruleset ranks players on snap share, route participation, target share and depth-chart movement, and NONE of that is available from Sleeper. " +
        `All you have is each player's stored injury designation (up to ${st.poolAgeMinutes} minutes old), their depth-chart order, and league-wide add counts. Rank on what you know, mark every candidate's confidence as uncertain or speculative unless the add counts alone justify more, and say clearly in your assumptions that this run is not grounded in current news.`,
    );
  }
  lines.push("");

  if (st.rankingsLoaded) {
    lines.push(
      "NOTE ON RANKINGS: any rank/ADP/tier values behind this list come from a PRESEASON DRAFT sheet — season-long, not weekly, and most free agents will not appear on it at all. Use them only as a rough talent prior.",
    );
  }
  lines.push(`Sleeper's stored injury designations above are up to ${st.poolAgeMinutes} minutes old.`);
  if (st.question) lines.push("", `MANAGER NOTE: ${st.question}`);
  lines.push("", "Work the waiver wire now.");
  return lines.join("\n");
}
