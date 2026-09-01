import type { LeagueFormat, Position } from "./sleeper";
import type { RankedPlayer } from "./rankings";
import type { RosterAnalysis } from "./rosterNeeds";
import type { TurnInfo } from "./draftMath";
import type { TierSummary } from "./availability";

const STRATEGY_GUIDE = `You are an expert fantasy football draft advisor helping ONE manager during a live draft.
Your job: recommend the best pick right now, using the manager's preference document (highest authority), the league's exact format, and the live board.

Principles (apply unless the preference document says otherwise):
- Value over need early; need over value late. Take the best player available in rounds 1-5 unless a positional cliff or the preference file says otherwise.
- Tiers beat ranks: prefer taking the last player in a tier over the first player of a deeper tier at another position.
- Use the "P(gone)" numbers: if a target will likely survive to the next turn, take the scarcer player now and plan the target for later.
- Roster construction: fill dedicated starter slots before bench depth; count FLEX/SUPERFLEX. In SUPERFLEX, QBs are premium. In TE-premium, elite TEs move up.
- Kickers and defenses: final two rounds only, unless the preference document says otherwise or only 2-3 picks remain.
- Consider the teams picking before the manager's next turn and their needs (positional runs).
- Flag bye-week pile-ups (3+ starters), injury statuses, ages/decline risk, and any pick that conflicts with the preference document.
- Be decisive: the manager has a pick clock. Give the single best pick first with a crisp reason; include 2-4 alternates.
- Only recommend players from the AVAILABLE list, using their exact player_id.`;

export function buildSystemPrompt(preferences: string, fmt: LeagueFormat): string {
  const s = fmt.slots;
  const starters = [
    `QB ${s.QB}`, `RB ${s.RB}`, `WR ${s.WR}`, `TE ${s.TE}`,
    s.FLEX ? `FLEX ${s.FLEX}` : "", s.SUPER_FLEX ? `SUPERFLEX ${s.SUPER_FLEX}` : "", s.REC_FLEX ? `REC_FLEX ${s.REC_FLEX}` : "",
    s.WRRB_FLEX ? `WRRB_FLEX ${s.WRRB_FLEX}` : "",
    `K ${s.K}`, `DEF ${s.DEF}`, `BENCH ${s.BN}`,
  ].filter(Boolean).join(", ");
  const league = `LEAGUE FORMAT
- Teams: ${fmt.teams}, rounds: ${fmt.rounds}, draft type: ${fmt.draftType}, pick clock: ${fmt.pickTimer}s
- Scoring: ${fmt.scoring} (${fmt.ppr} pts/reception${fmt.tePremium ? `, TE premium +${fmt.tePremium}/rec` : ""}), passing TD = ${fmt.passTdPts} pts
- Superflex: ${fmt.superflex ? "YES (QBs are premium)" : "no"}
- Starting lineup: ${starters}`;

  return `${STRATEGY_GUIDE}\n\n${league}\n\nMANAGER PREFERENCE DOCUMENT (highest authority; follow it even when it conflicts with the principles above):\n<preferences>\n${preferences.trim()}\n</preferences>`;
}

export interface DraftStateForPrompt {
  turn: TurnInfo;
  myRoster: RankedPlayer[];
  analysis: RosterAnalysis;
  available: RankedPlayer[]; // already sorted best-first, top N
  pGone: Map<string, { next: number; after: number }>;
  tiers: TierSummary[];
  otherTeams: { slot: number; picksBeforeMe: boolean; needs: string }[];
  recentPicks: string[];
  question?: string;
  rankingsLoaded: boolean;
}

