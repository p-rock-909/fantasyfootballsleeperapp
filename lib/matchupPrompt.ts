// Prompts for the in-season start/sit call.
//
// The system prompt is content/start-sit-rules.md plus the league's own format. It
// deliberately does NOT include content/preferences.md: that file is draft strategy
// ("do not take a QB in the first three rounds"), it claims to be the highest authority,
// and it would fight the ruleset for that title on a question it has nothing to say about.

import type { LiveContextResult } from "./liveContext";
import { renderLiveContext } from "./liveContext";
import type { MatchupTeam, StartingSlot, TeamRow } from "./lineup";
import { SLOT_ELIGIBILITY } from "./lineup";
import type { ScoringFormat } from "./sleeper";

const STATUS_NOTE: Record<string, string> = {
  ir: "ON IR — cannot be started",
  taxi: "on the taxi squad — cannot be started",
  bye: "ON BYE this week — cannot be started",
  out: "listed out/doubtful — do not start without evidence they will play",
  startable: "",
};

export interface MatchupPromptInput {
  fmt: ScoringFormat;
  week: number;
  playoffWeekStart: number | null;
  phase: "pre" | "live" | "final";
  me: MatchupTeam;
  opponent: MatchupTeam | null;
  slots: StartingSlot[];
  unsupportedSlots: string[];
  legalBySlot: Map<StartingSlot, TeamRow[]>;
  live: LiveContextResult | null;
  poolAgeMinutes: number;
  rankingsLoaded: boolean;
  question?: string;
}

export function buildMatchupSystemPrompt(rules: string, fmt: ScoringFormat, playoffWeekStart: number | null): string {
  const s = fmt.slots;
  const starters = [
    `QB ${s.QB}`, `RB ${s.RB}`, `WR ${s.WR}`, `TE ${s.TE}`,
    s.FLEX ? `FLEX ${s.FLEX}` : "", s.REC_FLEX ? `REC_FLEX ${s.REC_FLEX}` : "",
    s.WRRB_FLEX ? `WRRB_FLEX ${s.WRRB_FLEX}` : "", s.SUPER_FLEX ? `SUPERFLEX ${s.SUPER_FLEX}` : "",
    `K ${s.K}`, `DEF ${s.DEF}`, `BENCH ${s.BN}`,
  ].filter(Boolean).join(", ");

  const league = `LEAGUE FORMAT
- Teams: ${fmt.teams}
- Scoring: ${fmt.scoring} (${fmt.ppr} pts/reception${fmt.tePremium ? `, TE premium +${fmt.tePremium}/rec` : ""}), passing TD = ${fmt.passTdPts} pts
- Superflex: ${fmt.superflex ? "YES (QBs are premium)" : "no"}
- Starting lineup: ${starters}
${playoffWeekStart ? `- Playoffs start week ${playoffWeekStart}` : "- Playoff schedule unknown"}`;

  return `You are an expert fantasy football advisor setting ONE manager's starting lineup for a specific head-to-head matchup.

The rules document below is the highest authority. Follow it over any general instinct, and use its Recommendation Output Format as the shape of your answer.

<start-sit-rules>
${rules.trim()}
</start-sit-rules>

${league}

Hard constraints:
- Recommend exactly one player for every slot in the SLOTS list, using the slot's exact spelling and the player's exact player_id.
- Only choose from that slot's CANDIDATES list. Players marked as on bye, on IR, on the taxi squad, or out are not startable — never put one in a slot.
- Never start the same player in two slots.
- Where the news brief and the stored Sleeper designation disagree, the news brief is newer and wins.
- Say what would change your mind: every close call needs the specific news condition that flips it.`;
}