export function buildUserMessage(st: DraftStateForPrompt): string {
  const t = st.turn;
  const next = t.myNextPicks[0];
  const after = t.myNextPicks[1];
  const lines: string[] = [];
  lines.push(`DRAFT STATE: pick ${t.currentPick} of ${t.totalPicks} (round ${t.round}). ${t.onTheClock ? "MANAGER IS ON THE CLOCK NOW." : `Manager picks in ${t.picksUntilMyTurn} picks (overall #${next ?? "-"}).`}`);
  if (next) lines.push(`Manager's next picks: #${t.myNextPicks.join(", #")}. Picks by other teams between this turn and the following one: ${Number.isFinite(t.picksBetweenNextTwo) ? t.picksBetweenNextTwo : "n/a"}.`);
  lines.push("");
  lines.push(`MANAGER ROSTER (${st.myRoster.length} players): ${st.myRoster.length ? st.myRoster.map((p) => `${p.name} ${p.pos}/${p.team}${p.bye ? ` bye${p.bye}` : ""}`).join("; ") : "empty"}`);
  lines.push(st.analysis.summary);
  if (st.analysis.byeClashes.length) lines.push(`Bye clashes: ${st.analysis.byeClashes.map((c) => `week ${c.bye}: ${c.players.join(", ")}`).join(" | ")}`);
  lines.push("");
  if (st.otherTeams.length) {
    lines.push("TEAMS PICKING BEFORE MANAGER'S NEXT TURN (slot: roster needs):");
    for (const o of st.otherTeams) lines.push(`- slot ${o.slot}: ${o.needs}`);
    lines.push("");
  }
  if (st.recentPicks.length) lines.push(`LAST PICKS: ${st.recentPicks.join(", ")}`);
  const tiers = st.tiers.filter((x) => x.currentTier != null);
  if (tiers.length) lines.push(`TIERS ON BOARD: ${tiers.map((x) => `${x.pos} tier ${x.currentTier} (${x.leftInTier} left${x.nextTierStartsAt ? `, next tier starts ${x.nextTierStartsAt}` : ""})`).join("; ")}`);
  lines.push("");
  lines.push(st.rankingsLoaded
    ? "AVAILABLE PLAYERS (best first; rank/ADP/tier/proj from the manager's imported rankings; P(gone) = probability taken before manager's next pick / the pick after):"
    : "AVAILABLE PLAYERS (best first by Sleeper's own ordering; NO external ADP/tiers were imported, so rely on your knowledge of current-season player values; P(gone) is a rough estimate):");
  lines.push("player_id | name | pos | team | rank | posRank | ADP | tier | proj | bye | age | injury | P(gone next) | P(gone after)");
  for (const p of st.available) {
    const g = st.pGone.get(p.id);
    lines.push([
      p.id, p.name, p.pos, p.team, p.rank ?? "-", p.posRank ? `${p.pos}${p.posRank}` : "-", p.adp ?? "-", p.tier ?? "-",
      p.proj != null ? Math.round(p.proj) : "-", p.bye ?? "-", p.age ?? "-", p.inj ?? "-",
      g ? `${Math.round(g.next * 100)}%` : "-", g ? `${Math.round(g.after * 100)}%` : "-",
    ].join(" | "));
  }
  if (st.question) lines.push("", `MANAGER NOTE FOR THIS PICK: ${st.question}`);
  lines.push("", "Recommend the pick now.");
  void after;
  return lines.join("\n");
}

export function needsSummary(counts: Record<Position, number>, slots: { QB: number; RB: number; WR: number; TE: number; SUPER_FLEX: number }): string {
  const need: string[] = [];
  if (counts.QB < slots.QB + (slots.SUPER_FLEX ? 1 : 0)) need.push("QB");
  if (counts.RB < slots.RB) need.push("RB");
  if (counts.WR < slots.WR) need.push("WR");
  if (counts.TE < slots.TE) need.push("TE");
  const have = (Object.entries(counts) as [Position, number][]).filter(([, n]) => n > 0).map(([p, n]) => `${p}${n}`).join(" ");
  return `${have || "no picks yet"}${need.length ? ` — needs ${need.join("/")}` : " — starters mostly set"}`;
}