const line = (r: TeamRow, live: LiveContextResult | null): string => {
  const p = r.player;
  const news = live?.players.find((n) => n.player_id === p.id);
  const bits = [
    p.id,
    p.name,
    `${p.pos}/${p.team}`,
    r.slot ? `currently ${r.slot}` : "bench",
    p.bye ? `bye ${p.bye}` : "",
    p.inj ? `Sleeper: ${p.inj}` : "",
    news ? `news: ${news.status}${news.confirmed ? " (confirmed)" : " (unconfirmed)"}` : "",
    r.points != null ? `${r.points} pts` : "",
    STATUS_NOTE[r.status] ?? "",
  ].filter(Boolean);
  return `  - ${bits.join(" | ")}`;
};

function teamBlock(team: MatchupTeam, label: string, live: LiveContextResult | null): string[] {
  const out = [`${label}: ${team.name}${team.record ? ` (${team.record})` : ""}${team.points != null ? ` — ${team.points} pts so far` : ""}`];
  out.push(" STARTERS:");
  out.push(...(team.starters.length ? team.starters.map((r) => line(r, live)) : ["  (none set)"]));
  out.push(" BENCH:");
  out.push(...(team.bench.length ? team.bench.map((r) => line(r, live)) : ["  (empty)"]));
  return out;
}

export function buildMatchupUserMessage(st: MatchupPromptInput): string {
  const lines: string[] = [];
  const phaseText = { pre: "has not started", live: "is in progress", final: "is over" }[st.phase];

  lines.push(`WEEK ${st.week} MATCHUP — the week ${phaseText}.`);
  if (st.playoffWeekStart && st.week >= st.playoffWeekStart) lines.push("This is a PLAYOFF week.");
  lines.push("");
  lines.push(...teamBlock(st.me, "OPTIMIZE THIS TEAM", st.live));
  lines.push("");
  if (st.opponent) {
    lines.push(...teamBlock(st.opponent, "OPPONENT", st.live));
    lines.push("");
    lines.push("Compare the two teams' ranges of outcomes, not just their medians, and choose the floor/ceiling/balanced posture the ruleset calls for.");
  } else {
    lines.push("OPPONENT: none — this team is on a bye this week. Optimize for points, and say so.");
  }
  lines.push("");

  lines.push(`SLOTS TO FILL (in order): ${st.slots.join(", ")}`);
  if (st.unsupportedSlots.length) {
    lines.push(`This league also has slots this assistant does not support (${st.unsupportedSlots.join(", ")}); ignore them and do not mention them.`);
  }
  lines.push("");
  lines.push("CANDIDATES — the only legal, startable choice for each slot:");
  for (const slot of new Set(st.slots)) {
    const cands = st.legalBySlot.get(slot) ?? [];
    lines.push(` ${slot} (eligible: ${SLOT_ELIGIBILITY[slot].join("/")}):`);
    lines.push(...(cands.length ? cands.map((r) => line(r, st.live)) : ["  (nobody legal — say so in alerts)"]));
  }
  lines.push("");

  if (st.live) {
    lines.push(renderLiveContext(st.live, new Map(
      [...st.me.starters, ...st.me.bench, ...(st.opponent?.starters ?? []), ...(st.opponent?.bench ?? [])].map((r) => [r.player.id, r.player]),
    )));
  } else {
    lines.push(
      "NEWS BRIEF: unavailable — the live news lookup did not run or failed. You have no injury report, practice participation, weather, or betting data beyond the stored Sleeper designations above, which are up to " +
        `${st.poolAgeMinutes} minutes old. Reason from what you know, state clearly that the recommendation is not grounded in current news, and put every player whose status must be checked before kickoff in alerts.`,
    );
  }
  lines.push("");

  if (st.rankingsLoaded) {
    lines.push(
      "NOTE ON RANKINGS: any rank/ADP/tier/projection values in this app come from a PRESEASON DRAFT sheet — season-long, not weekly. Use them only as a rough talent prior. They are NOT this week's projection.",
    );
  }
  lines.push(`Sleeper's stored injury designations above are up to ${st.poolAgeMinutes} minutes old.`);
  if (st.question) lines.push("", `MANAGER NOTE: ${st.question}`);
  lines.push("", "Set the lineup now.");
  return lines.join("\n");
}
